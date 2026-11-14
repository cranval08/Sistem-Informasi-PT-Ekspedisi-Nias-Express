"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, Truck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { keluar } from "@/lib/auth/aksi";
import { LABEL_PERAN, MENU, RUTE, ruteDariPath, type Peran } from "@/lib/domain/peran";
import { SidebarNav } from "./sidebar-nav";

type Props = {
  children: ReactNode;
  pengguna: { namaLengkap: string; email: string; peran: Peran };
  namaPerusahaan: string;
  modeDemo: boolean;
};

function Merek({ namaPerusahaan }: { namaPerusahaan: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-4">
      <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Truck className="size-4.5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">Nias Express</span>
        <span className="block text-xs text-sidebar-foreground/70">{namaPerusahaan}</span>
      </span>
    </Link>
  );
}

export function AppShell({ children, pengguna, namaPerusahaan, modeDemo }: Props) {
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const pathname = usePathname();
  const rute = ruteDariPath(pathname);
  const grup = rute ? MENU.find((g) => g.item.includes(rute)) : undefined;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto bg-sidebar lg:flex">
        <Merek namaPerusahaan={namaPerusahaan} />
        <SidebarNav peran={pengguna.peran} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64 print:pl-0">
        {modeDemo && (
          <div className="no-print bg-warning-subtle px-4 py-1.5 text-center text-xs font-medium text-warning">
            Data Demo: data di aplikasi ini adalah contoh, bukan data aktual perusahaan.
          </div>
        )}

        {/* Topbar */}
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
          <Sheet open={menuTerbuka} onOpenChange={setMenuTerbuka}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
              <SheetDescription className="sr-only">Pilih halaman yang ingin dibuka</SheetDescription>
              <div className="overflow-y-auto">
                <Merek namaPerusahaan={namaPerusahaan} />
                <SidebarNav peran={pengguna.peran} onNavigasi={() => setMenuTerbuka(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList>
              {grup && grup.label !== (rute && RUTE[rute].judul) && (
                <>
                  <BreadcrumbItem className="hidden sm:inline-flex">{grup.label}</BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:inline-flex" />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate font-medium">{rute ? RUTE[rute].judul : "Nias Express"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-2 px-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block max-w-40 truncate text-sm font-medium">{pengguna.namaLengkap}</span>
                  <span className="block text-xs text-muted-foreground">{LABEL_PERAN[pengguna.peran]}</span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block font-medium">{pengguna.namaLengkap}</span>
                <span className="block truncate text-xs text-muted-foreground">{pengguna.email}</span>
                <span className="block text-xs text-muted-foreground">Peran: {LABEL_PERAN[pengguna.peran]}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void keluar()}>
                <LogOut aria-hidden /> Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 print:p-0">
          <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
