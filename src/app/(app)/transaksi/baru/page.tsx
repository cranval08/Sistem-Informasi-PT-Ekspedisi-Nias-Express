import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Buat Transaksi" };

export default function Halaman() {
  return <HalamanModul rute="transaksiBaru" fase={3} />;
}
