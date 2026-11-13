import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Laporan Pengiriman" };

export default function Halaman() {
  return <HalamanModul rute="laporanKirim" fase={6} />;
}
