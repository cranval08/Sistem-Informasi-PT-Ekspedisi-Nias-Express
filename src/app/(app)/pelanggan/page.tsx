import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Daftar Pelanggan" };

export default function Halaman() {
  return <HalamanModul rute="pelanggan" fase={2} />;
}
