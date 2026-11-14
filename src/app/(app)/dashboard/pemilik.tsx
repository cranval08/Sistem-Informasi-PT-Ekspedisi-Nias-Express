import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CircleCheck,
  ClipboardList,
  Copy,
  PackageCheck,
  PackageOpen,
  ReceiptText,
  ShieldAlert,
  Truck,
  Warehouse,
} from "lucide-react";
import { FilterRentang, FilterTautan, paramTunggal, rentangDariParam } from "@/components/app/daftar";
import { GrafikBatang, GrafikKolom } from "@/components/app/grafik";
import { KpiCard } from "@/components/app/kpi-card";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { LABEL_SATUAN_GRAFIK, labelEmber, labelRentang, SATUAN_GRAFIK, satuanGrafik } from "@/lib/domain/laporan";
import { hitungKapasitas, keGram } from "@/lib/domain/manifes";
import { STATUS_KIRIM } from "@/lib/domain/status";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilKebijakanKapasitas } from "../manifes/data";
import { DaftarPeringatan } from "./admin";
import { WaktuData } from "./waktu-data";

const PATH = "/dashboard";

export type Ringkasan = {
  jumlah_transaksi: number;
  total_biaya: number;
  total_berat_kg: number;
  jumlah_lunas: number;
  jumlah_belum_lunas: number;
  sisa_tagihan: number;
  jumlah_diterima_loket: number;
  jumlah_dimuat: number;
  jumlah_dalam_perjalanan: number;
  jumlah_tiba: number;
  jumlah_sudah_diambil: number;
  jumlah_void: number;
  total_diterima: number;
  jumlah_pembayaran: number;
  total_dibatalkan: number;
  jumlah_pembayaran_dibatalkan: number;
  peringatan_duplikat: number;
  duplikat_dikonfirmasi: number;
  override_kapasitas: number;
  override_belum_lunas: number;
  peringatan_kapasitas: number | null;
};

export type BarisArmada = {
  id_armada: string;
  plat_nomor: string;
  jenis_unit: string;
  kapasitas_ton: number;
  status: string;
  is_active: boolean;
  supir: string | null;
  id_manifes_aktif: string | null;
  status_manifes_aktif: string | null;
  rute_aktif: string | null;
  muatan_aktif_kg: number | null;
  jumlah_perjalanan: number;
  total_muatan_kg: number;
  rata_utilisasi_persen: number | null;
  maks_utilisasi_persen: number | null;
  jumlah_override: number;
};

type Tren = { awal: string; akhir: string; jumlah_transaksi: number; total_biaya: number; total_diterima: number };

