-- ═══════════════════════════════════════════════════════════════════
-- Job Hunter MCP — Database Schema
-- Supabase / PostgreSQL with Row Level Security
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Candidate Profiles ─────────────────────────────────────────
CREATE TABLE candidate_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  summary TEXT,
  education JSONB NOT NULL DEFAULT '[]',
  experience JSONB NOT NULL DEFAULT '[]',
  internships JSONB NOT NULL DEFAULT '[]',
  projects JSONB NOT NULL DEFAULT '[]',
  technical_skills JSONB NOT NULL DEFAULT '{}',
  certifications JSONB NOT NULL DEFAULT '[]',
  publications JSONB NOT NULL DEFAULT '[]',
  hackathons JSONB NOT NULL DEFAULT '[]',
  achievements JSONB NOT NULL DEFAULT '[]',
  portfolio_url TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  preferred_locations JSONB NOT NULL DEFAULT '[]',
  salary_expectations JSONB,
  notice_period TEXT,
  job_preferences JSONB NOT NULL DEFAULT '{}',
  master_resume_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── Resume Versions ────────────────────────────────────────────
CREATE TABLE resume_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID,
  is_master BOOLEAN NOT NULL DEFAULT FALSE,
  filename TEXT NOT NULL,
  original_format TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  latex_source TEXT,
  latex_source_path TEXT,
  pdf_path TEXT,
  changes_made JSONB NOT NULL DEFAULT '[]',
  keywords_targeted JSONB NOT NULL DEFAULT '[]',
  source_resume_id UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Job Listings ───────────────────────────────────────────────
CREATE TABLE job_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  remote TEXT NOT NULL DEFAULT 'ONSITE',
  salary TEXT,
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency TEXT,
  experience_level TEXT,
  employment_type TEXT,
  job_url TEXT NOT NULL,
  application_url TEXT,
  source TEXT NOT NULL,
  date_posted TIMESTAMPTZ,
  date_discovered TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL DEFAULT '',
  extracted_technologies JSONB NOT NULL DEFAULT '[]',
  application_method TEXT,
  analyzed BOOLEAN NOT NULL DEFAULT FALSE,
  match_score NUMERIC,
  analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate job URLs per user
CREATE UNIQUE INDEX idx_job_listings_user_url ON job_listings(user_id, job_url);
-- Index for faster match queries
CREATE INDEX idx_job_listings_match ON job_listings(user_id, match_score DESC NULLS LAST);
CREATE INDEX idx_job_listings_source ON job_listings(user_id, source);

-- ─── Applications ───────────────────────────────────────────────
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  job_url TEXT NOT NULL,
  application_url TEXT,
  date_found TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_applied TIMESTAMPTZ,
  resume_version_id UUID REFERENCES resume_versions(id),
  cover_letter_version_id UUID,
  status TEXT NOT NULL DEFAULT 'DISCOVERED',
  status_reason TEXT,
  last_checked TIMESTAMPTZ,
  next_action TEXT,
  interview_date DATE,
  interview_time TIME,
  interview_type TEXT,
  interview_meeting_url TEXT,
  recruiter_name TEXT,
  recruiter_email TEXT,
  notes TEXT,
  application_answers JSONB,
  failure_reason TEXT,
  failure_step TEXT,
  audit_log JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate applications per user+job
CREATE UNIQUE INDEX idx_applications_user_job ON applications(user_id, job_id);
CREATE INDEX idx_applications_status ON applications(user_id, status);
CREATE INDEX idx_applications_company ON applications(user_id, company);

-- ─── Cover Letters ──────────────────────────────────────────────
CREATE TABLE cover_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Interviews ─────────────────────────────────────────────────
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  round TEXT,
  type TEXT NOT NULL DEFAULT 'OTHER',
  interview_date DATE,
  interview_time TIME,
  timezone TEXT,
  meeting_url TEXT,
  location TEXT,
  interviewer_name TEXT,
  interviewer_email TEXT,
  instructions TEXT,
  preparation JSONB DEFAULT '[]',
  calendar_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'INVITED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interviews_upcoming ON interviews(user_id, interview_date ASC NULLS LAST);

-- ─── Notifications ──────────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  application_id UUID REFERENCES applications(id),
  job_id UUID REFERENCES job_listings(id),
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON notifications(user_id, read, created_at DESC);

