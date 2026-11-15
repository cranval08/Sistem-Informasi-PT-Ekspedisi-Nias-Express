import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Halaman tidak ditemukan" };

/** 404 untuk URL yang tidak dikenal (di luar shell aplikasi). */
export default function TidakDitemukan() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md space-y-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Halaman tidak ditemukan</h1>
          <p className="text-sm text-muted-foreground">Alamat yang Anda buka tidak tersedia. Periksa kembali tautan atau kembali ke Dashboard.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
