"use client";
import { useState } from "react";
import MaterialInput from "../components/MaterialInput";
import { API_BASE } from "../lib/apiBase";

const card = {
  border: "1px solid #2a2d34",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
  background: "#161821",
};
const input = {
  width: "100%",
  padding: "6px 8px",
  marginTop: 4,
  marginBottom: 8,
  background: "#0f1115",
  border: "1px solid #2a2d34",
  borderRadius: 6,
  color: "#e6e6e6",
};
const label = { fontSize: 12, color: "#9aa0ab" };

export default function Home() {
  const [file, setFile] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const [mainMat, setMainMat] = useState({});
  const [supportMat, setSupportMat] = useState({});
  const [interfaceMat, setInterfaceMat] = useState({});

  const [printerId, setPrinterId] = useState("h2d_pro");
  const [wallCount, setWallCount] = useState(3);
  const [nozzleWidth, setNozzleWidth] = useState(0.42);
  const [infillPercent, setInfillPercent] = useState(15);
  const [supportType, setSupportType] = useState("tree");
  const [overhangFraction, setOverhangFraction] = useState(25);
  const [interfaceFraction, setInterfaceFraction] = useState(15);
  const [shrinkagePercent, setShrinkagePercent] = useState(101);

  const [result, setResult] = useState(null);
  const [calcError, setCalcError] = useState(null);
  const [calculating, setCalculating] = useState(false);

  async function handleUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    setUploadError(null);
    setGeometry(null);

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
            nozzle_line_width_mm: nozzleWidth,
            wall_count: wallCount,
            infill_percent: infillPercent,
            support_type: supportType,
            overhang_fraction: overhangFraction / 100,
            interface_fraction: interfaceFraction / 100,
            shrinkage_percent: shrinkagePercent,
          },
          materials: {
            main: mainMat,
            support: supportType !== "none" ? supportMat : undefined,
            interface: interfaceFraction > 0 ? interfaceMat : undefined,
          },
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

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22 }}>Printed Parts Material Calc</h1>
      <p style={{ color: "#9aa0ab", fontSize: 13 }}>
        Filament usage + cost estimate from a STEP/STL file. No slicing, no visuals — just the numbers.
      </p>

      {/* Upload + thumbnail */}
      <div style={card}>
        <strong>1. Part file</strong>
        <div style={{ marginTop: 8 }}>
          <input type="file" accept=".step,.stp,.iges,.igs,.stl" onChange={handleUpload} />
        </div>
        {uploading && <div style={{ fontSize: 12, marginTop: 8 }}>Parsing geometry…</div>}
        {uploadError && <div style={{ color: "#e08080", fontSize: 12, marginTop: 8 }}>{uploadError}</div>}
        {geometry && (
          <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start" }}>
            <img
              src={`${API_BASE}${geometry.thumbnail_url}`}
              alt="part preview"
              width={120}
              height={120}
              style={{ borderRadius: 6, border: "1px solid #2a2d34" }}
            />
            <div style={{ fontSize: 12, color: "#9aa0ab" }}>
              <div>{geometry.filename}</div>
              <div>Volume: {(geometry.volume_mm3 / 1000).toFixed(2)} cm³</div>
              <div>
                Bbox: {geometry.bbox.x_mm.toFixed(1)} × {geometry.bbox.y_mm.toFixed(1)} × {geometry.bbox.z_mm.toFixed(1)} mm
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Materials */}
      <div style={card}>
        <strong>2. Materials</strong>
        <div style={{ marginTop: 12 }}>
          <MaterialInput title="Main filament" material={mainMat} onChange={setMainMat} />
          {supportType !== "none" && (
            <MaterialInput title="Support filament" material={supportMat} onChange={setSupportMat} />
          )}
          {interfaceFraction > 0 && (
            <MaterialInput
              title="Interface support filament (e.g. AquaSys — last bit touching the part)"
              material={interfaceMat}
              onChange={setInterfaceMat}
            />
          )}
        </div>
      </div>

      {/* Printer + settings */}
      <div style={card}>
        <strong>3. Printer + print settings</strong>

        <div style={label}>Printer</div>
        <select style={input} value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
          <option value="h2d_pro">Bambu Lab H2D Pro</option>
          <option value="qidi_plus4">Qidi Plus 4</option>
        </select>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>Wall count</div>
            <input type="number" style={input} value={wallCount} onChange={(e) => setWallCount(+e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>Nozzle line width (mm)</div>
            <input
              type="number"
              step="0.01"
              style={input}
              value={nozzleWidth}
              onChange={(e) => setNozzleWidth(+e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>Infill %</div>
            <input
              type="number"
              style={input}
              value={infillPercent}
              onChange={(e) => setInfillPercent(+e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>Support type</div>
            <select style={input} value={supportType} onChange={(e) => setSupportType(e.target.value)}>
              <option value="none">None</option>
              <option value="grid">Grid / Normal</option>
              <option value="tree">Tree</option>
              <option value="organic">Organic</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>Est. overhang area %</div>
            <input
              type="number"
              style={input}
              value={overhangFraction}
              onChange={(e) => setOverhangFraction(+e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>Interface support %</div>
            <input
              type="number"
              style={input}
              value={interfaceFraction}
              onChange={(e) => setInterfaceFraction(+e.target.value)}
            />
          </div>
        </div>

        <div style={label}>Shrinkage compensation % (101 = scale up 1%)</div>
        <input
          type="number"
          step="0.1"
          style={{ ...input, maxWidth: 160 }}
          value={shrinkagePercent}
          onChange={(e) => setShrinkagePercent(+e.target.value)}
        />
      </div>

      <button
        onClick={handleCalc}
        disabled={!geometry || calculating}
        style={{ padding: "10px 20px", fontWeight: 600, borderRadius: 6, border: "none", background: "#4f8cff", color: "#fff", cursor: "pointer" }}
      >
        {calculating ? "Calculating…" : "Calculate cost"}
      </button>

      {calcError && <div style={{ color: "#e08080", marginTop: 12 }}>{calcError}</div>}

      {result && (
        <div style={{ ...card, marginTop: 16 }}>
          <strong>Results</strong>

          {result.bed_fit && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 6,
                background: result.bed_fit.fits ? "#173d2b" : "#3d1717",
                fontSize: 13,
              }}
            >
              {result.bed_fit.fits ? "✓ Fits on bed" : "✗ Does NOT fit on bed"} — part{" "}
              {result.bed_fit.part_dims_mm.x.toFixed(1)}×{result.bed_fit.part_dims_mm.y.toFixed(1)}×
              {result.bed_fit.part_dims_mm.z.toFixed(1)}mm vs bed {result.bed_fit.bed_mm.x}×
              {result.bed_fit.bed_mm.y}×{result.bed_fit.bed_mm.z}mm
            </div>
          )}

          <table style={{ width: "100%", marginTop: 12, fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#9aa0ab", textAlign: "left" }}>
                <th>Material</th>
                <th>Grams</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Main</td>
                <td>{result.usage.usage.main.grams.toFixed(1)}g</td>
                <td>${result.usage.usage.main.cost.toFixed(2)}</td>
              </tr>
              {result.usage.usage.support.grams > 0 && (
                <tr>
                  <td>Support</td>
                  <td>{result.usage.usage.support.grams.toFixed(1)}g</td>
                  <td>${result.usage.usage.support.cost.toFixed(2)}</td>
                </tr>
              )}
              {result.usage.usage.interface && (
                <tr>
                  <td>Interface</td>
                  <td>{result.usage.usage.interface.grams.toFixed(1)}g</td>
                  <td>${result.usage.usage.interface.cost.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 8, fontWeight: 600 }}>
            Total: ${result.usage.total_cost.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>{result.usage.note}</div>
        </div>
      )}
    </main>
  );
}
