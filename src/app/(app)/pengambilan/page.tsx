import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, PackageCheck, PackageX, Search, Wallet } from "lucide-react";
import { paramTunggal } from "@/components/app/daftar";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { FormPengambilan } from "./form-pengambilan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Pengambilan Barang" };

const PATH = "/pengambilan";

export default async function HalamanPengambilan(props: PageProps<"/pengambilan">) {
  const profil = await wajibAksesRute("pengambilan");
  const kantor = profil.peran === "pemilik" || profil.peran === "admin_loket";
  const sp = await props.searchParams;
  const resi = paramTunggal(sp.resi)?.toUpperCase().slice(0, 40);

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();

  const [hasil, menunggu] = await Promise.all([
    resi
      ? supabase
          .from("data_transaksi")
          .select(
            `no_resi, status_kirim, status_bayar, total_biaya, total_dibayar, total_berat_kg, status_void, waktu_diambil, catatan_pengambilan,
             pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama),
             penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama, telepon),
             petugas:data_pengguna!data_transaksi_diambil_diproses_oleh_fkey(nama_lengkap),
             detail:detail_transaksi(id_detail)`,
          )
          .eq("no_resi", resi)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("data_transaksi")
      .select("no_resi, updated_at, total_berat_kg, status_bayar, penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama)")
      .eq("status_kirim", "tiba")
      .eq("status_void", false)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  if (hasil.error) throw new Error(`Resi gagal dimuat (${hasil.error.code ?? "tanpa kode"}).`);
  const t = hasil.data;
  const penerima = relasiTunggal(t?.penerima);

  return (
    <>
      <PageHeader
        judul="Pengambilan Barang"
        deskripsi="Cari nomor resi, periksa identitas penerima secara fisik, lalu konfirmasi pengambilan."
      />

      <form action={PATH} method="get" role="search" className="flex w-full gap-2 sm:max-w-md">
        <label htmlFor="resi" className="sr-only">
          Nomor resi
        </label>
        <Input id="resi" name="resi" defaultValue={resi} placeholder="Ketik atau pindai nomor resi" className="h-9 uppercase" autoComplete="off" autoFocus />
        <Button type="submit" variant="outline" size="lg">
          <Search aria-hidden /> Cari
        </Button>
      </form>

      {resi && !t && (
        <EmptyState ikon={PackageX} judul="Nomor resi tidak ditemukan" deskripsi="Periksa kembali nomor resi pada lembar resi penerima." />
      )}

      {t && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Link href={`/transaksi/${t.no_resi}`} className="text-primary hover:underline">
                {t.no_resi}
              </Link>
              {!t.status_void && <StatusBadge jenis="kirim" nilai={t.status_kirim} />}
              {!t.status_void && <StatusBadge jenis="bayar" nilai={t.status_bayar} />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Penerima</dt>
                <dd className="text-base font-semibold">{penerima?.nama ?? "—"}</dd>
                <dd className="text-muted-foreground tabular-nums">{penerima?.telepon}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pengirim</dt>
                <dd>{relasiTunggal(t.pengirim)?.nama ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Barang</dt>
                <dd>
                  {(t.detail ?? []).length} jenis · {formatAngka(t.total_berat_kg)} kg
                </dd>
              </div>
            </dl>

            {t.status_void ? (
              <Alert variant="destructive">
                <PackageX aria-hidden />
                <AlertTitle>Transaksi dibatalkan</AlertTitle>
                <AlertDescription>Barang dengan resi ini tidak dapat diserahkan.</AlertDescription>
              </Alert>
            ) : t.status_kirim === "sudah_diambil" ? (
              <Alert>
                <CheckCircle2 aria-hidden />
                <AlertTitle>Sudah diambil</AlertTitle>
                <AlertDescription>
                  {formatTanggalWaktu(t.waktu_diambil, zonaWaktu)} · diproses {relasiTunggal(t.petugas)?.nama_lengkap ?? "—"}
                  {t.catatan_pengambilan ? ` · ${t.catatan_pengambilan}` : ""}
                </AlertDescription>
              </Alert>
            ) : t.status_kirim !== "tiba" ? (
              <Alert>
                <PackageX aria-hidden />
                <AlertTitle>Barang belum tiba di loket tujuan</AlertTitle>
                <AlertDescription>Pengambilan hanya dapat dikonfirmasi untuk barang berstatus Tiba.</AlertDescription>
              </Alert>
            ) : t.status_bayar !== "lunas" ? (
              <Alert variant="destructive">
                <Wallet aria-hidden />
                <AlertTitle>Pembayaran belum lunas — barang belum dapat diserahkan</AlertTitle>
                <AlertDescription>
                  <p>
                    Sisa tagihan {formatRupiah(Number(t.total_biaya) - Number(t.total_dibayar))}.{" "}
                    {kantor
                      ? "Catat pelunasan di detail transaksi, lalu kembali ke halaman ini untuk mengonfirmasi pengambilan."
                      : "Minta Admin Loket mencatat pelunasan, lalu cari ulang resi ini untuk mengonfirmasi pengambilan."}
                  </p>
                  {kantor && (
                    <Button asChild size="default" className="mt-2">
                      <Link href={`/transaksi/${t.no_resi}`}>Catat pelunasan</Link>
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <FormPengambilan noResi={t.no_resi} namaPenerima={penerima?.nama ?? "—"} />
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Menunggu diambil</h2>
        {menunggu.error ? (
          <EmptyState judul="Daftar barang tiba gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
        ) : !menunggu.data?.length ? (
          <EmptyState ikon={PackageCheck} judul="Tidak ada barang berstatus Tiba" className="py-8" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {menunggu.data.map((m) => (
              <li key={m.no_resi}>
                <Link href={`${PATH}?resi=${m.no_resi}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40">
                  <span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-primary">{m.no_resi}</span>
                      {m.status_bayar !== "lunas" && <StatusBadge jenis="bayar" nilai={m.status_bayar} />}
                    </span>
                    <span className="block text-xs text-muted-foreground">{relasiTunggal(m.penerima)?.nama ?? "—"}</span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    {formatAngka(m.total_berat_kg)} kg
                    <br />
                    tiba {formatTanggalWaktu(m.updated_at, zonaWaktu)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
