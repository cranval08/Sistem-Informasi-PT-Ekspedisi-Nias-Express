import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Audit Log" };

export default function Halaman() {
  return <HalamanModul rute="auditLog" fase={6} />;
}
