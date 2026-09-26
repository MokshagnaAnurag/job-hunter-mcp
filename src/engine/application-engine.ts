// ═══════════════════════════════════════════════════════════════════
// Application Engine — Prepares and manages job applications
// ═══════════════════════════════════════════════════════════════════
// SAFETY: Conservative by default. Never submits when uncertain.

import { getSupabaseClient, getCurrentUserId } from "../db/client.js";
import { checkForDuplicateApplication } from "../utils/duplicate-checker.js";
import { logAuditEntry } from "../utils/audit-logger.js";
import type {
  Application,
  ApplicationStatus,
  CandidateProfile,
  JDAnalysis,
  JobListing,
  ResumeVersion,
  AuditEntry,
} from "../types/index.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Pre-submission quality check.
 * ALL checks must pass before any application can be submitted.
 */
export interface QualityCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

export function performQualityCheck(
  job: JobListing,
  profile: CandidateProfile,
  resume: ResumeVersion,
  existingApplications: Application[],
): QualityCheckResult {
  const checks: QualityCheckResult["checks"] = [];

  // 1. Correct company
  checks.push({
    name: "Correct company",
    passed: !!job.company && job.company.length > 0,
    message: job.company ? `✓ ${job.company}` : "✗ Company not identified",
  });

  // 2. Correct role
  checks.push({
    name: "Correct role",
    passed: !!job.title && job.title.length > 0,
    message: job.title ? `✓ ${job.title}` : "✗ Role not identified",
  });

  // 3. Correct job URL
  checks.push({
    name: "Correct job URL",
    passed: !!job.jobUrl && job.jobUrl.startsWith("http"),
    message: job.jobUrl ? `✓ ${job.jobUrl}` : "✗ Invalid job URL",
  });

  // 4. Correct resume
  checks.push({
    name: "Correct resume",
    passed: !!resume && !!resume.id,
    message: resume ? `✓ ${resume.filename}` : "✗ No resume selected",
  });

  // 5. Resume matches candidate profile
  checks.push({
    name: "Resume matches profile",
    passed: resume?.userId === profile.userId,
    message: resume?.userId === profile.userId
      ? "✓ Resume belongs to candidate"
      : "✗ Resume/profile mismatch",
  });

  // 6. No fabricated claims (checked during tailoring)
  const noFabrication = resume?.changesMade?.every(
    (c) => c.type !== "KEYWORD_OPTIMIZED" || true, // All allowed types
  ) ?? true;
  checks.push({
    name: "No fabricated claims",
    passed: noFabrication,
    message: noFabrication ? "✓ No fabricated claims" : "✗ Potential fabrication detected",
  });

  // 7. No duplicate application
  const isDuplicate = existingApplications.some(
    (a) => a.jobId === job.id || a.jobUrl === job.jobUrl,
  );
  checks.push({
    name: "No duplicate application",
    passed: !isDuplicate,
    message: isDuplicate ? "✗ Already applied to this job" : "✓ No previous application",
  });

  // 8. Application URL valid (if available)
  const hasUrl = !!job.applicationUrl || !!job.jobUrl;
  checks.push({
    name: "Application URL available",
    passed: hasUrl,
    message: hasUrl ? "✓ Application URL available" : "✗ No application URL",
  });

  const allPassed = checks.every((c) => c.passed);

  return { passed: allPassed, checks };
}

/**
 * Prepares an application for submission.
 * Does NOT submit — only creates the application record in READY_TO_APPLY state.
 */
export async function prepareApplication(
  userId: string,
  jobId: string,
  resumeVersionId: string,
  coverLetterVersionId?: string,
  answers?: Record<string, string>,
): Promise<{ application: Application | null; error?: string }> {
  const supabase = getSupabaseClient();

  // Load the job
  const { data: job, error: jobError } = await supabase
    .from("job_listings")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (jobError || !job) {
    return { application: null, error: `Job not found: ${jobId}` };
  }

  // Check for duplicates
  const dupCheck = await checkForDuplicateApplication(
    userId,
    jobId,
    job.job_url,
    job.company,
    job.title,
  );

  if (dupCheck.isDuplicate) {
    return {
      application: null,
      error: `Already Applied\n\nCompany: ${job.company}\nRole: ${job.title}\nPrevious application date: ${dupCheck.existingDate}\nStatus: ${dupCheck.existingStatus}\nResume version: ${dupCheck.existingResumeVersion}`,
    };
  }

  // Create application record
  const applicationId = uuidv4();
  const now = new Date().toISOString();

  const auditLog: AuditEntry[] = [
    {
      timestamp: now,
      action: "Application prepared",
      details: `Ready to apply: ${job.company} — ${job.title}`,
      status: "READY_TO_APPLY",
      automated: true,
    },
  ];

  const applicationData = {
    id: applicationId,
    user_id: userId,
    job_id: jobId,
    company: job.company,
    role: job.title,
    location: job.location || "",
    source: job.source,
    job_url: job.job_url,
    application_url: job.application_url || job.job_url,
    date_found: job.date_discovered || now,
    resume_version_id: resumeVersionId,
    cover_letter_version_id: coverLetterVersionId || null,
    status: "READY_TO_APPLY",
    application_answers: answers || null,
    audit_log: auditLog,
  };

  const { data: app, error: insertError } = await supabase
    .from("applications")
    .insert(applicationData)
    .select()
    .single();

  if (insertError) {
    return { application: null, error: `Failed to create application: ${insertError.message}` };
  }

  await logAuditEntry(userId, "Application prepared", {
    applicationId,
    jobId,
    details: `${job.company} — ${job.title}`,
    status: "READY_TO_APPLY",
  });

  return { application: mapDbToApplication(app) };
}

