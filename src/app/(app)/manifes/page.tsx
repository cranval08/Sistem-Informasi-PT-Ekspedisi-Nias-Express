import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Daftar Manifes" };

export default function Halaman() {
  return <HalamanModul rute="manifes" fase={5} />;
}
