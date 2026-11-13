"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tampilan galat dengan tombol "Coba lagi". Komponen klien karena menerima
 * handler `onCobaLagi`. Pakai dari Client Component atau dari error.tsx.
 */
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
