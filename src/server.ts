// ═══════════════════════════════════════════════════════════════════
// MCP Server — Tool Registration and Server Setup
// ═══════════════════════════════════════════════════════════════════

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Engine imports
import { searchJobs, getAvailableSources, PLATFORM_LIMITATIONS } from "./engine/job-discovery.js";
import { analyzeJobDescription, extractAllTechnologiesFlat } from "./engine/jd-parser.js";
import { calculateJobMatch, formatMatchReport, passesFilters } from "./engine/match-engine.js";
import {
  generateTailoringPlan,
  generateLatexResume,
  formatTailoringReport,
} from "./engine/resume-tailor-engine.js";
import {
  prepareApplication,
  markAsApplied,
  markAsUncertain,
  markAsFailed,
  requestManualHandoff,
  updateApplicationStatus,
  performQualityCheck,
} from "./engine/application-engine.js";
import {
  classifyText,
  extractInterviewDetails,
  createNotification,
  recordInterview,
  getUpcomingInterviews,
  getUnreadNotifications,
} from "./engine/status-monitor.js";
import { generateDailySummary, formatDailySummary } from "./engine/notification-engine.js";
import { enqueueJob, getQueueStats } from "./engine/queue.js";

// Integration imports
import { cloneOrPullOverleafProject, updateOverleafResume, getOverleafStatus } from "./integrations/overleaf-git.js";
import { compileLatex, isLatexAvailable } from "./integrations/latex-compiler.js";
import { createInterviewCalendarEvent, isCalendarConfigured } from "./integrations/calendar.js";

// Storage imports
import { storeMasterResume, storeTailoredResume, listResumeVersions } from "./storage/resume-storage.js";

// Utility imports
import { getSupabaseClient, getCurrentUserId } from "./db/client.js";
import { logAuditEntry, getAuditTrail, formatAuditTrail } from "./utils/audit-logger.js";
import { checkForDuplicateApplication } from "./utils/duplicate-checker.js";
import { categorizeSkills } from "./utils/fabrication-guard.js";

// Type imports
import {
  SearchJobsInput,
  ApplicationStatus,
  AutomationMode,
  ExperienceLevel,
  EmploymentType,
  JobSource,
  WorkArrangement,
  InterviewType,
} from "./types/index.js";

import * as fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

/**
 * Creates and configures the MCP Server with all tools.
 */
