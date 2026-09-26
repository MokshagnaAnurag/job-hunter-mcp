// ═══════════════════════════════════════════════════════════════════
// Job Hunter MCP — Core Type Definitions
// ═══════════════════════════════════════════════════════════════════

import { z } from "zod";

// ─── Application Statuses ────────────────────────────────────────
export const ApplicationStatus = z.enum([
  "DISCOVERED",
  "ANALYZING",
  "MATCHED",
  "RESUME_READY",
  "READY_TO_APPLY",
  "APPLYING",
  "APPLIED",
  "ASSESSMENT",
  "SHORTLISTED",
  "INTERVIEW_INVITED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_COMPLETED",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "ON_HOLD",
  "NO_RESPONSE",
  "APPLICATION_FAILED",
  "SUBMISSION_UNCERTAIN",
  "REQUIRES_REVIEW",
  "MANUAL_ACTION_REQUIRED",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

// ─── Automation Mode ─────────────────────────────────────────────
export const AutomationMode = z.enum([
  "FULLY_AUTONOMOUS",
  "APPROVAL_REQUIRED",
  "MANUAL_HANDOFF",
]);
export type AutomationMode = z.infer<typeof AutomationMode>;

// ─── Email Classification ────────────────────────────────────────
export const EmailClassification = z.enum([
  "JOB_APPLICATION",
  "SHORTLIST",
  "INTERVIEW",
  "ASSESSMENT",
  "REJECTION",
  "OFFER",
  "RECRUITER_MESSAGE",
  "REQUEST_FOR_INFORMATION",
  "OTHER",
]);
export type EmailClassification = z.infer<typeof EmailClassification>;

// ─── Interview Type ──────────────────────────────────────────────
export const InterviewType = z.enum([
  "PHONE_SCREEN",
  "TECHNICAL",
  "HR",
  "BEHAVIORAL",
  "SYSTEM_DESIGN",
  "CODING",
  "ONSITE",
  "PANEL",
  "CASE_STUDY",
  "PRESENTATION",
  "OTHER",
]);
export type InterviewType = z.infer<typeof InterviewType>;

// ─── Job Source ──────────────────────────────────────────────────
export const JobSource = z.enum([
  "LINKEDIN",
  "INDEED",
  "NAUKRI",
  "WELLFOUND",
  "INTERNSHALA",
  "GREENHOUSE",
  "LEVER",
  "WORKDAY",
  "ASHBY",
  "COMPANY_CAREER",
  "ADZUNA",
  "REED",
  "THE_MUSE",
  "ARBEITNOW",
  "REMOTIVE",
  "OTHER",
]);
export type JobSource = z.infer<typeof JobSource>;

// ─── Employment Type ─────────────────────────────────────────────
export const EmploymentType = z.enum([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "FREELANCE",
  "TEMPORARY",
]);
export type EmploymentType = z.infer<typeof EmploymentType>;

// ─── Work Arrangement ────────────────────────────────────────────
export const WorkArrangement = z.enum([
  "ONSITE",
  "REMOTE",
  "HYBRID",
]);
export type WorkArrangement = z.infer<typeof WorkArrangement>;

// ─── Experience Level ────────────────────────────────────────────
export const ExperienceLevel = z.enum([
  "ENTRY",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
  "DIRECTOR",
  "VP",
  "C_LEVEL",
]);
export type ExperienceLevel = z.infer<typeof ExperienceLevel>;

// ─── Candidate Profile ──────────────────────────────────────────
export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  summary?: string;
  education: Education[];
  experience: WorkExperience[];
  internships: Internship[];
  projects: Project[];
  technicalSkills: TechnicalSkills;
  certifications: Certification[];
  publications: Publication[];
  hackathons: Hackathon[];
  achievements: string[];
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  preferredLocations: string[];
  salaryExpectations?: SalaryExpectation;
  noticePeriod?: string;
  jobPreferences: JobPreferences;
  masterResumeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  achievements?: string[];
}

export interface WorkExperience {
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  responsibilities: string[];
  technologies: string[];
}

export interface Internship {
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  responsibilities: string[];
  technologies: string[];
}

export interface Project {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  highlights: string[];
  startDate?: string;
  endDate?: string;
}

export interface TechnicalSkills {
  programmingLanguages: string[];
  frameworks: string[];
  tools: string[];
  hardware: string[];
  protocols: string[];
  roboticsFrameworks: string[];
  embeddedTechnologies: string[];
  operatingSystems: string[];
  databases: string[];
  cloudPlatforms: string[];
  other: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  date?: string;
  url?: string;
}

export interface Publication {
  title: string;
  venue: string;
  date?: string;
  url?: string;
  authors?: string[];
}

export interface Hackathon {
  name: string;
  date?: string;
  result?: string;
  project?: string;
  technologies?: string[];
}

export interface SalaryExpectation {
  minimum: number;
  preferred?: number;
  currency: string;
  period: "MONTHLY" | "ANNUAL";
}

// ─── Job Preferences ────────────────────────────────────────────
export interface JobPreferences {
  targetRoles: string[];
  preferredLocations: string[];
  remotePreference: WorkArrangement[];
  minimumSalary?: SalaryExpectation;
  experienceLevel: ExperienceLevel[];
  employmentTypes: EmploymentType[];
  technologies: string[];
  companiesToInclude: string[];
  companiesToExclude: string[];
  minimumMatchScore: number; // 0-100
  maxExperienceYears?: number;
  datePostedWithinDays?: number;
  sources: JobSource[];
}

// ─── Job Listing ─────────────────────────────────────────────────
export interface JobListing {
  id: string;
  userId: string;
  title: string;
  company: string;
  location: string;
  remote: WorkArrangement;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  experienceLevel?: ExperienceLevel;
  employmentType?: EmploymentType;
  jobUrl: string;
  applicationUrl?: string;
  source: JobSource;
  datePosted?: string;
  dateDiscovered: string;
  description: string;
  extractedTechnologies: string[];
  applicationMethod?: string;
  analyzed: boolean;
  matchScore?: number;
  analysis?: JDAnalysis;
  createdAt: string;
  updatedAt: string;
}

// ─── JD Analysis ─────────────────────────────────────────────────
export interface JDAnalysis {
  company: CompanyInfo;
  position: PositionInfo;
  requirements: RequirementsInfo;
  responsibilities: string[];
  applicationRequirements: ApplicationRequirements;
}

export interface CompanyInfo {
  name: string;
  location?: string;
  industry?: string;
}

export interface PositionInfo {
  title: string;
  level?: ExperienceLevel;
  employmentType?: EmploymentType;
  workArrangement?: WorkArrangement;
}

export interface RequirementsInfo {
  requiredSkills: string[];
  preferredSkills: string[];
  education: string[];
  experience: string;
  certifications: string[];
  programmingLanguages: string[];
  tools: string[];
  hardware: string[];
  protocols: string[];
  roboticsFrameworks: string[];
  embeddedTechnologies: string[];
}

export interface ApplicationRequirements {
  resume: boolean;
  coverLetter: boolean;
  portfolio: boolean;
  github: boolean;
  linkedin: boolean;
  questions: string[];
  codingAssessment: boolean;
  additionalDocuments: string[];
  salaryExpectations: boolean;
  noticePeriod: boolean;
  relocationQuestions: boolean;
}

// ─── Job Match ───────────────────────────────────────────────────
export interface JobMatch {
  jobId: string;
  overallScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  matchingTechnologies: string[];
  missingTechnologies: string[];
  experienceAlignment: string;
  locationMatch: boolean;
  salaryMatch: string;
  roleRelevance: number;
  details: MatchDetail[];
}

export interface MatchDetail {
  category: string;
  required: string[];
  matched: string[];
  missing: string[];
  score: number;
}

// ─── Resume Version ─────────────────────────────────────────────
export interface ResumeVersion {
  id: string;
  userId: string;
  jobId?: string;
  isMaster: boolean;
  filename: string;
  originalFormat: string;
  storagePath: string;
  latexSource?: string;
  latexSourcePath?: string;
  pdfPath?: string;
  changesMade: ResumeChange[];
  keywordsTargeted: string[];
  sourceResumeId: string;
  generatedAt: string;
  createdAt: string;
}

export interface ResumeChange {
  type: "ADDED_EMPHASIS" | "REORDERED" | "DE_EMPHASIZED" | "KEYWORD_OPTIMIZED" | "SECTION_REORDERED";
  description: string;
  section?: string;
  items?: string[];
}

// ─── Application ─────────────────────────────────────────────────
export interface Application {
  id: string;
  userId: string;
  jobId: string;
  company: string;
  role: string;
  location: string;
  source: JobSource;
  jobUrl: string;
  applicationUrl?: string;
  dateFound: string;
  dateApplied?: string;
  resumeVersionId?: string;
  coverLetterVersionId?: string;
  status: ApplicationStatus;
  statusReason?: string;
  lastChecked?: string;
  nextAction?: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewType?: InterviewType;
  interviewMeetingUrl?: string;
  recruiterName?: string;
  recruiterEmail?: string;
  notes?: string;
  applicationAnswers?: Record<string, string>;
  failureReason?: string;
  failureStep?: string;
  auditLog: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

// ─── Cover Letter ────────────────────────────────────────────────
export interface CoverLetter {
  id: string;
  userId: string;
  jobId: string;
  content: string;
  filename: string;
  storagePath: string;
  generatedAt: string;
}

// ─── Interview ───────────────────────────────────────────────────
export interface Interview {
  id: string;
  userId: string;
  applicationId: string;
  company: string;
  role: string;
  round: string;
  type: InterviewType;
  date?: string;
  time?: string;
  timezone?: string;
  meetingUrl?: string;
  location?: string;
  interviewerName?: string;
  interviewerEmail?: string;
  instructions?: string;
  preparation?: string[];
  calendarEventId?: string;
  status: "INVITED" | "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  createdAt: string;
  updatedAt: string;
}

// ─── Audit Entry ─────────────────────────────────────────────────
export interface AuditEntry {
  timestamp: string;
  action: string;
  details?: string;
  status?: string;
  automated: boolean;
}

// ─── Notification ────────────────────────────────────────────────
export interface Notification {
  id: string;
  userId: string;
  type: "SHORTLISTED" | "INTERVIEW" | "ASSESSMENT" | "REJECTION" | "OFFER" |
        "APPLICATION_SUBMITTED" | "APPLICATION_FAILED" | "MANUAL_ACTION" |
        "RECRUITER_RESPONSE" | "FOLLOW_UP_DUE" | "DEADLINE_APPROACHING";
  title: string;
  message: string;
  applicationId?: string;
  jobId?: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

// ─── Automation Settings ─────────────────────────────────────────
export interface AutomationSettings {
  userId: string;
  mode: AutomationMode;
  jobDiscovery: boolean;
  resumeTailoring: boolean;
  overleafSync: boolean;
  automaticApplications: boolean;
  applicationMonitoring: boolean;
  interviewDetection: boolean;
  emailMonitoring: boolean;
  calendarIntegration: boolean;
  recruiterFollowUp: boolean;
  notificationPreference: "IMMEDIATE" | "DAILY_SUMMARY" | "BOTH";
  followUpDaysThreshold: number;
  dailySummaryTime?: string;
}

// ─── Overleaf Config ─────────────────────────────────────────────
export interface OverleafConfig {
  userId: string;
  gitUrl: string;
  mainTexFile: string;
  projectCloned: boolean;
  localPath: string;
  lastSyncAt?: string;
}

// ─── Job Queue Item ──────────────────────────────────────────────
export interface JobQueueItem {
  id: string;
  userId: string;
  jobId: string;
  stage: "DISCOVERY" | "ANALYSIS" | "MATCHING" | "TAILORING" | "VALIDATION" | "READY" | "APPLYING" | "TRACKING" | "MONITORING" | "COMPLETED" | "FAILED" | "SKIPPED";
  priority: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Fabrication Check Result ────────────────────────────────────
export interface FabricationCheckResult {
  passed: boolean;
  unsupportedClaims: string[];
  addedSkills: string[];
  addedExperience: string[];
  addedProjects: string[];
  verification: string;
}

// ─── Resume Tailoring Report ─────────────────────────────────────
export interface ResumeTailoringReport {
  addedEmphasis: string[];
  reordered: string[];
  deEmphasized: string[];
  removed: string[];
  fabricatedInformation: string[];
  fabricationCheck: FabricationCheckResult;
}

// ─── Search Parameters ──────────────────────────────────────────
export const SearchJobsInput = z.object({
  keywords: z.array(z.string()).optional().describe("Search keywords"),
  location: z.string().optional().describe("Job location"),
  remote: z.boolean().optional().describe("Remote jobs only"),
  experienceLevel: ExperienceLevel.optional().describe("Experience level"),
  employmentType: EmploymentType.optional().describe("Employment type"),
  salaryMinimum: z.number().optional().describe("Minimum salary"),
  technologies: z.array(z.string()).optional().describe("Required technologies"),
  company: z.string().optional().describe("Company name"),
  datePostedDays: z.number().optional().describe("Posted within N days"),
  source: JobSource.optional().describe("Job source platform"),
  limit: z.number().min(1).max(100).default(25).describe("Maximum results"),
});
export type SearchJobsInput = z.infer<typeof SearchJobsInput>;

// ─── Daily Summary ──────────────────────────────────────────────
export interface DailySummary {
  date: string;
  jobsDiscovered: number;
  jobsMatched: number;
  applicationsSubmitted: number;
  interviews: number;
  shortlisted: number;
  rejected: number;
  offers: number;
  manualActionsRequired: number;
  newNotifications: Notification[];
}
