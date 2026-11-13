import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Akses ditolak" };

export default function AksesDitolak() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md space-y-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <ShieldX className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Anda tidak memiliki akses ke halaman ini</h1>
          <p className="text-sm text-muted-foreground">
            Halaman tersebut tidak tersedia untuk peran Anda. Jika Anda memerlukan akses, hubungi Pemilik.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
