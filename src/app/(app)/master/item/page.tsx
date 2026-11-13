import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Jenis Barang & Tarif" };

export default function Halaman() {
  return <HalamanModul rute="masterItem" fase={2} />;
}
