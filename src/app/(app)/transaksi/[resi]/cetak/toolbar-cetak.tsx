"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FORMAT = [
  { nilai: "standar", label: "Standar (A5)" },
  { nilai: "thermal80", label: "Thermal 80 mm" },
  { nilai: "thermal58", label: "Thermal 58 mm" },
] as const;

/**
 * Toolbar cetak (tidak ikut tercetak). Mencetak memakai dialog print
 * browser; printer thermal Bluetooth hanya dapat dipakai bila perangkat
 * dan browser mendukungnya — tidak ada koneksi printer khusus.
 */
export function ToolbarCetak({ noResi, format, otomatis }: { noResi: string; format: string; otomatis: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sudah = useRef(false);

  useEffect(() => {
    if (!otomatis || sudah.current) return;
    sudah.current = true;
    // Hapus ?otomatis agar muat ulang tidak membuka dialog cetak lagi.
    router.replace(format === "standar" ? pathname : `${pathname}?format=${format}`, { scroll: false });
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [otomatis, format, pathname, router]);

  return (
    <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href={`/transaksi/${noResi}`}>
          <ArrowLeft aria-hidden /> Kembali ke detail transaksi
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Format cetak" className="inline-flex rounded-lg border bg-card p-0.5">
          {FORMAT.map((f) => (
            <Link
              key={f.nilai}
              href={f.nilai === "standar" ? pathname : `${pathname}?format=${f.nilai}`}
              replace
              aria-current={format === f.nilai ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground",
                format === f.nilai && "bg-primary text-primary-foreground hover:text-primary-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <Button size="lg" onClick={() => window.print()}>
          <Printer aria-hidden /> Cetak
        </Button>
      </div>
    </div>
  );
}
