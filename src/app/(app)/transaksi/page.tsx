import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Daftar Transaksi" };

export default function Halaman() {
  return <HalamanModul rute="transaksi" fase={3} />;
}
