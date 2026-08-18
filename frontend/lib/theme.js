// Shared style tokens -- kept as plain objects (no CSS framework) since
// the frontend is a static export. Centralized here so BedViewer,
// SlicerSettings, MaterialInput and page.js all read the same palette.

export const colors = {
  bg: "#0b0c10",
  panelBg: "linear-gradient(180deg, #191c24 0%, #14161c 100%)",
  panelBorder: "#262a35",
  inputBg: "#0e0f13",
  inputBorder: "#2a2e3a",
  text: "#e8e9ed",
  textDim: "#8b93a3",
  textFaint: "#5b6472",
  accent: "#5b8cff",
  accentHover: "#4677f0",
  good: "#33c47c",
  goodBg: "#123023",
  bad: "#ef5a5a",
  badBg: "#301616",
};

export const panel = {
  border: `1px solid ${colors.panelBorder}`,
  borderRadius: 10,
  padding: 16,
  background: colors.panelBg,
  boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.25)",
};

export const sectionTitle = {
  fontSize: 11,
  fontWeight: 700,
  color: colors.accent,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: `1px solid ${colors.panelBorder}`,
};

export const label = {
  fontSize: 11,
  color: colors.textDim,
  display: "block",
  marginBottom: 3,
  fontWeight: 500,
};

export const input = {
  width: "100%",
  padding: "6px 8px",
  background: colors.inputBg,
  border: `1px solid ${colors.inputBorder}`,
  borderRadius: 6,
  color: colors.text,
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  outline: "none",
};

export const button = {
  padding: "9px 18px",
  fontWeight: 600,
  fontSize: 13,
  borderRadius: 7,
  border: "none",
  background: colors.accent,
  color: "#fff",
  cursor: "pointer",
  transition: "background 0.15s ease",
};

export const buttonGhost = {
  fontSize: 12,
  background: "none",
  border: `1px solid ${colors.panelBorder}`,
  color: colors.textDim,
  borderRadius: 6,
  padding: "5px 11px",
  cursor: "pointer",
};
