"use client";
import { colors, label as labelStyle, input as inputStyle, sectionTitle } from "../lib/theme";

const row = { display: "flex", gap: 8, marginBottom: 9 };
const section = { marginBottom: 20 };
const checkboxRow = { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#c7cbd1", marginBottom: 7, cursor: "pointer" };
const hint = { fontSize: 10.5, color: colors.textFaint, lineHeight: 1.4 };

function Field({ children }) {
  return <div style={{ flex: 1 }}>{children}</div>;
}

export default function SlicerSettings({ settings, onChange }) {
  const set = (key, val) => onChange({ ...settings, [key]: val });

  return (
    <div style={{ fontSize: 13 }}>
      <div style={section}>
        <div style={sectionTitle}>Layers &amp; Perimeters</div>
        <div style={row}>
          <Field>
            <label style={labelStyle}>Layer height (mm)</label>
            <input type="number" step="0.01" style={inputStyle} value={settings.layer_height_mm}
              onChange={(e) => set("layer_height_mm", +e.target.value)} />
          </Field>
          <Field>
            <label style={labelStyle}>Line width (mm)</label>
            <input type="number" step="0.01" style={inputStyle} value={settings.nozzle_line_width_mm}
              onChange={(e) => set("nozzle_line_width_mm", +e.target.value)} />
          </Field>
        </div>
        <div style={row}>
          <Field>
            <label style={labelStyle}>Wall count</label>
            <input type="number" style={inputStyle} value={settings.wall_count}
              onChange={(e) => set("wall_count", +e.target.value)} />
          </Field>
          <Field>
            <label style={labelStyle}>Top/bottom layers</label>
            <input type="number" style={inputStyle} value={settings.top_bottom_layers}
              onChange={(e) => set("top_bottom_layers", +e.target.value)} />
          </Field>
        </div>
        <label style={checkboxRow}>
          <input type="checkbox" checked={settings.ironing_enabled} onChange={(e) => set("ironing_enabled", e.target.checked)} />
          Ironing <span style={{ color: colors.textFaint, fontWeight: 400 }}>(cosmetic)</span>
        </label>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Infill</div>
        <div style={row}>
          <Field>
            <label style={labelStyle}>Density (%)</label>
            <input type="number" style={inputStyle} value={settings.infill_percent}
              onChange={(e) => set("infill_percent", +e.target.value)} />
          </Field>
          <Field>
            <label style={labelStyle}>Pattern</label>
            <select style={inputStyle} value={settings.infill_pattern} onChange={(e) => set("infill_pattern", e.target.value)}>
              <option value="grid">Grid</option>
              <option value="gyroid">Gyroid</option>
              <option value="honeycomb">Honeycomb</option>
              <option value="cubic">Cubic</option>
            </select>
          </Field>
        </div>
        <div style={hint}>Pattern is cosmetic — only density affects the material estimate.</div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Support Material</div>
        <div style={row}>
          <Field>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={settings.support_type} onChange={(e) => set("support_type", e.target.value)}>
              <option value="none">None</option>
              <option value="grid">Grid / Normal</option>
              <option value="tree">Tree</option>
              <option value="organic">Organic</option>
            </select>
          </Field>
          <Field>
            <label style={labelStyle}>Overhang area (%)</label>
            <input type="number" style={inputStyle} value={settings.overhang_fraction}
              onChange={(e) => set("overhang_fraction", +e.target.value)} />
          </Field>
        </div>
        <div style={row}>
          <Field>
            <label style={labelStyle}>Interface support (%)</label>
            <input type="number" style={inputStyle} value={settings.interface_fraction}
              onChange={(e) => set("interface_fraction", +e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Build Plate Adhesion</div>

        <label style={checkboxRow}>
          <input type="checkbox" checked={settings.brim_enabled} onChange={(e) => set("brim_enabled", e.target.checked)} />
          Brim
        </label>
        {settings.brim_enabled && (
          <div style={row}>
            <Field><label style={labelStyle}>Width (mm)</label>
              <input type="number" style={inputStyle} value={settings.brim_width_mm} onChange={(e) => set("brim_width_mm", +e.target.value)} /></Field>
          </div>
        )}

        <label style={checkboxRow}>
          <input type="checkbox" checked={settings.skirt_enabled} onChange={(e) => set("skirt_enabled", e.target.checked)} />
          Skirt
        </label>
        {settings.skirt_enabled && (
          <div style={row}>
            <Field><label style={labelStyle}>Loops</label>
              <input type="number" style={inputStyle} value={settings.skirt_loops} onChange={(e) => set("skirt_loops", +e.target.value)} /></Field>
            <Field><label style={labelStyle}>Distance (mm)</label>
              <input type="number" style={inputStyle} value={settings.skirt_distance_mm} onChange={(e) => set("skirt_distance_mm", +e.target.value)} /></Field>
          </div>
        )}

        <label style={checkboxRow}>
          <input type="checkbox" checked={settings.raft_enabled} onChange={(e) => set("raft_enabled", e.target.checked)} />
          Raft
        </label>
        {settings.raft_enabled && (
          <div style={row}>
            <Field><label style={labelStyle}>Layers</label>
              <input type="number" style={inputStyle} value={settings.raft_layers} onChange={(e) => set("raft_layers", +e.target.value)} /></Field>
            <Field><label style={labelStyle}>Margin (mm)</label>
              <input type="number" style={inputStyle} value={settings.raft_margin_mm} onChange={(e) => set("raft_margin_mm", +e.target.value)} /></Field>
          </div>
        )}
      </div>

      <div style={section}>
        <div style={sectionTitle}>Speed <span style={{ color: colors.textFaint, fontWeight: 400, textTransform: "none" }}>(cosmetic)</span></div>
        <div style={row}>
          <Field><label style={labelStyle}>Print speed (mm/s)</label>
            <input type="number" style={inputStyle} value={settings.print_speed_mms} onChange={(e) => set("print_speed_mms", +e.target.value)} /></Field>
          <Field><label style={labelStyle}>First layer (mm/s)</label>
            <input type="number" style={inputStyle} value={settings.first_layer_speed_mms} onChange={(e) => set("first_layer_speed_mms", +e.target.value)} /></Field>
        </div>
      </div>

      <div style={section}>
        <div style={sectionTitle}>Advanced</div>
        <div style={row}>
          <Field><label style={labelStyle}>Seam position <span style={{ color: colors.textFaint }}>(cosmetic)</span></label>
            <select style={inputStyle} value={settings.seam_position} onChange={(e) => set("seam_position", e.target.value)}>
              <option value="aligned">Aligned</option>
              <option value="nearest">Nearest</option>
              <option value="random">Random</option>
            </select></Field>
        </div>
        <div style={row}>
          <Field><label style={labelStyle}>Shrinkage compensation (%)</label>
            <input type="number" step="0.1" style={inputStyle} value={settings.shrinkage_percent}
              onChange={(e) => set("shrinkage_percent", +e.target.value)} /></Field>
        </div>
      </div>
    </div>
  );
}
