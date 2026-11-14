import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, History, Printer, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { BadgeNada, StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilTransaksi } from "../data";
import { TombolBatalPembayaran, TombolCatatPembayaran } from "../../pembayaran/form-pembayaran";
import { TombolBatalTransaksi } from "./tombol-batal";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export async function generateMetadata(props: PageProps<"/transaksi/[resi]">): Promise<Metadata> {
  const { resi } = await props.params;
  return { title: `Resi ${decodeURIComponent(resi).toUpperCase()}` };
}

export default async function HalamanDetailTransaksi(props: PageProps<"/transaksi/[resi]">) {
  const profil = await wajibAksesRute("transaksi");
  const { resi } = await props.params;
  const t = await ambilTransaksi(resi);
  if (!t) notFound();

  const kantor = profil.peran === "pemilik" || profil.peran === "admin_loket";
  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();
  const [{ data: riwayat }, { data: bayar }] = await Promise.all([
    supabase
      .from("riwayat_status_pengiriman")
      .select("id, status_sebelumnya, status_baru, waktu_perubahan, catatan, pengguna:data_pengguna(nama_lengkap)")
      .eq("no_resi", t.noResi)
      .order("waktu_perubahan", { ascending: false }),
    // Staf Gudang tidak dapat membaca tabel pembayaran (RLS) — tidak diminta.
    kantor
      ? supabase
          .from("pembayaran")
          .select("id_pembayaran, waktu_bayar, jumlah_bayar, status_pembayaran_record, catatan, catatan_koreksi, pencatat:data_pengguna!pembayaran_id_pengguna_pencatat_fkey(nama_lengkap)")
          .eq("no_resi", t.noResi)
          .order("waktu_bayar", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const sisa = t.totalBiaya - t.totalDibayar;
  const bolehBatal = profil.peran === "pemilik" && !t.void && t.statusKirim === "diterima_loket" && t.totalDibayar === 0;

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/transaksi">
            <ArrowLeft aria-hidden /> Kembali ke daftar transaksi
          </Link>
        </Button>
      </div>
      <PageHeader
        judul={t.noResi}
        deskripsi={`Dicatat ${formatTanggalWaktu(t.waktu, zonaWaktu)} oleh ${t.pencatat}`}
        aksi={
          <>
            {bolehBatal && <TombolBatalTransaksi noResi={t.noResi} />}
            {!t.void && (
              <Button asChild size="lg">
                <Link href={`/transaksi/${t.noResi}/cetak`}>
                  <Printer aria-hidden /> Cetak Resi
                </Link>
              </Button>
            )}
          </>
        }
      />

      {t.void ? (
        <Alert variant="destructive">
          <Ban aria-hidden />
          <AlertTitle>Transaksi dibatalkan</AlertTitle>
          <AlertDescription>
            Dibatalkan {formatTanggalWaktu(t.void.pada, zonaWaktu)} oleh {t.void.oleh}. Alasan: {t.void.alasan}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-wrap gap-2">
          <StatusBadge jenis="bayar" nilai={t.statusBayar} />
          <StatusBadge jenis="kirim" nilai={t.statusKirim} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <KartuPihak judul="Pengirim" p={t.pengirim} />
        <KartuPihak judul="Penerima" p={t.penerima} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rincian barang</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jenis barang</TableHead>
                <TableHead className="text-right">Berat</TableHead>
                <TableHead className="text-right">Jumlah ditagih</TableHead>
                <TableHead className="text-right">Tarif saat transaksi</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.detail.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.nama}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAngka(d.berat)} kg</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAngka(d.jumlah)} {d.satuan}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(d.tarif)}/{d.satuan}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(d.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatAngka(t.totalBerat)} kg</TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right font-semibold tabular-nums">{formatRupiah(t.totalBiaya)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4" aria-hidden /> Pembayaran
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Total biaya</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(t.totalBiaya)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dibayar</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(t.totalDibayar)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sisa</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(sisa)}</dd>
              </div>
            </dl>
            {kantor &&
              (bayar?.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {bayar.map((b) => (
                    <li key={b.id_pembayaran} className="flex items-start justify-between gap-3 p-2.5">
                      <div>
                        <p className={b.status_pembayaran_record === "dibatalkan" ? "line-through" : "font-medium"}>{formatRupiah(b.jumlah_bayar)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTanggalWaktu(b.waktu_bayar, zonaWaktu)} · {relasiTunggal(b.pencatat)?.nama_lengkap ?? "—"}
                          {b.catatan ? ` · ${b.catatan}` : ""}
                        </p>
                      </div>
                      {b.status_pembayaran_record === "dibatalkan" ? (
                        <div className="text-right">
                          <BadgeNada nada="neutral" label="Dibatalkan" />
                          {b.catatan_koreksi && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{b.catatan_koreksi}</p>}
                        </div>
                      ) : (
                        profil.peran === "pemilik" && (
                          <TombolBatalPembayaran idPembayaran={b.id_pembayaran} ringkasan={`${formatRupiah(b.jumlah_bayar)} untuk ${t.noResi}`} />
                        )
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
              ))}
            {kantor && !t.void && sisa > 0 && (
              <TombolCatatPembayaran
                ukuran="default"
                tagihan={{
                  noResi: t.noResi,
                  pengirim: t.pengirim.nama,
                  penerima: t.penerima.nama,
                  total: t.totalBiaya,
                  dibayar: t.totalDibayar,
                  sisa,
                  dibatalkan: false,
                }}
              />
            )}
            {profil.peran === "pemilik" && !t.void && t.statusKirim === "diterima_loket" && t.totalDibayar > 0 && (
              <p className="text-xs text-muted-foreground">
                Untuk membatalkan transaksi ini, batalkan dulu seluruh pembayarannya.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" aria-hidden /> Riwayat status pengiriman
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riwayat?.length ? (
              <ol className="space-y-3 text-sm">
                {riwayat.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <StatusBadge jenis="kirim" nilai={r.status_baru} />
                      {r.catatan && <p className="text-muted-foreground">{r.catatan}</p>}
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {formatTanggalWaktu(r.waktu_perubahan, zonaWaktu)}
                      <br />
                      {relasiTunggal(r.pengguna)?.nama_lengkap ?? "Sistem"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState ikon={History} judul="Belum ada riwayat status" className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>

      {t.catatan && (
        <Card>
          <CardHeader>
            <CardTitle>Catatan</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-line">{t.catatan}</CardContent>
        </Card>
      )}
    </>
  );
}

function KartuPihak({ judul, p }: { judul: string; p: { nama: string; telepon: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{judul}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-medium">{p.nama}</p>
        <p className="text-sm text-muted-foreground tabular-nums">{p.telepon}</p>
      </CardContent>
    </Card>
  );
}
