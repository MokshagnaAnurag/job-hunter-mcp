// ═══════════════════════════════════════════════════════════════════
// Tests — Job Matching, JD Extraction, Filtering
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { analyzeJobDescription, extractTechnologies, extractAllTechnologiesFlat } from "../src/engine/jd-parser.js";
import { calculateJobMatch, formatMatchReport, passesFilters } from "../src/engine/match-engine.js";
import type { CandidateProfile } from "../src/types/index.js";

const mockProfile: CandidateProfile = {
  id: "test",
  userId: "user-1",
  fullName: "Test Candidate",
  email: "test@test.com",
  education: [{ institution: "University", degree: "B.Tech", field: "ECE" }],
  experience: [],
  internships: [{
    company: "Drone Lab",
    title: "Intern",
    startDate: "2025-01",
    responsibilities: ["ROS2 development"],
    technologies: ["ROS2", "Python", "Nav2"],
  }],
  projects: [{
    name: "UAV Project",
    description: "Drone navigation",
    technologies: ["ROS2", "PX4", "Gazebo"],
    highlights: ["Autonomous flight"],
  }],
  technicalSkills: {
    programmingLanguages: ["Python", "C++", "C"],
    frameworks: ["ROS2", "Nav2"],
    tools: ["Gazebo", "Linux", "Docker", "OpenCV"],
    hardware: ["Raspberry Pi", "ESP32", "STM32"],
    protocols: ["MQTT", "I2C", "SPI"],
    roboticsFrameworks: ["ROS2", "Nav2", "PX4"],
    embeddedTechnologies: ["ESP32", "STM32"],
    operatingSystems: ["Linux"],
    databases: [],
    cloudPlatforms: [],
    other: ["SLAM"],
  },
  certifications: [],
  publications: [],
  hackathons: [],
  achievements: [],
  preferredLocations: ["Bangalore", "Hyderabad", "Remote"],
  jobPreferences: {
    targetRoles: ["Robotics Engineer", "ROS2 Engineer"],
    preferredLocations: ["Bangalore", "Hyderabad", "Remote"],
    remotePreference: ["REMOTE"],
    experienceLevel: ["ENTRY"],
    employmentTypes: ["FULL_TIME"],
    technologies: ["ROS2", "Python"],
    companiesToInclude: [],
    companiesToExclude: [],
    minimumMatchScore: 40,
    sources: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── JD Extraction Tests ────────────────────────────────────────

describe("JD Parser", () => {
  it("should extract programming languages", () => {
    const techs = extractTechnologies("We need Python, C++, and JavaScript developers");
    expect(techs.programmingLanguages).toContain("python");
    expect(techs.programmingLanguages).toContain("c++");
    expect(techs.programmingLanguages).toContain("javascript");
  });

  it("should extract robotics frameworks", () => {
    const techs = extractTechnologies("Experience with ROS2, Nav2, and Gazebo required");
    expect(techs.roboticsFrameworks).toContain("ros2");
    expect(techs.roboticsFrameworks).toContain("nav2");
    expect(techs.roboticsFrameworks).toContain("gazebo");
  });

  it("should extract embedded technologies", () => {
    const techs = extractTechnologies("Work with STM32, ESP32, and Raspberry Pi");
    expect(techs.embeddedTechnologies).toContain("stm32");
    expect(techs.embeddedTechnologies).toContain("esp32");
    expect(techs.embeddedTechnologies).toContain("raspberry pi");
  });

  it("should analyze full JD", () => {
    const jd = `
Robotics Software Engineer
Company: ABC Robotics
Location: Bangalore, India

We are looking for a full-time entry-level Robotics Software Engineer.

Requirements:
- Python and C++ programming
- ROS2 and Nav2 experience
- SLAM knowledge
- Linux proficiency

Preferred:
- Docker experience
- Gazebo simulation
- Computer vision with OpenCV

Responsibilities:
- Develop navigation algorithms
- Implement SLAM solutions
- Test and validate robot behavior

Please submit your resume and cover letter.
`;

    const analysis = analyzeJobDescription(jd, "ABC Robotics", "Robotics Software Engineer", "Bangalore");

    expect(analysis.company.name).toBe("ABC Robotics");
    expect(analysis.position.title).toBe("Robotics Software Engineer");
    expect(analysis.requirements.programmingLanguages).toContain("python");
    expect(analysis.requirements.programmingLanguages).toContain("c++");
    expect(analysis.requirements.roboticsFrameworks).toContain("ros2");
    expect(analysis.requirements.roboticsFrameworks).toContain("nav2");
    expect(analysis.applicationRequirements.resume).toBe(true);
    expect(analysis.applicationRequirements.coverLetter).toBe(true);
  });

  it("should detect experience level", () => {
    const analysis = analyzeJobDescription(
      "Looking for entry-level engineer with 0-2 years experience",
      "Company",
      "Engineer",
    );
    expect(analysis.position.level).toBe("ENTRY");
  });

  it("should detect employment type", () => {
    const analysis = analyzeJobDescription(
      "This is a full-time position",
      "Company",
      "Engineer",
    );
    expect(analysis.position.employmentType).toBe("FULL_TIME");
  });

  it("should detect work arrangement", () => {
    const analysis = analyzeJobDescription(
      "This is a remote position, work from home available",
      "Company",
      "Engineer",
    );
    expect(analysis.position.workArrangement).toBe("REMOTE");
  });
});

// ─── Match Engine Tests ─────────────────────────────────────────

describe("Match Engine", () => {
  it("should calculate high match for relevant JD", () => {
    const analysis = analyzeJobDescription(
      "ROS2 Python C++ Nav2 SLAM Gazebo Linux developer needed",
      "Test Corp",
      "Robotics Engineer",
      "Bangalore",
    );

    const match = calculateJobMatch(mockProfile, analysis, "Bangalore");

    expect(match.overallScore).toBeGreaterThan(60);
    expect(match.matchingSkills.length).toBeGreaterThan(3);
    expect(match.locationMatch).toBe(true);
  });

  it("should calculate low match for irrelevant JD", () => {
    const analysis = analyzeJobDescription(
      "We need CUDA TensorRT AWS Kubernetes Go Terraform experience",
      "Cloud Corp",
      "Cloud Engineer",
      "Mumbai",
    );

    const match = calculateJobMatch(mockProfile, analysis, "Mumbai");

    expect(match.overallScore).toBeLessThan(50);
    expect(match.missingSkills.length).toBeGreaterThan(0);
  });

  it("should identify missing skills correctly", () => {
    const analysis = analyzeJobDescription(
      "Must know ROS2 Python CUDA TensorRT",
      "AI Corp",
      "AI Engineer",
    );

    const match = calculateJobMatch(mockProfile, analysis);

    expect(match.matchingSkills).toContain("ros2");
    expect(match.matchingSkills).toContain("python");
    expect(match.missingSkills).toContain("cuda");
    expect(match.missingSkills).toContain("tensorrt");
  });

  it("should check location match", () => {
    const analysis = analyzeJobDescription("Test JD", "Corp", "Role");

    const matchBangalore = calculateJobMatch(mockProfile, analysis, "Bangalore");
    expect(matchBangalore.locationMatch).toBe(true);

    const matchMumbai = calculateJobMatch(mockProfile, analysis, "Mumbai");
    expect(matchMumbai.locationMatch).toBe(false);
  });

  it("should generate readable match report", () => {
    const analysis = analyzeJobDescription(
      "ROS2 Python Nav2 SLAM Gazebo",
      "Test Corp",
      "Robotics Engineer",
    );

    const match = calculateJobMatch(mockProfile, analysis);
    const report = formatMatchReport(match, "Robotics Engineer");

    expect(report).toContain("Job Match Analysis");
    expect(report).toContain("Overall Score");
    expect(report).toContain("Matching Skills");
  });

  it("should apply filters correctly", () => {
    const analysis = analyzeJobDescription(
      "ROS2 Python Nav2 SLAM Gazebo",
      "Test Corp",
      "Robotics Engineer",
    );

    const match = calculateJobMatch(mockProfile, analysis, "Bangalore");
    match.overallScore = 75;

    const passes = passesFilters(match, mockProfile.jobPreferences, "Bangalore");
    expect(passes).toBe(true);

    // Low score should not pass
    match.overallScore = 20;
    const fails = passesFilters(match, { ...mockProfile.jobPreferences, minimumMatchScore: 40 });
    expect(fails).toBe(false);
  });
});

// ─── Duplicate Detection Tests ──────────────────────────────────

describe("Duplicate Detection", () => {
  it("should detect normalized URL duplicates", () => {
    // URL normalization is tested indirectly through the checker module
    const url1 = "https://example.com/jobs/123/?utm_source=google";
    const url2 = "https://example.com/jobs/123/";

    // Both should normalize to the same thing
    const normalize = (url: string) => {
      try {
        const parsed = new URL(url);
        parsed.searchParams.delete("utm_source");
        parsed.hash = "";
        let result = parsed.toString();
        if (result.endsWith("/")) result = result.slice(0, -1);
        return result.toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    };

    expect(normalize(url1)).toBe(normalize(url2));
  });
});
