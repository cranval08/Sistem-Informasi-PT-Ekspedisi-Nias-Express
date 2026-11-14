// Tanpa "use client": grafik dirender di server sebagai HTML/CSS biasa
// (tanpa pustaka grafik). Tooltip muncul saat hover atau fokus keyboard;
// setiap grafik punya tampilan tabel agar data tidak bergantung pada visual.
import { formatAngka, formatRupiah } from "@/lib/domain/format";
import { angkaRingkas, skalaSumbu } from "@/lib/domain/laporan";
import { cn } from "@/lib/utils";

export type TitikGrafik = {
  /** Label sumbu (singkat), mis. "14 Nov". */
  label: string;
  /** Label lengkap untuk tooltip & tabel, mis. "9–15 Nov 2026". */
  labelPanjang: string;
  nilai: number;
};

type FormatNilai = "angka" | "rupiah";

const formatPenuh = (n: number, f: FormatNilai) => (f === "rupiah" ? formatRupiah(n) : formatAngka(n, 0));
const formatSumbu = (n: number, f: FormatNilai) => (f === "rupiah" ? angkaRingkas(n) : formatAngka(n, 0));

/** Label sumbu-x selektif: semua bila sedikit, selebihnya berjarak + titik terakhir. */
function tampilkanLabel(i: number, n: number): boolean {
  if (n <= 8) return true;
  const k = Math.ceil(n / 7);
  return i === n - 1 || (i % k === 0 && n - 1 - i >= k / 2);
}

/**
 * Grafik kolom satu seri (PRD §7.2: jumlah transaksi / penerimaan per
 * periode). Satu warna (primary) — tidak ada legenda; judul kartu yang
 * menamai seri. Batang ≤ 24px, ujung data membulat 4px, garis bantu hairline.
 */
export function GrafikKolom({
  data,
  format = "angka",
  satuan,
  labelTabel,
  tinggi = 176,
}: {
  data: TitikGrafik[];
  format?: FormatNilai;
  /** Kata untuk tooltip & pembaca layar, mis. "transaksi". */
  satuan?: string;
  /** Judul kolom nilai pada tabel data. */
  labelTabel: string;
  tinggi?: number;
}) {
  const maks = Math.max(0, ...data.map((d) => d.nilai));
  const { atas, langkah } = skalaSumbu(maks);
  const tick: number[] = [];
  for (let v = 0; v <= atas + 1e-9; v += langkah) tick.push(v);
  const semuaNol = maks === 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-2" style={{ height: tinggi + 20 }}>
        {/* Sumbu Y */}
        <div className="relative w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums" style={{ height: tinggi }} aria-hidden>
          {tick.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (v / atas) * 100}%` }}>
              {formatSumbu(v, format)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Garis bantu */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: tinggi }} aria-hidden>
            {tick.map((v) => (
              <div key={v} className="absolute inset-x-0 border-t border-border" style={{ top: `${100 - (v / atas) * 100}%` }} />
            ))}
          </div>
          <ul className="relative flex h-full gap-0.5" aria-label={`Grafik ${labelTabel}`}>
            {data.map((d, i) => {
              const persen = semuaNol ? 0 : (d.nilai / atas) * 100;
              const teks = `${d.labelPanjang}: ${formatPenuh(d.nilai, format)}${satuan ? ` ${satuan}` : ""}`;
              return (
                <li
                  key={`${d.labelPanjang}-${i}`}
                  tabIndex={0}
                  aria-label={teks}
                  className="group relative flex min-w-0 flex-1 flex-col items-center outline-none"
                >
                  {/* Area hit = seluruh kolom (lebih besar dari batangnya). */}
                  <div className="relative flex w-full items-end justify-center rounded-sm group-hover:bg-muted/50 group-focus-visible:bg-muted/50" style={{ height: tinggi }}>
                    {d.nilai > 0 && (
                      <div
                        className="w-[70%] max-w-6 min-w-1 rounded-t-[4px] bg-primary"
                        style={{ height: `max(${persen}%, 2px)` }}
                      />
                    )}
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-48 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
                    >
                      <span className="block text-muted-foreground">{d.labelPanjang}</span>
                      <span className="font-medium tabular-nums">
                        {formatPenuh(d.nilai, format)}
                        {satuan ? ` ${satuan}` : ""}
                      </span>
                    </div>
                  </div>
                  <span className={cn("mt-1 truncate text-[11px] text-muted-foreground", !tampilkanLabel(i, data.length) && "invisible")} aria-hidden>
                    {d.label}
                  </span>
                </li>
              );
            })}
          </ul>
          {semuaNol && (
            <p className="absolute inset-x-0 text-center text-sm text-muted-foreground" style={{ top: tinggi / 2 - 10 }}>
              Belum ada data pada periode ini.
            </p>
          )}
        </div>
      </div>
      <TabelData judul={labelTabel} baris={data.map((d) => [d.labelPanjang, formatPenuh(d.nilai, format)])} />
    </div>
  );
}

/**
 * Batang horizontal satu seri untuk kategori berurutan (mis. tahap status
 * pengiriman). Nilai di ujung batang; urutan mengikuti alur, bukan peringkat.
 */
export function GrafikBatang({ data, satuan, labelTabel }: { data: { label: string; nilai: number }[]; satuan?: string; labelTabel: string }) {
  const maks = Math.max(0, ...data.map((d) => d.nilai));
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5" aria-label={`Grafik ${labelTabel}`}>
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(6.5rem,9rem)_1fr] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-3 flex-1">
                {d.nilai > 0 && (
                  <span className="block h-full max-w-full rounded-r-[4px] bg-primary" style={{ width: `${maks ? Math.max((d.nilai / maks) * 100, 1.5) : 0}%` }} />
                )}
              </span>
              <span className="w-10 shrink-0 text-right font-medium tabular-nums">
                {formatAngka(d.nilai, 0)}
                <span className="sr-only"> {satuan}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {maks === 0 && <p className="text-sm text-muted-foreground">Belum ada data pada periode ini.</p>}
      <TabelData judul={labelTabel} baris={data.map((d) => [d.label, formatAngka(d.nilai, 0)])} />
    </div>
  );
}

function TabelData({ judul, baris }: { judul: string; baris: string[][] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Lihat sebagai tabel</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-2 py-1.5 font-medium">Periode / kategori</th>
              <th className="px-2 py-1.5 text-right font-medium">{judul}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {baris.map(([a, b], i) => (
              <tr key={`${a}-${i}`}>
                <td className="px-2 py-1">{a}</td>
                <td className="px-2 py-1 text-right tabular-nums">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
