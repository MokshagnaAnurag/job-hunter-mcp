// ═══════════════════════════════════════════════════════════════════
// Job Discovery Engine — Multi-source job search
// ═══════════════════════════════════════════════════════════════════
// IMPORTANT: Only uses official, documented APIs.
// Platforms without public APIs are supported in DISCOVER ONLY mode —
// jobs are surfaced to the user who can then apply manually.

import type { JobListing, SearchJobsInput, JobSource } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";
import { extractAllTechnologiesFlat } from "./jd-parser.js";

// ─── Source Adapters ────────────────────────────────────────────

/**
 * Base interface for job source adapters.
 * Each adapter implements search for a specific platform.
 */
interface JobSourceAdapter {
  source: JobSource;
  name: string;
  hasOfficialApi: boolean;
  supportsAutomatedApplication: boolean;
  search(params: SearchJobsInput, userId: string): Promise<Partial<JobListing>[]>;
}

/**
 * Adzuna API adapter — Official public API available.
 * https://developer.adzuna.com/
 */
class AdzunaAdapter implements JobSourceAdapter {
  source: JobSource = "ADZUNA";
  name = "Adzuna";
  hasOfficialApi = true;
  supportsAutomatedApplication = false;

  async search(params: SearchJobsInput, userId: string): Promise<Partial<JobListing>[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;

    if (!appId || !appKey) return [];

    try {
      const keywords = params.keywords?.join(" ") || "";
      const location = params.location || "india";
      const country = "in"; // Default to India

      const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
      url.searchParams.set("app_id", appId);
      url.searchParams.set("app_key", appKey);
      url.searchParams.set("results_per_page", String(params.limit || 25));
      if (keywords) url.searchParams.set("what", keywords);
      if (params.location) url.searchParams.set("where", params.location);
      if (params.salaryMinimum) url.searchParams.set("salary_min", String(params.salaryMinimum));

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`Adzuna API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as { results?: Array<Record<string, unknown>> };
      const results = data.results || [];

      return results.map((job: Record<string, unknown>) => ({
        id: uuidv4(),
        userId,
        title: String(job.title || ""),
        company: String((job.company as Record<string, unknown>)?.display_name || "Unknown"),
        location: String((job.location as Record<string, unknown>)?.display_name || ""),
        remote: "ONSITE" as const,
        salary: job.salary_min ? `₹${job.salary_min} - ₹${job.salary_max}` : undefined,
        salaryMin: job.salary_min as number | undefined,
        salaryMax: job.salary_max as number | undefined,
        jobUrl: String(job.redirect_url || ""),
        source: "ADZUNA" as const,
        datePosted: String(job.created || ""),
        dateDiscovered: new Date().toISOString(),
        description: String(job.description || ""),
        extractedTechnologies: extractAllTechnologiesFlat(String(job.description || "")),
        analyzed: false,
      }));
    } catch (error) {
      console.error("Adzuna search failed:", error);
      return [];
    }
  }
}

/**
 * Reed API adapter — Official public API available.
 * https://www.reed.co.uk/developers/jobseeker
 */
class ReedAdapter implements JobSourceAdapter {
  source: JobSource = "REED";
  name = "Reed";
  hasOfficialApi = true;
  supportsAutomatedApplication = false;

  async search(params: SearchJobsInput, userId: string): Promise<Partial<JobListing>[]> {
    const apiKey = process.env.REED_API_KEY;
    if (!apiKey) return [];

    try {
      const url = new URL("https://www.reed.co.uk/api/1.0/search");
      if (params.keywords?.length) url.searchParams.set("keywords", params.keywords.join(" "));
      if (params.location) url.searchParams.set("locationName", params.location);
      url.searchParams.set("resultsToTake", String(params.limit || 25));

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json() as { results?: Array<Record<string, unknown>> };
      const results = data.results || [];

      return results.map((job: Record<string, unknown>) => ({
        id: uuidv4(),
        userId,
        title: String(job.jobTitle || ""),
        company: String(job.employerName || "Unknown"),
        location: String(job.locationName || ""),
        remote: "ONSITE" as const,
        salary: job.minimumSalary ? `£${job.minimumSalary} - £${job.maximumSalary}` : undefined,
        jobUrl: String(job.jobUrl || ""),
        source: "REED" as const,
        datePosted: String(job.date || ""),
        dateDiscovered: new Date().toISOString(),
        description: String(job.jobDescription || ""),
        extractedTechnologies: extractAllTechnologiesFlat(String(job.jobDescription || "")),
        analyzed: false,
      }));
    } catch (error) {
      console.error("Reed search failed:", error);
      return [];
    }
  }
}

/**
 * The Muse API adapter — Official public API available.
 * https://www.themuse.com/developers/api/v2
 */
class TheMuseAdapter implements JobSourceAdapter {
  source: JobSource = "THE_MUSE";
  name = "The Muse";
  hasOfficialApi = true;
  supportsAutomatedApplication = false;

  async search(params: SearchJobsInput, userId: string): Promise<Partial<JobListing>[]> {
    try {
      const url = new URL("https://www.themuse.com/api/public/jobs");
      url.searchParams.set("page", "0");
      if (params.location) url.searchParams.set("location", params.location);
      if (params.experienceLevel) {
        const levelMap: Record<string, string> = {
          "ENTRY": "Entry Level",
          "JUNIOR": "Entry Level",
          "MID": "Mid Level",
          "SENIOR": "Senior Level",
        };
        const level = levelMap[params.experienceLevel];
        if (level) url.searchParams.set("level", level);
      }

      const apiKey = process.env.THE_MUSE_API_KEY;
      if (apiKey) url.searchParams.set("api_key", apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) return [];

      const data = await response.json() as { results?: Array<Record<string, unknown>> };
      const results = data.results || [];

      return results.slice(0, params.limit || 25).map((job: Record<string, unknown>) => {
        const locations = (job.locations as Array<Record<string, string>>) || [];
        const locationStr = locations.map((l) => l.name).join(", ");
        const contents = String(job.contents || "");

        return {
          id: uuidv4(),
          userId,
          title: String(job.name || ""),
          company: String((job.company as Record<string, unknown>)?.name || "Unknown"),
          location: locationStr,
          remote: locationStr.toLowerCase().includes("remote") ? "REMOTE" as const : "ONSITE" as const,
          jobUrl: String(job.refs && (job.refs as Record<string, unknown>).landing_page || ""),
          source: "THE_MUSE" as const,
          datePosted: String(job.publication_date || ""),
          dateDiscovered: new Date().toISOString(),
          description: contents.replace(/<[^>]*>/g, ""), // Strip HTML
          extractedTechnologies: extractAllTechnologiesFlat(contents),
          analyzed: false,
        };
      });
    } catch (error) {
      console.error("The Muse search failed:", error);
      return [];
    }
  }
}

/**
 * Arbeitnow API adapter — Official public API available.
 * https://arbeitnow.com/api
 */
class ArbeitnowAdapter implements JobSourceAdapter {
  source: JobSource = "ARBEITNOW";
  name = "Arbeitnow";
  hasOfficialApi = true;
  supportsAutomatedApplication = false;

  async search(params: SearchJobsInput, userId: string): Promise<Partial<JobListing>[]> {
    try {
      const response = await fetch("https://arbeitnow.com/api/job-board-api");
      if (!response.ok) return [];

      const data = await response.json() as { data?: Array<Record<string, unknown>> };
      const results = data.data || [];

      // Filter locally based on params
      let filtered = results;

      if (params.keywords?.length) {
        const kw = params.keywords.map((k) => k.toLowerCase());
        filtered = filtered.filter((job) => {
          const text = `${job.title} ${job.description} ${job.tags}`.toLowerCase();
          return kw.some((k) => text.includes(k));
        });
      }

      if (params.remote) {
        filtered = filtered.filter((job) => job.remote === true);
      }

      return filtered.slice(0, params.limit || 25).map((job: Record<string, unknown>) => ({
        id: uuidv4(),
        userId,
        title: String(job.title || ""),
        company: String(job.company_name || "Unknown"),
        location: String(job.location || ""),
        remote: job.remote ? "REMOTE" as const : "ONSITE" as const,
        jobUrl: String(job.url || ""),
        source: "ARBEITNOW" as const,
        datePosted: String(job.created_at || ""),
        dateDiscovered: new Date().toISOString(),
        description: String(job.description || "").replace(/<[^>]*>/g, ""),
        extractedTechnologies: extractAllTechnologiesFlat(String(job.description || "")),
        analyzed: false,
      }));
    } catch (error) {
      console.error("Arbeitnow search failed:", error);
      return [];
    }
  }
}

/**
 * Remotive API adapter — Official public API for remote jobs.
 * https://remotive.com/api/remote-jobs
 */
class RemotiveAdapter implements JobSourceAdapter {
  source: JobSource = "REMOTIVE";
  name = "Remotive";
  hasOfficialApi = true;
  supportsAutomatedApplication = false;

  async search(params: SearchJobsInput, userId: string): Promise<Partial<JobListing>[]> {
    try {
      const url = new URL("https://remotive.com/api/remote-jobs");
      if (params.keywords?.length) {
        url.searchParams.set("search", params.keywords.join(" "));
      }
      url.searchParams.set("limit", String(params.limit || 25));

      const response = await fetch(url.toString());
      if (!response.ok) return [];

      const data = await response.json() as { jobs?: Array<Record<string, unknown>> };
      const jobs = data.jobs || [];

      return jobs.map((job: Record<string, unknown>) => ({
        id: uuidv4(),
        userId,
        title: String(job.title || ""),
        company: String(job.company_name || "Unknown"),
        location: String(job.candidate_required_location || "Remote"),
        remote: "REMOTE" as const,
        salary: job.salary ? String(job.salary) : undefined,
        jobUrl: String(job.url || ""),
        source: "REMOTIVE" as const,
        datePosted: String(job.publication_date || ""),
        dateDiscovered: new Date().toISOString(),
        description: String(job.description || "").replace(/<[^>]*>/g, ""),
        extractedTechnologies: extractAllTechnologiesFlat(String(job.description || "")),
        applicationUrl: String(job.url || ""),
        analyzed: false,
      }));
    } catch (error) {
      console.error("Remotive search failed:", error);
      return [];
    }
  }
}

// ─── Adapter Registry ───────────────────────────────────────────

const adapters: JobSourceAdapter[] = [
  new AdzunaAdapter(),
  new ReedAdapter(),
  new TheMuseAdapter(),
  new ArbeitnowAdapter(),
  new RemotiveAdapter(),
];

/**
 * Gets list of available (configured) sources.
 */
export function getAvailableSources(): { source: string; name: string; configured: boolean; hasApi: boolean }[] {
  return [
    { source: "ADZUNA", name: "Adzuna", configured: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY), hasApi: true },
    { source: "REED", name: "Reed", configured: !!process.env.REED_API_KEY, hasApi: true },
    { source: "THE_MUSE", name: "The Muse", configured: true, hasApi: true },
    { source: "ARBEITNOW", name: "Arbeitnow", configured: true, hasApi: true },
    { source: "REMOTIVE", name: "Remotive", configured: true, hasApi: true },
    { source: "LINKEDIN", name: "LinkedIn", configured: false, hasApi: false },
    { source: "INDEED", name: "Indeed", configured: false, hasApi: false },
    { source: "NAUKRI", name: "Naukri", configured: false, hasApi: false },
    { source: "WELLFOUND", name: "Wellfound", configured: false, hasApi: false },
    { source: "INTERNSHALA", name: "Internshala", configured: false, hasApi: false },
  ];
}

/**
 * Searches all configured job sources.
 */
export async function searchJobs(
  params: SearchJobsInput,
  userId: string,
  enabledSources?: JobSource[],
): Promise<Partial<JobListing>[]> {
  const results: Partial<JobListing>[] = [];

  // Determine which adapters to use
  const activeAdapters = enabledSources
    ? adapters.filter((a) => enabledSources.includes(a.source))
    : adapters;

  // Search all sources in parallel
  const promises = activeAdapters.map(async (adapter) => {
    try {
      const jobs = await adapter.search(params, userId);
      return jobs;
    } catch (error) {
      console.error(`Search failed for ${adapter.name}:`, error);
      return [];
    }
  });

  const allResults = await Promise.all(promises);
  for (const sourceResults of allResults) {
    results.push(...sourceResults);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated = results.filter((job) => {
    const url = job.jobUrl?.toLowerCase().trim();
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  // Sort by date (most recent first)
  deduplicated.sort((a, b) => {
    const dateA = new Date(a.datePosted || a.dateDiscovered || 0).getTime();
    const dateB = new Date(b.datePosted || b.dateDiscovered || 0).getTime();
    return dateB - dateA;
  });

  return deduplicated.slice(0, params.limit || 25);
}

/**
 * Information about platforms that don't have official APIs.
 * These require manual discovery by the user.
 */
export const PLATFORM_LIMITATIONS: Record<string, string> = {
  LINKEDIN: "LinkedIn does not provide a public job search API for third-party applications. Jobs can be discovered via LinkedIn's website. The system supports: Discover → Analyze → Prepare → Notify user → Human completes submission on LinkedIn.",
  INDEED: "Indeed's API program has restricted access. Jobs from Indeed can be surfaced via Adzuna (which aggregates Indeed listings). Direct Indeed integration requires partnership approval.",
  NAUKRI: "Naukri.com does not provide a public job search API. Users can manually add Naukri job URLs for analysis and tracking.",
  WELLFOUND: "Wellfound (formerly AngelList Talent) has limited API access. Users can manually add job URLs for analysis.",
  INTERNSHALA: "Internshala does not provide a public API. Users can manually add job URLs for tracking.",
  GREENHOUSE: "Greenhouse provides a job board API for individual companies. Company-specific Greenhouse boards can be queried if the company's board URL is known.",
  LEVER: "Lever provides a job postings API for individual companies. Company-specific Lever pages can be queried if the company's Lever URL is known.",
};
