import { useEffect, useRef } from "react";

function DeleteCustomerModal({ customerName, onCancel, onConfirm }) {
  const cancelRef = useRef(null);

  /* Focus trap: close on Escape */
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    /* Backdrop with premium blur */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-[#2d3436]/40 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      {/* Modal Card */}
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xl overflow-hidden animate-scale-in relative z-10">
        {/* Warning icon area */}
        <div className="flex justify-center pt-8 pb-3 relative z-10">
          <div className="w-16 h-16 rounded-full bg-[var(--danger-light)] border border-[var(--danger)]/20 flex items-center justify-center shadow-sm">
            <svg
              className="w-8 h-8 text-[var(--danger)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-2 pb-6 text-center space-y-3 relative z-10">
          <h2 className="text-[var(--text-primary)] text-xl font-bold tracking-tight">Delete Customer?</h2>
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
            This will permanently delete{" "}
            <span className="text-[var(--text-primary)] font-extrabold">{customerName}</span> and
            all associated transaction details.
          </p>

          {/* Bullet list */}
          <ul className="mt-4 text-left space-y-2.5 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--background)] rounded-2xl px-5 py-4 border border-[var(--border)]">
            <li className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[var(--danger)] shrink-0" />
              <span>Customer record & details</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[var(--danger)] shrink-0" />
              <span>Complete transaction ledger history</span>
            </li>
          </ul>

          <p className="text-[var(--danger)] text-xs font-bold pt-2 uppercase tracking-wider">
            This action cannot be undone.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 border-t border-[var(--border)] bg-[var(--background)]">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="py-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-sm hover:bg-[var(--border)]/45 transition cursor-pointer border-r border-[var(--border)] outline-none"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="py-4 text-[var(--danger)] hover:text-[var(--danger)]/80 font-extrabold text-sm hover:bg-[var(--secondary)]/60 transition cursor-pointer outline-none"
          >
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteCustomerModal;

