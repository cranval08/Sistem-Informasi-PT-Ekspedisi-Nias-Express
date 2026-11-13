"use client";

import { AlertCircle, Construction, Inbox, RotateCw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export function ErrorState({
  judul = "Data gagal dimuat",
  deskripsi = "Periksa koneksi internet Anda, lalu coba lagi.",
  onCobaLagi,
}: {
  judul?: string;
  deskripsi?: string;
  onCobaLagi?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/25 bg-danger-subtle px-6 py-10 text-center"
    >
      <AlertCircle className="size-6 text-danger" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium text-danger">{judul}</p>
        <p className="text-sm text-foreground/80">{deskripsi}</p>
      </div>
      {onCobaLagi && (
        <Button variant="outline" size="sm" onClick={onCobaLagi}>
          <RotateCw aria-hidden /> Coba lagi
        </Button>
      )}
    </div>
  );
}

export function TabelSkeleton({ baris = 5, kolom = 4 }: { baris?: number; kolom?: number }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: baris }).map((_, i) => (
        <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${kolom}, minmax(0, 1fr))` }}>
          {Array.from({ length: kolom }).map((_, j) => (
            <Skeleton key={j} className="h-5" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Penanda jujur untuk modul yang belum dibangun — tidak menampilkan data
 * palsu (PRD §18: modul yang belum terhubung harus diberi label jelas).
 */
export function ModulBelumTersedia({ fase, deskripsi }: { fase: number; deskripsi?: string }) {
  return (
    <EmptyState
      ikon={Construction}
      judul={`Modul ini dijadwalkan pada Fase ${fase}`}
      deskripsi={
        deskripsi ??
        "Halaman ini belum terhubung ke database dan belum dapat digunakan. Hak akses halaman sudah diterapkan."
      }
    />
  );
}
