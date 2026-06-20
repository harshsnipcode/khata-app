const STORAGE_KEY = "reminder_message_template";

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

export function saveTemplate(template) {
  try {
    localStorage.setItem(STORAGE_KEY, template);
  } catch (e) {
    console.error("Failed to save reminder template:", e);
  }
}

export function resetTemplate() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to reset reminder template:", e);
  }
}

export function fillTemplate(template, vars) {
  if (!template) template = DEFAULT_TEMPLATE;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}
