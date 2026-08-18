export const metadata = {
  title: "Printed Parts Material Calc",
  description: "Filament cost + material estimate from STEP/STL files",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          background: "radial-gradient(circle at 20% -10%, #1a1d27 0%, #0b0c10 55%)",
          backgroundAttachment: "fixed",
          color: "#e8e9ed",
          margin: 0,
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
