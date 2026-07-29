-- Create a public storage bucket for company logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-logos', 'company-logos', true, 5242880, ARRAY['image/png'::text, 'image/jpeg'::text, 'image/gif'::text, 'image/webp'::text])
ON CONFLICT (id) DO NOTHING;

-- Allow public (unauthenticated) read access to logo files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Access' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Public Read Access" ON storage.objects
      FOR SELECT USING (bucket_id = 'company-logos');
  END IF;
END $$;

-- Allow authenticated/anonymous uploads (consistent with existing app auth model)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Logo Upload Access' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Logo Upload Access" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'company-logos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Logo Update Access' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Logo Update Access" ON storage.objects
      FOR UPDATE USING (bucket_id = 'company-logos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Logo Delete Access' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Logo Delete Access" ON storage.objects
      FOR DELETE USING (bucket_id = 'company-logos');
  END IF;
END $$;
