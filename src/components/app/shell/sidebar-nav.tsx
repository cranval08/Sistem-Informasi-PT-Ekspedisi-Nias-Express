"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BarChart3,
  Database,
  FileClock,
  Loader2,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { menuUntuk, RUTE, ruteDariPath, type Peran } from "@/lib/domain/peran";

const IKON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  transaksi: ReceiptText,
  pelanggan: Users,
  manifes: Warehouse,
  armada: Truck,
  pembayaran: Banknote,
  laporan: BarChart3,
  master: Database,
  pengaturan: Settings,
  audit: FileClock,
};

export function SidebarNav({ peran, onNavigasi }: { peran: Peran; onNavigasi?: () => void }) {
  const pathname = usePathname();
  const aktif = ruteDariPath(pathname);
  const grup = menuUntuk(peran);

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-1 px-3 py-4">
      {grup.map((g) => {
        const Ikon = IKON[g.ikon] ?? LayoutDashboard;
        // Grup satu item ditampilkan sebagai tautan langsung.
        if (g.item.length === 1 && RUTE[g.item[0]].judul === g.label) {
          const k = g.item[0];
          return (
            <TautanMenu key={g.label} href={RUTE[k].href} aktif={aktif === k} onClick={onNavigasi}>
              <Ikon className="size-4" aria-hidden />
              {g.label}
            </TautanMenu>
          );
        }
        return (
          <div key={g.label} className="mt-3 first:mt-0">
            <p className="flex items-center gap-2 px-2 pb-1 text-xs font-medium tracking-wide text-sidebar-foreground/60 uppercase">
              <Ikon className="size-3.5" aria-hidden />
              {g.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {g.item.map((k) => (
                <TautanMenu key={k} href={RUTE[k].href} aktif={aktif === k} onClick={onNavigasi} inset>
                  {RUTE[k].judul}
                </TautanMenu>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function TautanMenu({
  href,
  aktif,
  inset,
  onClick,
  children,
}: {
  href: string;
  aktif: boolean;
  inset?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={aktif ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        inset && "pl-7",
        aktif && "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary",
      )}
    >
      {children}
      <IndikatorMemuat />
    </Link>
  );
}

/**
 * Loading state navigasi (PRD §14): halaman internal dirender dinamis di
 * server tanpa loading.tsx (agar status 307/404 tetap benar), jadi tautan
 * yang diklik menampilkan pemutar kecil sampai halaman tujuan siap.
 * Ukuran tetap & hanya opasitas yang berubah agar tidak menggeser tata letak.
 */
function IndikatorMemuat() {
  const { pending } = useLinkStatus();
  return (
    <span className="ml-auto flex size-4 shrink-0 items-center justify-center">
      <Loader2 aria-hidden className={cn("size-3.5 animate-spin transition-opacity", pending ? "opacity-100" : "opacity-0")} />
      {pending && <span className="sr-only">Memuat…</span>}
    </span>
  );
}
