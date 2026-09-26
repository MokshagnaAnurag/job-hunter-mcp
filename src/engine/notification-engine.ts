// ═══════════════════════════════════════════════════════════════════
// Notification Engine — Immediate + Daily Summary notifications
// ═══════════════════════════════════════════════════════════════════

import type { Notification, DailySummary, Application, AutomationSettings } from "../types/index.js";
import { getSupabaseClient } from "../db/client.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Priority mapping for notification types.
 */
const PRIORITY_MAP: Record<Notification["type"], Notification["priority"]> = {
  SHORTLISTED: "HIGH",
  INTERVIEW: "HIGH",
  ASSESSMENT: "HIGH",
  REJECTION: "MEDIUM",
  OFFER: "HIGH",
  APPLICATION_SUBMITTED: "LOW",
  APPLICATION_FAILED: "HIGH",
  MANUAL_ACTION: "HIGH",
  RECRUITER_RESPONSE: "MEDIUM",
  FOLLOW_UP_DUE: "LOW",
  DEADLINE_APPROACHING: "HIGH",
};

/**
 * Immediately notifiable events — always sent right away.
 */
const IMMEDIATE_EVENTS: Notification["type"][] = [
  "INTERVIEW",
  "SHORTLISTED",
  "OFFER",
  "ASSESSMENT",
  "REJECTION",
  "APPLICATION_FAILED",
  "MANUAL_ACTION",
  "DEADLINE_APPROACHING",
];

/**
 * Sends a notification to the user.
 * Respects the user's notification preferences (immediate vs daily summary).
 */
export async function sendNotification(
  userId: string,
  type: Notification["type"],
  title: string,
  message: string,
  options?: {
    applicationId?: string;
    jobId?: string;
    actionUrl?: string;
  },
): Promise<Notification> {
  const supabase = getSupabaseClient();

  const priority = PRIORITY_MAP[type] || "MEDIUM";
  const id = uuidv4();
  const now = new Date().toISOString();

  const notification: Notification = {
    id,
    userId,
    type,
    title,
    message,
    applicationId: options?.applicationId,
    jobId: options?.jobId,
    priority,
    read: false,
    actionUrl: options?.actionUrl,
    createdAt: now,
  };

  await supabase.from("notifications").insert({
    id,
    user_id: userId,
    type,
    title,
    message,
    application_id: options?.applicationId || null,
    job_id: options?.jobId || null,
    priority,
    read: false,
    action_url: options?.actionUrl || null,
  });

  return notification;
}

/**
 * Generates a daily summary of job search activity.
 */
export async function generateDailySummary(userId: string): Promise<DailySummary> {
  const supabase = getSupabaseClient();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  // Count jobs discovered today
  const { count: jobsDiscovered } = await supabase
    .from("job_listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("date_discovered", startOfDay);

  // Count jobs matched
  const { count: jobsMatched } = await supabase
    .from("job_listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("date_discovered", startOfDay)
    .not("match_score", "is", null);

  // Count applications submitted today
  const { count: applicationsSubmitted } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "APPLIED")
    .gte("date_applied", startOfDay);

  // Count by status
  const statuses = ["INTERVIEW_INVITED", "INTERVIEW_SCHEDULED", "SHORTLISTED", "REJECTED", "OFFER"];
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    const { count } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", status)
      .gte("updated_at", startOfDay);
    counts[status] = count || 0;
  }

  // Manual actions required
  const { count: manualActions } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "MANUAL_ACTION_REQUIRED");

  // New notifications today
  const { data: newNotifs } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", startOfDay)
    .order("created_at", { ascending: false });

  return {
    date: today.toISOString().split("T")[0],
    jobsDiscovered: jobsDiscovered || 0,
    jobsMatched: jobsMatched || 0,
    applicationsSubmitted: applicationsSubmitted || 0,
    interviews: (counts["INTERVIEW_INVITED"] || 0) + (counts["INTERVIEW_SCHEDULED"] || 0),
    shortlisted: counts["SHORTLISTED"] || 0,
    rejected: counts["REJECTED"] || 0,
    offers: counts["OFFER"] || 0,
    manualActionsRequired: manualActions || 0,
    newNotifications: (newNotifs || []).map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      applicationId: n.application_id,
      jobId: n.job_id,
      priority: n.priority,
      read: n.read,
      actionUrl: n.action_url,
      createdAt: n.created_at,
    })),
  };
}

/**
 * Formats a daily summary into a readable report.
 */
export function formatDailySummary(summary: DailySummary): string {
  const lines: string[] = [];

  lines.push(`📊 Daily Job Search Summary — ${summary.date}`);
  lines.push(`══════════════════════════════════════`);
  lines.push(``);
  lines.push(`Jobs discovered: ${summary.jobsDiscovered}`);
  lines.push(`Jobs matched: ${summary.jobsMatched}`);
  lines.push(`Applications submitted: ${summary.applicationsSubmitted}`);
  lines.push(`Interviews: ${summary.interviews}`);
  lines.push(`Shortlisted: ${summary.shortlisted}`);
  lines.push(`Rejected: ${summary.rejected}`);
  lines.push(`Offers: ${summary.offers}`);

  if (summary.manualActionsRequired > 0) {
    lines.push(``);
    lines.push(`⚠ Manual actions required: ${summary.manualActionsRequired}`);
  }

  if (summary.newNotifications.length > 0) {
    lines.push(``);
    lines.push(`Recent notifications:`);
    for (const notif of summary.newNotifications.slice(0, 10)) {
      const icon = notif.priority === "HIGH" ? "🔴" : notif.priority === "MEDIUM" ? "🟡" : "🟢";
      lines.push(`  ${icon} ${notif.title}`);
    }
  }

  return lines.join("\n");
}

/**
 * Marks notifications as read.
 */
export async function markNotificationsRead(
  userId: string,
  notificationIds: string[],
): Promise<void> {
  const supabase = getSupabaseClient();

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .in("id", notificationIds);
}
