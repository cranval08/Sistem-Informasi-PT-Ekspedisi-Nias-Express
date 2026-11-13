import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Daftar Armada" };

export default function Halaman() {
  return <HalamanModul rute="armada" fase={2} />;
}
