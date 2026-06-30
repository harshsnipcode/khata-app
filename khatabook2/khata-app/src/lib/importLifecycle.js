export function getImportLifecycle(status) {
  if (status === "deleted") return { label: "Deleted", tone: "deleted" };
  if (status === "restored") return { label: "Restored", tone: "restored" };
  if (status === "failed") return { label: "Failed", tone: "failed" };
  if (status === "processing") return { label: "Processing", tone: "processing" };
  return { label: "Imported", tone: "imported" };
}

