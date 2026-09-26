// ═══════════════════════════════════════════════════════════════════
// JD Parser — Job Description Analysis Engine
// ═══════════════════════════════════════════════════════════════════

import type {
  JDAnalysis,
  CompanyInfo,
  PositionInfo,
  RequirementsInfo,
  ApplicationRequirements,
  ExperienceLevel,
  EmploymentType,
  WorkArrangement,
} from "../types/index.js";

// ─── Technology keyword lists ────────────────────────────────────
const PROGRAMMING_LANGUAGES = new Set([
  "python", "c", "c++", "c#", "java", "javascript", "typescript", "go", "golang",
  "rust", "ruby", "kotlin", "swift", "scala", "matlab", "r", "julia", "perl",
  "lua", "haskell", "elixir", "dart", "php", "vhdl", "verilog", "assembly",
  "bash", "shell", "powershell", "sql", "html", "css",
]);

const ROBOTICS_FRAMEWORKS = new Set([
  "ros", "ros2", "ros 2", "nav2", "moveit", "moveit2", "gazebo", "rviz",
  "isaac sim", "webots", "coppeliasim", "v-rep", "carla", "airsim",
  "ardupilot", "px4", "mavros", "mavlink", "micro-ros", "rtps", "dds",
]);

const EMBEDDED_TECHNOLOGIES = new Set([
  "stm32", "esp32", "esp8266", "arduino", "raspberry pi", "rpi", "fpga",
  "arm", "arm cortex", "cortex-m", "avr", "pic", "msp430", "teensy",
  "beaglebone", "jetson", "nvidia jetson", "jetson nano", "jetson orin",
  "freertos", "zephyr", "nuttx", "mbed", "rtos", "bare-metal",
  "i2c", "spi", "uart", "can", "can bus", "modbus", "mqtt", "zigbee",
  "bluetooth", "ble", "wifi", "lora", "lorawan", "nrf", "nrf52",
]);

const TOOLS = new Set([
  "docker", "kubernetes", "k8s", "git", "github", "gitlab", "bitbucket",
  "jenkins", "ci/cd", "terraform", "ansible", "aws", "gcp", "azure",
  "opencv", "pcl", "point cloud library", "tensorflow", "pytorch",
  "keras", "scikit-learn", "numpy", "pandas", "matplotlib",
  "cmake", "make", "gcc", "gdb", "valgrind", "jira", "confluence",
  "solidworks", "autocad", "kicad", "altium", "eagle", "fusion 360",
  "simulink", "labview", "proteus",  "linux", "ubuntu", "debian",
  "cuda", "tensorrt", "onnx", "slam", "lidar", "radar", "imu",
]);

const HARDWARE_KEYWORDS = new Set([
  "lidar", "radar", "imu", "gps", "gnss", "camera", "depth camera",
  "stereo camera", "ultrasonic", "encoder", "servo", "stepper",
  "motor driver", "actuator", "sensor", "accelerometer", "gyroscope",
  "magnetometer", "barometer", "sonar", "infrared", "ir sensor",
  "force sensor", "torque sensor", "strain gauge", "load cell",
  "pcb", "oscilloscope", "logic analyzer", "multimeter",
]);

const PROTOCOLS = new Set([
  "tcp/ip", "udp", "http", "https", "websocket", "grpc", "rest",
  "mqtt", "amqp", "dds", "rtps", "can", "can bus", "canopen",
  "ethercat", "profinet", "modbus", "opc-ua", "ros topics",
  "ros services", "ros actions", "i2c", "spi", "uart", "usb",
  "ethernet", "serial", "rs232", "rs485",
]);

/**
 * Extracts technologies from text by matching against known categories.
 */
