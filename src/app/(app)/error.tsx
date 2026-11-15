"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/app/error-state";
import { Button } from "@/components/ui/button";

/**
 * Batas galat untuk semua halaman internal (PRD §14: error state). Tampil
 * di dalam shell aplikasi bila sebuah halaman gagal dirender, mis. kueri
 * database gagal atau koneksi terputus. Di produksi pesan asli galat server
 * disembunyikan oleh Next.js; yang ditampilkan hanya kode rujukan (digest)
 * agar dapat dicocokkan dengan log server.
 */
export default function GalatHalaman({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <ErrorState
        judul="Halaman gagal dimuat"
        deskripsi="Terjadi gangguan saat mengambil data. Periksa koneksi internet, lalu coba lagi. Data yang sudah tersimpan tidak terpengaruh."
        onCobaLagi={retry}
      />
      <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        {digest && <p>Kode rujukan untuk Pemilik/pengelola sistem: <span className="font-mono">{digest}</span></p>}
        <Button asChild variant="link" size="sm">
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
