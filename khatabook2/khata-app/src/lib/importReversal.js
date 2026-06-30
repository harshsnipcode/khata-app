import { supabase } from "./supabase";

export function getImportActor() {
  return localStorage.getItem("khata_user") || "admin";
}

export async function deleteImportBatch(importId, actor = getImportActor()) {
  const { data, error } = await supabase.rpc("delete_import_batch", {
    p_import_history_id: importId,
    p_actor: actor,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function restoreImportBatch(importId, actor = getImportActor()) {
  const { data, error } = await supabase.rpc("restore_import_batch", {
    p_import_history_id: importId,
    p_actor: actor,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function permanentlyDeleteImportBatch(importId) {
  const { error } = await supabase.rpc("permanently_delete_import_batch", {
    p_import_history_id: importId,
  });
  if (error) throw error;
}
