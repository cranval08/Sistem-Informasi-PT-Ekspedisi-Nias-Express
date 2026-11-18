// Sengaja TANPA "use client": komponen di sini menerima prop berupa
// komponen ikon (fungsi) dari Server Component. Fungsi tidak dapat
// dikirim ke Client Component. State yang butuh interaksi ada di
// ./error-state.tsx.
import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  judul,
  deskripsi,
  ikon: Ikon = Inbox,
  aksi,
  className,
}: {
  judul: string;
  deskripsi?: string;
  ikon?: LucideIcon;
  aksi?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Ikon className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{judul}</p>
        {deskripsi && <p className="max-w-md text-sm text-muted-foreground">{deskripsi}</p>}
      </div>
      {aksi}
    </div>
  );
}
