import { Clock } from "lucide-react";
import { formatTanggalWaktu } from "@/lib/domain/format";
import { TombolMuatUlang } from "./tombol-muat-ulang";

/**
 * Waktu data diambil (PRD §7.2: tampilkan waktu pembaruan; jangan sebut
 * real-time). Data dihitung ulang setiap halaman dibuka atau dimuat ulang.
 */
export function WaktuData({ zonaWaktu }: { zonaWaktu: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Clock className="size-3.5" aria-hidden />
      <span>
        Data diambil {formatTanggalWaktu(new Date(), zonaWaktu)} saat halaman dibuka (bukan pembaruan otomatis).
      </span>
      <TombolMuatUlang />
    </div>
  );
}
