import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Buat Manifes" };

export default function Halaman() {
  return <HalamanModul rute="manifesBaru" fase={5} />;
}
