// ═══════════════════════════════════════════════════════════════════
// Fabrication Guard — Ensures no invented information in resumes
// ═══════════════════════════════════════════════════════════════════
// MANDATORY: The system must NEVER fabricate experience, skills,
// projects, certifications, or any other qualification.

import type { CandidateProfile, FabricationCheckResult, TechnicalSkills } from "../types/index.js";

/**
 * Extracts ALL skills/technologies from the candidate profile
 * as the single source of truth.
 */
export function extractAllCandidateSkills(profile: CandidateProfile): Set<string> {
  const skills = new Set<string>();

  // From technical skills
  const ts = profile.technicalSkills;
  const allSkillArrays: string[][] = [
    ts.programmingLanguages,
    ts.frameworks,
    ts.tools,
    ts.hardware,
    ts.protocols,
    ts.roboticsFrameworks,
    ts.embeddedTechnologies,
    ts.operatingSystems,
    ts.databases,
    ts.cloudPlatforms,
    ts.other,
  ];

  for (const arr of allSkillArrays) {
    for (const skill of arr) {
      skills.add(skill.toLowerCase().trim());
    }
  }

  // From experience
  for (const exp of profile.experience) {
    for (const tech of exp.technologies) {
      skills.add(tech.toLowerCase().trim());
    }
  }

  // From internships
  for (const intern of profile.internships) {
    for (const tech of intern.technologies) {
      skills.add(tech.toLowerCase().trim());
    }
  }

  // From projects
  for (const proj of profile.projects) {
    for (const tech of proj.technologies) {
      skills.add(tech.toLowerCase().trim());
    }
  }

  return skills;
}

/**
 * Extracts all company names from the candidate profile.
 */
export function extractAllCompanies(profile: CandidateProfile): Set<string> {
  const companies = new Set<string>();

  for (const exp of profile.experience) {
    companies.add(exp.company.toLowerCase().trim());
  }
  for (const intern of profile.internships) {
    companies.add(intern.company.toLowerCase().trim());
  }

  return companies;
}

/**
 * Extracts all project names from the candidate profile.
 */
export function extractAllProjects(profile: CandidateProfile): Set<string> {
  const projects = new Set<string>();
  for (const proj of profile.projects) {
    projects.add(proj.name.toLowerCase().trim());
  }
  return projects;
}

/**
 * Extracts all certifications from the candidate profile.
 */
export function extractAllCertifications(profile: CandidateProfile): Set<string> {
  const certs = new Set<string>();
  for (const cert of profile.certifications) {
    certs.add(cert.name.toLowerCase().trim());
  }
  return certs;
}

/**
 * Extracts all educational qualifications from the candidate profile.
 */
export function extractAllEducation(profile: CandidateProfile): Set<string> {
  const edu = new Set<string>();
  for (const e of profile.education) {
    edu.add(`${e.degree} ${e.field}`.toLowerCase().trim());
    edu.add(e.institution.toLowerCase().trim());
  }
  return edu;
}

/**
 * Verifies that a tailored resume does NOT contain fabricated information.
 *
 * Checks:
 * 1. No skills/technologies added that aren't in the candidate profile
 * 2. No companies/employers that don't exist in work history
 * 3. No projects that don't exist in the project list
 * 4. No certifications not held by the candidate
 *
 * @returns FabricationCheckResult with pass/fail and details
 */
export function checkForFabrication(
  profile: CandidateProfile,
  tailoredSkills: string[],
  tailoredCompanies: string[],
  tailoredProjects: string[],
  tailoredCertifications: string[],
): FabricationCheckResult {
  const candidateSkills = extractAllCandidateSkills(profile);
  const candidateCompanies = extractAllCompanies(profile);
  const candidateProjects = extractAllProjects(profile);
  const candidateCerts = extractAllCertifications(profile);

  const unsupportedClaims: string[] = [];
  const addedSkills: string[] = [];
  const addedExperience: string[] = [];
  const addedProjects: string[] = [];

  // Check skills
  for (const skill of tailoredSkills) {
    const normalized = skill.toLowerCase().trim();
    if (!candidateSkills.has(normalized)) {
      addedSkills.push(skill);
      unsupportedClaims.push(`Skill "${skill}" not found in candidate profile`);
    }
  }

  // Check companies
  for (const company of tailoredCompanies) {
    const normalized = company.toLowerCase().trim();
    if (!candidateCompanies.has(normalized)) {
      addedExperience.push(company);
      unsupportedClaims.push(`Company "${company}" not found in work history`);
    }
  }

  // Check projects
  for (const project of tailoredProjects) {
    const normalized = project.toLowerCase().trim();
    if (!candidateProjects.has(normalized)) {
      addedProjects.push(project);
      unsupportedClaims.push(`Project "${project}" not found in project list`);
    }
  }

  // Check certifications
  for (const cert of tailoredCertifications) {
    const normalized = cert.toLowerCase().trim();
    if (!candidateCerts.has(normalized)) {
      unsupportedClaims.push(`Certification "${cert}" not held by candidate`);
    }
  }

  const passed = unsupportedClaims.length === 0;

  return {
    passed,
    unsupportedClaims,
    addedSkills,
    addedExperience,
    addedProjects,
    verification: passed
      ? "✓ No unsupported claims added. All information verified against candidate profile."
      : `✗ FABRICATION DETECTED: ${unsupportedClaims.length} unsupported claim(s) found. DO NOT SUBMIT.`,
  };
}

/**
 * Identifies which required skills from a JD the candidate genuinely has
 * and which are missing.
 */
export function categorizeSkills(
  profile: CandidateProfile,
  requiredSkills: string[],
): { matching: string[]; missing: string[] } {
  const candidateSkills = extractAllCandidateSkills(profile);
  const matching: string[] = [];
  const missing: string[] = [];

  for (const skill of requiredSkills) {
    const normalized = skill.toLowerCase().trim();
    // Also check common variations
    const variations = [
      normalized,
      normalized.replace(/\s+/g, ""),
      normalized.replace(/-/g, ""),
      normalized.replace(/\+\+/g, "pp"),
    ];

    const found = variations.some((v) => candidateSkills.has(v));
    if (found) {
      matching.push(skill);
    } else {
      missing.push(skill);
    }
  }

  return { matching, missing };
}
