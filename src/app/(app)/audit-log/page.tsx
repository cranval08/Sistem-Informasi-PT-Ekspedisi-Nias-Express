import type { Metadata } from "next";
import { HalamanModul } from "@/components/app/halaman-modul";

export const metadata: Metadata = { title: "Audit Log" };

export default function Halaman() {
  return <HalamanModul rute="auditLog" fase={6} />;
}
