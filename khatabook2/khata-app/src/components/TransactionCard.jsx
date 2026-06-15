function TransactionCard({ date, type, amount, balance }) {
  const isGot = type === "got";
  const label = isGot ? "Got" : "Gave";
  const badgeBg = isGot ? "#d8f3e3" : "#fde8e2";
  const badgeColor = isGot ? "#52b788" : "#e76f51";
  const amountColor = isGot ? "#52b788" : "#e76f51";

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "#fff",
        border: "1px solid #e9ecef",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm" style={{ color: "#636e72" }}>{date}</span>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: badgeBg, color: badgeColor }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xl font-bold" style={{ color: amountColor }}>
            ₹{new Intl.NumberFormat("en-IN").format(amount)}
          </p>
          <p className="text-sm mt-0.5" style={{ color: "#b2bec3" }}>
            {label} amount
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium" style={{ color: "#636e72" }}>Balance</p>
          <p className="font-semibold" style={{ color: "#2d3436" }}>
            ₹{new Intl.NumberFormat("en-IN").format(balance)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default TransactionCard;
