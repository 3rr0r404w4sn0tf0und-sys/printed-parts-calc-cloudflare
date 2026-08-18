"use client";
import { useState, useEffect, useRef } from "react";
import MaterialInput from "../components/MaterialInput";
import SlicerSettings from "../components/SlicerSettings";
import BedViewer from "../components/BedViewer";
import { API_BASE } from "../lib/apiBase";
import { colors, panel, button, buttonGhost } from "../lib/theme";
import { saveSession, loadSession, clearSession } from "../lib/sessionCache";

const DEFAULT_SETTINGS = {
  layer_height_mm: 0.2,
  nozzle_line_width_mm: 0.42,
  wall_count: 3,
  top_bottom_layers: 4,
  ironing_enabled: false,
  infill_percent: 15,
  infill_pattern: "grid",
  support_type: "tree",
  overhang_fraction: 25,
  interface_fraction: 15,
  brim_enabled: false,
  brim_width_mm: 5,
  skirt_enabled: true,
  skirt_loops: 2,
  skirt_distance_mm: 2,
  raft_enabled: false,
  raft_layers: 3,
  raft_margin_mm: 5,
  print_speed_mms: 150,
  first_layer_speed_mms: 30,
  seam_position: "aligned",
  shrinkage_percent: 101,
};

const PRINTERS = {
  h2d_pro: { name: "Bambu Lab H2D Pro", bed_mm: { x: 350, y: 320, z: 325 } },
  qidi_plus4: { name: "Qidi Plus 4", bed_mm: { x: 280, y: 280, z: 270 } },
};

