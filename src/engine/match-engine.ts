// ═══════════════════════════════════════════════════════════════════
// Match Engine — Profile ↔ JD Matching with Explainable Analysis
// ═══════════════════════════════════════════════════════════════════

import type {
  CandidateProfile,
  JDAnalysis,
  JobMatch,
  MatchDetail,
  JobPreferences,
} from "../types/index.js";
import { extractAllCandidateSkills, categorizeSkills } from "../utils/fabrication-guard.js";

/**
 * Calculates an explainable match score between a candidate profile and JD.
 * The score is NOT a probability of getting hired — it's an objective
 * measure of how well the candidate's profile aligns with the JD.
 */
export function calculateJobMatch(
  profile: CandidateProfile,
  analysis: JDAnalysis,
  jobLocation?: string,
  jobSalary?: string,
): JobMatch {
  const candidateSkills = extractAllCandidateSkills(profile);
  const details: MatchDetail[] = [];

  // 1. Programming Languages Match
  const langMatch = categorizeSkills(profile, analysis.requirements.programmingLanguages);
  const langScore = analysis.requirements.programmingLanguages.length > 0
    ? (langMatch.matching.length / analysis.requirements.programmingLanguages.length) * 100
    : 100;
  details.push({
    category: "Programming Languages",
    required: analysis.requirements.programmingLanguages,
    matched: langMatch.matching,
    missing: langMatch.missing,
    score: langScore,
  });

  // 2. Robotics Frameworks
  const robotMatch = categorizeSkills(profile, analysis.requirements.roboticsFrameworks);
  const robotScore = analysis.requirements.roboticsFrameworks.length > 0
    ? (robotMatch.matching.length / analysis.requirements.roboticsFrameworks.length) * 100
    : 100;
  details.push({
    category: "Robotics Frameworks",
    required: analysis.requirements.roboticsFrameworks,
    matched: robotMatch.matching,
    missing: robotMatch.missing,
    score: robotScore,
  });

  // 3. Embedded Technologies
  const embedMatch = categorizeSkills(profile, analysis.requirements.embeddedTechnologies);
  const embedScore = analysis.requirements.embeddedTechnologies.length > 0
    ? (embedMatch.matching.length / analysis.requirements.embeddedTechnologies.length) * 100
    : 100;
  details.push({
    category: "Embedded Technologies",
    required: analysis.requirements.embeddedTechnologies,
    matched: embedMatch.matching,
    missing: embedMatch.missing,
    score: embedScore,
  });

  // 4. Tools
  const toolMatch = categorizeSkills(profile, analysis.requirements.tools);
  const toolScore = analysis.requirements.tools.length > 0
    ? (toolMatch.matching.length / analysis.requirements.tools.length) * 100
    : 100;
  details.push({
    category: "Tools & Platforms",
    required: analysis.requirements.tools,
    matched: toolMatch.matching,
    missing: toolMatch.missing,
    score: toolScore,
  });

  // 5. Hardware
  const hwMatch = categorizeSkills(profile, analysis.requirements.hardware);
  const hwScore = analysis.requirements.hardware.length > 0
    ? (hwMatch.matching.length / analysis.requirements.hardware.length) * 100
    : 100;
  details.push({
    category: "Hardware",
    required: analysis.requirements.hardware,
    matched: hwMatch.matching,
    missing: hwMatch.missing,
    score: hwScore,
  });

  // 6. Protocols
  const protoMatch = categorizeSkills(profile, analysis.requirements.protocols);
  const protoScore = analysis.requirements.protocols.length > 0
    ? (protoMatch.matching.length / analysis.requirements.protocols.length) * 100
    : 100;
  details.push({
    category: "Protocols",
    required: analysis.requirements.protocols,
    matched: protoMatch.matching,
    missing: protoMatch.missing,
    score: protoScore,
  });

  // Aggregate all matching / missing
  const allMatchingSkills = [
    ...langMatch.matching,
    ...robotMatch.matching,
    ...embedMatch.matching,
    ...toolMatch.matching,
    ...hwMatch.matching,
    ...protoMatch.matching,
  ];
  const allMissingSkills = [
    ...langMatch.missing,
    ...robotMatch.missing,
    ...embedMatch.missing,
    ...toolMatch.missing,
    ...hwMatch.missing,
    ...protoMatch.missing,
  ];

  // Calculate overall score (weighted)
  const weights: Record<string, number> = {
    "Programming Languages": 0.25,
    "Robotics Frameworks": 0.20,
    "Embedded Technologies": 0.15,
    "Tools & Platforms": 0.15,
    "Hardware": 0.10,
    "Protocols": 0.10,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const detail of details) {
    const w = weights[detail.category] || 0.05;
    // Only count categories that have requirements
    if (detail.required.length > 0) {
      weightedSum += detail.score * w;
      totalWeight += w;
    }
  }

  // Normalize to 0-100
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  // Experience alignment
  const experienceAlignment = assessExperienceAlignment(profile, analysis);

  // Location match
  const locationMatch = checkLocationMatch(profile, jobLocation);

  // Salary match
  const salaryMatch = assessSalaryMatch(profile, jobSalary);

  // Role relevance (how well does the JD title match user's target roles)
  const roleRelevance = calculateRoleRelevance(
    profile.jobPreferences.targetRoles,
    analysis.position.title,
  );

  return {
    jobId: "",
    overallScore,
    matchingSkills: allMatchingSkills,
    missingSkills: allMissingSkills,
    matchingTechnologies: allMatchingSkills, // alias
    missingTechnologies: allMissingSkills,   // alias
    experienceAlignment,
    locationMatch,
    salaryMatch,
    roleRelevance,
    details,
  };
}

