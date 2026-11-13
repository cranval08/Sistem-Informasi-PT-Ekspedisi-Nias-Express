// Tanpa "use client": komponen daftar berbasis URL (GET), bekerja tanpa
// JavaScript dan dapat dirender dari Server Component.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ParamDaftar = Record<string, string | undefined>;

function hrefDengan(path: string, param: ParamDaftar, ubah: ParamDaftar) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...param, ...ubah })) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** Ambil string tunggal dari searchParams Next. */
export function paramTunggal(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export function nomorHalaman(v: string | string[] | undefined): number {
  const n = Number(paramTunggal(v));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Form pencarian GET; parameter lain (filter) dipertahankan sebagai hidden. */
export function FormPencarian({
  path,
  q,
  placeholder,
  pertahankan = {},
  label = "Cari",
}: {
  path: string;
  q?: string;
  placeholder: string;
  pertahankan?: ParamDaftar;
  label?: string;
}) {
  return (
    <form action={path} method="get" role="search" className="flex w-full gap-2 sm:max-w-md">
      {Object.entries(pertahankan).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label htmlFor="cari" className="sr-only">
        {label}
      </label>
      <Input id="cari" name="q" type="search" defaultValue={q} placeholder={placeholder} className="h-9" />
      <Button type="submit" variant="outline" size="lg">
        <Search aria-hidden /> Cari
      </Button>
    </form>
  );
}

/** Pilihan filter sebagai tautan (segmented). */
export function FilterTautan({
  path,
  param,
  kunci,
  pilihan,
  aktif,
  label,
}: {
  path: string;
  param: ParamDaftar;
  kunci: string;
  pilihan: { nilai: string | undefined; label: string }[];
  aktif: string | undefined;
  label: string;
}) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg border bg-card p-0.5">
      {pilihan.map((p) => {
        const dipilih = p.nilai === aktif;
        return (
          <Link
            key={p.label}
            href={hrefDengan(path, param, { [kunci]: p.nilai, hal: undefined })}
            aria-current={dipilih ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              dipilih && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Paginasi({
  path,
  param,
  halaman,
  ukuran,
  total,
}: {
  path: string;
  param: ParamDaftar;
  halaman: number;
  ukuran: number;
  total: number;
}) {
  const jumlahHalaman = Math.max(1, Math.ceil(total / ukuran));
  const awal = total === 0 ? 0 : (halaman - 1) * ukuran + 1;
  const akhir = Math.min(total, halaman * ukuran);
  const tautan = (h: number) => hrefDengan(path, param, { hal: h > 1 ? String(h) : undefined });

  return (
    <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
      <p>
        Menampilkan {awal}–{akhir} dari {total} data
      </p>
      <nav aria-label="Navigasi halaman" className="flex items-center gap-2">
        {halaman > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={tautan(halaman - 1)}>
              <ChevronLeft aria-hidden /> Sebelumnya
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden /> Sebelumnya
          </Button>
        )}
        <span>
          Halaman {Math.min(halaman, jumlahHalaman)} dari {jumlahHalaman}
        </span>
        {halaman < jumlahHalaman ? (
          <Button asChild variant="outline" size="sm">
            <Link href={tautan(halaman + 1)}>
              Berikutnya <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Berikutnya <ChevronRight aria-hidden />
          </Button>
        )}
      </nav>
    </div>
  );
}

/** Bersihkan kata kunci untuk filter PostgREST `or(...)` (hindari karakter sintaks). */
export function kataKunciAman(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
