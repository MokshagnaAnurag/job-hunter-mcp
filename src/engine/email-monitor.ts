// ═══════════════════════════════════════════════════════════════════
// Email Monitor — Classifies recruiting-related emails
// ═══════════════════════════════════════════════════════════════════
// Only processes emails if the user has explicitly connected
// and authorized email access.

import type { EmailClassification } from "../types/index.js";
import { classifyText, extractInterviewDetails } from "./status-monitor.js";

/**
 * Email metadata for classification.
 */
export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  attachments?: string[];
}

/**
 * Result of email classification.
 */
export interface EmailClassificationResult {
  emailId: string;
  classification: EmailClassification;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  matchedCompany?: string;
  matchedRole?: string;
  interviewDetails?: ReturnType<typeof extractInterviewDetails>;
  requiresReview: boolean;
  summary: string;
}

// ─── Recruiter/Company Detection ────────────────────────────────

const RECRUITER_DOMAINS = [
  "naukri.com",
  "linkedin.com",
  "indeed.com",
  "internshala.com",
  "wellfound.com",
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "ashbyhq.com",
  "myworkday.com",
  "icims.com",
  "taleo.net",
  "smartrecruiters.com",
  "bamboohr.com",
  "freshteam.com",
  "zohorecruit.com",
  "recruitee.com",
];

const JOB_EMAIL_PATTERNS = [
  /\b(application|job|position|role|vacancy|hiring|career|recruit)\b/i,
  /\b(interview|assessment|test|coding\s+challenge)\b/i,
  /\b(shortlisted|selected|congratulations|offer)\b/i,
  /\b(unfortunately|regret|not\s+selected|rejected)\b/i,
];

/**
 * Determines if an email is job/recruiting related.
 */
export function isJobRelatedEmail(email: EmailMessage): boolean {
  // Check sender domain
  const fromDomain = email.from.split("@")[1]?.toLowerCase();
  if (fromDomain && RECRUITER_DOMAINS.some((d) => fromDomain.includes(d))) {
    return true;
  }

  // Check subject and body
  const combinedText = `${email.subject} ${email.body}`;
  return JOB_EMAIL_PATTERNS.some((p) => p.test(combinedText));
}

/**
 * Classifies a job-related email.
 */
export function classifyEmail(email: EmailMessage): EmailClassificationResult {
  const combinedText = `${email.subject}\n${email.body}`;
  const textClassification = classifyText(combinedText);

  // Map text classification to email classification
  let classification: EmailClassification;
  switch (textClassification.type) {
    case "SHORTLIST":
      classification = "SHORTLIST";
      break;
    case "INTERVIEW":
      classification = "INTERVIEW";
      break;
    case "REJECTION":
      classification = "REJECTION";
      break;
    case "OFFER":
      classification = "OFFER";
      break;
    case "ASSESSMENT":
      classification = "ASSESSMENT";
      break;
    default:
      // Check if it's a recruiter message or general job application
      const fromDomain = email.from.split("@")[1]?.toLowerCase();
      if (fromDomain && RECRUITER_DOMAINS.some((d) => fromDomain.includes(d))) {
        classification = "JOB_APPLICATION";
      } else if (/\b(recruiter|talent\s+acquisition|hiring\s+manager)\b/i.test(combinedText)) {
        classification = "RECRUITER_MESSAGE";
      } else if (/\b(additional\s+information|more\s+details|documents|references)\b/i.test(combinedText)) {
        classification = "REQUEST_FOR_INFORMATION";
      } else {
        classification = "OTHER";
      }
  }

  // Extract interview details if applicable
  let interviewDetails;
  if (classification === "INTERVIEW") {
    interviewDetails = extractInterviewDetails(combinedText);
  }

  // Determine if human review is needed
  const requiresReview = textClassification.confidence === "LOW" ||
    (classification === "SHORTLIST" && textClassification.confidence !== "HIGH");

  // Generate summary
  const summary = generateEmailSummary(email, classification, textClassification.confidence);

  return {
    emailId: email.id,
    classification,
    confidence: textClassification.confidence,
    interviewDetails,
    requiresReview,
    summary,
  };
}

/**
 * Generates a human-readable summary of the email classification.
 */
function generateEmailSummary(
  email: EmailMessage,
  classification: EmailClassification,
  confidence: string,
): string {
  const lines: string[] = [];

  lines.push(`Email Classification: ${classification}`);
  lines.push(`Confidence: ${confidence}`);
  lines.push(`From: ${email.from}`);
  lines.push(`Subject: ${email.subject}`);
  lines.push(`Date: ${email.date}`);

  if (confidence === "LOW") {
    lines.push(`\n⚠ Low confidence — REQUIRES REVIEW`);
    lines.push(`This classification may be incorrect. Please verify manually.`);
  }

  return lines.join("\n");
}

/**
 * Batch processes emails for job-related classification.
 */
export function processEmails(emails: EmailMessage[]): EmailClassificationResult[] {
  return emails
    .filter(isJobRelatedEmail)
    .map(classifyEmail);
}
