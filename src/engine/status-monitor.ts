// ═══════════════════════════════════════════════════════════════════
// Status Monitor — Detects interviews, shortlists, rejections
// ═══════════════════════════════════════════════════════════════════

import type { Interview, Notification, ApplicationStatus } from "../types/index.js";
import { getSupabaseClient } from "../db/client.js";
import { logAuditEntry } from "../utils/audit-logger.js";
import { v4 as uuidv4 } from "uuid";

// ─── Detection Patterns ─────────────────────────────────────────

const SHORTLIST_PATTERNS = [
  /\bshortlisted\b/i,
  /\bselected\s+for\s+(the\s+)?next\s+round\b/i,
  /\bmoved\s+to\s+(the\s+)?next\s+stage\b/i,
  /\bapplication\s+(is\s+)?progressing\b/i,
  /\badvanced\s+to\b/i,
  /\bpleased\s+to\s+inform\b/i,
  /\bcongratulations\b/i,
  /\bwe('d| would)\s+like\s+to\s+move\s+forward\b/i,
];

const INTERVIEW_PATTERNS = [
  /\binterview\s+(invitation|invite|schedule|request)\b/i,
  /\btechnical\s+interview\b/i,
  /\bhr\s+interview\b/i,
  /\bcoding\s+(round|test|challenge|interview)\b/i,
  /\bassessment\b/i,
  /\bschedule\s+(a|an|your)\s+interview\b/i,
  /\binterview\s+(?:on|at|for|scheduled)\b/i,
  /\bwe\s+would\s+like\s+to\s+invite\s+you\b/i,
  /\bphone\s+screen\b/i,
  /\bvideo\s+call\b/i,
];

const REJECTION_PATTERNS = [
  /\bapplication\s+(has\s+been\s+)?rejected\b/i,
  /\bnot\s+selected\b/i,
  /\bposition\s+(has\s+been\s+)?filled\b/i,
  /\bdecided\s+to\s+move\s+forward\s+with\s+other\s+candidates\b/i,
  /\bunfortunately\b/i,
  /\bwe\s+regret\s+to\s+inform\b/i,
  /\bnot\s+be\s+able\s+to\s+proceed\b/i,
  /\bwe\s+will\s+not\s+be\s+moving\s+forward\b/i,
  /\bthank\s+you\s+for\s+your\s+interest.*however\b/i,
  /\bafter\s+careful\s+consideration\b.*\bnot\b/i,
];

const OFFER_PATTERNS = [
  /\boffer\s+(letter|of\s+employment)\b/i,
  /\bwe\s+are\s+pleased\s+to\s+offer\b/i,
  /\bjob\s+offer\b/i,
  /\bextending\s+(an\s+)?offer\b/i,
  /\bcompensation\s+package\b/i,
];

const ASSESSMENT_PATTERNS = [
  /\bcoding\s+(test|challenge|assessment)\b/i,
  /\btechnical\s+assessment\b/i,
  /\bonline\s+test\b/i,
  /\bhackerrank\b/i,
  /\bleetcode\b/i,
  /\bcodility\b/i,
  /\bcodeSignal\b/i,
  /\btake[\s-]?home\s+(test|assignment|project)\b/i,
];

// ─── Date/Time Extraction ───────────────────────────────────────

const DATE_PATTERNS = [
  // "September 29, 2026" or "29 September 2026"
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
  // "29/09/2026" or "09/29/2026"
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  // "2026-09-29"
  /(\d{4})-(\d{2})-(\d{2})/,
];

const TIME_PATTERNS = [
  /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)\s*(IST|EST|PST|UTC|GMT|CET)?/,
  /(\d{1,2})\s*(AM|PM|am|pm)\s*(IST|EST|PST|UTC|GMT|CET)?/,
  /(\d{1,2}):(\d{2})\s*(IST|EST|PST|UTC|GMT|CET)/,
];

const MEETING_URL_PATTERNS = [
  /(https?:\/\/[^\s]*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|whereby\.com|webex\.com)[^\s]*)/i,
];

/**
 * Classifies a text (email body, message) into application event types.
 */
export function classifyText(text: string): {
  type: "SHORTLIST" | "INTERVIEW" | "REJECTION" | "OFFER" | "ASSESSMENT" | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  patterns_matched: string[];
} {
  const matchedPatterns: string[] = [];
  let type: "SHORTLIST" | "INTERVIEW" | "REJECTION" | "OFFER" | "ASSESSMENT" | "UNKNOWN" = "UNKNOWN";
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";

  // Check each category
  const categories: { name: typeof type; patterns: RegExp[] }[] = [
    { name: "OFFER", patterns: OFFER_PATTERNS },
    { name: "INTERVIEW", patterns: INTERVIEW_PATTERNS },
    { name: "ASSESSMENT", patterns: ASSESSMENT_PATTERNS },
    { name: "SHORTLIST", patterns: SHORTLIST_PATTERNS },
    { name: "REJECTION", patterns: REJECTION_PATTERNS },
  ];

  let bestMatchCount = 0;

  for (const cat of categories) {
    let matchCount = 0;
    for (const pattern of cat.patterns) {
      if (pattern.test(text)) {
        matchCount++;
        matchedPatterns.push(`${cat.name}: ${pattern.source}`);
      }
    }
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      type = cat.name;
    }
  }

  // Set confidence based on match count
  if (bestMatchCount >= 3) confidence = "HIGH";
  else if (bestMatchCount >= 2) confidence = "MEDIUM";
  else if (bestMatchCount >= 1) confidence = "LOW";

  return { type, confidence, patterns_matched: matchedPatterns };
}

/**
 * Extracts interview details from text.
 */
