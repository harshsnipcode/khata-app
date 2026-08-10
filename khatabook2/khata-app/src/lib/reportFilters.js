function getLocalDateKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultCustomerTransactionsFilters(today = new Date()) {
  const date = getLocalDateKey(today);
  return {
    searchTerm: "",
    startDate: "",
    endDate: "",
    durationFilter: "single_day",
    singleDay: date,
    paymentFilter: null,
  };
}

function getSavedReportFilters(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveReportFilters(key, filters) {
  try {
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // storage unavailable or full - filters just won't persist this time
  }
}

export { getSavedReportFilters, saveReportFilters, createDefaultCustomerTransactionsFilters };