/** Dashboard Pemilik (PRD §7.2): semua kartu & grafik mengikuti filter periode. */
export async function DashboardPemilik({ sp, zonaWaktu }: { sp: Record<string, string | string[] | undefined>; zonaWaktu: string }) {
  const rentang = rentangDariParam(sp, zonaWaktu, "7_hari");
  const satuan = satuanGrafik(rentang.dari, rentang.sampai, paramTunggal(sp.grafik));
  const param = { periode: rentang.periode === "khusus" ? undefined : rentang.periode, dari: rentang.periode === "khusus" ? rentang.dari : undefined, sampai: rentang.periode === "khusus" ? rentang.sampai : undefined, grafik: paramTunggal(sp.grafik) };

  const supabase = await buatKlienServer();
  const [ringkasanQ, trenQ, armadaQ, terbaruQ, peringatanQ, { ambang }] = await Promise.all([
    supabase.rpc("ringkasan_operasional", { p_dari: rentang.dari, p_sampai: rentang.sampai }).single(),
    supabase.rpc("tren_operasional", { p_dari: rentang.dari, p_sampai: rentang.sampai, p_satuan: satuan }),
    supabase.rpc("laporan_armada", { p_dari: rentang.dari, p_sampai: rentang.sampai }),
    supabase
      .from("data_transaksi")
      .select(
        `no_resi, waktu_transaksi, total_biaya, status_bayar, status_kirim, status_void,
         pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama),
         penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama)`,
      )
      .gte("tanggal_transaksi", rentang.dari)
      .lte("tanggal_transaksi", rentang.sampai)
      .order("waktu_transaksi", { ascending: false })
      .limit(8),
    supabase.rpc("peringatan_data"),
    ambilKebijakanKapasitas(),
  ]);
  const galat = ringkasanQ.error ?? trenQ.error ?? armadaQ.error ?? terbaruQ.error ?? peringatanQ.error;
  if (galat) throw new Error(`Dashboard gagal dimuat (${galat.code ?? "tanpa kode"}).`);

  const r = ringkasanQ.data as Ringkasan;
  const tren = (trenQ.data ?? []) as Tren[];
  const armada = ((armadaQ.data ?? []) as BarisArmada[]).filter((a) => a.is_active);
  const kapasitasAktif = armada
    .filter((a) => a.id_manifes_aktif)
    .map((a) => ({ a, hasil: hitungKapasitas(keGram(a.muatan_aktif_kg ?? 0), a.kapasitas_ton, ambang) }));
  const peringatan = kapasitasAktif.filter((k) => k.hasil.tingkat === "peringatan" || k.hasil.tingkat === "penuh" || k.hasil.tingkat === "melebihi");
  const titik = tren.map((t) => ({ ...labelEmber(t.awal, t.akhir, satuan), t }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <FilterRentang path={PATH} rentang={rentang} param={param} />
        <WaktuData zonaWaktu={zonaWaktu} />
      </div>
      <p className="text-sm text-muted-foreground">
        Periode: <span className="font-medium text-foreground">{labelRentang(rentang.dari, rentang.sampai)}</span> · transaksi menurut tanggal dibuat,
        status pengiriman menurut kondisi terkini.
      </p>

      <section aria-label="Ringkasan KPI" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total transaksi" nilai={formatAngka(r.jumlah_transaksi, 0)} keterangan={`${formatAngka(r.total_berat_kg)} kg · ${formatRupiah(r.total_biaya)}`} ikon={ReceiptText} />
        <KpiCard label="Penerimaan pembayaran" nilai={formatRupiah(r.total_diterima)} keterangan={`${formatAngka(r.jumlah_pembayaran, 0)} pembayaran valid`} ikon={Banknote} />
        <KpiCard label="Transaksi belum lunas" nilai={formatAngka(r.jumlah_belum_lunas, 0)} keterangan={`Sisa tagihan ${formatRupiah(r.sisa_tagihan)}`} ikon={AlertTriangle} />
        <KpiCard label="Barang diterima di loket" nilai={formatAngka(r.jumlah_diterima_loket, 0)} ikon={Warehouse} />
        <KpiCard label="Barang dimuat" nilai={formatAngka(r.jumlah_dimuat, 0)} ikon={PackageOpen} />
        <KpiCard label="Dalam perjalanan" nilai={formatAngka(r.jumlah_dalam_perjalanan, 0)} ikon={Truck} />
        <KpiCard label="Barang tiba" nilai={formatAngka(r.jumlah_tiba, 0)} keterangan="Menunggu diambil penerima" ikon={PackageCheck} />
        <KpiCard label="Sudah diambil" nilai={formatAngka(r.jumlah_sudah_diambil, 0)} ikon={CircleCheck} />
      </section>

      <section aria-labelledby="judul-indikator" className="space-y-2">
        <h2 id="judul-indikator" className="text-sm font-medium text-muted-foreground">
          Indikator kontrol periode ini
        </h2>
        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-3 xl:grid-cols-6">
          <Indikator label="Peringatan duplikasi" nilai={r.peringatan_duplikat} keterangan={`${formatAngka(r.duplikat_dikonfirmasi, 0)} tetap disimpan`} ikon={Copy} />
          <Indikator
            label="Peringatan kapasitas"
            nilai={r.peringatan_kapasitas}
            keterangan={r.peringatan_kapasitas === null ? "Ambang perlu dilengkapi" : "Muatan ≥ ambang saat dimuat"}
            href={r.peringatan_kapasitas === null ? "/pengaturan" : undefined}
            ikon={Truck}
          />
          <Indikator label="Override kapasitas" nilai={r.override_kapasitas} ikon={ShieldAlert} />
          <Indikator label="Override belum lunas" nilai={r.override_belum_lunas} ikon={ShieldAlert} />
          <Indikator label="Transaksi dibatalkan" nilai={r.jumlah_void} ikon={ClipboardList} />
          <Indikator label="Pembayaran dibatalkan" nilai={r.jumlah_pembayaran_dibatalkan} keterangan={formatRupiah(r.total_dibatalkan)} ikon={Banknote} />
        </dl>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Tren periode</h2>
        <FilterTautan
          path={PATH}
          param={param}
          kunci="grafik"
          label="Satuan grafik"
          aktif={satuan}
          pilihan={SATUAN_GRAFIK.map((s) => ({ nilai: s, label: LABEL_SATUAN_GRAFIK[s] }))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jumlah transaksi</CardTitle>
            <CardDescription>{LABEL_SATUAN_GRAFIK[satuan]}, tidak termasuk transaksi dibatalkan</CardDescription>
          </CardHeader>
          <CardContent>
            <GrafikKolom data={titik.map((p) => ({ label: p.label, labelPanjang: p.labelPanjang, nilai: p.t.jumlah_transaksi }))} satuan="transaksi" labelTabel="Jumlah transaksi" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Penerimaan pembayaran</CardTitle>
            <CardDescription>{LABEL_SATUAN_GRAFIK[satuan]}, menurut waktu bayar (pembayaran valid)</CardDescription>
          </CardHeader>
          <CardContent>
            <GrafikKolom data={titik.map((p) => ({ label: p.label, labelPanjang: p.labelPanjang, nilai: Number(p.t.total_diterima) }))} format="rupiah" labelTabel="Penerimaan" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Distribusi status pengiriman</CardTitle>
            <CardDescription>Transaksi periode ini menurut status terkini</CardDescription>
          </CardHeader>
          <CardContent>
            <GrafikBatang
              labelTabel="Jumlah resi"
              satuan="resi"
              data={[
                { label: STATUS_KIRIM.diterima_loket.label, nilai: r.jumlah_diterima_loket },
                { label: STATUS_KIRIM.dimuat.label, nilai: r.jumlah_dimuat },
                { label: STATUS_KIRIM.dalam_perjalanan.label, nilai: r.jumlah_dalam_perjalanan },
                { label: STATUS_KIRIM.tiba.label, nilai: r.jumlah_tiba },
                { label: STATUS_KIRIM.sudah_diambil.label, nilai: r.jumlah_sudah_diambil },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Armada & utilisasi tonase</CardTitle>
              <CardDescription>Muatan manifes aktif terhadap kapasitas; utilisasi rata-rata perjalanan berangkat dalam periode</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/laporan/armada">Laporan</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {peringatan.length > 0 && (
              <Alert variant={peringatan.some((p) => p.hasil.tingkat === "melebihi") ? "destructive" : "default"}>
                <AlertTriangle aria-hidden />
                <AlertTitle>Peringatan kapasitas truk</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {peringatan.map(({ a, hasil }) => (
                      <li key={a.id_armada}>
                        <Link href={`/manifes/${a.id_manifes_aktif}`} className="font-medium underline-offset-4 hover:underline">
                          {a.plat_nomor}
                        </Link>{" "}
                        {hasil.tingkat === "melebihi" ? "melebihi kapasitas" : hasil.tingkat === "penuh" ? "tepat penuh" : "melewati ambang"} ({hasil.persen}%)
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {!armada.length ? (
              <EmptyState ikon={Truck} judul="Belum ada armada aktif" className="py-8" />
            ) : (
              <ul className="divide-y rounded-lg border">
                {armada.map((a) => {
                  const k = kapasitasAktif.find((x) => x.a.id_armada === a.id_armada);
                  return (
                    <li key={a.id_armada} className="grid gap-2 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <Link href={`/armada/${a.id_armada}`} className="font-medium text-primary hover:underline">
                            {a.plat_nomor}
                          </Link>
                          <StatusBadge jenis="armada" nilai={a.status} />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatAngka(a.kapasitas_ton)} ton · {a.supir ?? "Supir belum ditetapkan"}
                          {a.jumlah_perjalanan > 0 && ` · ${a.jumlah_perjalanan} perjalanan, rata-rata ${formatAngka(a.rata_utilisasi_persen ?? 0, 1)}%`}
                        </p>
                      </div>
                      {k ? (
                        <MeterKapasitas hasil={k.hasil} ambang={ambang} ringkas />
                      ) : (
                        <p className="text-xs text-muted-foreground">Tidak ada manifes aktif.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>Aktivitas transaksi terbaru</CardTitle>
            <CardDescription>Dalam periode terpilih</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/laporan/transaksi">Laporan</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <TabelTransaksiRingkas baris={terbaruQ.data ?? []} zonaWaktu={zonaWaktu} />
        </CardContent>
      </Card>
      <DaftarPeringatan peringatan={(peringatanQ.data ?? []) as Parameters<typeof DaftarPeringatan>[0]["peringatan"]} zonaWaktu={zonaWaktu} />
      </div>
    </div>
  );
}

function Indikator({
  label,
  nilai,
  keterangan,
  href,
  ikon: Ikon,
}: {
  label: string;
  nilai: number | null;
  keterangan?: string;
  href?: string;
  ikon: typeof Copy;
}) {
  return (
    <div className="bg-card p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Ikon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className="text-xl font-semibold">{nilai === null ? "—" : formatAngka(nilai, 0)}</dd>
      {keterangan && (
        <dd className="text-xs text-muted-foreground">
          {href ? (
            <Link href={href} className="text-warning underline-offset-4 hover:underline">
              {keterangan}
            </Link>
          ) : (
            keterangan
          )}
        </dd>
      )}
    </div>
  );
}

const namaRelasi = (v: unknown) => relasiTunggal(v as { nama: string } | { nama: string }[] | null)?.nama ?? "—";

type BarisRingkas = {
  no_resi: string;
  waktu_transaksi: string;
  total_biaya: number;
  status_bayar: string;
  status_kirim: string;
  status_void: boolean;
  pengirim: unknown;
  penerima: unknown;
};

/** Tabel transaksi singkat (dipakai dashboard Pemilik & Admin Loket). */
export function TabelTransaksiRingkas({ baris, zonaWaktu }: { baris: BarisRingkas[]; zonaWaktu: string }) {
  if (!baris.length) return <EmptyState ikon={ReceiptText} judul="Belum ada transaksi" deskripsi="Transaksi yang dibuat di loket akan tampil di sini." className="py-8" />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resi</TableHead>
            <TableHead>Waktu</TableHead>
            <TableHead>Pengirim → Penerima</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baris.map((t) => (
            <TableRow key={t.no_resi} className={t.status_void ? "text-muted-foreground" : undefined}>
              <TableCell>
                <Link href={`/transaksi/${t.no_resi}`} className="font-medium text-primary hover:underline">
                  {t.no_resi}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatTanggalWaktu(t.waktu_transaksi, zonaWaktu)}</TableCell>
              <TableCell className="max-w-64 truncate">
                {namaRelasi(t.pengirim)} → {namaRelasi(t.penerima)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatRupiah(t.total_biaya)}</TableCell>
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
  );
}
