import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";
import { FilterRentang, FilterTautan, nomorHalaman, Paginasi } from "@/components/app/daftar";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { labelRentang } from "@/lib/domain/laporan";
import { STATUS_KIRIM } from "@/lib/domain/status";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { ambilLaporanTransaksi, bacaFilterTransaksi, BATAS_EKSPOR, rincianBarang, totalLaporanTransaksi, UKURAN_HALAMAN } from "../data";
import { KepalaLaporan, paramRentang, Ringkas } from "../kepala-laporan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Laporan Transaksi" };

const PATH = "/laporan/transaksi";
const nama = (v: unknown) => relasiTunggal(v as { nama: string } | { nama: string }[] | null)?.nama ?? "—";

export default async function LaporanTransaksi(props: PageProps<"/laporan/transaksi">) {
  await wajibAksesRute("laporanTransaksi");
  const [{ zonaWaktu }, sp] = await Promise.all([ambilPengaturan(), props.searchParams]);
  const f = bacaFilterTransaksi(sp, zonaWaktu);
  const halaman = nomorHalaman(sp.hal);
  const [{ baris, total }, ringkas] = await Promise.all([ambilLaporanTransaksi(f, halaman), totalLaporanTransaksi(f)]);
  const param = { ...paramRentang(f.rentang), bayar: f.bayar, kirim: f.kirim, batal: f.batal };

  return (
    <>
      <KepalaLaporan
        judul="Laporan Transaksi"
        deskripsi="Transaksi menurut tanggal dibuat, lengkap dengan rincian barang, pembayaran, dan status pengiriman."
        jenis="transaksi"
        param={param}
      />
      <div className="space-y-3">
        <FilterRentang path={PATH} rentang={f.rentang} param={param} />
        <div className="flex flex-wrap gap-2">
          <FilterTautan path={PATH} param={param} kunci="bayar" label="Filter status pembayaran" aktif={f.bayar} pilihan={[{ nilai: undefined, label: "Semua pembayaran" }, { nilai: "lunas", label: "Lunas" }, { nilai: "belum_lunas", label: "Belum lunas" }]} />
          <FilterTautan
            path={PATH}
            param={param}
            kunci="kirim"
            label="Filter status pengiriman"
            aktif={f.kirim}
            pilihan={[{ nilai: undefined, label: "Semua status" }, ...Object.entries(STATUS_KIRIM).map(([k, v]) => ({ nilai: k, label: v.label }))]}
          />
          <FilterTautan path={PATH} param={param} kunci="batal" label="Transaksi dibatalkan" aktif={f.batal} pilihan={[{ nilai: undefined, label: "Tanpa dibatalkan" }, { nilai: "ya", label: "Sertakan dibatalkan" }]} />
        </div>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-5">
        <Ringkas label="Periode" nilai={labelRentang(f.rentang.dari, f.rentang.sampai)} />
        <Ringkas label="Jumlah transaksi" nilai={formatAngka(ringkas.jumlah, 0)} />
        <Ringkas label="Total biaya" nilai={formatRupiah(ringkas.biaya)} />
        <Ringkas label="Total dibayar" nilai={formatRupiah(ringkas.dibayar)} />
        <Ringkas label="Sisa pembayaran" nilai={formatRupiah(ringkas.biaya - ringkas.dibayar)} />
      </dl>
      {f.batal === "ya" && <p className="text-xs text-muted-foreground">Total biaya, dibayar, dan sisa tidak menghitung transaksi dibatalkan.</p>}
      {ringkas.terpotong && (
        <Alert>
          <AlertDescription>Lebih dari {formatAngka(BATAS_EKSPOR, 0)} transaksi cocok; total & ekspor dibatasi. Persempit periode.</AlertDescription>
        </Alert>
      )}

      {!baris.length ? (
        <EmptyState ikon={FileSearch} judul="Tidak ada transaksi pada filter ini" deskripsi="Ubah periode atau filter status." />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resi & waktu</TableHead>
                  <TableHead>Pengirim → Penerima</TableHead>
                  <TableHead>Rincian barang</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dibayar</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baris.map((t) => (
                  <TableRow key={t.no_resi} className={t.status_void ? "text-muted-foreground" : undefined}>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/transaksi/${t.no_resi}`} className="font-medium text-primary hover:underline">
                        {t.no_resi}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{formatTanggalWaktu(t.waktu_transaksi, zonaWaktu)}</span>
                    </TableCell>
                    <TableCell className="max-w-52">
                      <span className="block truncate">{nama(t.pengirim)}</span>
                      <span className="block truncate text-xs text-muted-foreground">→ {nama(t.penerima)}</span>
                    </TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal">{rincianBarang(t.detail)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(t.total_biaya)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(t.total_dibayar)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(Number(t.total_biaya) - Number(t.total_dibayar))}</TableCell>
                    <TableCell>
                      {t.status_void ? (
                        <StatusBadge jenis="manifes" nilai="dibatalkan" />
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          <StatusBadge jenis="bayar" nilai={t.status_bayar} />
                          <StatusBadge jenis="kirim" nilai={t.status_kirim} />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Paginasi path={PATH} param={param} halaman={halaman} ukuran={UKURAN_HALAMAN} total={total} />
        </div>
      )}
    </>
  );
}
