import { Download } from "lucide-react";
import type { ParamDaftar } from "@/components/app/daftar";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export type JenisEkspor = "transaksi" | "pembayaran" | "armada" | "pengiriman" | "audit";

/** URL ekspor CSV dengan filter yang sedang aktif (tanpa nomor halaman). */
export function hrefEkspor(jenis: JenisEkspor, param: ParamDaftar): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(param)) if (v && k !== "hal") sp.set(k, v);
  const s = sp.toString();
  return `/laporan/ekspor/${jenis}${s ? `?${s}` : ""}`;
}

/** Judul laporan + tombol unduh CSV yang mengikuti filter. */
export function KepalaLaporan({
  judul,
  deskripsi,
  jenis,
  param,
  bolehEkspor = true,
}: {
  judul: string;
  deskripsi: string;
  jenis: JenisEkspor;
  param: ParamDaftar;
  bolehEkspor?: boolean;
}) {
  return (
    <PageHeader
      judul={judul}
      deskripsi={deskripsi}
      aksi={
        bolehEkspor ? (
          <Button asChild variant="outline" size="lg">
            {/* Tautan biasa (bukan <Link>): unduhan berkas, bukan navigasi. */}
            <a href={hrefEkspor(jenis, param)} download>
              <Download aria-hidden /> Ekspor CSV
            </a>
          </Button>
        ) : undefined
      }
    />
  );
}

/** Parameter filter rentang untuk tautan (preset atau tanggal khusus). */
export function paramRentang(r: { dari: string; sampai: string; periode: string }): ParamDaftar {
  return r.periode === "khusus" ? { dari: r.dari, sampai: r.sampai } : { periode: r.periode };
}

/** Sel ringkasan angka di atas tabel laporan. */
export function Ringkas({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{nilai}</dd>
    </div>
  );
}
