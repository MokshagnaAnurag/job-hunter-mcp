// ═══════════════════════════════════════════════════════════════════
// Resume Tailoring Engine
// ═══════════════════════════════════════════════════════════════════
// Optimizes resume presentation for specific JDs WITHOUT fabricating
// any information. Only reorders, emphasizes, and keyword-optimizes
// genuinely held skills and experience.

import type {
  CandidateProfile,
  JDAnalysis,
  JobMatch,
  ResumeChange,
  ResumeTailoringReport,
  FabricationCheckResult,
} from "../types/index.js";
import { checkForFabrication, extractAllCandidateSkills } from "../utils/fabrication-guard.js";

/**
 * Generates a tailored resume structure based on the JD analysis.
 * Returns the modifications to make + a fabrication check result.
 *
 * CRITICAL: This ONLY reorders and emphasizes existing information.
 * It NEVER adds new skills, experience, or qualifications.
 */
export function generateTailoringPlan(
  profile: CandidateProfile,
  analysis: JDAnalysis,
  match: JobMatch,
): {
  changes: ResumeChange[];
  report: ResumeTailoringReport;
  fabricationCheck: FabricationCheckResult;
  tailoredSections: TailoredSections;
} {
  const changes: ResumeChange[] = [];
  const addedEmphasis: string[] = [];
  const reordered: string[] = [];
  const deEmphasized: string[] = [];

  // 1. Identify relevant skills to emphasize (only from candidate's actual skills)
  const candidateSkills = extractAllCandidateSkills(profile);
  const jdTechnologies = [
    ...analysis.requirements.programmingLanguages,
    ...analysis.requirements.roboticsFrameworks,
    ...analysis.requirements.embeddedTechnologies,
    ...analysis.requirements.tools,
    ...analysis.requirements.hardware,
    ...analysis.requirements.protocols,
  ];

  const skillsToEmphasize = jdTechnologies.filter((tech) =>
    candidateSkills.has(tech.toLowerCase().trim()),
  );

  if (skillsToEmphasize.length > 0) {
    changes.push({
      type: "ADDED_EMPHASIS",
      description: "Emphasized matching technologies in skills section",
      section: "Technical Skills",
      items: skillsToEmphasize,
    });
    addedEmphasis.push(...skillsToEmphasize);
  }

  // 2. Reorder projects by relevance to JD
  const projectOrder = reorderByRelevance(
    profile.projects.map((p) => ({
      name: p.name,
      technologies: p.technologies,
      text: `${p.name} ${p.description} ${p.technologies.join(" ")}`,
    })),
    jdTechnologies,
  );

  if (projectOrder.reordered) {
    changes.push({
      type: "REORDERED",
      description: "Reordered projects by relevance to JD",
      section: "Projects",
      items: projectOrder.order,
    });
    reordered.push(...projectOrder.order.slice(0, 3).map((p) => `Project: ${p}`));
  }

  // 3. Reorder experience/internships by relevance
  const experienceItems = [
    ...profile.experience.map((e) => ({
      name: `${e.title} at ${e.company}`,
      technologies: e.technologies,
      text: `${e.title} ${e.company} ${e.responsibilities.join(" ")} ${e.technologies.join(" ")}`,
    })),
    ...profile.internships.map((i) => ({
      name: `${i.title} at ${i.company}`,
      technologies: i.technologies,
      text: `${i.title} ${i.company} ${i.responsibilities.join(" ")} ${i.technologies.join(" ")}`,
    })),
  ];

  const expOrder = reorderByRelevance(experienceItems, jdTechnologies);
  if (expOrder.reordered) {
    changes.push({
      type: "REORDERED",
      description: "Reordered experience by relevance to JD",
      section: "Experience",
      items: expOrder.order,
    });
    reordered.push(...expOrder.order.slice(0, 2).map((e) => `Experience: ${e}`));
  }

  // 4. Identify less relevant items to de-emphasize (not remove)
  const lessRelevantProjects = profile.projects.filter((p) => {
    const techOverlap = p.technologies.some((t) =>
      jdTechnologies.some((jt) => t.toLowerCase().includes(jt.toLowerCase())),
    );
    return !techOverlap;
  });

  if (lessRelevantProjects.length > 0) {
    changes.push({
      type: "DE_EMPHASIZED",
      description: "De-emphasized less relevant projects (kept but lower priority)",
      section: "Projects",
      items: lessRelevantProjects.map((p) => p.name),
    });
    deEmphasized.push(...lessRelevantProjects.map((p) => p.name));
  }

  // 5. Keyword optimization (reword bullets to match JD terminology)
  const keywordChanges = optimizeKeywords(profile, jdTechnologies);
  if (keywordChanges.length > 0) {
    changes.push({
      type: "KEYWORD_OPTIMIZED",
      description: "Optimized keyword usage for ATS compatibility",
      items: keywordChanges,
    });
    addedEmphasis.push(...keywordChanges);
  }

  // 6. Section order optimization
  const sectionOrder = optimizeSectionOrder(profile, analysis);
  if (sectionOrder.changed) {
    changes.push({
      type: "SECTION_REORDERED",
      description: "Optimized section order for maximum impact",
      items: sectionOrder.order,
    });
  }

  // Fabrication check — MANDATORY
  const fabricationCheck = checkForFabrication(
    profile,
    skillsToEmphasize,    // Only skills from profile, should pass
    [],                    // No new companies added
    [],                    // No new projects added
    [],                    // No new certifications added
  );

  const report: ResumeTailoringReport = {
    addedEmphasis,
    reordered,
    deEmphasized,
    removed: [],  // We never remove content, only de-emphasize
    fabricatedInformation: fabricationCheck.unsupportedClaims,
    fabricationCheck,
  };

  // Generate tailored sections
  const tailoredSections = generateTailoredSections(
    profile,
    analysis,
    skillsToEmphasize,
    projectOrder.order,
    expOrder.order,
  );

  return { changes, report, fabricationCheck, tailoredSections };
}

