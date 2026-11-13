import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Laporan Transaksi" };

export default function Halaman() {
  return <HalamanModul rute="laporanTransaksi" fase={6} />;
}
