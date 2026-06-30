import { getImportLifecycle } from "../lib/importLifecycle";

const TONES = {
  imported: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  restored: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  deleted: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  failed: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  processing: "bg-amber-500/10 text-amber-700 border-amber-500/20",
};

function ImportStatusBadge({ status }) {
  const lifecycle = getImportLifecycle(status);
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wide ${TONES[lifecycle.tone]}`}>
      {lifecycle.label}
    </span>
  );
}

export default ImportStatusBadge;
