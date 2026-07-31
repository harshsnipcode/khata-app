import { offlineSupabase } from "./offline/offlineSupabase";

const STORAGE_KEY = "reminder_message_template";
const SETTINGS_ID = 1;
const SETTING_FIELD = "reminder_message_text";

export const DEFAULT_TEMPLATE = `Ledger Update - {{customerName}}:
Balance \u20b9{{balance}}
({{balanceType}})

View full ledger:
{{ledgerLink}}`;

export function getSavedTemplate() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export async function loadSavedTemplate() {
  try {
    const { data } = await offlineSupabase
      .from("business_settings")
      .select("settings")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    const text = data?.settings?.[SETTING_FIELD];
    if (text) {
      try {
        localStorage.setItem(STORAGE_KEY, text);
      } catch {}
      return text;
    }
  } catch {}
  return getSavedTemplate();
}

export async function saveTemplate(template) {
  try {
    localStorage.setItem(STORAGE_KEY, template);
  } catch {}
  try {
    const { data: current } = await offlineSupabase
      .from("business_settings")
      .select("settings")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    const settings = { ...(current?.settings || {}), [SETTING_FIELD]: template };
    if (current) {
      await offlineSupabase
        .from("business_settings")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("id", SETTINGS_ID);
    } else {
      await offlineSupabase
        .from("business_settings")
        .insert({ id: SETTINGS_ID, settings });
    }
  } catch (e) {
    console.error("Failed to save reminder template:", e);
  }
}

export async function resetTemplate() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  try {
    const { data: current } = await offlineSupabase
      .from("business_settings")
      .select("settings")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    if (current) {
      const settings = { ...(current.settings || {}) };
      delete settings[SETTING_FIELD];
      await offlineSupabase
        .from("business_settings")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("id", SETTINGS_ID);
    }
  } catch (e) {
    console.error("Failed to reset reminder template:", e);
  }
}

export function fillTemplate(template, vars) {
  if (!template) template = DEFAULT_TEMPLATE;
  const date = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const allVars = { date, ...vars };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = allVars[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}
