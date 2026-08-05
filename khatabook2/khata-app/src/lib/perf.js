const PERF_FLAG = "khata_perf";
const MAX_EVENTS = 500;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function isPerfEnabled() {
  if (!isBrowser()) return false;
  return localStorage.getItem(PERF_FLAG) === "1";
}

export function enablePerfLogging() {
  if (!isBrowser()) return;
  localStorage.setItem(PERF_FLAG, "1");
}

export function disablePerfLogging() {
  if (!isBrowser()) return;
  localStorage.removeItem(PERF_FLAG);
}

function getPerfState() {
  if (!isBrowser()) return null;
  window.__khataPerf ||= { events: [], currentRoute: window.location.pathname };
  return window.__khataPerf;
}

export function recordRouteChange(pathname) {
  const state = getPerfState();
  if (!state) return;
  state.currentRoute = pathname;
  if (!isPerfEnabled()) return;
  const event = {
    type: "route",
    route: pathname,
    at: new Date().toISOString(),
    timestamp: performance.now(),
  };
  state.events.push(event);
  state.events = state.events.slice(-MAX_EVENTS);
  console.info("[khata-perf] route", pathname);
}

export function recordQueryTiming(event) {
  const state = getPerfState();
  if (!state) return;
  const entry = {
    type: "query",
    route: state.currentRoute || window.location.pathname,
    at: new Date().toISOString(),
    ...event,
  };
  state.events.push(entry);
  state.events = state.events.slice(-MAX_EVENTS);

  if (!isPerfEnabled()) return;
  const status = entry.error ? "error" : "ok";
  console.info(
    `[khata-perf] ${entry.source} ${entry.method} ${entry.table} ${status} ${Math.round(entry.durationMs)}ms`,
    entry,
  );
}

export function getPerfEvents() {
  return getPerfState()?.events || [];
}
