import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Laporan Armada & Tonase" };

export default function Halaman() {
  return <HalamanModul rute="laporanArmada" fase={6} />;
}
