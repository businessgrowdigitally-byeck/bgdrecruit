-- Drop the existing unsafe profile update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Recreate the profile update policy with the WITH CHECK constraint to prevent company_id changes
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND company_id = public.current_company_id());

-- Add UPDATE policy for resumes storage bucket
CREATE POLICY "Company members can update resumes"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.current_company_id()::text);
