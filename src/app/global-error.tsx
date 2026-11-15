"use client";

/**
 * Galat pada root layout. Menggantikan seluruh dokumen dan tidak memuat
 * globals.css, jadi gayanya ditulis inline (tema terang seperti aplikasi).
 */
export default function GalatGlobal({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f7fa", color: "#0f172a" }}>
        <title>Terjadi gangguan · Nias Express</title>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 420, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 32, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Aplikasi gagal dimuat</h1>
            <p style={{ fontSize: 14, color: "#475569", margin: "0 0 20px" }}>
              Periksa koneksi internet, lalu coba lagi. Data yang sudah tersimpan tidak terpengaruh.
            </p>
            <button
              onClick={() => retry()}
              style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}
            >
              Coba lagi
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
