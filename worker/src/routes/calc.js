import { Hono } from "hono";
import { calcMaterialUsage, checkBedFit } from "../lib/materialCalc.js";
import printers from "../printers.json";

const calc = new Hono();

calc.get("/printers", (c) => c.json(printers));

calc.post("/calc", async (c) => {
  const { geometry_id, printer_id, settings = {}, materials = {} } = await c.req.json();

  const raw = await c.env.GEOMETRY_KV.get(`geometry:${geometry_id}`);
  if (!raw) return c.json({ error: "geometry not found, re-upload the file" }, 404);
  const geometry = JSON.parse(raw);

  if (!materials.main) return c.json({ error: "materials.main is required" }, 400);

  const usage = calcMaterialUsage(geometry, settings, materials);

  let bedFit = null;
  if (printer_id) {
    const printer = printers[printer_id];
    if (!printer) return c.json({ error: `unknown printer_id: ${printer_id}` }, 400);
    bedFit = checkBedFit(geometry.bbox, printer, settings.shrinkage_percent ?? 100);
  }

  return c.json({ usage, bed_fit: bedFit });
});

export default calc;