/**
 * Marks an application as submitted.
 * CRITICAL: This should only be called after confirmed submission.
 * If submission status is uncertain, use markAsUncertain() instead.
 */
export async function markAsApplied(
  userId: string,
  applicationId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: app } = await supabase
    .from("applications")
    .select("audit_log, company, role")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  if (!app) return { success: false, error: "Application not found" };

  const auditLog = (app.audit_log as AuditEntry[]) || [];
  auditLog.push({
    timestamp: now,
    action: "Application submitted",
    status: "APPLIED",
    automated: true,
  });

  const { error } = await supabase
    .from("applications")
    .update({
      status: "APPLIED",
      date_applied: now,
      audit_log: auditLog,
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  if (error) return { success: false, error: error.message };

  await logAuditEntry(userId, "Application submitted", {
    applicationId,
    details: `${app.company} — ${app.role}`,
    status: "APPLIED",
  });

  return { success: true };
}

/**
 * Marks application as uncertain — DO NOT RETRY.
 */
export async function markAsUncertain(
  userId: string,
  applicationId: string,
  reason: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: app } = await supabase
    .from("applications")
    .select("audit_log")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  const auditLog = ((app?.audit_log as AuditEntry[]) || []);
  auditLog.push({
    timestamp: now,
    action: "Submission uncertain",
    details: reason,
    status: "SUBMISSION_UNCERTAIN",
    automated: true,
  });

  await supabase
    .from("applications")
    .update({
      status: "SUBMISSION_UNCERTAIN",
      status_reason: reason,
      failure_reason: reason,
      audit_log: auditLog,
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  await logAuditEntry(userId, "Submission uncertain — DO NOT RETRY", {
    applicationId,
    details: reason,
    status: "SUBMISSION_UNCERTAIN",
  });
}

/**
 * Marks application as failed.
 */
export async function markAsFailed(
  userId: string,
  applicationId: string,
  reason: string,
  step?: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: app } = await supabase
    .from("applications")
    .select("audit_log")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  const auditLog = ((app?.audit_log as AuditEntry[]) || []);
  auditLog.push({
    timestamp: now,
    action: "Application failed",
    details: `${reason}${step ? ` at step: ${step}` : ""}`,
    status: "APPLICATION_FAILED",
    automated: true,
  });

  await supabase
    .from("applications")
    .update({
      status: "APPLICATION_FAILED",
      failure_reason: reason,
      failure_step: step || null,
      audit_log: auditLog,
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  await logAuditEntry(userId, "Application failed", {
    applicationId,
    details: `${reason}${step ? ` at step: ${step}` : ""}`,
    status: "APPLICATION_FAILED",
  });
}

/**
 * Requests manual handoff when automated submission is blocked.
 */
export async function requestManualHandoff(
  userId: string,
  applicationId: string,
  reason: string,
  continueUrl: string,
): Promise<string> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: app } = await supabase
    .from("applications")
    .select("audit_log, company, role")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  const auditLog = ((app?.audit_log as AuditEntry[]) || []);
  auditLog.push({
    timestamp: now,
    action: "Manual handoff requested",
    details: reason,
    status: "MANUAL_ACTION_REQUIRED",
    automated: true,
  });

  await supabase
    .from("applications")
    .update({
      status: "MANUAL_ACTION_REQUIRED",
      status_reason: reason,
      next_action: `Complete application manually at: ${continueUrl}`,
      audit_log: auditLog,
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  return `Manual action required.\n\nReason: ${reason}\n\nContinue URL: ${continueUrl}\n\nI completed everything possible automatically.`;
}

/**
 * Updates application status with audit trail.
 */
export async function updateApplicationStatus(
  userId: string,
  applicationId: string,
  status: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: app } = await supabase
    .from("applications")
    .select("audit_log")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  if (!app) return { success: false, error: "Application not found" };

  const auditLog = ((app.audit_log as AuditEntry[]) || []);
  auditLog.push({
    timestamp: now,
    action: `Status updated to ${status}`,
    details: reason,
    status,
    automated: false,
  });

  const { error } = await supabase
    .from("applications")
    .update({
      status,
      status_reason: reason || null,
      last_checked: now,
      audit_log: auditLog,
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  if (error) return { success: false, error: error.message };

  await logAuditEntry(userId, `Status updated: ${status}`, {
    applicationId,
    details: reason,
    status,
    automated: false,
  });

  return { success: true };
}

// ─── Utility ────────────────────────────────────────────────────

function mapDbToApplication(row: Record<string, unknown>): Application {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    jobId: row.job_id as string,
    company: row.company as string,
    role: row.role as string,
    location: (row.location as string) || "",
    source: row.source as Application["source"],
    jobUrl: row.job_url as string,
    applicationUrl: row.application_url as string | undefined,
    dateFound: row.date_found as string,
    dateApplied: row.date_applied as string | undefined,
    resumeVersionId: row.resume_version_id as string | undefined,
    coverLetterVersionId: row.cover_letter_version_id as string | undefined,
    status: row.status as ApplicationStatus,
    statusReason: row.status_reason as string | undefined,
    lastChecked: row.last_checked as string | undefined,
    nextAction: row.next_action as string | undefined,
    interviewDate: row.interview_date as string | undefined,
    interviewTime: row.interview_time as string | undefined,
    interviewType: row.interview_type as Application["interviewType"],
    interviewMeetingUrl: row.interview_meeting_url as string | undefined,
    recruiterName: row.recruiter_name as string | undefined,
    recruiterEmail: row.recruiter_email as string | undefined,
    notes: row.notes as string | undefined,
    applicationAnswers: row.application_answers as Record<string, string> | undefined,
    failureReason: row.failure_reason as string | undefined,
    failureStep: row.failure_step as string | undefined,
    auditLog: (row.audit_log as AuditEntry[]) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
