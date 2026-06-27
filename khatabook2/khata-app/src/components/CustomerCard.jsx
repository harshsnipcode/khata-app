import { useNavigate } from "react-router-dom";

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const days = Math.floor(diffMs / 86400000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return "just now";
}

function CustomerCard({ id, initial, name, time, balance }) {
  const navigate = useNavigate();

  const hasBalance = balance !== undefined && balance !== null;
  const absBalance = hasBalance ? Math.abs(balance) : 0;
  const formatted = new Intl.NumberFormat("en-IN").format(absBalance);

  let amountColor = "#636e72";
  let labelColor = "#b2bec3";
  let badgeBg = "#f8f9fa";
  let badgeBorder = "#e9ecef";
  let label = "";

  if (hasBalance) {
    if (balance > 0) {
      amountColor = "#e76f51";
      labelColor = "#e76f51";
      badgeBg = "#fde8e2";
      badgeBorder = "#f9c4b5";
      label = "You Get";
    } else if (balance < 0) {
      amountColor = "#52b788";
      labelColor = "#52b788";
      badgeBg = "#d8f3e3";
      badgeBorder = "#b7e4c7";
      label = "You Give";
    } else {
      label = "Settled";
      amountColor = "#636e72";
      badgeBg = "#f1f3f5";
      badgeBorder = "#dee2e6";
    }
  }

  return (
    <div
      onClick={() => id && navigate(`/customer/${id}`)}
      role="button"
      className="rounded-xl px-3.5 py-2.5 flex items-center gap-3 cursor-pointer relative group transition-all duration-200"
      style={{
        background: "#fff",
        border: "1px solid #e9ecef",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
        e.currentTarget.style.borderColor = "#dee2e6";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "#e9ecef";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 select-none transition-all duration-200"
        style={{
          background: "#ebf6f5",
          color: "#5cbdb9",
          fontSize: "13px",
        }}
      >
        {initial || "?"}
      </div>

      {/* Name + time */}
      <div className="flex-1 min-w-0">
        <h3
          className="font-semibold text-sm truncate"
          style={{ color: "#2d3436" }}
        >
          {name}
        </h3>
        <p className="text-[10px] font-medium" style={{ color: "#b2bec3" }}>
          {timeAgo(time)}
        </p>
      </div>

      {/* Balance Badge */}
      {hasBalance && (
        <div
          className="px-2.5 py-1.5 rounded-lg text-right shrink-0 transition-all duration-200"
          style={{
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
          }}
        >
          <p
            className="font-bold text-xs tracking-wide"
            style={{ color: amountColor }}
          >
            ₹{formatted}
          </p>
          <p
            className="text-[8px] uppercase font-semibold tracking-widest"
            style={{ color: labelColor }}
          >
            {label}
          </p>
        </div>
      )}
    </div>
  );
}

export default CustomerCard;
