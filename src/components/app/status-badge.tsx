import { AlertTriangle, CheckCircle2, Circle, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { definisiStatus, type JenisStatus, type Nada } from "@/lib/domain/status";

const GAYA: Record<Nada, { kelas: string; ikon: LucideIcon }> = {
  success: { kelas: "bg-success-subtle text-success border-success/25", ikon: CheckCircle2 },
  warning: { kelas: "bg-warning-subtle text-warning border-warning/30", ikon: AlertTriangle },
  danger: { kelas: "bg-danger-subtle text-danger border-danger/25", ikon: XCircle },
  info: { kelas: "bg-info-subtle text-info border-info/25", ikon: Info },
  neutral: { kelas: "bg-neutral-subtle text-neutral border-neutral/20", ikon: Circle },
};

/** Badge status: warna + ikon + teks, agar tidak bergantung pada warna saja. */
export function StatusBadge({
  jenis,
  nilai,
  className,
}: {
  jenis: JenisStatus;
  nilai: string;
  className?: string;
}) {
  const { label, nada } = definisiStatus(jenis, nilai);
  return <BadgeNada nada={nada} label={label} className={className} />;
}

export function BadgeNada({ nada, label, className }: { nada: Nada; label: string; className?: string }) {
  const { kelas, ikon: Ikon } = GAYA[nada];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        kelas,
        className,
      )}
    >
      <Ikon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
