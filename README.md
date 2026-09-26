# Job Hunter MCP

**Autonomous Job Application & Career Automation MCP App**

An MCP (Model Context Protocol) server that acts as an autonomous personal job-search and application agent. Upload your resume once, configure your preferences, and let the system discover relevant jobs, tailor your resume, and manage your applications.

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Supabase credentials, API keys, etc.

# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Start the MCP server
npm start

# Or run in development mode
npm run dev

# Inspect with MCP Inspector
npm run inspect
```

## Architecture

```
src/
├── index.ts                    # MCP Server entry point (stdio transport)
├── server.ts                   # McpServer with 22 registered tools
├── db/
│   ├── client.ts               # Supabase client (service role, user-scoped)
│   └── schema.sql              # Full schema + RLS policies
├── engine/
│   ├── job-discovery.ts        # Multi-source job search (Adzuna, Reed, etc.)
│   ├── jd-parser.ts            # JD analysis & technology extraction
│   ├── match-engine.ts         # Profile ↔ JD matching with scoring
│   ├── resume-tailor-engine.ts # Resume optimization (NO fabrication)
│   ├── application-engine.ts   # Application lifecycle management
│   ├── status-monitor.ts       # Interview/shortlist/rejection detection
│   ├── email-monitor.ts        # Email classification
│   ├── notification-engine.ts  # Notifications & daily summaries
│   └── queue.ts                # Job processing pipeline
├── integrations/
│   ├── overleaf-git.ts         # Overleaf Git sync (official method)
│   ├── latex-compiler.ts       # Local TeX Live/MiKTeX compilation
│   └── calendar.ts             # Google Calendar event creation
├── storage/
│   └── resume-storage.ts       # Secure file storage
├── types/
│   └── index.ts                # All TypeScript type definitions
└── utils/
    ├── fabrication-guard.ts    # MANDATORY no-fabrication policy
    ├── duplicate-checker.ts    # Duplicate application prevention
    └── audit-logger.ts         # Complete action audit trail

views/                          # MCP App Views (sandboxed HTML)
├── dashboard.html              # Main dashboard
├── job-search.html             # Job discovery & filters
├── job-detail.html             # JD analysis & match
├── resume-tailoring.html       # Tailoring report & compilation
├── application-review.html     # Pre-submission review
├── application-tracker.html    # All applications tracker
├── interview.html              # Interview schedule
├── notifications.html          # Event notifications
└── assets/styles.css           # Premium dark theme design system
```

## MCP Tools (22)

| Tool | Description |
|------|-------------|
| `candidate-profile` | View or update candidate information |
| `upload-resume` | Upload master resume (PDF/DOCX/TXT/MD/LaTeX) |
| `parse-resume` | Extract structured profile from resume |
| `search-jobs` | Search across configured job sources |
| `analyze-job` | Parse JD requirements & technologies |
| `match-job` | Generate explainable match analysis |
| `tailor-resume` | Create JD-specific resume (no fabrication) |
| `update-overleaf-resume` | Sync LaTeX to Overleaf via Git |
| `compile-resume` | Compile LaTeX to PDF locally |
| `generate-cover-letter` | Create truthful cover letter |
| `prepare-application` | Prepare app with quality checks |
| `apply-to-job` | Submit with human approval flow |
| `list-applications` | List all tracked applications |
| `get-application` | Detailed app info + audit trail |
| `monitor-applications` | Check for status updates |
| `detect-interviews` | Detect from email/message text |
| `get-upcoming-interviews` | Chronological interview schedule |
| `update-application-status` | Manual status update |
| `generate-follow-up` | Generate recruiter follow-up |
| `job-search-settings` | Configure preferences & automation |

## MCP App Views (8)

- **Dashboard** — Overview stats, pipeline, interviews, notifications
- **Job Search** — Filters, results with match scores
- **Job Detail** — JD analysis, match breakdown, requirements
- **Resume Tailoring** — Change report, keyword targeting, compilation
- **Application Review** — Pre-submission review with Approve/Edit/Skip
- **Application Tracker** — Status-filtered application table
- **Interview** — Schedule with meeting links and prep notes
- **Notifications** — Categorized alerts and updates

## Database Schema

11 tables with full Row Level Security:

- `candidate_profiles` — Source of truth for candidate info
- `resume_versions` — Immutable resume version history
- `job_listings` — Discovered jobs with analysis
- `applications` — Application lifecycle with audit logs
- `cover_letters` — Generated cover letters
- `interviews` — Detected/scheduled interviews
- `notifications` — Event notifications
- `automation_settings` — Per-feature automation toggles
- `overleaf_configs` — Overleaf Git project configuration
- `job_queue` — Processing pipeline state
- `audit_log` — Complete action history

## External Integrations

| Integration | Method | Status |
|-------------|--------|--------|
| **Adzuna** | Official API | ✅ Supported |
| **Reed** | Official API | ✅ Supported |
| **The Muse** | Official API | ✅ Supported |
| **Arbeitnow** | Official API | ✅ Supported |
| **Remotive** | Official API | ✅ Supported |
| **Overleaf** | Git integration | ✅ Premium feature |
| **LaTeX** | Local TeX Live/MiKTeX | ✅ Local compilation |
| **Google Calendar** | OAuth API | ✅ Supported |
| **Gmail** | OAuth API | 🔧 Configurable |
| **LinkedIn** | No public API | ⚠ Manual only |
| **Indeed** | Restricted API | ⚠ Via Adzuna |
| **Naukri** | No public API | ⚠ Manual URL add |
| **Wellfound** | No public API | ⚠ Manual URL add |
| **Internshala** | No public API | ⚠ Manual URL add |

## Environment Variables

```bash
# Required
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
DEFAULT_USER_ID=         # For local development

