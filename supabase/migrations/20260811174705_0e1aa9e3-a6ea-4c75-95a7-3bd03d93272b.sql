-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Add organization_id to existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lead_activities ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.work_sessions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.amocrm_calls ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.amocrm_connection ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.integration_settings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.business_profile ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Call recording analysis + manual uploads
ALTER TABLE public.amocrm_calls
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'amocrm',
  ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.amocrm_calls ALTER COLUMN amocrm_note_id DROP NOT NULL;

-- integration_settings gets a surrogate key, unique per company+key
ALTER TABLE public.integration_settings ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- Backfill everything into one default organization
DO $$
DECLARE org_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations ORDER BY created_at LIMIT 1;
  IF org_id IS NULL THEN
    INSERT INTO public.organizations (name) VALUES ('SalesOS Elite') RETURNING id INTO org_id;
  END IF;
  UPDATE public.profiles SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.leads SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.deals SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.contacts SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.companies SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.tasks SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.task_comments SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.pipeline_stages SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.lead_activities SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.call_logs SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.work_sessions SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.notifications SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.audit_logs SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.error_logs SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.amocrm_calls SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.amocrm_connection SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.integration_settings SET organization_id = org_id WHERE organization_id IS NULL;
  UPDATE public.business_profile SET organization_id = org_id WHERE organization_id IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS integration_settings_org_key_idx ON public.integration_settings (organization_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS business_profile_org_idx ON public.business_profile (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS amocrm_connection_org_idx ON public.amocrm_connection (organization_id);

-- Helper: the caller's organization, usable inside RLS without recursion
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_owner')
$$;

drop policy if exists "Members can view their organization" on public.organizations;
CREATE POLICY "Members can view their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id() OR public.is_platform_owner());
drop policy if exists "Platform owners manage organizations" on public.organizations;
CREATE POLICY "Platform owners manage organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- AI agents
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  model text,
  system_prompt text,
  channels text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
drop policy if exists "Company members manage AI agents" on public.ai_agents;
CREATE POLICY "Company members manage AI agents"
  ON public.ai_agents FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- Auto responders
CREATE TABLE IF NOT EXISTS public.auto_responders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  question text NOT NULL DEFAULT '',
  target_field text,
  channels text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_responders TO authenticated;
GRANT ALL ON public.auto_responders TO service_role;
ALTER TABLE public.auto_responders ENABLE ROW LEVEL SECURITY;
drop policy if exists "Company members manage auto responders" on public.auto_responders;
CREATE POLICY "Company members manage auto responders"
  ON public.auto_responders FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_assigned boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
drop policy if exists "Signed-in users can read notification preferences" on public.notification_preferences;
CREATE POLICY "Signed-in users can read notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated USING (true);
drop policy if exists "Users manage their own notification preferences" on public.notification_preferences;
CREATE POLICY "Users manage their own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
