import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { LABEL_PERAN } from "@/lib/domain/peran";
import { formatTanggalWaktu } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";
import { DashboardAdmin } from "./admin";
import { DashboardGudang } from "./gudang";
import { DashboardPemilik } from "./pemilik";
import { ArmadaSaya } from "./supir";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

/** Dashboard per peran (PRD §7.2–§7.5); semua angka dihitung dari database saat halaman dibuka. */
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const profil = await wajibAksesRute("dashboard");
  const [pengaturan, sp] = await Promise.all([ambilPengaturan(), props.searchParams]);
  const zona = pengaturan.zonaWaktu;

  return (
    <>
      <PageHeader
        judul={`Selamat datang, ${profil.namaLengkap}`}
        deskripsi={`Masuk sebagai ${LABEL_PERAN[profil.peran]} · ${formatTanggalWaktu(new Date(), zona)}`}
        aksi={
          profil.peran === "admin_loket" ? (
            <Button asChild size="lg">
              <Link href="/transaksi/baru">Buat Transaksi Baru</Link>
            </Button>
          ) : undefined
        }
      />
      {profil.peran === "pemilik" && <PengaturanPerluDilengkapi />}
      {profil.peran === "pemilik" && <DashboardPemilik sp={sp} zonaWaktu={zona} />}
      {profil.peran === "admin_loket" && <DashboardAdmin zonaWaktu={zona} />}
      {profil.peran === "staf_gudang" && <DashboardGudang zonaWaktu={zona} />}
      {profil.peran === "supir" && <ArmadaSaya />}
    </>
  );
}

/** Konfigurasi bisnis yang belum diisi pemilik (PRD §19: jangan mengarang nilai). */
async function PengaturanPerluDilengkapi() {
  const supabase = await buatKlienServer();
  const [{ data: s }, { count: jumlahItem }, { count: jumlahArmada }] = await Promise.all([
    supabase.from("pengaturan").select("ambang_peringatan_kapasitas_persen, alamat, telepon").maybeSingle(),
    supabase.from("data_item").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("data_armada").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const kurang: { label: string; href: string }[] = [];
  if (s?.ambang_peringatan_kapasitas_persen == null) kurang.push({ label: "Ambang peringatan kapasitas truk (%)", href: "/pengaturan" });
  if (!s?.alamat || !s?.telepon) kurang.push({ label: "Alamat dan telepon perusahaan untuk resi", href: "/pengaturan" });
  if (!jumlahItem) kurang.push({ label: "Master jenis barang dan tarif", href: "/master/item" });
  if (!jumlahArmada) kurang.push({ label: "Data armada beserta kapasitas masing-masing", href: "/armada" });

  if (kurang.length === 0) return null;
  return (
    <Card className="border-warning/30 bg-warning-subtle/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <Settings className="size-4" aria-hidden /> Data yang perlu dilengkapi Pemilik
        </CardTitle>
        <CardDescription className="text-foreground/80">
          Nilai berikut tidak diisi otomatis oleh sistem dan harus ditentukan oleh perusahaan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {kurang.map((k) => (
            <li key={k.label}>
              <Link href={k.href} className="underline-offset-4 hover:underline">
                {k.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
