// Lightweight session cache so a reload mid-session doesn't lose the
// uploaded part, materials, or settings. Intentionally sessionStorage
// (not localStorage) -- this is meant to be temporary, cleared when the
// tab closes, not a persistent save (that's the planned Neon integration).

const PREFIX = "ppc:";

export function saveSession(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable -- fail silently, it's just a convenience cache
  }
}

export function loadSession(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function clearSession(key) {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
