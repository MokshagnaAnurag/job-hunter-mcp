// ═══════════════════════════════════════════════════════════════════
// Duplicate Application Checker
// ═══════════════════════════════════════════════════════════════════

import { getSupabaseClient } from "../db/client.js";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingApplicationId?: string;
  existingStatus?: string;
  existingDate?: string;
  existingResumeVersion?: string;
  reason?: string;
}

/**
 * Normalizes a URL for comparison by removing trailing slashes,
 * query parameters, and fragments.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove common tracking parameters
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("ref");
    parsed.searchParams.delete("refId");
    parsed.searchParams.delete("trackingId");
    parsed.hash = "";
    let normalized = parsed.toString();
    // Remove trailing slash
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Normalizes company name for comparison.
 */
function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/\b(inc|llc|ltd|corp|co|pvt|private|limited|technologies|tech|software|solutions)\b\.?/gi, "")
    .replace(/[.,\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes job title for comparison.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[.,\-_()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if the user has already applied to a job.
 * Checks by:
 * 1. Exact job ID match
 * 2. Normalized job URL match
 * 3. Company + Title match (fuzzy)
 */
export async function checkForDuplicateApplication(
  userId: string,
  jobId?: string,
  jobUrl?: string,
  company?: string,
  title?: string,
): Promise<DuplicateCheckResult> {
  const supabase = getSupabaseClient();

  // 1. Check by exact job ID
  if (jobId) {
    const { data: byJobId } = await supabase
      .from("applications")
      .select("id, status, date_applied, resume_version_id")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (byJobId) {
      return {
        isDuplicate: true,
        existingApplicationId: byJobId.id,
        existingStatus: byJobId.status,
        existingDate: byJobId.date_applied,
        existingResumeVersion: byJobId.resume_version_id,
        reason: `Already applied to this job (ID: ${jobId})`,
      };
    }
  }

  // 2. Check by normalized URL
  if (jobUrl) {
    const normalizedUrl = normalizeUrl(jobUrl);
    const { data: allApps } = await supabase
      .from("applications")
      .select("id, status, date_applied, resume_version_id, job_url")
      .eq("user_id", userId);

    if (allApps) {
      for (const app of allApps) {
        if (normalizeUrl(app.job_url) === normalizedUrl) {
          return {
            isDuplicate: true,
            existingApplicationId: app.id,
            existingStatus: app.status,
            existingDate: app.date_applied,
            existingResumeVersion: app.resume_version_id,
            reason: `Already applied via same URL`,
          };
        }
      }
    }
  }

  // 3. Check by company + title
  if (company && title) {
    const normCompany = normalizeCompany(company);
    const normTitle = normalizeTitle(title);

    const { data: allApps } = await supabase
      .from("applications")
      .select("id, status, date_applied, resume_version_id, company, role")
      .eq("user_id", userId);

    if (allApps) {
      for (const app of allApps) {
        const appCompany = normalizeCompany(app.company);
        const appTitle = normalizeTitle(app.role);

        if (appCompany === normCompany && appTitle === normTitle) {
          return {
            isDuplicate: true,
            existingApplicationId: app.id,
            existingStatus: app.status,
            existingDate: app.date_applied,
            existingResumeVersion: app.resume_version_id,
            reason: `Already applied to ${app.company} — ${app.role}`,
          };
        }
      }
    }
  }

  return { isDuplicate: false };
}
