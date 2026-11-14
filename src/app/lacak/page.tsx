import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch, Search, Truck } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTanggalWaktu, ZONA_WAKTU_DEFAULT } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lacak Resi", robots: { index: false, follow: false } };

// Bergantung pada searchParams; dirender per request.
export const instant = false;

type Baris = { no_resi: string; status: string; waktu: string };

/**
 * Pelacakan publik (PRD §7.12, §13 butir 5). Tanpa login. Data hanya dari
 * RPC lacak_resi: nomor resi, status, dan waktu — tidak ada nama, telepon,
 * biaya, atau armada. Bila Pemilik menonaktifkan fitur, RPC tidak
 * mengembalikan apa pun.
 */
export default async function HalamanLacak({ searchParams }: PageProps<"/lacak">) {
  const sp = await searchParams;
  const resi = (typeof sp.resi === "string" ? sp.resi : "").trim().toUpperCase().slice(0, 40);

  const supabase = await buatKlienServer();
  const { data: aktif, error: galatStatus } = await supabase.rpc("pelacakan_publik_aktif");
  const hasil = aktif && resi ? await supabase.rpc("lacak_resi", { p_no_resi: resi }) : null;
  const riwayat = (hasil?.data ?? []) as Baris[];
  const terkini = riwayat.at(-1);

  return (
    <main className="flex min-h-screen items-start justify-center bg-sidebar p-4 sm:items-center">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-card p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold">Lacak Resi</h1>
            <p className="text-sm text-muted-foreground">Nias Express</p>
          </div>
        </div>

        {galatStatus ? (
          <Alert variant="destructive">
            <AlertTitle>Layanan pelacakan sedang tidak dapat diakses</AlertTitle>
            <AlertDescription>Coba lagi beberapa saat lagi.</AlertDescription>
          </Alert>
        ) : !aktif ? (
          <Alert>
            <PackageSearch aria-hidden />
            <AlertTitle>Pelacakan resi belum diaktifkan</AlertTitle>
            <AlertDescription>Hubungi loket Nias Express untuk menanyakan status kiriman Anda.</AlertDescription>
          </Alert>
        ) : (
          <>
            <form action="/lacak" method="get" role="search" className="flex gap-2">
              <label htmlFor="resi" className="sr-only">
                Nomor resi
              </label>
              <Input id="resi" name="resi" defaultValue={resi} placeholder="Contoh: NX-20261114-0001" className="h-9 uppercase" autoComplete="off" required />
              <Button type="submit" size="lg">
                <Search aria-hidden /> Lacak
              </Button>
            </form>

            {hasil?.error ? (
              <Alert variant="destructive">
                <AlertTitle>Pelacakan gagal</AlertTitle>
                <AlertDescription>Periksa koneksi lalu coba lagi.</AlertDescription>
              </Alert>
            ) : resi && !terkini ? (
              <Alert>
                <PackageSearch aria-hidden />
                <AlertTitle>Nomor resi tidak ditemukan</AlertTitle>
                <AlertDescription>Periksa kembali nomor resi pada lembar resi Anda.</AlertDescription>
              </Alert>
            ) : terkini ? (
              <section aria-label={`Status resi ${terkini.no_resi}`} className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Nomor resi</p>
                  <p className="text-lg font-semibold tracking-wide">{terkini.no_resi}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <LabelStatus status={terkini.status} />
                    <span className="text-xs text-muted-foreground">diperbarui {formatTanggalWaktu(terkini.waktu, ZONA_WAKTU_DEFAULT)} WIB</span>
                  </div>
                </div>
                <ol className="space-y-2 border-l-2 pl-4 text-sm">
                  {[...riwayat].reverse().map((r, i) => (
                    <li key={`${r.status}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                      <LabelStatus status={r.status} />
                      <span className="text-xs text-muted-foreground">{formatTanggalWaktu(r.waktu, ZONA_WAKTU_DEFAULT)}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  Status diperbarui oleh petugas Nias Express (bukan pelacakan GPS). Saat mengambil barang, bawa resi dan identitas diri.
                </p>
              </section>
            ) : null}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Petugas?{" "}
          <Link href="/login" className="underline-offset-4 hover:underline">
            Masuk ke sistem
          </Link>
        </p>
      </div>
    </main>
  );
}

function LabelStatus({ status }: { status: string }) {
  if (status === "dibatalkan") return <StatusBadge jenis="manifes" nilai="dibatalkan" />;
  return <StatusBadge jenis="kirim" nilai={status} />;
}
