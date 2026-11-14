import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { FilterRentang } from "@/components/app/daftar";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka } from "@/lib/domain/format";
import { labelRentang } from "@/lib/domain/laporan";
import { hitungKapasitas, keGram } from "@/lib/domain/manifes";
import { ambilKebijakanKapasitas } from "../../manifes/data";
import { ambilLaporanArmada, bacaFilterArmada } from "../data";
import { KepalaLaporan, paramRentang, Ringkas } from "../kepala-laporan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Laporan Armada & Tonase" };

const PATH = "/laporan/armada";

export default async function LaporanArmada(props: PageProps<"/laporan/armada">) {
  await wajibAksesRute("laporanArmada");
  const [{ zonaWaktu }, sp] = await Promise.all([ambilPengaturan(), props.searchParams]);
  const { rentang } = bacaFilterArmada(sp, zonaWaktu);
  const [baris, { ambang }] = await Promise.all([ambilLaporanArmada(rentang), ambilKebijakanKapasitas()]);
  const param = paramRentang(rentang);
  const perjalanan = baris.reduce((n, a) => n + a.jumlah_perjalanan, 0);
  const totalKg = baris.reduce((n, a) => n + Math.round(Number(a.total_muatan_kg) * 1000), 0) / 1000;

  return (
    <>
      <KepalaLaporan
        judul="Laporan Armada & Tonase"
        deskripsi="Status dan muatan aktif saat ini, serta utilisasi perjalanan yang berangkat dalam periode (terhadap kapasitas armada saat ini)."
        jenis="armada"
        param={param}
      />
      <FilterRentang path={PATH} rentang={rentang} param={param} />
      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-4">
        <Ringkas label="Periode" nilai={labelRentang(rentang.dari, rentang.sampai)} />
        <Ringkas label="Armada" nilai={formatAngka(baris.length, 0)} />
        <Ringkas label="Perjalanan berangkat" nilai={formatAngka(perjalanan, 0)} />
        <Ringkas label="Total muatan diangkut" nilai={`${formatAngka(totalKg)} kg`} />
      </dl>
      {ambang === null && (
        <p className="text-sm text-muted-foreground">
          Ambang peringatan kapasitas belum diisi —{" "}
          <Link href="/pengaturan" className="text-primary underline-offset-4 hover:underline">
            perlu dilengkapi di Pengaturan
          </Link>
          .
        </p>
      )}

      {!baris.length ? (
        <EmptyState ikon={Truck} judul="Belum ada data armada" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Armada</TableHead>
                <TableHead>Supir</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-56">Muatan aktif / kapasitas</TableHead>
                <TableHead className="text-right">Perjalanan</TableHead>
                <TableHead className="text-right">Total muatan</TableHead>
                <TableHead className="text-right">Utilisasi rata-rata</TableHead>
                <TableHead className="text-right">Tertinggi</TableHead>
                <TableHead className="text-right">Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {baris.map((a) => (
                <TableRow key={a.id_armada} className={a.is_active ? undefined : "text-muted-foreground"}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/armada/${a.id_armada}`} className="font-medium text-primary hover:underline">
                      {a.plat_nomor}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {a.jenis_unit === "besar" ? "Besar" : "Kecil"} · {formatAngka(a.kapasitas_ton)} ton{!a.is_active && " · nonaktif"}
                    </span>
                  </TableCell>
                  <TableCell>{a.supir ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge jenis="armada" nilai={a.status} />
                  </TableCell>
                  <TableCell>
                    {a.id_manifes_aktif ? (
                      <Link href={`/manifes/${a.id_manifes_aktif}`} className="block hover:opacity-90">
                        <MeterKapasitas hasil={hitungKapasitas(keGram(a.muatan_aktif_kg ?? 0), a.kapasitas_ton, ambang)} ambang={ambang} ringkas />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Tidak ada manifes aktif</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.jumlah_perjalanan}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAngka(a.total_muatan_kg)} kg</TableCell>
                  <TableCell className="text-right tabular-nums">{a.rata_utilisasi_persen === null ? "—" : `${formatAngka(a.rata_utilisasi_persen, 1)}%`}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.maks_utilisasi_persen === null ? "—" : `${formatAngka(a.maks_utilisasi_persen, 1)}%`}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.jumlah_override}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
