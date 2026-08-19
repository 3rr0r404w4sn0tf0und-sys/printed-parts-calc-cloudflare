/**
 * STL is parsed locally (pure JS, no dependencies). STEP/IGES are proxied to
 * the render-occt-service (see /render-occt-service) instead of running
 * occt-import-js in-Worker: bundling its ~7.5 MB wasm binary pushed the
 * Worker script past Cloudflare's free-plan 3 MiB size limit. Running OCCT
 * as a normal Node dependency on Render sidesteps that ceiling entirely.
 */

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {"step"|"iges"|"stl"} format
 * @param {{RENDER_PARSE_URL: string, INTERNAL_PARSE_SECRET: string}} env
 */
export async function parseCadFile(arrayBuffer, format, env) {
  if (format === "stl") {
    return parseStlBuffer(arrayBuffer);
  }

  return parseViaRenderService(arrayBuffer, format, env);
}

async function parseViaRenderService(arrayBuffer, format, env) {
  if (!env?.RENDER_PARSE_URL || !env?.INTERNAL_PARSE_SECRET) {
    throw new Error(
      "RENDER_PARSE_URL / INTERNAL_PARSE_SECRET not configured -- STEP/IGES parsing is unavailable"
    );
  }

  // Render's free tier spins down on idle, so a cold start can take
  // 30-50s. Give this a long timeout rather than failing fast -- the
  // frontend should show a "warming up" state for uploads, same idea as
  // the price-fetch polling UX.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch(`${env.RENDER_PARSE_URL}/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        authorization: `Bearer ${env.INTERNAL_PARSE_SECRET}`,
        "x-format": format,
      },
      body: arrayBuffer,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("CAD parsing service timed out (cold start can take up to a minute -- try again)");
    }
    throw new Error(`CAD parsing service unreachable: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `CAD parsing service returned ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore -- fall back to the generic status message
    }
    throw new Error(message);
  }

  return response.json();
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

function parseStlBuffer(arrayBuffer) {
  const buffer = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  const header = new TextDecoder().decode(bytes.slice(0, 5)).toLowerCase();
  const isAscii = header === "solid" && !looksBinary(buffer, arrayBuffer.byteLength);

  const positions = [];
  const indices = [];

  if (isAscii) {
    const text = new TextDecoder().decode(bytes);
    const vertexRe = /vertex\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/g;
    let match;
    let idx = 0;
    while ((match = vertexRe.exec(text)) !== null) {
      positions.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
      indices.push(idx++);
    }
  } else {
    const triCount = buffer.getUint32(80, true);
    let offset = 84;
    let idx = 0;
    for (let t = 0; t < triCount; t++) {
      offset += 12; // skip normal
      for (let v = 0; v < 3; v++) {
        positions.push(
          buffer.getFloat32(offset, true),
          buffer.getFloat32(offset + 4, true),
          buffer.getFloat32(offset + 8, true)
        );
        indices.push(idx++);
        offset += 12;
      }
      offset += 2; // skip attribute byte count
    }
  }

  const { volume_mm3, surface_area_mm2 } = meshVolumeAndArea(positions, indices);
  const bbox = boundingBox(positions);
  return { volume_mm3, surface_area_mm2, bbox, mesh: { positions, indices } };
}

function looksBinary(buffer, byteLength) {
  if (byteLength < 84) return true;
  const triCount = buffer.getUint32(80, true);
  return 84 + triCount * 50 === byteLength;
}
