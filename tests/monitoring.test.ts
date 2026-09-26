// ═══════════════════════════════════════════════════════════════════
// Tests — Status Monitoring, Interview/Rejection/Shortlist Detection
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { classifyText, extractInterviewDetails } from "../src/engine/status-monitor.js";
import { classifyEmail, isJobRelatedEmail, type EmailMessage } from "../src/engine/email-monitor.js";

// ─── Interview Detection Tests ──────────────────────────────────

describe("Interview Detection", () => {
  it("should detect interview invitation", () => {
    const text = "We would like to invite you for a technical interview for the Robotics Engineer position.";
    const result = classifyText(text);
    expect(result.type).toBe("INTERVIEW");
  });

  it("should extract interview date and time", () => {
    const text = "Your interview is scheduled for 29 September 2026 at 11:00 AM IST. Join via https://meet.google.com/abc-def-ghi";
    const details = extractInterviewDetails(text);

    expect(details.date).toBeTruthy();
    expect(details.time).toBeTruthy();
    expect(details.meetingUrl).toContain("meet.google.com");
  });

  it("should detect interview type", () => {
    const text = "You have been scheduled for a technical interview round 2";
    const details = extractInterviewDetails(text);
    expect(details.type).toBe("TECHNICAL");
  });

  it("should detect HR interview", () => {
    const text = "HR interview scheduled for next week";
    const details = extractInterviewDetails(text);
    expect(details.type).toBe("HR");
  });

  it("should detect coding round", () => {
    const text = "Please complete the coding challenge on HackerRank within 48 hours";
    const result = classifyText(text);
    expect(["INTERVIEW", "ASSESSMENT"]).toContain(result.type);
  });

  it("should extract Zoom meeting URL", () => {
    const text = "Join us at https://zoom.us/j/123456789 for your interview";
    const details = extractInterviewDetails(text);
    expect(details.meetingUrl).toContain("zoom.us");
  });

  it("should extract Teams meeting URL", () => {
    const text = "Interview link: https://teams.microsoft.com/l/meetup-join/abc123";
    const details = extractInterviewDetails(text);
    expect(details.meetingUrl).toContain("teams.microsoft.com");
  });
});

// ─── Shortlist Detection Tests ──────────────────────────────────

describe("Shortlist Detection", () => {
  it("should detect shortlist notification", () => {
    const text = "Congratulations! You have been shortlisted for the next round of the selection process.";
    const result = classifyText(text);
    expect(result.type).toBe("SHORTLIST");
  });

  it("should detect 'moved to next stage'", () => {
    const text = "Your application has been moved to the next stage of our hiring process.";
    const result = classifyText(text);
    expect(result.type).toBe("SHORTLIST");
  });

  it("should detect 'pleased to inform'", () => {
    const text = "We are pleased to inform you that your application is progressing.";
    const result = classifyText(text);
    expect(result.type).toBe("SHORTLIST");
  });
});

// ─── Rejection Detection Tests ──────────────────────────────────

describe("Rejection Detection", () => {
  it("should detect rejection email", () => {
    const text = "We regret to inform you that we have decided to move forward with other candidates for this position.";
    const result = classifyText(text);
    expect(result.type).toBe("REJECTION");
  });

  it("should detect 'position filled'", () => {
    const text = "Thank you for your interest. Unfortunately, the position has been filled.";
    const result = classifyText(text);
    expect(result.type).toBe("REJECTION");
  });

  it("should detect 'not selected'", () => {
    const text = "After careful consideration, we will not be moving forward with your application.";
    const result = classifyText(text);
    expect(result.type).toBe("REJECTION");
  });

  it("should NOT infer rejection from silence", () => {
    const text = "Thank you for applying. We will get back to you soon.";
    const result = classifyText(text);
    expect(result.type).not.toBe("REJECTION");
  });
});

// ─── Offer Detection Tests ──────────────────────────────────────

describe("Offer Detection", () => {
  it("should detect job offer", () => {
    const text = "We are pleased to offer you the position of Robotics Engineer with a compensation package of ₹6,00,000 per annum.";
    const result = classifyText(text);
    expect(result.type).toBe("OFFER");
  });
});

// ─── False Positive Prevention ──────────────────────────────────

describe("False Positive Prevention", () => {
  it("should mark low-confidence classifications as requiring review", () => {
    const text = "Thanks for your application. We'll be in touch.";
    const result = classifyText(text);

    // Generic acknowledgement should either be UNKNOWN or low confidence
    if (result.type !== "UNKNOWN") {
      expect(result.confidence).toBe("LOW");
    }
  });

  it("should not classify generic newsletter as job-related", () => {
    const email: EmailMessage = {
      id: "1",
      from: "newsletter@example.com",
      subject: "Weekly Tech Digest",
      body: "Here are the latest articles about AI and technology.",
      date: new Date().toISOString(),
    };

    const isRelated = isJobRelatedEmail(email);
    expect(isRelated).toBe(false);
  });

  it("should classify recruiting email as job-related", () => {
    const email: EmailMessage = {
      id: "2",
      from: "recruiter@naukri.com",
      subject: "Your application update",
      body: "Your application for Robotics Engineer has been reviewed.",
      date: new Date().toISOString(),
    };

    const isRelated = isJobRelatedEmail(email);
    expect(isRelated).toBe(true);
  });
});

// ─── Email Classification Tests ─────────────────────────────────

describe("Email Classification", () => {
  it("should classify interview email", () => {
    const email: EmailMessage = {
      id: "3",
      from: "hr@company.com",
      subject: "Interview Invitation - Robotics Engineer",
      body: "We would like to schedule a technical interview with you. Please join at https://meet.google.com/abc on 29 September at 11:00 AM IST.",
      date: new Date().toISOString(),
    };

    const result = classifyEmail(email);
    expect(result.classification).toBe("INTERVIEW");
    expect(result.interviewDetails).toBeTruthy();
    expect(result.interviewDetails?.meetingUrl).toContain("meet.google.com");
  });

  it("should classify rejection email", () => {
    const email: EmailMessage = {
      id: "4",
      from: "hr@company.com",
      subject: "Application Update",
      body: "We regret to inform you that we have decided to move forward with other candidates.",
      date: new Date().toISOString(),
    };

    const result = classifyEmail(email);
    expect(result.classification).toBe("REJECTION");
  });

  it("should flag low confidence for review", () => {
    const email: EmailMessage = {
      id: "5",
      from: "unknown@example.com",
      subject: "Quick update",
      body: "Just following up on our conversation.",
      date: new Date().toISOString(),
    };

    const result = classifyEmail(email);
    // Low confidence or OTHER should require review
    if (result.confidence === "LOW") {
      expect(result.requiresReview).toBe(true);
    }
  });
});
