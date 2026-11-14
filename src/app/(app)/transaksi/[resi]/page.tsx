import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, History, Printer, Truck, UserCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { BadgeNada, StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { bolehBatalkanPembayaran } from "@/lib/domain/pembayaran";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilTransaksi } from "../data";
import { TombolBatalPembayaran, TombolCatatPembayaran } from "../../pembayaran/form-pembayaran";
import { ambilKebijakanKapasitas } from "../../manifes/data";
import { TombolBatalTransaksi } from "./tombol-batal";
import { TombolOverrideBelumLunas } from "./tombol-override";

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
  const [{ zonaWaktu }, kebijakan] = await Promise.all([ambilPengaturan(), ambilKebijakanKapasitas()]);
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
          .select("id_pembayaran, waktu_bayar, jumlah_bayar, status_pembayaran_record, catatan, catatan_koreksi, id_pengguna_pencatat, pencatat:data_pengguna!pembayaran_id_pengguna_pencatat_fkey(nama_lengkap)")
          .eq("no_resi", t.noResi)
          .order("waktu_bayar", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const sisa = t.totalBiaya - t.totalDibayar;
  const bolehBatal = profil.peran === "pemilik" && !t.void && t.statusKirim === "diterima_loket" && t.totalDibayar === 0;
  const perluOverride = !t.void && t.statusBayar !== "lunas" && !t.overrideBelumLunas && t.statusKirim === "diterima_loket";
  const manifesAktif = t.manifes.find((m) => m.aktif);

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

      {!t.void && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-4" aria-hidden /> Pemuatan & pengambilan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {manifesAktif ? (
              <p>
                Manifes{" "}
                <Link href={`/manifes/${manifesAktif.id}`} className="font-medium text-primary hover:underline">
                  {manifesAktif.plat} · {manifesAktif.rute}
                </Link>{" "}
                <span className="ml-1 inline-block align-middle">
                  <StatusBadge jenis="manifes" nilai={manifesAktif.status} />
                </span>
              </p>
            ) : (
              t.statusKirim === "diterima_loket" && <p className="text-muted-foreground">Belum dimuat ke manifes.</p>
            )}
            {t.manifes.some((m) => !m.aktif) && (
              <p className="text-xs text-muted-foreground">
                Sebelumnya di:{" "}
                {t.manifes
                  .filter((m) => !m.aktif)
                  .map((m) => `${m.plat} (${m.status === "dibatalkan" ? "dibatalkan" : "dipindahkan"})`)
                  .join(", ")}
              </p>
            )}
            {t.overrideBelumLunas && (
              <p className="rounded-lg border border-warning/30 bg-warning-subtle/60 p-2.5">
                <span className="font-medium">Override belum lunas</span> oleh {t.overrideBelumLunas.oleh}: {t.overrideBelumLunas.alasan}
              </p>
            )}
            {perluOverride && (
              <div className="flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p>Barang belum lunas tidak dapat dimuat ke truk kecuali ada override resmi dari Pemilik.</p>
                {profil.peran === "pemilik" &&
                  (kebijakan.overrideBelumLunas ? (
                    <TombolOverrideBelumLunas noResi={t.noResi} sisa={formatRupiah(sisa)} />
                  ) : (
                    <p className="text-xs text-muted-foreground">Override dinonaktifkan di Pengaturan.</p>
                  ))}
              </div>
            )}
            {t.pengambilan ? (
              <p className="flex items-start gap-2">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  Diambil {formatTanggalWaktu(t.pengambilan.waktu, zonaWaktu)} · diproses {t.pengambilan.petugas} · identitas penerima
                  diverifikasi
                  {t.pengambilan.catatan ? ` · ${t.pengambilan.catatan}` : ""}
                </span>
              </p>
            ) : (
              t.statusKirim === "tiba" &&
              (sisa > 0 ? (
                <p className="rounded-lg border border-danger/30 bg-danger-subtle/60 p-2.5">
                  Barang sudah tiba, tetapi baru dapat diserahkan kepada penerima setelah sisa tagihan {formatRupiah(sisa)} dilunasi.
                </p>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/pengambilan?resi=${t.noResi}`}>
                    <UserCheck aria-hidden /> Proses Pengambilan
                  </Link>
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      )}

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
            {kantor && t.alasanBelumBayar && (
              <div className="rounded-lg border border-warning/30 bg-warning-subtle/60 p-2.5 text-sm">
                <p className="font-medium">Alasan belum bayar saat transaksi dibuat (Rp0)</p>
                <p className="whitespace-pre-line">{t.alasanBelumBayar}</p>
                <p className="mt-1 text-xs text-muted-foreground">Dicatat oleh {t.pencatat}. Tidak masuk riwayat pembayaran maupun rekap kas.</p>
              </div>
            )}
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
                        bolehBatalkanPembayaran(profil, b, zonaWaktu) && (
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
