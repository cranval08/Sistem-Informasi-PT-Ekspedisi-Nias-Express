import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Banknote, Receipt } from "lucide-react";
import { FilterRentang, rentangDariParam } from "@/components/app/daftar";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatRupiah, formatTanggal, formatTanggalWaktu } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Rekap Kas" };

type BarisRekap = {
  tanggal: string;
  id_pencatat: string;
  nama_pencatat: string;
  jumlah_pembayaran: number;
  total_diterima: number;
  jumlah_dibatalkan: number;
  total_dibatalkan: number;
};

type Ringkas = { jumlah: number; total: number; jumlahBatal: number; totalBatal: number };

function tambahkan(peta: Map<string, Ringkas & { label: string }>, kunci: string, label: string, r: BarisRekap) {
  const a = peta.get(kunci) ?? { label, jumlah: 0, total: 0, jumlahBatal: 0, totalBatal: 0 };
  a.jumlah += r.jumlah_pembayaran;
  a.total += Number(r.total_diterima);
  a.jumlahBatal += r.jumlah_dibatalkan;
  a.totalBatal += Number(r.total_dibatalkan);
  peta.set(kunci, a);
}

const tglLabel = (t: string, zona: string) => formatTanggal(`${t}T12:00:00Z`, zona);

export default async function HalamanRekapKas(props: PageProps<"/pembayaran/rekap-kas">) {
  await wajibAksesRute("rekapKas");
  const sp = await props.searchParams;
  const { zonaWaktu } = await ambilPengaturan();
  const rentang = rentangDariParam(sp, zonaWaktu, "hari_ini");

  const supabase = await buatKlienServer();
  const { data, error } = await supabase.rpc("rekap_kas", { p_dari: rentang.dari, p_sampai: rentang.sampai });
  const baris = (data ?? []) as BarisRekap[];

  const perTanggal = new Map<string, Ringkas & { label: string }>();
  const perPencatat = new Map<string, Ringkas & { label: string }>();
  for (const r of baris) {
    tambahkan(perTanggal, r.tanggal, tglLabel(r.tanggal, zonaWaktu), r);
    tambahkan(perPencatat, r.id_pencatat, r.nama_pencatat, r);
  }
  const total = [...perTanggal.values()].reduce(
    (a, r) => ({ jumlah: a.jumlah + r.jumlah, total: a.total + r.total, jumlahBatal: a.jumlahBatal + r.jumlahBatal, totalBatal: a.totalBatal + r.totalBatal }),
    { jumlah: 0, total: 0, jumlahBatal: 0, totalBatal: 0 },
  );
  const judulRentang = rentang.dari === rentang.sampai ? tglLabel(rentang.dari, zonaWaktu) : `${tglLabel(rentang.dari, zonaWaktu)} – ${tglLabel(rentang.sampai, zonaWaktu)}`;

  return (
    <>
      <PageHeader
        judul="Rekap Kas"
        deskripsi={`Penerimaan dihitung dari pembayaran valid yang tercatat, bukan input total manual. Data dimuat ${formatTanggalWaktu(new Date(), zonaWaktu)}.`}
      />
      <FilterRentang path="/pembayaran/rekap-kas" rentang={rentang} param={{}} />
      <p className="text-sm text-muted-foreground">Periode: {judulRentang}</p>

      {error ? (
        <EmptyState judul="Rekap kas gagal dimuat" deskripsi={error.code === "22023" ? error.message : "Muat ulang halaman untuk mencoba lagi."} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Total penerimaan" nilai={formatRupiah(total.total)} keterangan="Pembayaran valid" ikon={Banknote} />
            <KpiCard label="Jumlah pembayaran" nilai={String(total.jumlah)} keterangan="Transaksi pembayaran valid" ikon={Receipt} />
            <KpiCard
              label="Pembayaran dibatalkan"
              nilai={formatRupiah(total.totalBatal)}
              keterangan={`${total.jumlahBatal} pembayaran · tidak dihitung sebagai penerimaan`}
              ikon={Ban}
            />
          </div>

          {baris.length === 0 ? (
            <EmptyState ikon={Banknote} judul="Belum ada pembayaran pada periode ini" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <TabelRingkas judul="Per tanggal" kolom="Tanggal" data={[...perTanggal.entries()]} total={total} tautan={(k) => `/pembayaran?dari=${k}&sampai=${k}`} />
              <TabelRingkas judul="Per pencatat" kolom="Pencatat" data={[...perPencatat.entries()].sort((a, b) => b[1].total - a[1].total)} total={total} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function TabelRingkas({
  judul,
  kolom,
  data,
  total,
  tautan,
}: {
  judul: string;
  kolom: string;
  data: [string, Ringkas & { label: string }][];
  total: Ringkas;
  tautan?: (kunci: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{judul}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{kolom}</TableHead>
              <TableHead className="text-right">Pembayaran</TableHead>
              <TableHead className="text-right">Diterima</TableHead>
              <TableHead className="text-right">Dibatalkan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(([k, r]) => (
              <TableRow key={k}>
                <TableCell>
                  {tautan ? (
                    <Link href={tautan(k)} className="text-primary hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.jumlah}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatRupiah(r.total)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {r.jumlahBatal ? `${formatRupiah(r.totalBatal)} (${r.jumlahBatal})` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{total.jumlah}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatRupiah(total.total)}</TableCell>
              <TableCell className="text-right tabular-nums">{total.jumlahBatal ? formatRupiah(total.totalBatal) : "—"}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
