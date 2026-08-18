// Frontend and API now live on the same Worker/domain (no separate
// Pages project), so this is empty by default -- fetch(`${API_BASE}/api/...`)
// becomes a same-origin relative call. Only set NEXT_PUBLIC_API_BASE if
// you're running the frontend somewhere separate from the Worker again
// (e.g. local dev against `wrangler dev` on a different port).
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
