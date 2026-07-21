// Thin fetch wrapper around the backend REST API.
// Base URL comes from VITE_API_URL (see .env.example); falls back to local dev default.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const TOKEN_KEY = "cfs_token";
const USER_KEY = "cfs_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
}
export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const err = new Error("Could not reach the backend API. Is it running on " + BASE + "?");
    err.status = 0;
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request("/health", { auth: false }),

  signup: (payload) => request("/auth/signup", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me"),

  analyze: (text) => request("/ai/analyze", { method: "POST", body: { text } }),

  createReport: (payload) => request("/reports", { method: "POST", body: payload }),
  listReports: (query = "") => request(`/reports${query ? `?${query}` : ""}`),
  getReport: (id) => request(`/reports/${id}`),

  graphOverview: (limit = 60) => request(`/graph/overview?limit=${limit}`),
  graphSearch: (q) => request(`/graph/search?q=${encodeURIComponent(q)}`),
  graphEntity: (id) => request(`/graph/entity/${id}`),
  graphCluster: (id, depth = 2) => request(`/graph/cluster/${id}?depth=${depth}`),

  analyticsSummary: () => request("/analytics/summary"),
  analyticsByCategory: (months = 6) => request(`/analytics/by-category?months=${months}`),
  analyticsHotspots: () => request("/analytics/hotspots"),
  analyticsGeopoints: () => request("/analytics/geopoints"),
};
