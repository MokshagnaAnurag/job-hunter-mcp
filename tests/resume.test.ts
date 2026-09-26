// ═══════════════════════════════════════════════════════════════════
// Tests — Resume Parsing, Tailoring, Fabrication Prevention
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  checkForFabrication,
  extractAllCandidateSkills,
  categorizeSkills,
} from "../src/utils/fabrication-guard.js";
import {
  generateTailoringPlan,
  generateLatexResume,
  formatTailoringReport,
} from "../src/engine/resume-tailor-engine.js";
import { analyzeJobDescription } from "../src/engine/jd-parser.js";
import { calculateJobMatch } from "../src/engine/match-engine.js";
import type { CandidateProfile, JDAnalysis } from "../src/types/index.js";

// ─── Test Fixtures ──────────────────────────────────────────────

const mockProfile: CandidateProfile = {
  id: "test-id",
  userId: "user-1",
  fullName: "Test Candidate",
  email: "test@example.com",
  location: "Bangalore",
  education: [
    {
      institution: "Test University",
      degree: "B.Tech",
      field: "ECE",
      gpa: "8.5",
    },
  ],
  experience: [],
  internships: [
    {
      company: "Drone Lab",
      title: "Robotics Intern",
      startDate: "2025-06",
      endDate: "2025-09",
      responsibilities: [
        "Developed autonomous navigation using ROS2 and Nav2",
        "Implemented SLAM algorithms for indoor mapping",
      ],
      technologies: ["ROS2", "Nav2", "Python", "Linux", "SLAM", "Gazebo"],
    },
  ],
  projects: [
    {
      name: "Autonomous UAV Navigation",
      description: "Built autonomous drone navigation system",
      technologies: ["ROS2", "PX4", "Python", "Gazebo", "ArduPilot"],
      highlights: [
        "Implemented Nav2-based path planning",
        "Achieved 95% waypoint accuracy",
      ],
    },
    {
      name: "IoT Weather Station",
      description: "ESP32-based weather monitoring system",
      technologies: ["ESP32", "MQTT", "Python", "C++"],
      highlights: [
        "Real-time sensor data streaming",
        "Web dashboard for visualization",
      ],
    },
  ],
  technicalSkills: {
    programmingLanguages: ["Python", "C++", "C"],
    frameworks: ["ROS2", "Nav2"],
    tools: ["Gazebo", "Linux", "Docker", "Git", "OpenCV"],
    hardware: ["Raspberry Pi", "ESP32", "ESP8266", "STM32"],
    protocols: ["MQTT", "I2C", "SPI", "UART"],
    roboticsFrameworks: ["ROS2", "Nav2", "PX4", "ArduPilot"],
    embeddedTechnologies: ["ESP32", "ESP8266", "STM32", "Raspberry Pi"],
    operatingSystems: ["Linux", "Ubuntu"],
    databases: [],
    cloudPlatforms: [],
    other: ["SLAM", "IoT"],
  },
  certifications: [],
  publications: [],
  hackathons: [],
  achievements: ["Dean's list", "Robotics competition winner"],
  preferredLocations: ["Bangalore", "Hyderabad", "Chennai", "Remote"],
  jobPreferences: {
    targetRoles: [
      "Robotics Engineer",
      "ROS2 Engineer",
      "Embedded Engineer",
      "UAV Engineer",
    ],
    preferredLocations: ["Bangalore", "Hyderabad", "Chennai", "Remote"],
    remotePreference: ["REMOTE", "HYBRID"],
    experienceLevel: ["ENTRY", "JUNIOR"],
    employmentTypes: ["FULL_TIME"],
    technologies: ["ROS2", "Python", "C++"],
    companiesToInclude: [],
    companiesToExclude: [],
    minimumMatchScore: 40,
    sources: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockJD = `
Robotics Software Engineer

Company: XYZ Robotics
Location: Bangalore, India

Requirements:
- Strong experience with ROS2 and Nav2
- Python and C++ programming
- SLAM algorithms
- Gazebo simulation
- Linux environment
- Experience with CUDA and TensorRT (preferred)
- Docker and containerization
- Understanding of navigation algorithms

Preferred:
- Experience with TensorRT
- CUDA programming
- Deep learning for robotics

Responsibilities:
- Develop autonomous navigation solutions
- Implement SLAM and localization algorithms
- Write unit and integration tests
- Collaborate with hardware team
`;

// ─── Fabrication Guard Tests ────────────────────────────────────

describe("Fabrication Guard", () => {
  it("should extract all candidate skills correctly", () => {
    const skills = extractAllCandidateSkills(mockProfile);
    expect(skills.has("python")).toBe(true);
    expect(skills.has("ros2")).toBe(true);
    expect(skills.has("c++")).toBe(true);
    expect(skills.has("nav2")).toBe(true);
    expect(skills.has("slam")).toBe(true);
    expect(skills.has("gazebo")).toBe(true);
  });

  it("should pass fabrication check for genuine skills", () => {
    const result = checkForFabrication(
      mockProfile,
      ["ROS2", "Python", "C++", "Nav2", "SLAM"],
      [],
      [],
      [],
    );
    expect(result.passed).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
    expect(result.verification).toContain("No unsupported claims");
  });

  it("should FAIL fabrication check for invented skills", () => {
    const result = checkForFabrication(
      mockProfile,
      ["CUDA", "TensorRT", "Kubernetes"],
      [],
      [],
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.addedSkills).toContain("CUDA");
    expect(result.addedSkills).toContain("TensorRT");
    expect(result.addedSkills).toContain("Kubernetes");
    expect(result.verification).toContain("FABRICATION DETECTED");
  });

  it("should FAIL for invented companies", () => {
    const result = checkForFabrication(
      mockProfile,
      [],
      ["Google", "Tesla"],
      [],
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.addedExperience).toContain("Google");
  });

  it("should FAIL for invented projects", () => {
    const result = checkForFabrication(
      mockProfile,
      [],
      [],
      ["Self-Driving Car AI"],
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.addedProjects).toContain("Self-Driving Car AI");
  });

  it("should categorize matching vs missing skills", () => {
    const required = ["ROS2", "Python", "CUDA", "TensorRT", "C++"];
    const result = categorizeSkills(mockProfile, required);
    expect(result.matching).toContain("ROS2");
    expect(result.matching).toContain("Python");
    expect(result.matching).toContain("C++");
    expect(result.missing).toContain("CUDA");
    expect(result.missing).toContain("TensorRT");
  });
});

// ─── Resume Tailoring Tests ─────────────────────────────────────

describe("Resume Tailoring", () => {
  it("should generate tailoring plan without fabrication", () => {
    const analysis = analyzeJobDescription(mockJD, "XYZ Robotics", "Robotics Software Engineer", "Bangalore");
    const match = calculateJobMatch(mockProfile, analysis, "Bangalore");

    const { changes, report, fabricationCheck } = generateTailoringPlan(
      mockProfile,
      analysis,
      match,
    );

    expect(fabricationCheck.passed).toBe(true);
    expect(report.fabricatedInformation).toHaveLength(0);
    expect(changes.length).toBeGreaterThan(0);
  });

  it("should emphasize matching skills", () => {
    const analysis = analyzeJobDescription(mockJD, "XYZ Robotics", "Robotics Software Engineer");
    const match = calculateJobMatch(mockProfile, analysis);

    const { report } = generateTailoringPlan(mockProfile, analysis, match);

    // Should emphasize ROS2, Nav2, SLAM, Python etc
    expect(report.addedEmphasis.length).toBeGreaterThan(0);
  });

  it("should NOT add CUDA/TensorRT even though JD requires them", () => {
    const analysis = analyzeJobDescription(mockJD, "XYZ Robotics", "Robotics Software Engineer");
    const match = calculateJobMatch(mockProfile, analysis);

    const { report, fabricationCheck } = generateTailoringPlan(
      mockProfile,
      analysis,
      match,
    );

    // CUDA and TensorRT should NOT appear in added emphasis
    const addedLower = report.addedEmphasis.map((s) => s.toLowerCase());
    expect(addedLower).not.toContain("cuda");
    expect(addedLower).not.toContain("tensorrt");
    expect(fabricationCheck.passed).toBe(true);
  });

  it("should generate valid LaTeX", () => {
    const analysis = analyzeJobDescription(mockJD, "XYZ Robotics", "Robotics Software Engineer");
    const match = calculateJobMatch(mockProfile, analysis);
    const { tailoredSections } = generateTailoringPlan(mockProfile, analysis, match);

    const latex = generateLatexResume(
      mockProfile,
      tailoredSections,
      "XYZ Robotics",
      "Robotics Software Engineer",
    );

    expect(latex).toContain("\\documentclass");
    expect(latex).toContain("\\begin{document}");
    expect(latex).toContain("\\end{document}");
    expect(latex).toContain("Test Candidate");
    expect(latex).not.toContain("CUDA"); // Should not fabricate
  });

  it("should generate a readable tailoring report", () => {
    const analysis = analyzeJobDescription(mockJD, "XYZ Robotics", "Robotics Software Engineer");
    const match = calculateJobMatch(mockProfile, analysis);
    const { report } = generateTailoringPlan(mockProfile, analysis, match);
    const formatted = formatTailoringReport(report);

    expect(formatted).toContain("Resume Tailoring Report");
    expect(formatted).toContain("Fabrication check");
    expect(formatted).toContain("No unsupported claims");
  });
});

// ─── Resume Versioning Tests ────────────────────────────────────

describe("Resume Versioning", () => {
  it("should maintain master resume as immutable", () => {
    // The master resume ID should never change during tailoring
    const originalMasterId = mockProfile.masterResumeId;

    const analysis = analyzeJobDescription(mockJD, "XYZ Robotics", "Robotics Software Engineer");
    const match = calculateJobMatch(mockProfile, analysis);
    generateTailoringPlan(mockProfile, analysis, match);

    // Master resume ID should remain unchanged
    expect(mockProfile.masterResumeId).toBe(originalMasterId);
  });
});
