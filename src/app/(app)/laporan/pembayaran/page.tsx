import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { FilterRentang, FilterTautan, nomorHalaman, Paginasi } from "@/components/app/daftar";
import { EmptyState } from "@/components/app/states";
import { BadgeNada } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { labelRentang } from "@/lib/domain/laporan";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { ambilLaporanPembayaran, bacaFilterPembayaran, totalPembayaran, UKURAN_HALAMAN } from "../data";
import { KepalaLaporan, paramRentang, Ringkas } from "../kepala-laporan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Laporan Pembayaran" };

const PATH = "/laporan/pembayaran";
const namaPengguna = (v: unknown) => relasiTunggal(v as { nama_lengkap: string } | { nama_lengkap: string }[] | null)?.nama_lengkap ?? "—";

export default async function LaporanPembayaran(props: PageProps<"/laporan/pembayaran">) {
  await wajibAksesRute("laporanBayar");
  const [{ zonaWaktu }, sp] = await Promise.all([ambilPengaturan(), props.searchParams]);
  const f = bacaFilterPembayaran(sp, zonaWaktu);
  const halaman = nomorHalaman(sp.hal);
  const [{ baris, total }, rekap] = await Promise.all([ambilLaporanPembayaran(f, zonaWaktu, halaman), totalPembayaran(f)]);
  const param = { ...paramRentang(f.rentang), status: f.status };

  return (
    <>
      <KepalaLaporan
        judul="Laporan Pembayaran & Kas"
        deskripsi={`Pembayaran menurut waktu bayar (${zonaWaktu}). Total penerimaan hanya menghitung pembayaran valid.`}
        jenis="pembayaran"
        param={param}
      />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <FilterRentang path={PATH} rentang={f.rentang} param={param} />
        <FilterTautan
          path={PATH}
          param={param}
          kunci="status"
          label="Filter status pembayaran"
          aktif={f.status}
          pilihan={[{ nilai: undefined, label: "Valid" }, { nilai: "dibatalkan", label: "Dibatalkan" }, { nilai: "semua", label: "Semua" }]}
        />
      </div>

      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-4">
        <Ringkas label="Periode" nilai={labelRentang(f.rentang.dari, f.rentang.sampai)} />
        <Ringkas label="Total penerimaan" nilai={formatRupiah(rekap.diterima)} />
        <Ringkas label="Jumlah pembayaran valid" nilai={formatAngka(rekap.jumlah, 0)} />
        <Ringkas label="Dibatalkan" nilai={`${formatAngka(rekap.jumlahBatal, 0)} · ${formatRupiah(rekap.dibatalkan)}`} />
      </dl>

      {rekap.perPencatat.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Penerimaan per pencatat</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pencatat</TableHead>
                    <TableHead className="text-right">Pembayaran valid</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                    <TableHead className="text-right">Dibatalkan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rekap.perPencatat.map((p) => (
                    <TableRow key={p.nama}>
                      <TableCell>{p.nama}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAngka(p.jumlah, 0)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatRupiah(p.diterima)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.jumlahBatal ? `${p.jumlahBatal} · ${formatRupiah(p.dibatalkan)}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!baris.length ? (
        <EmptyState ikon={Wallet} judul="Tidak ada pembayaran pada filter ini" deskripsi="Ubah periode atau status." />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu bayar</TableHead>
                  <TableHead>Nomor resi</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Pencatat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baris.map((b) => {
                  const batal = b.status_pembayaran_record === "dibatalkan";
                  return (
                    <TableRow key={b.id_pembayaran} className={batal ? "text-muted-foreground" : undefined}>
                      <TableCell className="whitespace-nowrap">{formatTanggalWaktu(b.waktu_bayar, zonaWaktu)}</TableCell>
                      <TableCell>
                        <Link href={`/transaksi/${b.no_resi}`} className="font-medium text-primary hover:underline">
                          {b.no_resi}
                        </Link>
                      </TableCell>
                      <TableCell className={batal ? "text-right tabular-nums line-through" : "text-right font-medium tabular-nums"}>{formatRupiah(b.jumlah_bayar)}</TableCell>
                      <TableCell>{namaPengguna(b.pencatat)}</TableCell>
                      <TableCell>{batal ? <BadgeNada nada="neutral" label="Dibatalkan" /> : <BadgeNada nada="success" label="Valid" />}</TableCell>
                      <TableCell className="max-w-64 text-xs whitespace-normal">
                        {b.catatan}
                        {batal && b.catatan_koreksi && <span className="block">Alasan batal: {b.catatan_koreksi} ({namaPengguna(b.pembatal)})</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Paginasi path={PATH} param={param} halaman={halaman} ukuran={UKURAN_HALAMAN} total={total} />
        </div>
      )}
    </>
  );
}