export default function Home() {
  const [geometry, setGeometry] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const [mainMat, setMainMat] = useState({});
  const [supportMat, setSupportMat] = useState({});
  const [interfaceMat, setInterfaceMat] = useState({});

  const [printerId, setPrinterId] = useState("h2d_pro");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [rotatedDims, setRotatedDims] = useState(null);

  const [result, setResult] = useState(null);
  const [calcError, setCalcError] = useState(null);
  const [calculating, setCalculating] = useState(false);

  const hydrated = useRef(false);

  // Restore from the temporary session cache on first load
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const cached = loadSession("session");
    if (cached) {
      if (cached.geometry) setGeometry(cached.geometry);
      if (cached.mainMat) setMainMat(cached.mainMat);
      if (cached.supportMat) setSupportMat(cached.supportMat);
      if (cached.interfaceMat) setInterfaceMat(cached.interfaceMat);
      if (cached.printerId) setPrinterId(cached.printerId);
      if (cached.settings) setSettings(cached.settings);
    }
  }, []);

  // Persist to session cache on any relevant change (cleared on tab close)
  useEffect(() => {
    if (!hydrated.current) return;
    saveSession("session", { geometry, mainMat, supportMat, interfaceMat, printerId, settings });
  }, [geometry, mainMat, supportMat, interfaceMat, printerId, settings]);

  async function handleUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    setUploading(true);
    setUploadError(null);
    setGeometry(null);
    setRotatedDims(null);
    setResult(null);

    const form = new FormData();
    form.append("file", f);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      setGeometry(data);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function loadDifferentPart() {
    setGeometry(null);
    setResult(null);
    clearSession("session");
  }

  async function handleCalc() {
    setCalculating(true);
    setCalcError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/calc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geometry_id: geometry.id,
          printer_id: printerId,
          settings: {
            ...settings,
            overhang_fraction: settings.overhang_fraction / 100,
            interface_fraction: settings.interface_fraction / 100,
          },
          materials: {
            main: mainMat,
            support: settings.support_type !== "none" ? supportMat : undefined,
            interface: settings.interface_fraction > 0 ? interfaceMat : undefined,
          },
          rotated_dims: rotatedDims,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "calc failed");
      setResult(data);
    } catch (err) {
      setCalcError(err.message);
    } finally {
      setCalculating(false);
    }
  }

  const bedDims = PRINTERS[printerId].bed_mm;

  return (
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 24px 60px" }}>
      <header style={{ marginBottom: 22, display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>
          Printed Parts <span style={{ color: colors.accent }}>Material Calc</span>
        </h1>
        <span style={{ color: colors.textFaint, fontSize: 12.5 }}>
          Full slicer-style settings, real bed + orientation, no actual slicing
        </span>
      </header>

      {!geometry && (
        <div style={{ ...panel, marginBottom: 16, maxWidth: 480 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Load a part</div>
          <input type="file" accept=".step,.stp,.iges,.igs,.stl" onChange={handleUpload}
            style={{ fontSize: 13, color: colors.textDim }} />
          {uploading && <div style={{ fontSize: 12, marginTop: 10, color: colors.accent }}>Parsing geometry…</div>}
          {uploadError && <div style={{ color: colors.bad, fontSize: 12, marginTop: 10 }}>{uploadError}</div>}
        </div>
      )}

      {geometry && (
        <div style={{ display: "grid", gridTemplateColumns: "290px 1fr 320px", gap: 18, alignItems: "start" }}>
          {/* Left: slicer settings tree */}
          <div style={panel}>
            <SlicerSettings settings={settings} onChange={setSettings} />
          </div>

          {/* Center: bed + part */}
          <div>
            <div style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ fontSize: 13.5 }}>{geometry.filename}</strong>
                <select value={printerId} onChange={(e) => setPrinterId(e.target.value)}
                  style={{ background: colors.inputBg, color: colors.text, border: `1px solid ${colors.inputBorder}`, borderRadius: 6, padding: "5px 9px", fontSize: 12.5 }}>
                  <option value="h2d_pro">Bambu Lab H2D Pro</option>
                  <option value="qidi_plus4">Qidi Plus 4</option>
                </select>
              </div>
              <BedViewer meshUrl={`${API_BASE}${geometry.mesh_url}`} bedDims={bedDims} onRotatedDimsChange={setRotatedDims} />
              <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                vol {(geometry.volume_mm3 / 1000).toFixed(2)}cm³ · bbox {geometry.bbox.x_mm.toFixed(0)}×{geometry.bbox.y_mm.toFixed(0)}×{geometry.bbox.z_mm.toFixed(0)}mm
                {rotatedDims && <> · rotated {rotatedDims.x.toFixed(0)}×{rotatedDims.y.toFixed(0)}×{rotatedDims.z.toFixed(0)}mm</>}
              </div>
            </div>

            <button onClick={loadDifferentPart} style={{ ...buttonGhost, marginTop: 10 }}>
              Load different part
            </button>

            {result && (
              <div style={{ ...panel, marginTop: 18 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Results</div>
                {result.bed_fit && (
                  <div style={{
                    padding: "9px 12px", borderRadius: 7, fontSize: 13, marginBottom: 12,
                    background: result.bed_fit.fits ? colors.goodBg : colors.badBg,
                    color: result.bed_fit.fits ? colors.good : colors.bad,
                  }}>
                    {result.bed_fit.fits ? "✓ Fits on bed" : "✗ Does NOT fit on bed"} — part{" "}
                    {result.bed_fit.part_dims_mm.x.toFixed(1)}×{result.bed_fit.part_dims_mm.y.toFixed(1)}×{result.bed_fit.part_dims_mm.z.toFixed(1)}mm
                    {" "}vs bed {result.bed_fit.bed_mm.x}×{result.bed_fit.bed_mm.y}×{result.bed_fit.bed_mm.z}mm
                  </div>
                )}
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: colors.textDim, textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      <th style={{ paddingBottom: 6, fontWeight: 600 }}>Material</th>
                      <th style={{ paddingBottom: 6, fontWeight: 600 }}>Grams</th>
                      <th style={{ paddingBottom: 6, fontWeight: 600 }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <tr><td style={{ padding: "3px 0" }}>Main (+ adhesion)</td><td>{result.usage.usage.main.grams.toFixed(1)}g</td><td>${result.usage.usage.main.cost.toFixed(2)}</td></tr>
                    {result.usage.usage.support.grams > 0 && <tr><td style={{ padding: "3px 0" }}>Support</td><td>{result.usage.usage.support.grams.toFixed(1)}g</td><td>${result.usage.usage.support.cost.toFixed(2)}</td></tr>}
                    {result.usage.usage.interface && <tr><td style={{ padding: "3px 0" }}>Interface</td><td>{result.usage.usage.interface.grams.toFixed(1)}g</td><td>${result.usage.usage.interface.cost.toFixed(2)}</td></tr>}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.panelBorder}`, fontWeight: 700, fontSize: 15 }}>
                  Total: <span style={{ color: colors.accent }}>${result.usage.total_cost.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 8, lineHeight: 1.4 }}>{result.usage.note}</div>
              </div>
            )}
          </div>

          {/* Right: materials + calculate */}
          <div>
            <div style={panel}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Materials</div>
              <MaterialInput title="Main filament" material={mainMat} onChange={setMainMat} />
              {settings.support_type !== "none" && (
                <MaterialInput title="Support filament" material={supportMat} onChange={setSupportMat} />
              )}
              {settings.interface_fraction > 0 && (
                <MaterialInput title="Interface filament (e.g. AquaSys)" material={interfaceMat} onChange={setInterfaceMat} />
              )}
            </div>

            <button onClick={handleCalc} disabled={calculating} style={{ ...button, width: "100%", marginTop: 14, opacity: calculating ? 0.7 : 1 }}>
              {calculating ? "Calculating…" : "Calculate cost"}
            </button>
            {calcError && <div style={{ color: colors.bad, marginTop: 8, fontSize: 12 }}>{calcError}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
