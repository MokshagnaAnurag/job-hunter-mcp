// ═══════════════════════════════════════════════════════════════════
// Job Processing Queue — Manages the autonomous job pipeline
// ═══════════════════════════════════════════════════════════════════
// Pipeline: DISCOVERY → ANALYSIS → MATCHING → TAILORING →
//           VALIDATION → READY → APPLYING → TRACKING → MONITORING

import { getSupabaseClient } from "../db/client.js";
import { logAuditEntry } from "../utils/audit-logger.js";
import type { JobQueueItem } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";

export type QueueStage = JobQueueItem["stage"];

const STAGE_ORDER: QueueStage[] = [
  "DISCOVERY",
  "ANALYSIS",
  "MATCHING",
  "TAILORING",
  "VALIDATION",
  "READY",
  "APPLYING",
  "TRACKING",
  "MONITORING",
  "COMPLETED",
];

/**
 * Adds a job to the processing queue.
 */
export async function enqueueJob(
  userId: string,
  jobId: string,
  stage: QueueStage = "DISCOVERY",
  priority = 0,
): Promise<JobQueueItem> {
  const supabase = getSupabaseClient();

  const item = {
    id: uuidv4(),
    user_id: userId,
    job_id: jobId,
    stage,
    priority,
    retry_count: 0,
    max_retries: 3,
  };

  await supabase.from("job_queue").insert(item);

  await logAuditEntry(userId, `Job enqueued at stage: ${stage}`, {
    jobId,
    status: stage,
  });

  return {
    id: item.id,
    userId,
    jobId,
    stage,
    priority,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Advances a job to the next stage in the pipeline.
 */
export async function advanceStage(
  userId: string,
  queueItemId: string,
): Promise<QueueStage | null> {
  const supabase = getSupabaseClient();

  const { data: item } = await supabase
    .from("job_queue")
    .select("*")
    .eq("id", queueItemId)
    .eq("user_id", userId)
    .single();

  if (!item) return null;

  const currentIdx = STAGE_ORDER.indexOf(item.stage);
  if (currentIdx === -1 || currentIdx >= STAGE_ORDER.length - 1) return null;

  const nextStage = STAGE_ORDER[currentIdx + 1];

  await supabase
    .from("job_queue")
    .update({ stage: nextStage, retry_count: 0 })
    .eq("id", queueItemId);

  await logAuditEntry(userId, `Job advanced to stage: ${nextStage}`, {
    jobId: item.job_id,
    status: nextStage,
  });

  return nextStage;
}

/**
 * Marks a queue item as failed, with retry logic.
 */
export async function markQueueItemFailed(
  userId: string,
  queueItemId: string,
  errorMessage: string,
): Promise<{ shouldRetry: boolean }> {
  const supabase = getSupabaseClient();

  const { data: item } = await supabase
    .from("job_queue")
    .select("*")
    .eq("id", queueItemId)
    .eq("user_id", userId)
    .single();

  if (!item) return { shouldRetry: false };

  const newRetryCount = (item.retry_count || 0) + 1;
  const shouldRetry = newRetryCount < (item.max_retries || 3);

  await supabase
    .from("job_queue")
    .update({
      stage: shouldRetry ? item.stage : "FAILED",
      retry_count: newRetryCount,
      error_message: errorMessage,
    })
    .eq("id", queueItemId);

  await logAuditEntry(userId, shouldRetry ? "Queue item retry" : "Queue item failed", {
    jobId: item.job_id,
    details: errorMessage,
    status: shouldRetry ? `RETRY ${newRetryCount}` : "FAILED",
  });

  return { shouldRetry };
}

/**
 * Skips a queue item (e.g., job didn't pass filters).
 */
export async function skipQueueItem(
  userId: string,
  queueItemId: string,
  reason: string,
): Promise<void> {
  const supabase = getSupabaseClient();

  await supabase
    .from("job_queue")
    .update({ stage: "SKIPPED", error_message: reason })
    .eq("id", queueItemId)
    .eq("user_id", userId);
}

/**
 * Gets pending queue items for a specific stage.
 */
export async function getPendingItems(
  userId: string,
  stage: QueueStage,
  limit = 10,
): Promise<JobQueueItem[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("job_queue")
    .select("*")
    .eq("user_id", userId)
    .eq("stage", stage)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    stage: row.stage as QueueStage,
    priority: row.priority,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Gets queue statistics for the dashboard.
 */
export async function getQueueStats(userId: string): Promise<Record<QueueStage, number>> {
  const supabase = getSupabaseClient();
  const stats: Record<string, number> = {};

  for (const stage of [...STAGE_ORDER, "FAILED", "SKIPPED"]) {
    const { count } = await supabase
      .from("job_queue")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("stage", stage);
    stats[stage] = count || 0;
  }

  return stats as Record<QueueStage, number>;
}
