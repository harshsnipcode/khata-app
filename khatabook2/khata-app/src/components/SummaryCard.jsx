function SummaryCard({ youGive = 0, youGet = 0 }) {
  const fmt = (v) => new Intl.NumberFormat("en-IN").format(v);

  return (
    <div
      className="rounded-2xl px-4 py-3 relative overflow-hidden flex items-stretch"
      style={{
        background: "#ebf6f5",
        border: "1px solid #c8e9e7",
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#636e72" }}>
          YOU WILL GIVE
        </p>
        <p className="text-lg font-black" style={{ color: "#e76f51" }}>
          ₹{fmt(youGive)}
        </p>
      </div>

      <div className="w-px self-stretch mx-2" style={{ background: "#c8e9e7" }} />

      <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#636e72" }}>
          YOU WILL GET
        </p>
        <p className="text-lg font-black" style={{ color: "#52b788" }}>
          ₹{fmt(youGet)}
        </p>
      </div>
    </div>
  );
}

export default SummaryCard;
