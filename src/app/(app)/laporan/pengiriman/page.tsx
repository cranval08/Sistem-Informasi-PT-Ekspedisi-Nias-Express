import type { Metadata } from "next";
import Link from "next/link";
import { History, PackageCheck, Truck } from "lucide-react";
import { FilterRentang, FilterTautan, nomorHalaman, Paginasi } from "@/components/app/daftar";
import { GrafikBatang } from "@/components/app/grafik";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { labelRentang } from "@/lib/domain/laporan";
import { STATUS_KIRIM } from "@/lib/domain/status";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import type { Ringkasan } from "../../dashboard/pemilik";
import { ambilRiwayatPengiriman, bacaFilterPengiriman, UKURAN_HALAMAN } from "../data";
import { KepalaLaporan, paramRentang } from "../kepala-laporan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Laporan Pengiriman" };

const PATH = "/laporan/pengiriman";
const BATAS_DAFTAR = 100;

export default async function LaporanPengiriman(props: PageProps<"/laporan/pengiriman">) {
  await wajibAksesRute("laporanKirim");
  const [{ zonaWaktu }, sp] = await Promise.all([ambilPengaturan(), props.searchParams]);
  const f = bacaFilterPengiriman(sp, zonaWaktu);
  const halaman = nomorHalaman(sp.hal);
  const param = { ...paramRentang(f.rentang), status: f.status };

  const supabase = await buatKlienServer();
  const kolomResi = `no_resi, updated_at, total_berat_kg,
    penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama),
    armada:data_armada!data_transaksi_id_armada_fkey(plat_nomor)`;
  const [ringkasanQ, jalanQ, tibaQ, riwayat] = await Promise.all([
    supabase.rpc("ringkasan_operasional", { p_dari: f.rentang.dari, p_sampai: f.rentang.sampai }).single(),
    supabase.from("data_transaksi").select(kolomResi, { count: "exact" }).eq("status_kirim", "dalam_perjalanan").eq("status_void", false).order("updated_at").limit(BATAS_DAFTAR),
    supabase.from("data_transaksi").select(kolomResi, { count: "exact" }).eq("status_kirim", "tiba").eq("status_void", false).order("updated_at").limit(BATAS_DAFTAR),
    ambilRiwayatPengiriman(f, zonaWaktu, halaman),
  ]);
  const galat = ringkasanQ.error ?? jalanQ.error ?? tibaQ.error;
  if (galat) throw new Error(`Laporan pengiriman gagal dimuat (${galat.code ?? "tanpa kode"}).`);
  const r = ringkasanQ.data as Ringkasan;

  return (
    <>
      <KepalaLaporan
        judul="Laporan Pengiriman"
        deskripsi="Jumlah barang per status, barang dalam perjalanan, barang tiba yang belum diambil, dan riwayat perubahan status. Ekspor CSV berisi riwayat perubahan status sesuai filter."
        jenis="pengiriman"
        param={param}
      />
      <FilterRentang path={PATH} rentang={f.rentang} param={param} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Jumlah barang menurut status</CardTitle>
            <CardDescription>Transaksi tanggal {labelRentang(f.rentang.dari, f.rentang.sampai)}, status terkini</CardDescription>
          </CardHeader>
          <CardContent>
            <GrafikBatang
              labelTabel="Jumlah resi"
              satuan="resi"
              data={Object.entries(STATUS_KIRIM).map(([k, v]) => ({ label: v.label, nilai: Number(r[`jumlah_${k}` as keyof Ringkasan] ?? 0) }))}
            />
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <DaftarResi judul="Dalam perjalanan" deskripsi="Saat ini, terlama lebih dulu" ikon="jalan" data={jalanQ.data ?? []} total={jalanQ.count ?? 0} zonaWaktu={zonaWaktu} />
          <DaftarResi judul="Tiba, belum diambil" deskripsi="Saat ini, terlama lebih dulu" ikon="tiba" data={tibaQ.data ?? []} total={tibaQ.count ?? 0} zonaWaktu={zonaWaktu} />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="size-4" aria-hidden /> Riwayat perubahan status
          </h2>
          <FilterTautan
            path={PATH}
            param={param}
            kunci="status"
            label="Filter status baru"
            aktif={f.status}
            pilihan={[{ nilai: undefined, label: "Semua" }, ...Object.entries(STATUS_KIRIM).map(([k, v]) => ({ nilai: k, label: v.label }))]}
          />
        </div>
        {!riwayat.baris.length ? (
          <EmptyState ikon={History} judul="Tidak ada perubahan status pada filter ini" />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Nomor resi</TableHead>
                    <TableHead>Perubahan</TableHead>
                    <TableHead>Oleh</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riwayat.baris.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">{formatTanggalWaktu(h.waktu_perubahan, zonaWaktu)}</TableCell>
                      <TableCell>
                        <Link href={`/transaksi/${h.no_resi}`} className="font-medium text-primary hover:underline">
                          {h.no_resi}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1">
                          {h.status_sebelumnya ? <StatusBadge jenis="kirim" nilai={h.status_sebelumnya} /> : <span className="text-xs text-muted-foreground">Baru</span>}
                          <span aria-hidden>→</span>
                          <span className="sr-only">menjadi</span>
                          <StatusBadge jenis="kirim" nilai={h.status_baru} />
                        </span>
                      </TableCell>
                      <TableCell>{relasiTunggal(h.pengguna as { nama_lengkap: string } | null)?.nama_lengkap ?? "Sistem"}</TableCell>
                      <TableCell className="max-w-72 text-xs whitespace-normal">{h.catatan}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Paginasi path={PATH} param={param} halaman={halaman} ukuran={UKURAN_HALAMAN} total={riwayat.total} />
          </>
        )}
      </section>
    </>
  );
}

function DaftarResi({
  judul,
  deskripsi,
  ikon,
  data,
  total,
  zonaWaktu,
}: {
  judul: string;
  deskripsi: string;
  ikon: "jalan" | "tiba";
  data: { no_resi: string; updated_at: string; total_berat_kg: number; penerima: unknown; armada: unknown }[];
  total: number;
  zonaWaktu: string;
}) {
  const Ikon = ikon === "jalan" ? Truck : PackageCheck;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ikon className="size-4" aria-hidden /> {judul} <span className="text-muted-foreground">({formatAngka(total, 0)})</span>
        </CardTitle>
        <CardDescription>{deskripsi}</CardDescription>
      </CardHeader>
      <CardContent>
        {!data.length ? (
          <p className="text-sm text-muted-foreground">Tidak ada.</p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
            {data.map((t) => (
              <li key={t.no_resi} className="flex items-center justify-between gap-2 p-2.5">
                <span className="min-w-0">
                  <Link href={`/transaksi/${t.no_resi}`} className="font-medium text-primary hover:underline">
                    {t.no_resi}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {relasiTunggal(t.penerima as { nama: string } | null)?.nama ?? "—"}
                    {ikon === "jalan" && ` · ${relasiTunggal(t.armada as { plat_nomor: string } | null)?.plat_nomor ?? "—"}`} · diperbarui {formatTanggalWaktu(t.updated_at, zonaWaktu)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatAngka(t.total_berat_kg)} kg</span>
              </li>
            ))}
            {total > data.length && <li className="p-2.5 text-xs text-muted-foreground">Menampilkan {data.length} dari {total}.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
