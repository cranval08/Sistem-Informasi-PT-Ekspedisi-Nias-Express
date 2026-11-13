import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Rekap Kas" };

export default function Halaman() {
  return <HalamanModul rute="rekapKas" fase={4} />;
}
