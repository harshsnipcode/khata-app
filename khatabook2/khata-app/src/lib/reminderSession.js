export const REIMINDER_SESSION_STORAGE_KEY = "khata_bulk_reminder_session_v1";

function getSessionStorage() {
  if (typeof globalThis !== "undefined" && globalThis.sessionStorage) return globalThis.sessionStorage;
  return null;
}

export function getReminderSessionSnapshot() {
  const storage = getSessionStorage();
  if (!storage) return null;

  const raw = storage.getItem(REIMINDER_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const selectedIds = Array.isArray(parsed.selectedIds)
      ? parsed.selectedIds.filter((id) => id !== null && id !== undefined)
      : [];

    const sessionQueue = Array.isArray(parsed.sessionQueue)
      ? parsed.sessionQueue.filter((id) => id !== null && id !== undefined)
      : [];

    return {
      storageKey: REIMINDER_SESSION_STORAGE_KEY,
      active: Boolean(parsed.active || parsed.sessionActive || false),
      selectedIds,
      sessionQueue,
      sessionIndex: Number.isInteger(parsed.sessionIndex) ? parsed.sessionIndex : 0,
      sessionDone: Boolean(parsed.sessionDone || false),
      startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : Date.now(),
    };
  } catch (error) {
    console.warn("Reminder session restore failed", error);
    return null;
  }
}

export function saveReminderSessionSnapshot(snapshot) {
  const storage = getSessionStorage();
  if (!storage) return;

  const normalized = {
    storageKey: REIMINDER_SESSION_STORAGE_KEY,
    active: Boolean(snapshot?.active ?? false),
    selectedIds: Array.isArray(snapshot?.selectedIds)
      ? snapshot.selectedIds
      : [],
    sessionQueue: Array.isArray(snapshot?.sessionQueue)
      ? snapshot.sessionQueue
      : [],
    sessionIndex: Number.isInteger(snapshot?.sessionIndex) ? snapshot.sessionIndex : 0,
    sessionDone: Boolean(snapshot?.sessionDone ?? false),
    startedAt: Number.isFinite(snapshot?.startedAt) ? snapshot.startedAt : Date.now(),
  };

  storage.setItem(REIMINDER_SESSION_STORAGE_KEY, JSON.stringify(normalized));
}

export function clearReminderSessionSnapshot() {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(REIMINDER_SESSION_STORAGE_KEY);
}
