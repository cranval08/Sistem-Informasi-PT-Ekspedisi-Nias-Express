import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { wajibAksesRute } from "@/lib/auth/sesi";
import { ContohSistemDesain } from "./contoh";

export const metadata: Metadata = { title: "Sistem Desain" };

export default async function SistemDesainPage() {
  await wajibAksesRute("sistemDesain");
  return (
    <>
      <PageHeader
        judul="Sistem Desain"
        deskripsi="Referensi komponen antarmuka yang dipakai di seluruh aplikasi."
      />
      <ContohSistemDesain />
    </>
  );
}
