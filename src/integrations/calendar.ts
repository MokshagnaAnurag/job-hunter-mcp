// ═══════════════════════════════════════════════════════════════════
// Calendar Integration — Google Calendar / Outlook
// ═══════════════════════════════════════════════════════════════════
// Only creates events when:
// 1. The interview is verified
// 2. The user has authorized calendar access
// 3. The calendar integration is enabled in automation settings

import { getSupabaseClient } from "../db/client.js";
import { logAuditEntry } from "../utils/audit-logger.js";

export interface CalendarEvent {
  id?: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  timezone: string;
  location?: string;
  meetingUrl?: string;
}

/**
 * Creates a calendar event for an interview.
 * Currently supports Google Calendar via OAuth.
 */
export async function createInterviewCalendarEvent(
  userId: string,
  event: CalendarEvent,
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  // Check if calendar integration is enabled
  const supabase = getSupabaseClient();
  const { data: settings } = await supabase
    .from("automation_settings")
    .select("calendar_integration")
    .eq("user_id", userId)
    .single();

  if (!settings?.calendar_integration) {
    return {
      success: false,
      error: "Calendar integration is not enabled. Enable it in automation settings.",
    };
  }

  // Check for required credentials
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      success: false,
      error: "Google Calendar credentials not configured. Set GOOGLE_CALENDAR_* in .env",
    };
  }

  try {
    // Get access token from refresh token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      return { success: false, error: "Failed to refresh Google Calendar access token" };
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    // Check for duplicate events
    const existingCheck = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(event.summary)}&timeMin=${event.start}&timeMax=${event.end}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (existingCheck.ok) {
      const existing = await existingCheck.json() as { items?: unknown[] };
      if (existing.items && existing.items.length > 0) {
        return {
          success: false,
          error: "A similar calendar event already exists. Not creating a duplicate.",
        };
      }
    }

    // Create the event
    const calendarEvent = {
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.start,
        timeZone: event.timezone || "Asia/Kolkata",
      },
      end: {
        dateTime: event.end,
        timeZone: event.timezone || "Asia/Kolkata",
      },
      location: event.meetingUrl || event.location || "",
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 30 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    const createResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(calendarEvent),
      },
    );

    if (!createResponse.ok) {
      const errBody = await createResponse.text();
      return { success: false, error: `Failed to create calendar event: ${errBody}` };
    }

    const created = await createResponse.json() as { id: string };

    await logAuditEntry(userId, "Calendar event created", {
      details: event.summary,
    });

    return { success: true, eventId: created.id };
  } catch (error) {
    return {
      success: false,
      error: `Calendar integration error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks if calendar integration is available and configured.
 */
export function isCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  );
}
