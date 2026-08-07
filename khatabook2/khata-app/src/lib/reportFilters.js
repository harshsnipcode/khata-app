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

export { getSavedReportFilters, saveReportFilters };