/**
 * Assesses experience level alignment.
 */
function assessExperienceAlignment(
  profile: CandidateProfile,
  analysis: JDAnalysis,
): string {
  const jdLevel = analysis.position.level;
  const candidateLevels = profile.jobPreferences.experienceLevel;

  if (!jdLevel) return "Not specified in JD";

  if (candidateLevels.length === 0) return `JD requires: ${jdLevel}`;

  const levelOrder = ["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD", "PRINCIPAL", "DIRECTOR", "VP", "C_LEVEL"];
  const jdIdx = levelOrder.indexOf(jdLevel);
  const candidateIdx = candidateLevels.map((l) => levelOrder.indexOf(l));
  const maxCandidateIdx = Math.max(...candidateIdx);
  const minCandidateIdx = Math.min(...candidateIdx);

  if (jdIdx >= minCandidateIdx && jdIdx <= maxCandidateIdx) {
    return `Compatible — ${jdLevel} matches candidate's experience range`;
  }
  if (jdIdx > maxCandidateIdx) {
    return `JD requires ${jdLevel} — may be above candidate's current level`;
  }
  return `JD is ${jdLevel} — candidate may be overqualified`;
}

/**
 * Checks if job location matches candidate preferences.
 */
function checkLocationMatch(
  profile: CandidateProfile,
  jobLocation?: string,
): boolean {
  if (!jobLocation) return true; // Unknown location → don't exclude

  const preferred = profile.jobPreferences.preferredLocations.map((l) =>
    l.toLowerCase().trim(),
  );

  if (preferred.length === 0) return true;

  const jobLoc = jobLocation.toLowerCase().trim();

  return preferred.some((loc) => {
    // Check if either contains the other (e.g., "Bangalore" in "Bangalore, India")
    return jobLoc.includes(loc) || loc.includes(jobLoc);
  });
}

/**
 * Assesses salary match.
 */
function assessSalaryMatch(
  profile: CandidateProfile,
  jobSalary?: string,
): string {
  if (!jobSalary) return "Not disclosed";
  if (!profile.jobPreferences.minimumSalary) return `Offered: ${jobSalary}`;

  return `Offered: ${jobSalary} | Minimum expected: ${profile.jobPreferences.minimumSalary.minimum} ${profile.jobPreferences.minimumSalary.currency}/${profile.jobPreferences.minimumSalary.period.toLowerCase()}`;
}

/**
 * Calculates role relevance score (0-100).
 */
function calculateRoleRelevance(targetRoles: string[], jdTitle: string): number {
  if (targetRoles.length === 0) return 50;

  const jdLower = jdTitle.toLowerCase();
  let bestScore = 0;

  for (const role of targetRoles) {
    const roleLower = role.toLowerCase();
    const roleWords = roleLower.split(/\s+/);

    // Exact match
    if (jdLower === roleLower) return 100;

    // Contains match
    if (jdLower.includes(roleLower) || roleLower.includes(jdLower)) {
      bestScore = Math.max(bestScore, 90);
      continue;
    }

    // Word overlap
    const jdWords = jdLower.split(/\s+/);
    const commonWords = roleWords.filter((w) =>
      jdWords.some((jw) => jw.includes(w) || w.includes(jw)),
    );
    const overlapScore = (commonWords.length / Math.max(roleWords.length, 1)) * 80;
    bestScore = Math.max(bestScore, overlapScore);
  }

  return Math.round(bestScore);
}

/**
 * Formats a match analysis into a readable report.
 */
export function formatMatchReport(match: JobMatch, jdTitle: string): string {
  const lines: string[] = [];

  lines.push(`Job Match Analysis`);
  lines.push(`═══════════════════════════════════`);
  lines.push(`Role: ${jdTitle}`);
  lines.push(`Overall Score: ${match.overallScore}/100`);
  lines.push(``);

  lines.push(`Matching Skills:`);
  for (const skill of match.matchingSkills) {
    lines.push(`  ✓ ${skill}`);
  }
  if (match.matchingSkills.length === 0) {
    lines.push(`  (none)`);
  }

  lines.push(``);
  lines.push(`Missing Skills (from JD requirements):`);
  for (const skill of match.missingSkills) {
    lines.push(`  • ${skill}`);
  }
  if (match.missingSkills.length === 0) {
    lines.push(`  (none — all requirements met)`);
  }

  lines.push(``);
  lines.push(`Experience: ${match.experienceAlignment}`);
  lines.push(`Location: ${match.locationMatch ? "Match" : "May not match preferences"}`);
  lines.push(`Salary: ${match.salaryMatch}`);
  lines.push(`Role Relevance: ${match.roleRelevance}/100`);

  lines.push(``);
  lines.push(`Category Breakdown:`);
  for (const detail of match.details) {
    if (detail.required.length > 0) {
      lines.push(`  ${detail.category}: ${Math.round(detail.score)}/100 (${detail.matched.length}/${detail.required.length})`);
    }
  }

  return lines.join("\n");
}

/**
 * Checks if a job passes the user's filter preferences.
 */
export function passesFilters(
  match: JobMatch,
  preferences: JobPreferences,
  jobLocation?: string,
  experienceLevel?: string,
): boolean {
  // Minimum match score
  if (match.overallScore < preferences.minimumMatchScore) return false;

  // Location filter
  if (preferences.preferredLocations.length > 0 && !match.locationMatch) return false;

  // Role relevance threshold (at least 30% relevant)
  if (match.roleRelevance < 30) return false;

  return true;
}
