// ═══════════════════════════════════════════════════════════════════
// Audit Logger — Complete action history
// ═══════════════════════════════════════════════════════════════════

import { getSupabaseClient } from "../db/client.js";
import type { AuditEntry } from "../types/index.js";

/**
 * Logs an audit entry to the database and returns it.
 */
export async function logAuditEntry(
  userId: string,
  action: string,
  options?: {
    applicationId?: string;
    jobId?: string;
    details?: string;
    status?: string;
    automated?: boolean;
  },
): Promise<AuditEntry> {
  const supabase = getSupabaseClient();
  const timestamp = new Date().toISOString();
  const automated = options?.automated ?? true;

  const entry: AuditEntry = {
    timestamp,
    action,
    details: options?.details,
    status: options?.status,
    automated,
  };

  // Store in audit_log table
  await supabase.from("audit_log").insert({
    user_id: userId,
    application_id: options?.applicationId || null,
    job_id: options?.jobId || null,
    action,
    details: options?.details || null,
    status: options?.status || null,
    automated,
  });

  // Also append to application's inline audit log if applicationId is provided
  if (options?.applicationId) {
    const { data: app } = await supabase
      .from("applications")
      .select("audit_log")
      .eq("id", options.applicationId)
      .single();

    if (app) {
      const auditLog = (app.audit_log as AuditEntry[]) || [];
      auditLog.push(entry);
      await supabase
        .from("applications")
        .update({ audit_log: auditLog })
        .eq("id", options.applicationId);
    }
  }

  return entry;
}

/**
 * Gets the full audit trail for a user, optionally filtered by application.
 */
export async function getAuditTrail(
  userId: string,
  options?: {
    applicationId?: string;
    jobId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<AuditEntry[]> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("audit_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.applicationId) {
    query = query.eq("application_id", options.applicationId);
  }
  if (options?.jobId) {
    query = query.eq("job_id", options.jobId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch audit trail:", error);
    return [];
  }

  return (data || []).map((row) => ({
    timestamp: row.created_at,
    action: row.action,
    details: row.details,
    status: row.status,
    automated: row.automated,
  }));
}

/**
 * Formats an audit trail into a human-readable timeline string.
 */
export function formatAuditTrail(entries: AuditEntry[]): string {
  if (entries.length === 0) return "No audit entries.";

  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const date = new Date(e.timestamp).toLocaleDateString("en-IN");
      const auto = e.automated ? " [AUTO]" : " [MANUAL]";
      const status = e.status ? ` → ${e.status}` : "";
      const details = e.details ? ` — ${e.details}` : "";
      return `${date} ${time}${auto} ${e.action}${status}${details}`;
    })
    .join("\n");
}