// ─── Section Ordering ───────────────────────────────────────────

interface RelevanceItem {
  name: string;
  technologies: string[];
  text: string;
}

function reorderByRelevance(
  items: RelevanceItem[],
  jdTechnologies: string[],
): { reordered: boolean; order: string[] } {
  if (items.length <= 1) {
    return { reordered: false, order: items.map((i) => i.name) };
  }

  const scored = items.map((item) => {
    let score = 0;
    const lowerText = item.text.toLowerCase();

    for (const tech of jdTechnologies) {
      if (lowerText.includes(tech.toLowerCase())) {
        score += 10;
      }
    }

    // Bonus for technology array matches
    for (const tech of item.technologies) {
      if (jdTechnologies.some((jt) => jt.toLowerCase() === tech.toLowerCase())) {
        score += 5;
      }
    }

    return { name: item.name, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const originalOrder = items.map((i) => i.name);
  const newOrder = scored.map((s) => s.name);

  const reordered = JSON.stringify(originalOrder) !== JSON.stringify(newOrder);

  return { reordered, order: newOrder };
}

function optimizeKeywords(
  profile: CandidateProfile,
  jdTechnologies: string[],
): string[] {
  const optimizations: string[] = [];
  const candidateSkills = extractAllCandidateSkills(profile);

  // Find matching skills that could benefit from keyword alignment
  for (const tech of jdTechnologies) {
    const normalized = tech.toLowerCase().trim();
    if (candidateSkills.has(normalized)) {
      // Ensure the exact JD phrasing is used (e.g., "ROS2" vs "ROS 2")
      optimizations.push(`Use "${tech}" (JD phrasing)`);
    }
  }

  return optimizations;
}

function optimizeSectionOrder(
  profile: CandidateProfile,
  analysis: JDAnalysis,
): { changed: boolean; order: string[] } {
  // For fresh graduates, projects and skills should come before experience
  const isFreshGrad = profile.experience.length === 0 ||
    profile.jobPreferences.experienceLevel.includes("ENTRY");

  const defaultOrder = ["Summary", "Education", "Experience", "Projects", "Skills", "Certifications"];

  const optimizedOrder = isFreshGrad
    ? ["Summary", "Skills", "Projects", "Education", "Internships", "Certifications"]
    : ["Summary", "Experience", "Skills", "Projects", "Education", "Certifications"];

  return {
    changed: JSON.stringify(defaultOrder) !== JSON.stringify(optimizedOrder),
    order: optimizedOrder,
  };
}

// ─── Tailored Sections Output ───────────────────────────────────

export interface TailoredSections {
  summary: string;
  skills: TailoredSkillsSection;
  projects: TailoredProject[];
  experience: TailoredExperience[];
  education: string[];
  certifications: string[];
  sectionOrder: string[];
}

interface TailoredSkillsSection {
  emphasized: string[];
  other: string[];
  allSkills: Record<string, string[]>;
}

interface TailoredProject {
  name: string;
  description: string;
  technologies: string[];
  highlights: string[];
  relevanceScore: number;
}

interface TailoredExperience {
  title: string;
  company: string;
  period: string;
  responsibilities: string[];
  technologies: string[];
  relevanceScore: number;
}

function generateTailoredSections(
  profile: CandidateProfile,
  analysis: JDAnalysis,
  emphasizedSkills: string[],
  projectOrder: string[],
  experienceOrder: string[],
): TailoredSections {
  const jdTechs = [
    ...analysis.requirements.programmingLanguages,
    ...analysis.requirements.roboticsFrameworks,
    ...analysis.requirements.embeddedTechnologies,
    ...analysis.requirements.tools,
  ];

  // Tailored summary — use only genuine info
  const summary = profile.summary || "";

  // Skills section with emphasized skills first
  const allSkills: Record<string, string[]> = {
    "Programming Languages": profile.technicalSkills.programmingLanguages,
    "Frameworks": profile.technicalSkills.frameworks,
    "Robotics": profile.technicalSkills.roboticsFrameworks,
    "Embedded": profile.technicalSkills.embeddedTechnologies,
    "Tools": profile.technicalSkills.tools,
    "Hardware": profile.technicalSkills.hardware,
    "Protocols": profile.technicalSkills.protocols,
    "Operating Systems": profile.technicalSkills.operatingSystems,
  };

  const otherSkills = [...extractAllCandidateSkills(profile)]
    .filter((s) => !emphasizedSkills.map((e) => e.toLowerCase()).includes(s));

  // Reorder projects
  const projectMap = new Map(profile.projects.map((p) => [p.name, p]));
  const tailoredProjects: TailoredProject[] = projectOrder
    .map((name) => projectMap.get(name))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => {
      const relevance = p.technologies.filter((t) =>
        jdTechs.some((jt) => jt.toLowerCase() === t.toLowerCase()),
      ).length;
      return {
        name: p.name,
        description: p.description,
        technologies: p.technologies,
        highlights: p.highlights,
        relevanceScore: relevance,
      };
    });

  // Add any projects not in the order
  for (const p of profile.projects) {
    if (!projectOrder.includes(p.name)) {
      tailoredProjects.push({
        name: p.name,
        description: p.description,
        technologies: p.technologies,
        highlights: p.highlights,
        relevanceScore: 0,
      });
    }
  }

  // Reorder experience
  const allExp = [
    ...profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      period: `${e.startDate} - ${e.endDate || "Present"}`,
      responsibilities: e.responsibilities,
      technologies: e.technologies,
    })),
    ...profile.internships.map((i) => ({
      title: i.title,
      company: i.company,
      period: `${i.startDate} - ${i.endDate || "Present"}`,
      responsibilities: i.responsibilities,
      technologies: i.technologies,
    })),
  ];

  const tailoredExperience: TailoredExperience[] = allExp.map((e) => {
    const relevance = e.technologies.filter((t) =>
      jdTechs.some((jt) => jt.toLowerCase() === t.toLowerCase()),
    ).length;
    return { ...e, relevanceScore: relevance };
  });

  tailoredExperience.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Education
  const education = profile.education.map((e) =>
    `${e.degree} in ${e.field} — ${e.institution}${e.gpa ? ` (GPA: ${e.gpa})` : ""}`,
  );

  // Certifications
  const certifications = profile.certifications.map((c) =>
    `${c.name} — ${c.issuer}${c.date ? ` (${c.date})` : ""}`,
  );

  return {
    summary,
    skills: {
      emphasized: emphasizedSkills,
      other: otherSkills,
      allSkills,
    },
    projects: tailoredProjects,
    experience: tailoredExperience,
    education,
    certifications,
    sectionOrder: optimizeSectionOrder(profile, analysis).order,
  };
}

