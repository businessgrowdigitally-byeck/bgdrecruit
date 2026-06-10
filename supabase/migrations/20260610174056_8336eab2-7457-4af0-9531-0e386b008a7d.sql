
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage policies for the 'resumes' bucket (path layout: <company_id>/<job_id>/<file>)
CREATE POLICY "Company members can read resumes"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.current_company_id()::text);

CREATE POLICY "Company members can upload resumes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.current_company_id()::text);

CREATE POLICY "Company members can delete resumes"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.current_company_id()::text);
