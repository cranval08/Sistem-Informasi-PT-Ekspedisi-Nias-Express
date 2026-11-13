import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Daftar Pembayaran" };

export default function Halaman() {
  return <HalamanModul rute="pembayaran" fase={4} />;
}