# Job Search APIs (optional, per-source)
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
REED_API_KEY=
THE_MUSE_API_KEY=

# Overleaf (optional)
OVERLEAF_GIT_URL=
OVERLEAF_GIT_TOKEN=

# LaTeX (optional)
LATEX_BIN_PATH=

# Calendar (optional)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
```

## Automation Workflow

```
User uploads master resume
        ↓
Candidate profile created
        ↓
User configures preferences
        ↓
Job discovery (Adzuna, Reed, Muse, etc.)
        ↓
JD analysis (technology extraction)
        ↓
Match evaluation (weighted scoring)
        ↓
Resume tailoring (reorder + emphasize, NO fabrication)
        ↓
Overleaf updated via Git / Local PDF compiled
        ↓
Application prepared (quality checks)
        ↓
Human approval (Mode B) or auto-submit (Mode A)
        ↓
Application tracked
        ↓
Status monitored (email/portal)
        ↓
Interview/shortlist/rejection detected
        ↓
User notified
```

## Known Limitations

1. **LinkedIn, Naukri, Indeed, Wellfound, Internshala** — No public APIs for job search or application submission. Jobs from these platforms must be added manually or discovered through aggregators.

2. **Application Submission** — Most job platforms use CAPTCHA, MFA, or identity verification that cannot be bypassed. The system prepares everything and performs a manual handoff for final submission.

3. **Overleaf Compilation** — Overleaf has no public compile API. Compilation is done locally via TeX Live/MiKTeX, or the user opens Overleaf to compile after Git push.

4. **Email Monitoring** — Requires OAuth setup with Gmail/Outlook. The system does not store email credentials.

5. **Calendar Integration** — Only creates events when explicitly authorized. Duplicate event detection prevents double-booking.

## Security

- Row Level Security on all tables
- User identity derived from authenticated context, never from client
- Master resume is immutable
- No secrets exposed to MCP App Views
- No CAPTCHA/MFA bypass
- Conservative on uncertain submissions (SUBMISSION_UNCERTAIN status)
- Fabrication guard prevents all invented claims

## License

MIT
