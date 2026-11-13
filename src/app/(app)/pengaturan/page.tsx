import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Pengaturan" };

export default function Halaman() {
  return <HalamanModul rute="pengaturan" fase={2} />;
}