/**
 * Generates a LaTeX resume from tailored sections.
 * Uses a clean, ATS-friendly template.
 */
export function generateLatexResume(
  profile: CandidateProfile,
  tailored: TailoredSections,
  targetCompany: string,
  targetRole: string,
): string {
  const lines: string[] = [];

  lines.push(`\\documentclass[11pt,a4paper]{article}`);
  lines.push(`\\usepackage[margin=0.7in]{geometry}`);
  lines.push(`\\usepackage{enumitem}`);
  lines.push(`\\usepackage{hyperref}`);
  lines.push(`\\usepackage{titlesec}`);
  lines.push(`\\usepackage[utf8]{inputenc}`);
  lines.push(``);
  lines.push(`% ATS-friendly formatting`);
  lines.push(`\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]`);
  lines.push(`\\titlespacing*{\\section}{0pt}{8pt}{4pt}`);
  lines.push(`\\setlength{\\parindent}{0pt}`);
  lines.push(`\\pagestyle{empty}`);
  lines.push(``);
  lines.push(`% Generated for: ${escapeLatex(targetCompany)} — ${escapeLatex(targetRole)}`);
  lines.push(`% Generated at: ${new Date().toISOString()}`);
  lines.push(`% Source: Master Resume (NEVER overwritten)`);
  lines.push(``);
  lines.push(`\\begin{document}`);
  lines.push(``);

  // Header
  lines.push(`\\begin{center}`);
  lines.push(`{\\LARGE\\textbf{${escapeLatex(profile.fullName)}}}\\\\ \\vspace{2pt}`);
  const contactParts: string[] = [];
  if (profile.email) contactParts.push(profile.email);
  if (profile.phone) contactParts.push(profile.phone);
  if (profile.location) contactParts.push(profile.location);
  lines.push(contactParts.map(escapeLatex).join(" | "));
  lines.push(`\\\\ \\vspace{2pt}`);
  const linkParts: string[] = [];
  if (profile.linkedinUrl) linkParts.push(`\\href{${profile.linkedinUrl}}{LinkedIn}`);
  if (profile.githubUrl) linkParts.push(`\\href{${profile.githubUrl}}{GitHub}`);
  if (profile.portfolioUrl) linkParts.push(`\\href{${profile.portfolioUrl}}{Portfolio}`);
  if (linkParts.length > 0) lines.push(linkParts.join(" | "));
  lines.push(`\\end{center}`);
  lines.push(``);

  // Render sections in optimized order
  for (const section of tailored.sectionOrder) {
    switch (section) {
      case "Summary":
        if (tailored.summary) {
          lines.push(`\\section*{Summary}`);
          lines.push(escapeLatex(tailored.summary));
          lines.push(``);
        }
        break;

      case "Skills":
        lines.push(`\\section*{Technical Skills}`);
        // Emphasized skills first
        if (tailored.skills.emphasized.length > 0) {
          lines.push(`\\textbf{Key Skills:} ${tailored.skills.emphasized.map(escapeLatex).join(", ")}`);
          lines.push(``);
        }
        // Categorized skills
        for (const [category, skills] of Object.entries(tailored.skills.allSkills)) {
          if (skills.length > 0) {
            lines.push(`\\textbf{${escapeLatex(category)}:} ${skills.map(escapeLatex).join(", ")}`);
            lines.push(``);
          }
        }
        break;

      case "Projects":
        if (tailored.projects.length > 0) {
          lines.push(`\\section*{Projects}`);
          for (const proj of tailored.projects) {
            lines.push(`\\textbf{${escapeLatex(proj.name)}} \\hfill \\textit{${proj.technologies.map(escapeLatex).join(", ")}}`);
            lines.push(`\\begin{itemize}[leftmargin=*, nosep]`);
            lines.push(`\\item ${escapeLatex(proj.description)}`);
            for (const h of proj.highlights) {
              lines.push(`\\item ${escapeLatex(h)}`);
            }
            lines.push(`\\end{itemize}`);
            lines.push(``);
          }
        }
        break;

      case "Experience":
      case "Internships":
        if (tailored.experience.length > 0) {
          lines.push(`\\section*{Experience}`);
          for (const exp of tailored.experience) {
            lines.push(`\\textbf{${escapeLatex(exp.title)}} — ${escapeLatex(exp.company)} \\hfill ${escapeLatex(exp.period)}`);
            if (exp.responsibilities.length > 0) {
              lines.push(`\\begin{itemize}[leftmargin=*, nosep]`);
              for (const resp of exp.responsibilities) {
                lines.push(`\\item ${escapeLatex(resp)}`);
              }
              lines.push(`\\end{itemize}`);
            }
            lines.push(``);
          }
        }
        break;

      case "Education":
        if (tailored.education.length > 0) {
          lines.push(`\\section*{Education}`);
          for (const edu of tailored.education) {
            lines.push(escapeLatex(edu));
            lines.push(``);
          }
        }
        break;

      case "Certifications":
        if (tailored.certifications.length > 0) {
          lines.push(`\\section*{Certifications}`);
          for (const cert of tailored.certifications) {
            lines.push(escapeLatex(cert));
            lines.push(``);
          }
        }
        break;
    }
  }

  // Achievements
  if (profile.achievements.length > 0) {
    lines.push(`\\section*{Achievements}`);
    lines.push(`\\begin{itemize}[leftmargin=*, nosep]`);
    for (const ach of profile.achievements) {
      lines.push(`\\item ${escapeLatex(ach)}`);
    }
    lines.push(`\\end{itemize}`);
  }

  lines.push(``);
  lines.push(`\\end{document}`);

  return lines.join("\n");
}

/**
 * Escapes special LaTeX characters.
 */
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/**
 * Formats the tailoring report as a human-readable string.
 */
export function formatTailoringReport(report: ResumeTailoringReport): string {
  const lines: string[] = [];

  lines.push("Resume Tailoring Report");
  lines.push("═══════════════════════════════════");

  lines.push("\nAdded emphasis:");
  for (const item of report.addedEmphasis) {
    lines.push(`  ✓ ${item}`);
  }
  if (report.addedEmphasis.length === 0) lines.push("  (none)");

  lines.push("\nReordered:");
  for (const item of report.reordered) {
    lines.push(`  ✓ ${item}`);
  }
  if (report.reordered.length === 0) lines.push("  (none)");

  lines.push("\nDe-emphasized:");
  for (const item of report.deEmphasized) {
    lines.push(`  ✓ ${item}`);
  }
  if (report.deEmphasized.length === 0) lines.push("  (none)");

  lines.push("\nRemoved:");
  lines.push("  None (content is never removed)");

  lines.push("\nFabrication check:");
  lines.push(`  ${report.fabricationCheck.verification}`);

  return lines.join("\n");
}
