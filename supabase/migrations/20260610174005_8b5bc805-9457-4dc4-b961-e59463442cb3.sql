
-- Companies (tenants)
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Profiles (one per auth user, links to company)
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer helper: get current user's company_id (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT company_id FROM public.profiles WHERE id = auth.uid() $$;

-- Companies policies (after helper)
CREATE POLICY "Members can view their company" ON public.companies
  FOR SELECT TO authenticated USING (id = public.current_company_id());
CREATE POLICY "Owner can update their company" ON public.companies
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- Profiles policies
CREATE POLICY "Users can view profiles in their company" ON public.profiles
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Jobs
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requirements TEXT,
  location TEXT,
  experience_level TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view company jobs" ON public.jobs
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Members can insert company jobs" ON public.jobs
  FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id() AND created_by = auth.uid());
CREATE POLICY "Members can update company jobs" ON public.jobs
  FOR UPDATE TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Members can delete company jobs" ON public.jobs
  FOR DELETE TO authenticated USING (company_id = public.current_company_id());

-- Candidates (one per resume upload, includes AI scoring)
CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_score NUMERIC(3,1),
  ai_summary TEXT,
  ai_recommendation TEXT,
  ai_strengths TEXT[],
  ai_weaknesses TEXT[],
  ai_breakdown JSONB,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view company candidates" ON public.candidates
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Members can insert company candidates" ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id() AND uploaded_by = auth.uid());
CREATE POLICY "Members can update company candidates" ON public.candidates
  FOR UPDATE TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Members can delete company candidates" ON public.candidates
  FOR DELETE TO authenticated USING (company_id = public.current_company_id());

CREATE INDEX idx_jobs_company ON public.jobs(company_id);
CREATE INDEX idx_candidates_job ON public.candidates(job_id);
CREATE INDEX idx_candidates_company ON public.candidates(company_id);

-- Trigger: auto-create company + profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
  derived_name TEXT;
BEGIN
  derived_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  ) || '''s Workspace';

  INSERT INTO public.companies (name, owner_id)
  VALUES (derived_name, NEW.id)
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, email)
  VALUES (
    NEW.id,
    new_company_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
