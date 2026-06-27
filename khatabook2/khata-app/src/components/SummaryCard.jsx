function SummaryCard({ youGive = 0, youGet = 0 }) {
  const net = youGet - youGive;
  const isPositive = net > 0;
  const isNegative = net < 0;
  const absNet = Math.abs(net);
  const formatted = new Intl.NumberFormat("en-IN").format(absNet);

  return (
    <div
      className="rounded-2xl px-4 py-3 relative overflow-hidden flex items-center justify-between"
      style={{
        background: "#ebf6f5",
        border: "1px solid #c8e9e7",
      }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#636e72" }}>
        NET BALANCE
      </p>
      <div className="text-right">
        <p
          className="text-lg font-black"
          style={{ color: isPositive ? "#e76f51" : isNegative ? "#52b788" : "#636e72" }}
        >
          ₹{formatted}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#636e72" }}>
          {isPositive ? 'YOU WILL GET' : isNegative ? 'YOU WILL GIVE' : 'SETTLED'}
        </p>
      </div>
    </div>
  );
}

export default SummaryCard;
