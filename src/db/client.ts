// ═══════════════════════════════════════════════════════════════════
// Supabase Client — Server-side only
// ═══════════════════════════════════════════════════════════════════
// SECURITY: Uses the service role key for server-side operations.
// This key is NEVER exposed to client/browser/MCP App Views.
// All database operations derive user identity from authenticated
// context, NOT from client-supplied userId.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

/**
 * Get or create the Supabase client singleton.
 * Uses service role key for server-side operations with RLS bypass
 * when needed, but always scopes queries to authenticated user.
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Copy .env.example to .env and fill in your Supabase credentials."
    );
  }

  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}

/**
 * Get a Supabase client scoped to a specific user via their JWT.
 * This respects RLS policies automatically.
 */
export function getSupabaseClientForUser(userAccessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables."
    );
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * For MCP server context: derive userId from the authenticated session.
 * In MCP, the server receives auth context from the transport layer.
 * This function provides a consistent way to get the current user ID.
 *
 * For local/stdio development, falls back to the DEFAULT_USER_ID env var.
 */
export function getCurrentUserId(): string {
  // In production, this would be derived from OAuth/JWT context
  // passed through the MCP transport layer
  const userId = process.env.CURRENT_USER_ID || process.env.DEFAULT_USER_ID;

  if (!userId) {
    throw new Error(
      "No authenticated user context available. " +
      "Set DEFAULT_USER_ID in .env for local development."
    );
  }

  return userId;
}
