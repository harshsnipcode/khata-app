function SummaryCard({ youGive = 0, youGet = 0 }) {
  const formattedGive = new Intl.NumberFormat("en-IN").format(youGive);
  const formattedGet = new Intl.NumberFormat("en-IN").format(youGet);

  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: "#ebf6f5",
        border: "1px solid #c8e9e7",
      }}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        {/* You Will Give */}
        <div className="text-center">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "#636e72" }}
          >
            You Will Give
          </p>
          <p
            className="text-3xl font-black"
            style={{ color: "#52b788" }}
          >
            ₹{formattedGive}
          </p>
        </div>

        {/* Divider */}
        <div
          className="h-12 w-px"
          style={{ background: "#c8e9e7" }}
        />

        {/* You Will Get */}
        <div className="text-center">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "#636e72" }}
          >
            You Will Get
          </p>
          <p
            className="text-3xl font-black"
            style={{ color: "#e76f51" }}
          >
            ₹{formattedGet}
          </p>
        </div>
      </div>
    </div>
  );
}

export default SummaryCard;
