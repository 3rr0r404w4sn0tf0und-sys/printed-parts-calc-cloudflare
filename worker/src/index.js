import { Hono } from "hono";
import { cors } from "hono/cors";
import uploadRoutes from "./routes/upload.js";
import priceRoutes from "./routes/price.js";
import calcRoutes from "./routes/calc.js";

const app = new Hono().basePath("/api");

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// Temporary diagnostic -- confirms which env keys the LIVE worker actually
// sees at request time, without exposing values. Remove once RENDER_PARSE_URL
// / INTERNAL_PARSE_SECRET wiring is confirmed working.
app.get("/debug-env", (c) =>
  c.json({
    has_RENDER_PARSE_URL: Boolean(c.env.RENDER_PARSE_URL),
    has_INTERNAL_PARSE_SECRET: Boolean(c.env.INTERNAL_PARSE_SECRET),
    has_GITHUB_REPO: Boolean(c.env.GITHUB_REPO),
    has_GEOMETRY_KV: Boolean(c.env.GEOMETRY_KV),
    render_parse_url_value: c.env.RENDER_PARSE_URL || null,
  })
);

app.route("/", uploadRoutes);
app.route("/", priceRoutes);
app.route("/", calcRoutes);

export default app;
