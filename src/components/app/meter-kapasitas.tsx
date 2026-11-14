// Tanpa "use client": dirender dari Server Component.
import { formatAngka } from "@/lib/domain/format";
import { gramKeKg, type HasilKapasitas } from "@/lib/domain/manifes";
import { cn } from "@/lib/utils";

const WARNA = {
  kosong: "bg-neutral",
  aman: "bg-success",
  peringatan: "bg-warning",
  penuh: "bg-warning",
  melebihi: "bg-danger",
} as const;

const PESAN = {
  kosong: "Belum ada muatan.",
  aman: "Muatan masih dalam kapasitas.",
  peringatan: "Muatan mendekati kapasitas (melewati ambang peringatan).",
  penuh: "Muatan tepat sama dengan kapasitas — masih dapat diproses.",
  melebihi: "Muatan melebihi kapasitas. Konfirmasi muat dan keberangkatan diblokir.",
} as const;

/** Bar utilisasi muatan vs kapasitas, dengan teks (tidak bergantung pada warna saja). */
export function MeterKapasitas({
  hasil,
  ambang,
  ringkas,
  className,
}: {
  hasil: HasilKapasitas;
  /** Ambang dari pengaturan; null = belum diatur (ditampilkan apa adanya). */
  ambang: number | null;
  ringkas?: boolean;
  className?: string;
}) {
  const lebar = Math.min(100, hasil.persen);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="tabular-nums">
          <span className="font-medium">{formatAngka(gramKeKg(hasil.muatanGram))} kg</span>
          <span className="text-muted-foreground"> / {formatAngka(gramKeKg(hasil.kapasitasGram))} kg</span>
        </span>
        <span className={cn("font-semibold tabular-nums", hasil.tingkat === "melebihi" && "text-danger")}>
          {formatAngka(hasil.persen, 1)}%
        </span>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Utilisasi kapasitas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lebar}
        aria-valuetext={`${formatAngka(hasil.persen, 1)}% dari kapasitas`}
      >
        <div className={cn("h-full rounded-full", WARNA[hasil.tingkat])} style={{ width: `${lebar}%` }} />
        {ambang !== null && (
          <div className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${ambang}%` }} aria-hidden title={`Ambang ${ambang}%`} />
        )}
      </div>
      {!ringkas && (
        <p className={cn("text-xs", hasil.tingkat === "melebihi" ? "text-danger" : "text-muted-foreground")}>
          {PESAN[hasil.tingkat]}
          {hasil.tingkat === "melebihi"
            ? ` Kelebihan ${formatAngka(gramKeKg(-hasil.sisaGram))} kg.`
            : hasil.tingkat !== "kosong"
              ? ` Sisa ${formatAngka(gramKeKg(hasil.sisaGram))} kg.`
              : ""}
          {ambang === null && " Ambang peringatan belum diatur Pemilik (perlu dilengkapi)."}
        </p>
      )}
    </div>
  );
}