export function extractTechnologies(text: string): {
  programmingLanguages: string[];
  roboticsFrameworks: string[];
  embeddedTechnologies: string[];
  tools: string[];
  hardware: string[];
  protocols: string[];
} {
  const lowerText = text.toLowerCase();

  const extract = (keywords: Set<string>): string[] => {
    const found: string[] = [];
    for (const kw of keywords) {
      // Use word boundary matching for short keywords
      if (kw.length <= 2) {
        const regex = new RegExp(`\\b${kw.replace(/[+]/g, "\\+")}\\b`, "i");
        if (regex.test(lowerText)) found.push(kw);
      } else {
        if (lowerText.includes(kw)) found.push(kw);
      }
    }
    return [...new Set(found)];
  };

  return {
    programmingLanguages: extract(PROGRAMMING_LANGUAGES),
    roboticsFrameworks: extract(ROBOTICS_FRAMEWORKS),
    embeddedTechnologies: extract(EMBEDDED_TECHNOLOGIES),
    tools: extract(TOOLS),
    hardware: extract(HARDWARE_KEYWORDS),
    protocols: extract(PROTOCOLS),
  };
}

/**
 * Detects experience level from JD text.
 */
function detectExperienceLevel(text: string): ExperienceLevel | undefined {
  const lower = text.toLowerCase();

  const patterns: [RegExp, ExperienceLevel][] = [
    [/\b(entry[\s-]?level|fresher|fresh graduate|graduate trainee|0[\s-]?[\-–]?\s*[12]\s*years?)\b/i, "ENTRY"],
    [/\b(junior|jr\.?|1[\s-]?[\-–]?\s*3\s*years?)\b/i, "JUNIOR"],
    [/\b(mid[\s-]?level|intermediate|3[\s-]?[\-–]?\s*5\s*years?)\b/i, "MID"],
    [/\b(senior|sr\.?|5[\s-]?[\-–]?\s*[89]\s*years?|5\+\s*years?)\b/i, "SENIOR"],
    [/\b(lead|team\s*lead|tech\s*lead|8[\s-]?[\-–]?\s*1[0-2]\s*years?)\b/i, "LEAD"],
    [/\b(principal|staff)\b/i, "PRINCIPAL"],
    [/\b(director)\b/i, "DIRECTOR"],
    [/\b(vp|vice\s*president)\b/i, "VP"],
    [/\b(cto|ceo|c[\s-]?level|chief)\b/i, "C_LEVEL"],
  ];

  for (const [pattern, level] of patterns) {
    if (pattern.test(lower)) return level;
  }

  return undefined;
}

/**
 * Detects employment type from JD text.
 */
function detectEmploymentType(text: string): EmploymentType | undefined {
  const lower = text.toLowerCase();

  if (/\b(full[\s-]?time)\b/i.test(lower)) return "FULL_TIME";
  if (/\b(part[\s-]?time)\b/i.test(lower)) return "PART_TIME";
  if (/\b(contract|contractual)\b/i.test(lower)) return "CONTRACT";
  if (/\b(intern|internship)\b/i.test(lower)) return "INTERNSHIP";
  if (/\b(freelance|freelancer)\b/i.test(lower)) return "FREELANCE";
  if (/\b(temporary|temp)\b/i.test(lower)) return "TEMPORARY";

  return undefined;
}

/**
 * Detects work arrangement from JD text.
 */
function detectWorkArrangement(text: string): WorkArrangement | undefined {
  const lower = text.toLowerCase();

  if (/\b(remote|work\s*from\s*home|wfh|fully\s*remote)\b/i.test(lower)) return "REMOTE";
  if (/\b(hybrid|flexible|partial\s*remote)\b/i.test(lower)) return "HYBRID";
  if (/\b(on[\s-]?site|in[\s-]?office|in[\s-]?person)\b/i.test(lower)) return "ONSITE";

  return undefined;
}

/**
 * Extracts required vs preferred skills from JD text.
 */
