import Link from "next/link";
import { AlertTriangle, CheckCircle2, ReceiptText, Wallet } from "lucide-react";
import { FormPencarian } from "@/components/app/daftar";
import { KpiCard } from "@/components/app/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAngka, formatTanggalWaktu, tanggalOperasional } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";
import { TabelTransaksiRingkas } from "./pemilik";
import { WaktuData } from "./waktu-data";

type Peringatan = { jenis: string; no_resi: string; keterangan: string; waktu: string | null };

const LABEL_PERINGATAN: Record<string, string> = {
  tiba_belum_lunas: "Tiba, belum lunas",
  selisih_pembayaran: "Selisih pembayaran",
  void_berpembayaran: "Dibatalkan berpembayaran",
  diambil_belum_lunas: "Diambil belum lunas",
  status_tanpa_manifes: "Status tanpa manifes",
};

/** Dashboard Admin Loket (PRD §7.3). */
export async function DashboardAdmin({ zonaWaktu }: { zonaWaktu: string }) {
  const supabase = await buatKlienServer();
  const hariIni = tanggalOperasional(zonaWaktu);
  const [hariIniQ, belumLunasQ, terbaruQ, peringatanQ] = await Promise.all([
    supabase.from("data_transaksi").select("*", { count: "exact", head: true }).eq("tanggal_transaksi", hariIni).eq("status_void", false),
    supabase.from("data_transaksi").select("*", { count: "exact", head: true }).eq("status_bayar", "belum_lunas").eq("status_void", false),
    supabase
      .from("data_transaksi")
      .select(
        `no_resi, waktu_transaksi, total_biaya, status_bayar, status_kirim, status_void,
         pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama),
         penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama)`,
      )
      .order("waktu_transaksi", { ascending: false })
      .limit(10),
    supabase.rpc("peringatan_data"),
  ]);
  const galat = hariIniQ.error ?? belumLunasQ.error ?? terbaruQ.error ?? peringatanQ.error;
  if (galat) throw new Error(`Dashboard gagal dimuat (${galat.code ?? "tanpa kode"}).`);
  const peringatan = (peringatanQ.data ?? []) as Peringatan[];

  return (
    <div className="space-y-6">
      <WaktuData zonaWaktu={zonaWaktu} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Transaksi hari ini" nilai={formatAngka(hariIniQ.count ?? 0, 0)} ikon={ReceiptText} />
        <KpiCard label="Transaksi belum lunas" nilai={formatAngka(belumLunasQ.count ?? 0, 0)} keterangan="Seluruh periode, tidak termasuk dibatalkan" ikon={Wallet} />
        <KpiCard label="Data perlu diperiksa" nilai={formatAngka(peringatan.length, 0)} ikon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cari transaksi</CardTitle>
          <CardDescription>Nomor resi, nama, atau telepon pelanggan</CardDescription>
        </CardHeader>
        <CardContent>
          <FormPencarian path="/transaksi" placeholder="Contoh: NX-20261114-0001 atau nama pelanggan" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle>Transaksi terbaru</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/transaksi">Semua transaksi</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <TabelTransaksiRingkas baris={terbaruQ.data ?? []} zonaWaktu={zonaWaktu} />
          </CardContent>
        </Card>
        <DaftarPeringatan peringatan={peringatan} zonaWaktu={zonaWaktu} />
      </div>
    </div>
  );
}

export function DaftarPeringatan({ peringatan, zonaWaktu }: { peringatan: Peringatan[]; zonaWaktu: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden /> Data yang perlu diperiksa
        </CardTitle>
        <CardDescription>Pemeriksaan konsistensi transaksi & pembayaran, dihitung saat halaman dibuka</CardDescription>
      </CardHeader>
      <CardContent>
        {!peringatan.length ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> Tidak ada data yang perlu diperiksa.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {peringatan.slice(0, 15).map((p, i) => (
              <li key={`${p.jenis}-${p.no_resi}-${i}`} className="space-y-0.5 p-2.5">
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/transaksi/${p.no_resi}`} className="font-medium text-primary hover:underline">
                    {p.no_resi}
                  </Link>
                  <span className="text-xs font-medium text-warning">{LABEL_PERINGATAN[p.jenis] ?? p.jenis}</span>
                </p>
                <p className="text-muted-foreground">{p.keterangan}</p>
                {p.waktu && <p className="text-xs text-muted-foreground">{formatTanggalWaktu(p.waktu, zonaWaktu)}</p>}
              </li>
            ))}
            {peringatan.length > 15 && <li className="p-2.5 text-xs text-muted-foreground">dan {peringatan.length - 15} lainnya.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
