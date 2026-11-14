import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Rekap Kas" };

export default function Halaman() {
  return <HalamanModul rute="rekapKas" fase={4} />;
}