function extractSkillRequirements(text: string): {
  required: string[];
  preferred: string[];
} {
  const required: string[] = [];
  const preferred: string[] = [];

  // Split into sections and detect required vs preferred
  const sections = text.split(/\n(?=[A-Z]|\*|\-|•|●)/);
  let currentSection: "required" | "preferred" | "unknown" = "unknown";

  for (const section of sections) {
    const lower = section.toLowerCase();
    if (/\b(required|must\s*have|essential|mandatory|minimum)\b/.test(lower)) {
      currentSection = "required";
    } else if (/\b(preferred|nice\s*to\s*have|good\s*to\s*have|desirable|bonus|plus)\b/.test(lower)) {
      currentSection = "preferred";
    }

    // Extract bullet-point items
    const bullets = section.match(/^[\s]*[\-\*•●]\s*(.+)$/gm);
    if (bullets) {
      for (const bullet of bullets) {
        const item = bullet.replace(/^[\s]*[\-\*•●]\s*/, "").trim();
        if (item.length > 3 && item.length < 200) {
          if (currentSection === "preferred") {
            preferred.push(item);
          } else {
            required.push(item);
          }
        }
      }
    }
  }

  return { required, preferred };
}

/**
 * Extracts responsibilities from JD text.
 */
function extractResponsibilities(text: string): string[] {
  const responsibilities: string[] = [];
  const lower = text.toLowerCase();

  // Find responsibility sections
  const responsibilitySection = text.match(
    /(?:responsibilities|what\s*you['']ll\s*do|role|duties|key\s*responsibilities)[:\s]*\n([\s\S]*?)(?=\n(?:requirements|qualifications|skills|about|benefits|what\s*we|who\s*you)|$)/i,
  );

  const sectionText = responsibilitySection ? responsibilitySection[1] : text;

  const bullets = sectionText.match(/^[\s]*[\-\*•●]\s*(.+)$/gm);
  if (bullets) {
    for (const bullet of bullets) {
      const item = bullet.replace(/^[\s]*[\-\*•●]\s*/, "").trim();
      if (item.length > 10 && item.length < 500) {
        responsibilities.push(item);
      }
    }
  }

  return responsibilities.slice(0, 20);
}

/**
 * Detects application requirements from JD text.
 */
function detectApplicationRequirements(text: string): ApplicationRequirements {
  const lower = text.toLowerCase();

  return {
    resume: true, // Always assumed
    coverLetter: /\b(cover\s*letter)\b/i.test(lower),
    portfolio: /\b(portfolio|work\s*samples)\b/i.test(lower),
    github: /\b(github|git\s*repository)\b/i.test(lower),
    linkedin: /\b(linkedin)\b/i.test(lower),
    questions: [],
    codingAssessment: /\b(coding\s*(test|challenge|assessment|round)|hackerrank|leetcode|codility)\b/i.test(lower),
    additionalDocuments: [],
    salaryExpectations: /\b(salary\s*expectation|expected\s*salary|compensation\s*expectation)\b/i.test(lower),
    noticePeriod: /\b(notice\s*period)\b/i.test(lower),
    relocationQuestions: /\b(relocation|willing\s*to\s*relocate)\b/i.test(lower),
  };
}

/**
 * Extract experience string (e.g., "2-5 years")
 */
function extractExperienceRequirement(text: string): string {
  const match = text.match(/(\d+[\s]*[\-–—to]+[\s]*\d+[\s]*(?:years?|yrs?))/i);
  if (match) return match[1];

  const match2 = text.match(/(\d+\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience)?)/i);
  if (match2) return match2[1];

  return "Not specified";
}

/**
 * Full JD analysis — the primary export.
 */
