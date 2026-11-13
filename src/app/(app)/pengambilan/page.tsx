import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Pengambilan Barang" };

export default function Halaman() {
  return <HalamanModul rute="pengambilan" fase={5} />;
}
