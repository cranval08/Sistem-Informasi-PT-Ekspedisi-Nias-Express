import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Data Pengguna" };

export default function Halaman() {
  return <HalamanModul rute="masterPengguna" fase={2} />;
}
