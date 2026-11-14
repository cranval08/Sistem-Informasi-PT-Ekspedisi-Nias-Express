import type { Metadata } from "next";
import Link from "next/link";
import { History, Package } from "lucide-react";
import { FilterTautan, paramTunggal } from "@/components/app/daftar";
import { PageHeader } from "@/components/app/page-header";
import { RiwayatAudit } from "@/components/app/riwayat-audit";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { SATUAN } from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";
import { AksiBarisItem, TombolTambahItem, type BarisItem } from "./form-item";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Jenis Barang & Tarif" };

const PATH = "/master/item";

export default async function HalamanItem(props: PageProps<"/master/item">) {
  await wajibAksesRute("masterItem");
  const sp = await props.searchParams;
  const status = paramTunggal(sp.status);
  const riwayat = paramTunggal(sp.riwayat);

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();
  let kueri = supabase
    .from("data_item")
    .select("id_item, nama_item, satuan, tarif_per_satuan, is_active, updated_at")
    .order("nama_item");
  if (status !== "semua") kueri = kueri.eq("is_active", status !== "nonaktif");
  const { data, error } = await kueri;

  // Nama untuk riwayat (termasuk item nonaktif yang mungkin tersaring).
  const { data: semua } = await supabase.from("data_item").select("id_item, nama_item");
  const nama = Object.fromEntries((semua ?? []).map((i) => [i.id_item, i.nama_item]));
  const riwayatValid = riwayat && nama[riwayat] ? riwayat : undefined;

  return (
    <>
      <PageHeader
        judul="Jenis Barang & Tarif"
        deskripsi="Master jenis barang yang dipilih admin saat transaksi. Hanya Pemilik yang dapat menambah atau mengubah tarif."
        aksi={<TombolTambahItem />}
      />

      <FilterTautan
        path={PATH}
        param={{ status }}
        kunci="status"
        aktif={status}
        label="Filter status jenis barang"
        pilihan={[
          { nilai: undefined, label: "Aktif" },
          { nilai: "nonaktif", label: "Nonaktif" },
          { nilai: "semua", label: "Semua" },
        ]}
      />

      {error ? (
        <EmptyState judul="Data jenis barang gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        <EmptyState
          ikon={Package}
          judul={status ? "Tidak ada jenis barang pada filter ini" : "Belum ada jenis barang"}
          deskripsi="Tambahkan jenis barang beserta satuan dan tarif yang ditetapkan perusahaan. Transaksi baru membutuhkan minimal satu jenis barang aktif."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama jenis barang</TableHead>
                <TableHead>Satuan</TableHead>
                <TableHead className="text-right">Tarif per satuan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Terakhir diubah</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((i) => {
                const baris: BarisItem = {
                  id: i.id_item,
                  nama: i.nama_item,
                  satuan: i.satuan as (typeof SATUAN)[number],
                  tarif: Number(i.tarif_per_satuan),
                  aktif: i.is_active,
                };
                return (
                  <TableRow key={i.id_item}>
                    <TableCell className="font-medium">{i.nama_item}</TableCell>
                    <TableCell>{i.satuan}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(i.tarif_per_satuan)} <span className="text-muted-foreground">/ {i.satuan}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge jenis="akun" nilai={i.is_active ? "aktif" : "nonaktif"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatTanggalWaktu(i.updated_at, zonaWaktu)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`${PATH}?riwayat=${i.id_item}${status ? `&status=${status}` : ""}#riwayat`} scroll={false}>
                            <History aria-hidden /> Riwayat
                          </Link>
                        </Button>
                        <AksiBarisItem item={baris} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <section id="riwayat" className="space-y-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Riwayat perubahan {riwayatValid ? `— ${nama[riwayatValid]}` : "terbaru"}
          </h2>
          {riwayatValid && (
            <Link href={`${PATH}${status ? `?status=${status}` : ""}#riwayat`} className="text-sm text-primary hover:underline">
              Tampilkan semua jenis barang
            </Link>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Dicatat otomatis dari audit log: siapa, kapan, nilai lama, dan nilai baru.</p>
        <RiwayatAudit entitas="data_item" entitasId={riwayatValid} namaEntitas={nama} zonaWaktu={zonaWaktu} />
      </section>
    </>
  );
}
