# occt parse service

Tiny Express service with one job: parse STEP/IGES files via `occt-import-js`
and return volume/surface area/bbox/mesh as JSON. Exists because the wasm
build of OCCT is ~7.5 MB and bundling it into the Cloudflare Worker pushed
the Worker past Cloudflare's free-plan 3 MiB script size limit. Here, as a
normal Node dependency, there's no such ceiling.

Not part of the price-scraping pipeline -- that's still GitHub Actions,
triggered directly by the Worker via `repository_dispatch`. This service is
CAD parsing only.

## Deploy on Render

1. New > Web Service > connect this repo.
2. **Root directory**: `render-occt-service`
3. **Runtime**: Node
4. **Build command**: `npm install`
5. **Start command**: `npm start`
6. Environment variable: `INTERNAL_PARSE_SECRET` -- any random string. Must
   match the Worker's secret of the same name (`wrangler secret put
   INTERNAL_PARSE_SECRET`).
7. Deploy, then copy the resulting `https://<service>.onrender.com` URL into
   the Worker's `RENDER_PARSE_URL` var in the root `wrangler.toml`.

## Notes

- Free tier spins down on idle. First STEP/IGES upload after a while eats a
  ~30-50s cold start while the instance boots back up -- the Worker's fetch
  timeout to this service needs to tolerate that (see `stepParser.js`).
- `GET /health` for a quick liveness check / to pre-warm before a demo.
- `POST /parse` expects raw file bytes as the body (not JSON, not
  multipart), `Authorization: Bearer <INTERNAL_PARSE_SECRET>`, and
  `X-Format: step|iges`.