export function extractInterviewDetails(text: string): Partial<Interview> {
  const details: Partial<Interview> = {};

  // Extract date
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      details.date = match[0];
      break;
    }
  }

  // Extract time
  for (const pattern of TIME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      details.time = match[0];
      // Extract timezone if present
      const tzMatch = match[0].match(/(IST|EST|PST|UTC|GMT|CET)/i);
      if (tzMatch) details.timezone = tzMatch[1];
      break;
    }
  }

  // Extract meeting URL
  for (const pattern of MEETING_URL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      details.meetingUrl = match[1];
      break;
    }
  }

  // Detect interview type
  const lower = text.toLowerCase();
  if (/\btechnical\b/i.test(lower)) details.type = "TECHNICAL";
  else if (/\bhr\b/i.test(lower)) details.type = "HR";
  else if (/\bcoding\b/i.test(lower)) details.type = "CODING";
  else if (/\bsystem\s*design\b/i.test(lower)) details.type = "SYSTEM_DESIGN";
  else if (/\bphone\s*(screen|call)\b/i.test(lower)) details.type = "PHONE_SCREEN";
  else if (/\bbehavioral\b/i.test(lower)) details.type = "BEHAVIORAL";
  else if (/\bon[\s-]?site\b/i.test(lower)) details.type = "ONSITE";
  else details.type = "OTHER";

  // Extract round info
  const roundMatch = text.match(/\b(first|second|third|fourth|fifth|final|round\s*\d+)\s*(round|interview)?/i);
  if (roundMatch) details.round = roundMatch[0].trim();

  return details;
}

/**
 * Creates a notification for an application event.
 */
export async function createNotification(
  userId: string,
  type: Notification["type"],
  title: string,
  message: string,
  options?: {
    applicationId?: string;
    jobId?: string;
    priority?: Notification["priority"];
    actionUrl?: string;
  },
): Promise<Notification> {
  const supabase = getSupabaseClient();

  const notification: Omit<Notification, "createdAt"> & { created_at?: string } = {
    id: uuidv4(),
    userId,
    type,
    title,
    message,
    applicationId: options?.applicationId,
    jobId: options?.jobId,
    priority: options?.priority || "MEDIUM",
    read: false,
    actionUrl: options?.actionUrl,
    createdAt: "",
  };

  await supabase.from("notifications").insert({
    id: notification.id,
    user_id: userId,
    type,
    title,
    message,
    application_id: options?.applicationId || null,
    job_id: options?.jobId || null,
    priority: options?.priority || "MEDIUM",
    read: false,
    action_url: options?.actionUrl || null,
  });

  return notification as Notification;
}

/**
 * Records an interview from detected details.
 */
export async function recordInterview(
  userId: string,
  applicationId: string,
  company: string,
  role: string,
  details: Partial<Interview>,
): Promise<Interview> {
  const supabase = getSupabaseClient();
  const id = uuidv4();
  const now = new Date().toISOString();

  const interview = {
    id,
    user_id: userId,
    application_id: applicationId,
    company,
    role,
    round: details.round || "Interview",
    type: details.type || "OTHER",
    interview_date: details.date || null,
    interview_time: details.time || null,
    timezone: details.timezone || null,
    meeting_url: details.meetingUrl || null,
    location: details.location || null,
    interviewer_name: details.interviewerName || null,
    interviewer_email: details.interviewerEmail || null,
    instructions: details.instructions || null,
    preparation: details.preparation || [],
    status: details.date ? "SCHEDULED" : "INVITED",
  };

  await supabase.from("interviews").insert(interview);

  // Update application status
  const newStatus = details.date ? "INTERVIEW_SCHEDULED" : "INTERVIEW_INVITED";
  await supabase
    .from("applications")
    .update({
      status: newStatus,
      interview_date: details.date || null,
      interview_time: details.time || null,
      interview_type: details.type || null,
      interview_meeting_url: details.meetingUrl || null,
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  await logAuditEntry(userId, `Interview detected: ${newStatus}`, {
    applicationId,
    details: `${company} — ${role} — ${details.type || "Interview"}`,
    status: newStatus,
  });

  // Create high-priority notification
  await createNotification(
    userId,
    "INTERVIEW",
    `🎯 Interview ${details.date ? "Scheduled" : "Invitation"}`,
    `Company: ${company}\nRole: ${role}\nRound: ${details.round || "Interview"}\n${details.date ? `Date: ${details.date}` : ""}\n${details.time ? `Time: ${details.time}` : ""}\n${details.meetingUrl ? `Meeting: ${details.meetingUrl}` : ""}`,
    {
      applicationId,
      priority: "HIGH",
      actionUrl: details.meetingUrl,
    },
  );

  return interview as unknown as Interview;
}

/**
 * Gets upcoming interviews for a user.
 */
export async function getUpcomingInterviews(userId: string): Promise<Interview[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["INVITED", "SCHEDULED"])
    .order("interview_date", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    company: row.company,
    role: row.role,
    round: row.round,
    type: row.type,
    date: row.interview_date,
    time: row.interview_time,
    timezone: row.timezone,
    meetingUrl: row.meeting_url,
    location: row.location,
    interviewerName: row.interviewer_name,
    interviewerEmail: row.interviewer_email,
    instructions: row.instructions,
    preparation: row.preparation || [],
    calendarEventId: row.calendar_event_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Gets unread notifications for a user.
 */
export async function getUnreadNotifications(
  userId: string,
  limit = 50,
): Promise<Notification[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    applicationId: row.application_id,
    jobId: row.job_id,
    priority: row.priority,
    read: row.read,
    actionUrl: row.action_url,
    createdAt: row.created_at,
  }));
}