-- ─── Automation Settings ────────────────────────────────────────
CREATE TABLE automation_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  job_discovery BOOLEAN NOT NULL DEFAULT TRUE,
  resume_tailoring BOOLEAN NOT NULL DEFAULT TRUE,
  overleaf_sync BOOLEAN NOT NULL DEFAULT FALSE,
  automatic_applications BOOLEAN NOT NULL DEFAULT FALSE,
  application_monitoring BOOLEAN NOT NULL DEFAULT TRUE,
  interview_detection BOOLEAN NOT NULL DEFAULT TRUE,
  email_monitoring BOOLEAN NOT NULL DEFAULT FALSE,
  calendar_integration BOOLEAN NOT NULL DEFAULT FALSE,
  recruiter_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  notification_preference TEXT NOT NULL DEFAULT 'BOTH',
  follow_up_days_threshold INTEGER NOT NULL DEFAULT 14,
  daily_summary_time TIME DEFAULT '09:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Overleaf Configuration ────────────────────────────────────
CREATE TABLE overleaf_configs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  git_url TEXT NOT NULL,
  main_tex_file TEXT NOT NULL DEFAULT 'main.tex',
  project_cloned BOOLEAN NOT NULL DEFAULT FALSE,
  local_path TEXT NOT NULL DEFAULT '',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Job Queue ──────────────────────────────────────────────────
CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'DISCOVERY',
  priority INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_queue_pending ON job_queue(user_id, stage, priority DESC);

-- ─── Audit Log ──────────────────────────────────────────────────
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id),
  job_id UUID REFERENCES job_listings(id),
  action TEXT NOT NULL,
  details TEXT,
  status TEXT,
  automated BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE overleaf_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
-- candidate_profiles
CREATE POLICY "Users can view own profile"
  ON candidate_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON candidate_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON candidate_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own profile"
  ON candidate_profiles FOR DELETE USING (auth.uid() = user_id);

-- resume_versions
CREATE POLICY "Users can view own resumes"
  ON resume_versions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own resumes"
  ON resume_versions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own resumes"
  ON resume_versions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own resumes"
  ON resume_versions FOR DELETE USING (auth.uid() = user_id);

-- job_listings
CREATE POLICY "Users can view own jobs"
  ON job_listings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs"
  ON job_listings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs"
  ON job_listings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own jobs"
  ON job_listings FOR DELETE USING (auth.uid() = user_id);

-- applications
CREATE POLICY "Users can view own applications"
  ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own applications"
  ON applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own applications"
  ON applications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own applications"
  ON applications FOR DELETE USING (auth.uid() = user_id);

-- cover_letters
CREATE POLICY "Users can view own cover letters"
  ON cover_letters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cover letters"
  ON cover_letters FOR INSERT WITH CHECK (auth.uid() = user_id);

-- interviews
CREATE POLICY "Users can view own interviews"
  ON interviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interviews"
  ON interviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own interviews"
  ON interviews FOR UPDATE USING (auth.uid() = user_id);

-- notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- automation_settings
CREATE POLICY "Users can view own settings"
  ON automation_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings"
  ON automation_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings"
  ON automation_settings FOR UPDATE USING (auth.uid() = user_id);

-- overleaf_configs
CREATE POLICY "Users can view own overleaf config"
  ON overleaf_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own overleaf config"
  ON overleaf_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own overleaf config"
  ON overleaf_configs FOR UPDATE USING (auth.uid() = user_id);

-- job_queue
CREATE POLICY "Users can view own queue"
  ON job_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own queue"
  ON job_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own queue"
  ON job_queue FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own queue"
  ON job_queue FOR DELETE USING (auth.uid() = user_id);

-- audit_log
CREATE POLICY "Users can view own audit log"
  ON audit_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audit log"
  ON audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════

-- Create private storage bucket for resumes and documents
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', FALSE);
INSERT INTO storage.buckets (id, name, public) VALUES ('cover-letters', 'cover-letters', FALSE);
INSERT INTO storage.buckets (id, name, public) VALUES ('applications', 'applications', FALSE);

-- Storage RLS: users can only access their own files
CREATE POLICY "Users can upload own resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own resumes"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own cover letters"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cover-letters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own cover letters"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cover-letters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ═══════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_candidate_profiles_updated
  BEFORE UPDATE ON candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_job_listings_updated
  BEFORE UPDATE ON job_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_applications_updated
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_interviews_updated
  BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_automation_settings_updated
  BEFORE UPDATE ON automation_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_overleaf_configs_updated
  BEFORE UPDATE ON overleaf_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_job_queue_updated
  BEFORE UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
