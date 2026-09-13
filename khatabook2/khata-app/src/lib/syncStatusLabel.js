export function syncStatusLabel({ online, status }) {
  if (!online) return "Offline";
  if (status === "pending") return "Online · ⟳ Syncing...";
  return "Online · ✓ Synced";
}