export function analyzeJobDescription(
  description: string,
  company?: string,
  title?: string,
  location?: string,
): JDAnalysis {
  const techs = extractTechnologies(description);
  const skillReqs = extractSkillRequirements(description);
  const responsibilities = extractResponsibilities(description);
  const appReqs = detectApplicationRequirements(description);

  const companyInfo: CompanyInfo = {
    name: company || extractCompanyName(description),
    location: location || extractLocation(description),
    industry: detectIndustry(description),
  };

  const positionInfo: PositionInfo = {
    title: title || extractJobTitle(description),
    level: detectExperienceLevel(description),
    employmentType: detectEmploymentType(description),
    workArrangement: detectWorkArrangement(description),
  };

  const requirements: RequirementsInfo = {
    requiredSkills: skillReqs.required,
    preferredSkills: skillReqs.preferred,
    education: extractEducationRequirements(description),
    experience: extractExperienceRequirement(description),
    certifications: extractCertifications(description),
    programmingLanguages: techs.programmingLanguages,
    tools: techs.tools,
    hardware: techs.hardware,
    protocols: techs.protocols,
    roboticsFrameworks: techs.roboticsFrameworks,
    embeddedTechnologies: techs.embeddedTechnologies,
  };

  return {
    company: companyInfo,
    position: positionInfo,
    requirements,
    responsibilities,
    applicationRequirements: appReqs,
  };
}

// ─── Helper Extractors ──────────────────────────────────────────

function extractCompanyName(text: string): string {
  const match = text.match(/(?:company|about)\s*:\s*(.+)/i);
  return match ? match[1].trim().slice(0, 100) : "Unknown";
}

function extractJobTitle(text: string): string {
  const match = text.match(/(?:position|title|role)\s*:\s*(.+)/i);
  return match ? match[1].trim().slice(0, 100) : "Unknown";
}

function extractLocation(text: string): string {
  const match = text.match(/(?:location)\s*:\s*(.+)/i);
  return match ? match[1].trim().slice(0, 100) : "";
}

function detectIndustry(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(robotics|autonomous|robot)\b/.test(lower)) return "Robotics";
  if (/\b(automotive|self[\s-]?driving|adas)\b/.test(lower)) return "Automotive";
  if (/\b(aerospace|drone|uav|aviation)\b/.test(lower)) return "Aerospace";
  if (/\b(manufacturing|industrial)\b/.test(lower)) return "Manufacturing";
  if (/\b(healthcare|medical|biomedical)\b/.test(lower)) return "Healthcare";
  if (/\b(defense|military)\b/.test(lower)) return "Defense";
  if (/\b(fintech|banking|finance)\b/.test(lower)) return "Finance";
  if (/\b(edtech|education)\b/.test(lower)) return "Education";
  return "Technology";
}

function extractEducationRequirements(text: string): string[] {
  const reqs: string[] = [];
  const lower = text.toLowerCase();

  if (/\b(b\.?tech|bachelor|bsc|b\.?e\.?)\b/i.test(lower)) reqs.push("Bachelor's degree");
  if (/\b(m\.?tech|master|msc|m\.?e\.?|m\.?s\.?)\b/i.test(lower)) reqs.push("Master's degree");
  if (/\b(ph\.?d|doctorate)\b/i.test(lower)) reqs.push("Ph.D.");

  // Extract specific fields
  const fields = text.match(/(?:in|of)\s+([\w\s,]+(?:engineering|science|computer|electrical|electronics|mechanical|ece|cse|eee|it))/gi);
  if (fields) {
    for (const f of fields) {
      reqs.push(f.replace(/^(in|of)\s+/i, "").trim());
    }
  }

  return [...new Set(reqs)];
}

function extractCertifications(text: string): string[] {
  const certs: string[] = [];
  const patterns = [
    /\b(AWS\s+(?:Certified|Solutions|Developer|Cloud)[\w\s]*)/g,
    /\b(ROS\s+(?:Certified|Developer|Navigation)[\w\s]*)/g,
    /\b(PMP|PRINCE2|ITIL|CCNA|CCNP)\b/g,
    /\b(Certified\s+[\w\s]+(?:Engineer|Developer|Architect))\b/g,
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      certs.push(match[1].trim());
    }
  }

  return [...new Set(certs)];
}

/**
 * Extracts all technologies as a flat list (for job listing storage).
 */
export function extractAllTechnologiesFlat(text: string): string[] {
  const techs = extractTechnologies(text);
  return [
    ...techs.programmingLanguages,
    ...techs.roboticsFrameworks,
    ...techs.embeddedTechnologies,
    ...techs.tools,
    ...techs.hardware,
    ...techs.protocols,
  ];
}
