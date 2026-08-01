function ActivityDivider({ label = "Older Activity" }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-[2px] bg-black" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] shrink-0">
        {label}
      </span>
      <div className="flex-1 h-[2px] bg-black" />
    </div>
  );
}

export default ActivityDivider;
