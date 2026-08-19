/**
 * Standalone STEP/IGES parsing service. Exists purely because occt-import-js
 * (WASM build of OpenCascade) bundled into the Cloudflare Worker pushed the
 * Worker script past Cloudflare's free-plan 3 MiB size limit -- the wasm
 * binary alone is ~7.5 MB. Running it here instead means it's just a normal
 * Node dependency with no bundle-size ceiling and no emscripten
 * environment-detection weirdness, since this actually is Node.
 *
 * Not involved in price scraping at all -- that's still GitHub Actions,
 * triggered directly by the Worker. This service only does CAD parsing.
 */
import express from "express";
import occtimportjs from "occt-import-js";

const PORT = process.env.PORT || 3000;
const INTERNAL_PARSE_SECRET = process.env.INTERNAL_PARSE_SECRET;

if (!INTERNAL_PARSE_SECRET) {
  console.error(
    "INTERNAL_PARSE_SECRET is not set -- refusing to start. Set it in Render's environment variables (must match the Worker's secret of the same name)."
  );
  process.exit(1);
}

let occtInstance = null;
async function getOcct() {
  if (!occtInstance) {
    occtInstance = await occtimportjs();
  }
  return occtInstance;
}

function meshVolumeAndArea(positions, indices) {
  let volume = 0;
  let area = 0;
  const p = positions;

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
    const bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
    const cx = p[ic], cy = p[ic + 1], cz = p[ic + 2];

    volume += (
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx)
    ) / 6.0;

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const crossx = uy * vz - uz * vy;
    const crossy = uz * vx - ux * vz;
    const crossz = ux * vy - uy * vx;
    area += 0.5 * Math.sqrt(crossx * crossx + crossy * crossy + crossz * crossz);
  }

  return { volume_mm3: Math.abs(volume), surface_area_mm2: area };
}

function boundingBox(positions) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { x_mm: maxX - minX, y_mm: maxY - minY, z_mm: maxZ - minZ };
}

const app = express();

// Raw file bytes in the body, not JSON/multipart -- the Worker just
// forwards the ArrayBuffer it already has. 50mb ceiling is generous for a
// single printed part; tighten if abuse becomes a concern.
app.use("/parse", express.raw({ type: "*/*", limit: "50mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/parse", async (req, res) => {
  const auth = req.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== INTERNAL_PARSE_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const format = (req.get("x-format") || "").toLowerCase();
  if (format !== "step" && format !== "iges") {
    return res.status(400).json({ error: "x-format header must be 'step' or 'iges'" });
  }

  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: "empty request body" });
  }

  try {
    const occt = await getOcct();
    const fileBytes = new Uint8Array(req.body);
    const result =
      format === "iges" ? occt.ReadIgesFile(fileBytes, null) : occt.ReadStepFile(fileBytes, null);

    if (!result.success) {
      return res.status(422).json({ error: `OCCT failed to parse ${format.toUpperCase()} file` });
    }

    let positions = [];
    let indices = [];
    let indexOffset = 0;
    for (const meshData of result.meshes) {
      positions = positions.concat(Array.from(meshData.attributes.position.array));
      const idx = Array.from(meshData.index.array).map((i) => i + indexOffset);
      indices = indices.concat(idx);
      indexOffset += meshData.attributes.position.array.length / 3;
    }

    const { volume_mm3, surface_area_mm2 } = meshVolumeAndArea(positions, indices);
    const bbox = boundingBox(positions);

    return res.json({
      volume_mm3,
      surface_area_mm2,
      bbox,
      mesh: { positions, indices },
    });
  } catch (err) {
    console.error("parse error:", err);
    return res.status(500).json({ error: err.message || "parse failed" });
  }
});

app.listen(PORT, () => {
  console.log(`occt parse service listening on :${PORT}`);
});
