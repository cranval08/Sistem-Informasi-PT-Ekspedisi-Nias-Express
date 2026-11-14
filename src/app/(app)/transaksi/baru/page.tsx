import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import type { Satuan } from "@/lib/domain/transaksi";
import { buatKlienServer } from "@/lib/supabase/server";
import { FormTransaksi } from "./form-transaksi";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Buat Transaksi" };

export default async function HalamanTransaksiBaru() {
  const profil = await wajibAksesRute("transaksiBaru");
  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();
  const { data, error } = await supabase
    .from("data_item")
    .select("id_item, nama_item, satuan, tarif_per_satuan")
    .eq("is_active", true)
    .order("nama_item");

  return (
    <>
      <PageHeader judul="Buat Transaksi" deskripsi="Pilih pengirim dan penerima, isi barang, lalu simpan untuk membuat nomor resi." />
      {error ? (
        <EmptyState judul="Master jenis barang gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        <EmptyState
          ikon={Package}
          judul="Belum ada jenis barang aktif"
          deskripsi={
            profil.peran === "pemilik"
              ? "Transaksi membutuhkan minimal satu jenis barang beserta tarifnya."
              : "Transaksi membutuhkan minimal satu jenis barang beserta tarifnya. Minta Pemilik menambahkannya di menu Jenis Barang & Tarif."
          }
          aksi={
            profil.peran === "pemilik" ? (
              <Button asChild>
                <Link href="/master/item">Kelola Jenis Barang</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <FormTransaksi
          zonaWaktu={zonaWaktu}
          items={data.map((i) => ({ id: i.id_item, nama: i.nama_item, satuan: i.satuan as Satuan, tarif: Number(i.tarif_per_satuan) }))}
        />
      )}
    </>
  );
}