export function createJobHunterServer(): McpServer {
  const server = new McpServer({
    name: "job-hunter-mcp",
    version: "1.0.0",
  });

  // ─── TOOL: candidate-profile ──────────────────────────────────
  server.tool(
    "candidate-profile",
    "View or update the candidate profile. The profile is the source of truth for all resume tailoring.",
    {
      action: z.enum(["get", "update"]).describe("Get or update the candidate profile"),
      fullName: z.string().optional().describe("Full name"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      location: z.string().optional().describe("Current location"),
      summary: z.string().optional().describe("Professional summary"),
      education: z.array(z.object({
        institution: z.string(),
        degree: z.string(),
        field: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        gpa: z.string().optional(),
      })).optional().describe("Education history"),
      experience: z.array(z.object({
        company: z.string(),
        title: z.string(),
        location: z.string().optional(),
        startDate: z.string(),
        endDate: z.string().optional(),
        current: z.boolean().default(false),
        responsibilities: z.array(z.string()),
        technologies: z.array(z.string()),
      })).optional().describe("Work experience"),
      projects: z.array(z.object({
        name: z.string(),
        description: z.string(),
        technologies: z.array(z.string()),
        url: z.string().optional(),
        highlights: z.array(z.string()),
      })).optional().describe("Projects"),
      technicalSkills: z.object({
        programmingLanguages: z.array(z.string()).default([]),
        frameworks: z.array(z.string()).default([]),
        tools: z.array(z.string()).default([]),
        hardware: z.array(z.string()).default([]),
        protocols: z.array(z.string()).default([]),
        roboticsFrameworks: z.array(z.string()).default([]),
        embeddedTechnologies: z.array(z.string()).default([]),
        operatingSystems: z.array(z.string()).default([]),
        databases: z.array(z.string()).default([]),
        cloudPlatforms: z.array(z.string()).default([]),
        other: z.array(z.string()).default([]),
      }).optional().describe("Technical skills"),
      portfolioUrl: z.string().optional(),
      githubUrl: z.string().optional(),
      linkedinUrl: z.string().optional(),
    },
    async (params) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      if (params.action === "get") {
        const { data } = await supabase
          .from("candidate_profiles")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (!data) {
          return {
            content: [{ type: "text", text: "No candidate profile found. Upload your resume first using the upload-resume tool, or create a profile by calling this tool with action: 'update'." }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2),
          }],
        };
      }

      // Update
      const profileData: Record<string, unknown> = { user_id: userId };
      if (params.fullName) profileData.full_name = params.fullName;
      if (params.email) profileData.email = params.email;
      if (params.phone) profileData.phone = params.phone;
      if (params.location) profileData.location = params.location;
      if (params.summary) profileData.summary = params.summary;
      if (params.education) profileData.education = params.education;
      if (params.experience) profileData.experience = params.experience;
      if (params.projects) profileData.projects = params.projects;
      if (params.technicalSkills) profileData.technical_skills = params.technicalSkills;
      if (params.portfolioUrl) profileData.portfolio_url = params.portfolioUrl;
      if (params.githubUrl) profileData.github_url = params.githubUrl;
      if (params.linkedinUrl) profileData.linkedin_url = params.linkedinUrl;

      const { data, error } = await supabase
        .from("candidate_profiles")
        .upsert(profileData, { onConflict: "user_id" })
        .select()
        .single();

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }

      await logAuditEntry(userId, "Candidate profile updated");

      return {
        content: [{ type: "text", text: `Candidate profile updated successfully.\n\n${JSON.stringify(data, null, 2)}` }],
      };
    },
  );

  // ─── TOOL: upload-resume ──────────────────────────────────────
  server.tool(
    "upload-resume",
    "Upload a master resume file. Supports PDF, DOCX, TXT, Markdown, and LaTeX formats. The master resume is NEVER overwritten by automatic tailoring.",
    {
      filename: z.string().describe("Resume filename"),
      content: z.string().describe("Resume content (text or base64-encoded for binary formats)"),
      format: z.enum(["pdf", "docx", "txt", "md", "tex", "latex"]).describe("File format"),
    },
    async ({ filename, content, format }) => {
      const userId = getCurrentUserId();

      const buffer = ["pdf", "docx"].includes(format)
        ? Buffer.from(content, "base64")
        : Buffer.from(content, "utf-8");

      const { storagePath, resumeId } = await storeMasterResume(
        userId, filename, buffer, format,
      );

      // Update candidate profile with master resume ID
      const supabase = getSupabaseClient();
      await supabase
        .from("candidate_profiles")
        .upsert({
          user_id: userId,
          master_resume_id: resumeId,
          full_name: "Candidate",
          email: "candidate@email.com",
        }, { onConflict: "user_id" });

      await logAuditEntry(userId, "Master resume uploaded", {
        details: `File: ${filename}, Format: ${format}`,
      });

      return {
        content: [{
          type: "text",
          text: `Master resume uploaded successfully.\n\nFile: ${filename}\nFormat: ${format}\nResume ID: ${resumeId}\nStorage: ${storagePath}\n\nIMPORTANT: The master resume will NEVER be overwritten by automatic tailoring.\n\nNext step: Use the 'parse-resume' tool to extract your profile from the resume, or manually update your candidate profile.`,
        }],
      };
    },
  );

  // ─── TOOL: parse-resume ───────────────────────────────────────
  server.tool(
    "parse-resume",
    "Extract structured candidate information from an uploaded resume. Returns the extracted data for review — the user should verify and correct any inaccuracies before the profile is finalized.",
    {
      resumeId: z.string().optional().describe("Resume ID to parse (defaults to master resume)"),
      resumeText: z.string().optional().describe("Resume text content (if providing directly)"),
    },
    async ({ resumeId, resumeText }) => {
      const userId = getCurrentUserId();

      let text = resumeText || "";

      if (!text && resumeId) {
        // Load resume content
        const supabase = getSupabaseClient();
        const { data: resume } = await supabase
          .from("resume_versions")
          .select("latex_source, storage_path, original_format")
          .eq("id", resumeId)
          .eq("user_id", userId)
          .single();

        if (resume?.latex_source) {
          text = resume.latex_source;
        }
      }

      if (!text) {
        return {
          content: [{
            type: "text",
            text: "Please provide resume text content via the resumeText parameter, or upload a resume first. For PDF/DOCX parsing, please provide the text content extracted from the document.",
          }],
        };
      }

      // Extract technologies
      const techs = extractAllTechnologiesFlat(text);

      return {
        content: [{
          type: "text",
          text: `Resume parsed. Detected technologies:\n\n${techs.join(", ")}\n\nPlease review and update your candidate profile using the 'candidate-profile' tool with action: 'update'. Include your full education, experience, projects, and skills.\n\nIMPORTANT: Only include information that is genuinely true. The system will NEVER fabricate information.`,
        }],
      };
    },
  );

  // ─── TOOL: search-jobs ────────────────────────────────────────
  server.tool(
    "search-jobs",
    "Search for job openings across configured sources. Returns objective job information without claiming any job is 'best'.",
    {
      keywords: z.array(z.string()).optional().describe("Search keywords"),
      location: z.string().optional().describe("Job location"),
      remote: z.boolean().optional().describe("Remote jobs only"),
      experienceLevel: ExperienceLevel.optional().describe("Experience level"),
      employmentType: EmploymentType.optional().describe("Employment type"),
      salaryMinimum: z.number().optional().describe("Minimum salary"),
      technologies: z.array(z.string()).optional().describe("Required technologies"),
      company: z.string().optional().describe("Company name"),
      datePostedDays: z.number().optional().describe("Posted within N days"),
      source: JobSource.optional().describe("Specific job source"),
      limit: z.number().min(1).max(100).default(25).describe("Maximum results"),
    },
    async (params) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      // Search via adapters
      const jobs = await searchJobs(params, userId);

      // Store discovered jobs
      for (const job of jobs) {
        try {
          await supabase.from("job_listings").upsert({
            id: job.id || uuidv4(),
            user_id: userId,
            title: job.title || "",
            company: job.company || "Unknown",
            location: job.location || "",
            remote: job.remote || "ONSITE",
            salary: job.salary,
            salary_min: job.salaryMin,
            salary_max: job.salaryMax,
            job_url: job.jobUrl || "",
            application_url: job.applicationUrl,
            source: job.source || "OTHER",
            date_posted: job.datePosted,
            date_discovered: job.dateDiscovered || new Date().toISOString(),
            description: job.description || "",
            extracted_technologies: job.extractedTechnologies || [],
            analyzed: false,
          }, { onConflict: "user_id,job_url", ignoreDuplicates: true });
        } catch (err) {
          // Ignore duplicate key errors
        }
      }

      await logAuditEntry(userId, `Job search completed: ${jobs.length} results`, {
        details: `Keywords: ${params.keywords?.join(", ") || "none"}`,
      });

      // Get available sources info
      const sources = getAvailableSources();

      const response = [
        `Found ${jobs.length} jobs:\n`,
        ...jobs.map((j, i) =>
          `${i + 1}. ${j.title} — ${j.company}\n   📍 ${j.location || "N/A"} | 🔗 ${j.source}\n   ${j.salary || "Salary not disclosed"}\n   ${j.jobUrl}\n`,
        ),
        `\nConfigured sources:`,
        ...sources.filter(s => s.configured).map(s => `  ✓ ${s.name}`),
        `\nUnconfigured sources (manual only):`,
        ...sources.filter(s => !s.configured).map(s => `  • ${s.name}`),
      ].join("\n");

      return { content: [{ type: "text", text: response }] };
    },
  );

  // ─── TOOL: analyze-job ────────────────────────────────────────
  server.tool(
    "analyze-job",
    "Analyze a job description to extract requirements, technologies, responsibilities, and application requirements.",
    {
      jobId: z.string().optional().describe("Job ID from database"),
      description: z.string().optional().describe("Job description text"),
      company: z.string().optional().describe("Company name"),
      title: z.string().optional().describe("Job title"),
      location: z.string().optional().describe("Location"),
    },
    async (params) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      let description = params.description || "";
      let company = params.company;
      let title = params.title;

      if (params.jobId) {
        const { data: job } = await supabase
          .from("job_listings")
          .select("*")
          .eq("id", params.jobId)
          .eq("user_id", userId)
          .single();

        if (job) {
          description = job.description;
          company = company || job.company;
          title = title || job.title;
        }
      }

      if (!description) {
        return { content: [{ type: "text", text: "Please provide a job description or a valid jobId." }], isError: true };
      }

      const analysis = analyzeJobDescription(description, company, title, params.location);

      // Store analysis if jobId provided
      if (params.jobId) {
        await supabase
          .from("job_listings")
          .update({
            analyzed: true,
            analysis,
            extracted_technologies: [
              ...analysis.requirements.programmingLanguages,
              ...analysis.requirements.roboticsFrameworks,
              ...analysis.requirements.embeddedTechnologies,
              ...analysis.requirements.tools,
            ],
          })
          .eq("id", params.jobId)
          .eq("user_id", userId);

        await logAuditEntry(userId, "Job analyzed", {
          jobId: params.jobId,
          details: `${company} — ${title}`,
        });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(analysis, null, 2),
        }],
      };
    },
  );

  // ─── TOOL: match-job ──────────────────────────────────────────
  server.tool(
    "match-job",
    "Generate an explainable match analysis between the candidate's profile and a job. Does NOT claim hiring probability.",
    {
      jobId: z.string().describe("Job ID to match against"),
    },
    async ({ jobId }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      // Load profile
      const { data: profile } = await supabase
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (!profile) {
        return { content: [{ type: "text", text: "No candidate profile found. Create one first." }], isError: true };
      }

      // Load job
      const { data: job } = await supabase
        .from("job_listings")
        .select("*")
        .eq("id", jobId)
        .eq("user_id", userId)
        .single();

      if (!job) {
        return { content: [{ type: "text", text: `Job not found: ${jobId}` }], isError: true };
      }

      // Ensure analysis exists
      let analysis = job.analysis;
      if (!analysis) {
        analysis = analyzeJobDescription(job.description, job.company, job.title, job.location);
        await supabase.from("job_listings").update({ analyzed: true, analysis }).eq("id", jobId);
      }

      const match = calculateJobMatch(
        profile as unknown as import("./types/index.js").CandidateProfile,
        analysis,
        job.location,
        job.salary,
      );
      match.jobId = jobId;

      // Update match score in DB
      await supabase
        .from("job_listings")
        .update({ match_score: match.overallScore })
        .eq("id", jobId);

      const report = formatMatchReport(match, job.title);

      await logAuditEntry(userId, `Job match calculated: ${match.overallScore}/100`, {
        jobId,
        details: `${job.company} — ${job.title}`,
      });

      return { content: [{ type: "text", text: report }] };
    },
  );

  // ─── TOOL: tailor-resume ──────────────────────────────────────
  server.tool(
    "tailor-resume",
    "Create a JD-specific tailored resume. Only reorders and emphasizes genuine skills — NEVER fabricates information.",
    {
      jobId: z.string().describe("Job ID to tailor resume for"),
    },
    async ({ jobId }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      // Load profile
      const { data: profile } = await supabase
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (!profile) {
        return { content: [{ type: "text", text: "No candidate profile found." }], isError: true };
      }

      // Load job
      const { data: job } = await supabase
        .from("job_listings")
        .select("*")
        .eq("id", jobId)
        .eq("user_id", userId)
        .single();

      if (!job) {
        return { content: [{ type: "text", text: `Job not found: ${jobId}` }], isError: true };
      }

      let analysis = job.analysis;
      if (!analysis) {
        analysis = analyzeJobDescription(job.description, job.company, job.title, job.location);
      }

      const profileTyped = profile as unknown as import("./types/index.js").CandidateProfile;
      const match = calculateJobMatch(profileTyped, analysis, job.location, job.salary);

      const { changes, report, fabricationCheck, tailoredSections } = generateTailoringPlan(
        profileTyped,
        analysis,
        match,
      );

      // CRITICAL: If fabrication detected, DO NOT PROCEED
      if (!fabricationCheck.passed) {
        return {
          content: [{
            type: "text",
            text: `⛔ FABRICATION DETECTED — Resume NOT generated.\n\n${fabricationCheck.verification}\n\nUnsupported claims:\n${fabricationCheck.unsupportedClaims.map(c => `• ${c}`).join("\n")}`,
          }],
          isError: true,
        };
      }

      // Generate LaTeX
      const latex = generateLatexResume(profileTyped, tailoredSections, job.company, job.title);

      // Store tailored resume
      const stored = await storeTailoredResume(
        userId,
        jobId,
        job.company,
        job.title,
        latex,
        undefined,
        changes,
        match.matchingSkills,
        profile.master_resume_id,
      );

      // Try to compile
      let compilationNote = "";
      const latexStatus = await isLatexAvailable();
      if (latexStatus.available) {
        const compileResult = await compileLatex(stored.latexPath);
        if (compileResult.success) {
          compilationNote = `\n\n✓ PDF compiled: ${compileResult.pdfPath}`;
        } else {
          compilationNote = `\n\n⚠ PDF compilation failed: ${compileResult.error}\nLaTeX source saved at: ${stored.latexPath}`;
        }
      } else {
        compilationNote = "\n\n⚠ No LaTeX compiler found. Install TeX Live or use Overleaf to compile.";
      }

      const tailoringReport = formatTailoringReport(report);

      await logAuditEntry(userId, "Resume tailored", {
        jobId,
        details: `${job.company} — ${job.title} | Version: ${stored.filename}`,
      });

      return {
        content: [{
          type: "text",
          text: `Resume tailored for ${job.company} — ${job.title}\n\n${tailoringReport}\n\nResume ID: ${stored.resumeId}\nFile: ${stored.filename}${compilationNote}`,
        }],
      };
    },
  );

  // ─── TOOL: update-overleaf-resume ─────────────────────────────
  server.tool(
    "update-overleaf-resume",
    "Synchronize a tailored LaTeX resume with the user's Overleaf project via Git. Requires premium Overleaf account.",
    {
      action: z.enum(["setup", "sync", "status"]).describe("Setup, sync, or check status"),
      gitUrl: z.string().optional().describe("Overleaf Git URL (for setup)"),
      gitToken: z.string().optional().describe("Git authentication token (for setup)"),
      resumeId: z.string().optional().describe("Resume version to sync (for sync)"),
      targetFile: z.string().default("main.tex").describe("Target .tex file in project"),
    },
    async (params) => {
      const userId = getCurrentUserId();

      if (params.action === "status") {
        const status = await getOverleafStatus(userId);
        return {
          content: [{
            type: "text",
            text: `Overleaf Status:\n\nConfigured: ${status.configured}\nCloned: ${status.cloned}\nLast sync: ${status.lastSync || "Never"}\nMain file: ${status.mainTexFile || "N/A"}`,
          }],
        };
      }

      if (params.action === "setup") {
        if (!params.gitUrl) {
          return { content: [{ type: "text", text: "Please provide your Overleaf Git URL. Find it in Overleaf: Menu → Git → Clone with Git." }], isError: true };
        }

        const result = await cloneOrPullOverleafProject(userId, params.gitUrl, params.gitToken);
        return {
          content: [{
            type: "text",
            text: result.success
              ? `Overleaf project cloned successfully.\n\nLocal path: ${result.localPath}\n\nYou can now use 'sync' to push tailored resumes.`
              : `Failed: ${result.error}`,
          }],
        };
      }

      // Sync
      if (!params.resumeId) {
        return { content: [{ type: "text", text: "Please provide a resume version ID to sync." }], isError: true };
      }

      const supabase = getSupabaseClient();
      const { data: resume } = await supabase
        .from("resume_versions")
        .select("*")
        .eq("id", params.resumeId)
        .eq("user_id", userId)
        .single();

      if (!resume?.latex_source) {
        return { content: [{ type: "text", text: "Resume version not found or has no LaTeX source." }], isError: true };
      }

      // Get job info for commit message
      let company = "Unknown";
      let role = "Unknown";
      if (resume.job_id) {
        const { data: job } = await supabase
          .from("job_listings")
          .select("company, title")
          .eq("id", resume.job_id)
          .single();
        if (job) {
          company = job.company;
          role = job.title;
        }
      }

      const result = await updateOverleafResume(
        userId,
        resume.latex_source,
        params.targetFile,
        company,
        role,
      );

      return {
        content: [{
          type: "text",
          text: result.success
            ? `Overleaf updated.\n\nFile: ${params.targetFile}\n${result.manualStep || ""}`
            : `Failed: ${result.error}`,
        }],
      };
    },
  );

  // ─── TOOL: compile-resume ────────────────────────────────────
  server.tool(
    "compile-resume",
    "Compile a LaTeX resume to PDF using the local TeX distribution.",
    {
      resumeId: z.string().describe("Resume version ID to compile"),
    },
    async ({ resumeId }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      const { data: resume } = await supabase
        .from("resume_versions")
        .select("*")
        .eq("id", resumeId)
        .eq("user_id", userId)
        .single();

      if (!resume) {
        return { content: [{ type: "text", text: "Resume version not found." }], isError: true };
      }

      if (!resume.latex_source_path) {
        return { content: [{ type: "text", text: "No LaTeX source path available. The resume may not have been generated as LaTeX." }], isError: true };
      }

      const available = await isLatexAvailable();
      if (!available.available) {
        return {
          content: [{
            type: "text",
            text: "No LaTeX compiler found. Please install TeX Live or MiKTeX.\n\nAlternatively, use the update-overleaf-resume tool to push to Overleaf for compilation.",
          }],
          isError: true,
        };
      }

      const result = await compileLatex(resume.latex_source_path);

      if (result.success) {
        await supabase
          .from("resume_versions")
          .update({ pdf_path: result.pdfPath })
          .eq("id", resumeId);

        return {
          content: [{
            type: "text",
            text: `✓ Resume compiled successfully.\n\nPDF: ${result.pdfPath}\nCompiler: ${available.compiler}`,
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `Compilation failed: ${result.error}\n\nLog:\n${result.log || "No log available"}`,
        }],
        isError: true,
      };
    },
  );

  // ─── TOOL: generate-cover-letter ──────────────────────────────
  server.tool(
    "generate-cover-letter",
    "Generate a tailored cover letter using ONLY truthful candidate information. Never claims experience not in the profile.",
    {
      jobId: z.string().describe("Job ID"),
      tone: z.enum(["professional", "conversational", "enthusiastic"]).default("professional").describe("Writing tone"),
    },
    async ({ jobId, tone }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      const { data: profile } = await supabase.from("candidate_profiles").select("*").eq("user_id", userId).single();
      const { data: job } = await supabase.from("job_listings").select("*").eq("id", jobId).eq("user_id", userId).single();

      if (!profile || !job) {
        return { content: [{ type: "text", text: "Profile or job not found." }], isError: true };
      }

      let analysis = job.analysis;
      if (!analysis) {
        analysis = analyzeJobDescription(job.description, job.company, job.title, job.location);
      }

      const profileTyped = profile as unknown as import("./types/index.js").CandidateProfile;
      const match = calculateJobMatch(profileTyped, analysis, job.location, job.salary);

      // Generate structured cover letter content
      const coverLetter = generateCoverLetterContent(profileTyped, job, analysis, match, tone);

      // Store
      await supabase.from("cover_letters").insert({
        id: uuidv4(),
        user_id: userId,
        job_id: jobId,
        content: coverLetter,
        filename: `cover_letter_${job.company.replace(/\s+/g, "_").toLowerCase()}_${job.title.replace(/\s+/g, "_").toLowerCase()}.txt`,
        storage_path: `${userId}/coverletters/${jobId}.txt`,
      });

      return {
        content: [{
          type: "text",
          text: `Cover letter generated for ${job.company} — ${job.title}:\n\n${coverLetter}\n\n⚠ IMPORTANT: Review for accuracy. Only genuine information from your profile was used.`,
        }],
      };
    },
  );

  // ─── TOOL: prepare-application ────────────────────────────────
  server.tool(
    "prepare-application",
    "Prepare a complete job application. Verifies all quality checks before the application can be submitted.",
    {
      jobId: z.string().describe("Job ID"),
      resumeVersionId: z.string().describe("Resume version ID"),
      coverLetterVersionId: z.string().optional().describe("Cover letter ID"),
      answers: z.record(z.string(), z.string()).optional().describe("Application question answers"),
    },
    async (params) => {
      const userId = getCurrentUserId();

      const result = await prepareApplication(
        userId,
        params.jobId,
        params.resumeVersionId,
        params.coverLetterVersionId,
        params.answers,
      );

      if (result.error) {
        return { content: [{ type: "text", text: result.error }], isError: true };
      }

      const app = result.application!;

      return {
        content: [{
          type: "text",
          text: `Application prepared:\n\nCompany: ${app.company}\nRole: ${app.role}\nStatus: ${app.status}\nApplication ID: ${app.id}\n\nReady for submission. Use 'apply-to-job' to submit, or review first.`,
        }],
      };
    },
  );

  // ─── TOOL: apply-to-job ───────────────────────────────────────
  server.tool(
    "apply-to-job",
    "Submit a prepared application. Requires passing all quality checks. If CAPTCHA, MFA, or unsupported workflow is detected, performs manual handoff.",
    {
      applicationId: z.string().describe("Application ID from prepare-application"),
      confirmed: z.boolean().default(false).describe("User has confirmed submission"),
    },
    async ({ applicationId, confirmed }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      // Load application
      const { data: app } = await supabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();

      if (!app) {
        return { content: [{ type: "text", text: "Application not found." }], isError: true };
      }

      if (app.status === "APPLIED") {
        return { content: [{ type: "text", text: `Already applied to ${app.company} — ${app.role} on ${app.date_applied}` }] };
      }

      // Check automation settings
      const { data: settings } = await supabase
        .from("automation_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      const mode = settings?.mode || "APPROVAL_REQUIRED";

      if (mode === "APPROVAL_REQUIRED" && !confirmed) {
        return {
          content: [{
            type: "text",
            text: `Ready to Apply\n\nCompany: ${app.company}\nRole: ${app.role}\nLocation: ${app.location}\nURL: ${app.application_url || app.job_url}\n\nTo confirm, call this tool again with confirmed: true\n\nOr use [Approve & Apply] / [Edit] / [Skip]`,
          }],
        };
      }

      // Most platforms require manual submission — perform handoff
      const handoffMessage = await requestManualHandoff(
        userId,
        applicationId,
        "Most job platforms require manual submission (CAPTCHA, identity verification, platform-specific forms).",
        app.application_url || app.job_url,
      );

      await createNotification(
        userId,
        "MANUAL_ACTION",
        `Application ready: ${app.company}`,
        handoffMessage,
        { applicationId, priority: "MEDIUM" },
      );

      return {
        content: [{
          type: "text",
          text: handoffMessage,
        }],
      };
    },
  );

  // ─── TOOL: list-applications ──────────────────────────────────
  server.tool(
    "list-applications",
    "Show all tracked applications with status, dates, and next actions.",
    {
      status: ApplicationStatus.optional().describe("Filter by status"),
      limit: z.number().default(25).describe("Maximum results"),
    },
    async ({ status, limit }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      let query = supabase
        .from("applications")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (status) query = query.eq("status", status);

      const { data } = await query;

      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No applications found." }] };
      }

      const lines = data.map((a, i) =>
        `${i + 1}. ${a.company} — ${a.role}\n   Status: ${a.status}${a.date_applied ? ` | Applied: ${new Date(a.date_applied).toLocaleDateString()}` : ""}\n   ${a.next_action ? `⚠ ${a.next_action}` : ""}`,
      );

      return {
        content: [{
          type: "text",
          text: `Applications (${data.length}):\n\n${lines.join("\n\n")}`,
        }],
      };
    },
  );

  // ─── TOOL: get-application ────────────────────────────────────
  server.tool(
    "get-application",
    "Get detailed information about a specific application including audit trail.",
    {
      applicationId: z.string().describe("Application ID"),
    },
    async ({ applicationId }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      const { data: app } = await supabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();

      if (!app) {
        return { content: [{ type: "text", text: "Application not found." }], isError: true };
      }

      const auditTrail = formatAuditTrail(app.audit_log || []);

      return {
        content: [{
          type: "text",
          text: `Application Details:\n\nCompany: ${app.company}\nRole: ${app.role}\nLocation: ${app.location}\nSource: ${app.source}\nStatus: ${app.status}\n${app.date_applied ? `Applied: ${app.date_applied}` : ""}\n${app.next_action ? `Next action: ${app.next_action}` : ""}\n${app.failure_reason ? `Failure: ${app.failure_reason}` : ""}\n\nAudit Trail:\n${auditTrail}`,
        }],
      };
    },
  );

  // ─── TOOL: monitor-applications ───────────────────────────────
  server.tool(
    "monitor-applications",
    "Check application statuses for updates. Detects interviews, shortlists, rejections, and other status changes.",
    {
      text: z.string().optional().describe("Text to analyze for status updates (email body, message)"),
      applicationId: z.string().optional().describe("Application to update"),
    },
    async ({ text, applicationId }) => {
      const userId = getCurrentUserId();

      if (text) {
        const classification = classifyText(text);

        let response = `Classification: ${classification.type}\nConfidence: ${classification.confidence}\n\n`;

        if (classification.type === "INTERVIEW") {
          const details = extractInterviewDetails(text);
          response += `Interview Details:\n${JSON.stringify(details, null, 2)}\n\n`;

          if (applicationId) {
            const supabase = getSupabaseClient();
            const { data: app } = await supabase
              .from("applications")
              .select("company, role")
              .eq("id", applicationId)
              .eq("user_id", userId)
              .single();

            if (app) {
              await recordInterview(userId, applicationId, app.company, app.role, details);
              response += "✓ Interview recorded and application status updated.\n";
            }
          }
        }

        if (classification.confidence === "LOW") {
          response += "\n⚠ REQUIRES REVIEW — Low confidence classification. Please verify manually.";
        }

        return { content: [{ type: "text", text: response }] };
      }

      // Check all active applications
      const supabase = getSupabaseClient();
      const { data: apps } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["APPLIED", "SHORTLISTED", "INTERVIEW_INVITED", "ASSESSMENT"])
        .order("date_applied", { ascending: false });

      return {
        content: [{
          type: "text",
          text: `Active applications: ${apps?.length || 0}\n\n${(apps || []).map(a => `• ${a.company} — ${a.role}: ${a.status}`).join("\n")}\n\nTo check a specific application, provide the text from any recruiter email/message.`,
        }],
      };
    },
  );

  // ─── TOOL: detect-interviews ──────────────────────────────────
  server.tool(
    "detect-interviews",
    "Analyze text for interview invitations and extract date, time, meeting details.",
    {
      text: z.string().describe("Email or message text to analyze"),
      applicationId: z.string().optional().describe("Associated application ID"),
    },
    async ({ text, applicationId }) => {
      const userId = getCurrentUserId();

      const classification = classifyText(text);
      const details = extractInterviewDetails(text);

      let response = `Detection Result: ${classification.type}\nConfidence: ${classification.confidence}\n\n`;

      if (classification.type === "INTERVIEW" || classification.type === "ASSESSMENT") {
        response += `Interview Details:\n`;
        if (details.type) response += `  Type: ${details.type}\n`;
        if (details.round) response += `  Round: ${details.round}\n`;
        if (details.date) response += `  Date: ${details.date}\n`;
        if (details.time) response += `  Time: ${details.time}\n`;
        if (details.timezone) response += `  Timezone: ${details.timezone}\n`;
        if (details.meetingUrl) response += `  Meeting: ${details.meetingUrl}\n`;

        if (applicationId) {
          const supabase = getSupabaseClient();
          const { data: app } = await supabase
            .from("applications")
            .select("company, role")
            .eq("id", applicationId)
            .eq("user_id", userId)
            .single();

          if (app) {
            await recordInterview(userId, applicationId, app.company, app.role, details);
            response += `\n✓ Interview recorded for ${app.company} — ${app.role}`;
          }
        }
      }

      if (classification.confidence === "LOW") {
        response += "\n\n⚠ REQUIRES REVIEW — classification confidence is low.";
      }

      return { content: [{ type: "text", text: response }] };
    },
  );

  // ─── TOOL: get-upcoming-interviews ────────────────────────────
  server.tool(
    "get-upcoming-interviews",
    "Show upcoming interview schedule chronologically.",
    {},
    async () => {
      const userId = getCurrentUserId();
      const interviews = await getUpcomingInterviews(userId);

      if (interviews.length === 0) {
        return { content: [{ type: "text", text: "No upcoming interviews." }] };
      }

      const lines = interviews.map((i) =>
        `🎯 ${i.company} — ${i.role}\n   Round: ${i.round || "Interview"}\n   Type: ${i.type}\n   ${i.date ? `Date: ${i.date}` : "Date: TBD"}\n   ${i.time ? `Time: ${i.time} ${i.timezone || ""}` : ""}\n   ${i.meetingUrl ? `Meeting: ${i.meetingUrl}` : ""}\n   Status: ${i.status}`,
      );

      return {
        content: [{
          type: "text",
          text: `Upcoming Interviews (${interviews.length}):\n\n${lines.join("\n\n")}`,
        }],
      };
    },
  );

  // ─── TOOL: update-application-status ──────────────────────────
  server.tool(
    "update-application-status",
    "Manually update an application's status.",
    {
      applicationId: z.string().describe("Application ID"),
      status: ApplicationStatus.describe("New status"),
      reason: z.string().optional().describe("Reason for status change"),
    },
    async ({ applicationId, status, reason }) => {
      const userId = getCurrentUserId();
      const result = await updateApplicationStatus(userId, applicationId, status, reason);

      if (!result.success) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
      }

      return {
        content: [{
          type: "text",
          text: `Application status updated to: ${status}${reason ? `\nReason: ${reason}` : ""}`,
        }],
      };
    },
  );

  // ─── TOOL: generate-follow-up ─────────────────────────────────
  server.tool(
    "generate-follow-up",
    "Generate a follow-up message for an application. Only generates — does NOT send unless autonomous outreach is enabled.",
    {
      applicationId: z.string().describe("Application ID"),
    },
    async ({ applicationId }) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      const { data: app } = await supabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .single();

      if (!app) {
        return { content: [{ type: "text", text: "Application not found." }], isError: true };
      }

      const { data: profile } = await supabase
        .from("candidate_profiles")
        .select("full_name, email")
        .eq("user_id", userId)
        .single();

      const daysSince = app.date_applied
        ? Math.floor((Date.now() - new Date(app.date_applied).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const followUp = `Subject: Follow-up on ${app.role} Application\n\nDear Hiring Team,\n\nI hope this message finds you well. I am writing to follow up on my application for the ${app.role} position at ${app.company}, submitted on ${app.date_applied ? new Date(app.date_applied).toLocaleDateString() : "recently"}.\n\nI remain very interested in this opportunity and would welcome the chance to discuss how my skills and experience align with your team's needs.\n\nPlease let me know if you need any additional information.\n\nBest regards,\n${profile?.full_name || "Candidate"}\n${profile?.email || ""}`;

      return {
        content: [{
          type: "text",
          text: `Follow-up generated (${daysSince} days since application):\n\n${followUp}\n\n⚠ This message was NOT sent. Send it manually or enable autonomous outreach in settings.`,
        }],
      };
    },
  );

  // ─── TOOL: job-search-settings ────────────────────────────────
  server.tool(
    "job-search-settings",
    "View or update job search preferences and automation settings.",
    {
      action: z.enum(["get", "update"]).describe("Get or update settings"),
      targetRoles: z.array(z.string()).optional(),
      preferredLocations: z.array(z.string()).optional(),
      technologies: z.array(z.string()).optional(),
      minimumMatchScore: z.number().min(0).max(100).optional(),
      experienceLevel: z.array(ExperienceLevel).optional(),
      employmentTypes: z.array(EmploymentType).optional(),
      companiesToExclude: z.array(z.string()).optional(),
      companiesToInclude: z.array(z.string()).optional(),
      automationMode: AutomationMode.optional(),
      jobDiscovery: z.boolean().optional(),
      resumeTailoring: z.boolean().optional(),
      automaticApplications: z.boolean().optional(),
      applicationMonitoring: z.boolean().optional(),
      interviewDetection: z.boolean().optional(),
      emailMonitoring: z.boolean().optional(),
      calendarIntegration: z.boolean().optional(),
      recruiterFollowUp: z.boolean().optional(),
      notificationPreference: z.enum(["IMMEDIATE", "DAILY_SUMMARY", "BOTH"]).optional(),
      followUpDaysThreshold: z.number().optional(),
    },
    async (params) => {
      const userId = getCurrentUserId();
      const supabase = getSupabaseClient();

      if (params.action === "get") {
        const { data: profile } = await supabase
          .from("candidate_profiles")
          .select("job_preferences, preferred_locations, salary_expectations")
          .eq("user_id", userId)
          .single();

        const { data: settings } = await supabase
          .from("automation_settings")
          .select("*")
          .eq("user_id", userId)
          .single();

        return {
          content: [{
            type: "text",
            text: `Job Preferences:\n${JSON.stringify(profile?.job_preferences || {}, null, 2)}\n\nAutomation Settings:\n${JSON.stringify(settings || { mode: "APPROVAL_REQUIRED" }, null, 2)}`,
          }],
        };
      }

      // Update job preferences on profile
      if (params.targetRoles || params.preferredLocations || params.technologies || params.minimumMatchScore !== undefined) {
        const prefs: Record<string, unknown> = {};
        if (params.targetRoles) prefs.targetRoles = params.targetRoles;
        if (params.preferredLocations) prefs.preferredLocations = params.preferredLocations;
        if (params.technologies) prefs.technologies = params.technologies;
        if (params.minimumMatchScore !== undefined) prefs.minimumMatchScore = params.minimumMatchScore;
        if (params.experienceLevel) prefs.experienceLevel = params.experienceLevel;
        if (params.employmentTypes) prefs.employmentTypes = params.employmentTypes;
        if (params.companiesToExclude) prefs.companiesToExclude = params.companiesToExclude;
        if (params.companiesToInclude) prefs.companiesToInclude = params.companiesToInclude;

        await supabase
          .from("candidate_profiles")
          .update({
            job_preferences: prefs,
            preferred_locations: params.preferredLocations || [],
          })
          .eq("user_id", userId);
      }

      // Update automation settings
      const automationUpdate: Record<string, unknown> = { user_id: userId };
      if (params.automationMode) automationUpdate.mode = params.automationMode;
      if (params.jobDiscovery !== undefined) automationUpdate.job_discovery = params.jobDiscovery;
      if (params.resumeTailoring !== undefined) automationUpdate.resume_tailoring = params.resumeTailoring;
      if (params.automaticApplications !== undefined) automationUpdate.automatic_applications = params.automaticApplications;
      if (params.applicationMonitoring !== undefined) automationUpdate.application_monitoring = params.applicationMonitoring;
      if (params.interviewDetection !== undefined) automationUpdate.interview_detection = params.interviewDetection;
      if (params.emailMonitoring !== undefined) automationUpdate.email_monitoring = params.emailMonitoring;
      if (params.calendarIntegration !== undefined) automationUpdate.calendar_integration = params.calendarIntegration;
      if (params.recruiterFollowUp !== undefined) automationUpdate.recruiter_follow_up = params.recruiterFollowUp;
      if (params.notificationPreference) automationUpdate.notification_preference = params.notificationPreference;
      if (params.followUpDaysThreshold !== undefined) automationUpdate.follow_up_days_threshold = params.followUpDaysThreshold;

      await supabase
        .from("automation_settings")
        .upsert(automationUpdate, { onConflict: "user_id" });

      await logAuditEntry(userId, "Settings updated");

      return {
        content: [{
          type: "text",
          text: "Settings updated successfully. Use action: 'get' to view current settings.",
        }],
      };
    },
  );

  return server;
}

