import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { wajibAksesRute } from "@/lib/auth/sesi";
import { STATUS_MANIFES_AKTIF } from "@/lib/domain/manifes";
import { STATUS_ARMADA } from "@/lib/domain/status";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { FormManifes, type PilihanArmada, type PilihanSupirManifes } from "./form-manifes";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Buat Manifes" };

export default async function HalamanManifesBaru() {
  await wajibAksesRute("manifesBaru");
  const supabase = await buatKlienServer();
  const [{ data: armada, error: e1 }, { data: supir, error: e2 }, { data: aktif, error: e3 }] = await Promise.all([
    supabase.from("data_armada").select("id_armada, plat_nomor, jenis_unit, kapasitas_ton, id_supir, status").eq("is_active", true).order("plat_nomor"),
    supabase.from("data_pengguna").select("id_pengguna, nama_lengkap").eq("peran", "supir").eq("is_active", true).order("nama_lengkap"),
    supabase
      .from("manifes")
      .select("id_armada, id_supir, armada:data_armada!manifes_id_armada_fkey(plat_nomor)")
      .in("status_manifes", STATUS_MANIFES_AKTIF),
  ]);
  if (e1 || e2 || e3) throw new Error("Data armada atau supir gagal dimuat.");

  // Aturan yang sama ditegakkan buat_manifes(); di sini hanya untuk menonaktifkan pilihan.
  const pilihanArmada: PilihanArmada[] = (armada ?? []).map((a) => ({
    id: a.id_armada,
    plat: a.plat_nomor,
    jenis: a.jenis_unit,
    kapasitasTon: Number(a.kapasitas_ton),
    idSupir: a.id_supir,
    kendala: (aktif ?? []).some((m) => m.id_armada === a.id_armada)
      ? "perjalanan aktif"
      : a.status !== "siaga"
        ? STATUS_ARMADA[a.status as keyof typeof STATUS_ARMADA]?.label.toLowerCase() ?? a.status
        : null,
  }));
  const pilihanSupir: PilihanSupirManifes[] = (supir ?? []).map((s) => {
    const m = (aktif ?? []).find((x) => x.id_supir === s.id_pengguna);
    return { id: s.id_pengguna, nama: s.nama_lengkap, kendala: m ? `bertugas di ${relasiTunggal(m.armada)?.plat_nomor ?? "perjalanan lain"}` : null };
  });
  const adaArmada = pilihanArmada.some((a) => !a.kendala);

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/manifes">
            <ArrowLeft aria-hidden /> Kembali ke daftar manifes
          </Link>
        </Button>
      </div>
      <PageHeader judul="Buat Manifes" deskripsi="Pilih armada, supir, dan rute. Resi ditambahkan setelah manifes dibuat." />
      {!adaArmada ? (
        <EmptyState
          ikon={Truck}
          judul="Tidak ada armada yang tersedia"
          deskripsi="Semua armada aktif sedang dalam perjalanan, perbaikan, atau rusak. Selesaikan perjalanan atau perbarui status armada terlebih dahulu."
        />
      ) : !pilihanSupir.length ? (
        <EmptyState ikon={Truck} judul="Belum ada akun Supir aktif" deskripsi="Pemilik perlu menambahkan pengguna dengan peran Supir." />
      ) : (
        <FormManifes armada={pilihanArmada} supir={pilihanSupir} />
      )}
    </>
  );
}
