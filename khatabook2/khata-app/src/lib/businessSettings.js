import { supabase } from "./supabase";
import offlineSupabase from "./offline/offlineSupabase";

const BUCKET_NAME = "company-logos";
const LOGO_PATH = "company_logo";
const SETTINGS_TABLE = "business_settings";
const SETTINGS_ID = 1;

export async function getBusinessSettings() {
  const { data, error } = await offlineSupabase
    .from(SETTINGS_TABLE)
    .select("settings")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  if (error || !data) return {};
  return data.settings || {};
}

export async function getLogoUrl() {
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(LOGO_PATH);
  return publicUrl;
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET_NAME)) return;
  await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  });
}

export async function uploadLogo(file) {
  await ensureBucket();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(LOGO_PATH, file, { upsert: true, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(LOGO_PATH);

  const { error: upsertError } = await supabase
    .from(SETTINGS_TABLE)
    .upsert({ id: SETTINGS_ID, settings: { logo_uploaded: true } }, { onConflict: "id" });

  if (upsertError) throw upsertError;

  return publicUrl;
}