// ─── Cover Letter Generator ─────────────────────────────────────

function generateCoverLetterContent(
  profile: import("./types/index.js").CandidateProfile,
  job: Record<string, unknown>,
  analysis: import("./types/index.js").JDAnalysis,
  match: import("./types/index.js").JobMatch,
  tone: string,
): string {
  const company = String(job.company);
  const role = String(job.title);

  const relevantProjects = profile.projects
    .filter((p) =>
      match.matchingSkills.some((s) =>
        p.technologies.some((t) => t.toLowerCase().includes(s.toLowerCase())),
      ),
    )
    .slice(0, 2);

  const greeting = tone === "conversational"
    ? `Dear Hiring Manager,\n\nI'm excited to apply for`
    : `Dear Hiring Team,\n\nI am writing to express my strong interest in`;

  const lines: string[] = [];
  lines.push(`${greeting} the ${role} position at ${company}.`);
  lines.push(``);

  // Education
  if (profile.education.length > 0) {
    const edu = profile.education[0];
    lines.push(`I am a ${edu.degree} ${edu.field} graduate from ${edu.institution}.`);
  }

  // Matching skills
  if (match.matchingSkills.length > 0) {
    lines.push(`My technical expertise includes ${match.matchingSkills.slice(0, 6).join(", ")}, which directly align with your requirements.`);
  }

  // Relevant projects
  for (const proj of relevantProjects) {
    lines.push(`In my project "${proj.name}", I ${proj.highlights[0] || proj.description}.`);
  }

  // Relevant experience
  const relevantExp = profile.experience.length > 0
    ? profile.experience[0]
    : profile.internships.length > 0 ? profile.internships[0] : null;

  if (relevantExp) {
    lines.push(`During my ${relevantExp.title} at ${relevantExp.company}, I gained hands-on experience with ${relevantExp.technologies.slice(0, 3).join(", ")}.`);
  }

  lines.push(``);
  lines.push(`I am enthusiastic about the opportunity to contribute to ${company}'s team and would welcome the chance to discuss how my skills and experience can add value to your organization.`);
  lines.push(``);
  lines.push(`Thank you for considering my application.`);
  lines.push(``);
  lines.push(`Best regards,`);
  lines.push(profile.fullName);
  if (profile.email) lines.push(profile.email);
  if (profile.phone) lines.push(profile.phone);

  return lines.join("\n");
}
