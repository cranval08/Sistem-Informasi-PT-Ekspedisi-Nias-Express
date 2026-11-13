import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Laporan Pembayaran" };

export default function Halaman() {
  return <HalamanModul rute="laporanBayar" fase={6} />;
}
