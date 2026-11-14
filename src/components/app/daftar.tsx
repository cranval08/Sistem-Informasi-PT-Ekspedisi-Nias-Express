// Tanpa "use client": komponen daftar berbasis URL (GET), bekerja tanpa
// JavaScript dan dapat dirender dari Server Component.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tambahHari, tanggalOperasional } from "@/lib/domain/format";
import { tanggalValid } from "@/lib/domain/skema";
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
    <nav aria-label={label} className="inline-flex flex-wrap rounded-lg border bg-card p-0.5">
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

export { kataKunciAman } from "@/lib/domain/format";

// ---------------------------------------------------------------------
// Rentang tanggal (filter ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&periode=…)
// ---------------------------------------------------------------------
export type Rentang = { dari: string; sampai: string; periode: string };

const PRESET = [
  { nilai: "hari_ini", label: "Hari ini" },
  { nilai: "7_hari", label: "7 hari terakhir" },
  { nilai: "bulan_ini", label: "Bulan ini" },
] as const;

/** Baca rentang dari searchParams; tanggal tidak valid → preset bawaan. */
export function rentangDariParam(
  sp: Record<string, string | string[] | undefined>,
  zonaWaktu: string,
  bawaan: (typeof PRESET)[number]["nilai"] = "hari_ini",
): Rentang {
  const hariIni = tanggalOperasional(zonaWaktu);
  const dari = paramTunggal(sp.dari);
  const sampai = paramTunggal(sp.sampai);
  if (tanggalValid(dari) && tanggalValid(sampai) && dari <= sampai) return { dari, sampai, periode: "khusus" };
  const periode = PRESET.some((p) => p.nilai === paramTunggal(sp.periode)) ? paramTunggal(sp.periode)! : bawaan;
  if (periode === "7_hari") return { dari: tambahHari(hariIni, -6), sampai: hariIni, periode };
  if (periode === "bulan_ini") return { dari: `${hariIni.slice(0, 8)}01`, sampai: hariIni, periode };
  return { dari: hariIni, sampai: hariIni, periode: "hari_ini" };
}

/** Preset periode + form tanggal khusus (GET, bekerja tanpa JavaScript). */
export function FilterRentang({ path, rentang, param }: { path: string; rentang: Rentang; param: ParamDaftar }) {
  const tanpaRentang = { ...param, dari: undefined, sampai: undefined, periode: undefined, hal: undefined };
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
      <nav aria-label="Pilih periode" className="inline-flex flex-wrap self-start rounded-lg border bg-card p-0.5">
        {PRESET.map((p) => {
          const dipilih = rentang.periode === p.nilai;
          return (
            <Link
              key={p.nilai}
              href={hrefDengan(path, tanpaRentang, { periode: p.nilai })}
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
      <form action={path} method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(tanpaRentang).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Dari</span>
          <Input type="date" name="dari" defaultValue={rentang.dari} className="h-9 w-40" required />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Sampai</span>
          <Input type="date" name="sampai" defaultValue={rentang.sampai} className="h-9 w-40" required />
        </label>
        <Button type="submit" variant="outline" size="lg">
          Terapkan
        </Button>
      </form>
    </div>
  );
}
