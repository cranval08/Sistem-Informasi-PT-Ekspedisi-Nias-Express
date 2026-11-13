"use client";

import { Banknote, PackageCheck, ReceiptText, Truck } from "lucide-react";
import { toast } from "sonner";
import { KpiCard } from "@/components/app/kpi-card";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState, TabelSkeleton } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JENIS_STATUS, type JenisStatus } from "@/lib/domain/status";

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{judul}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ContohSistemDesain() {
  return (
    <div className="space-y-6">
      <Bagian judul="Badge status">
        <div className="space-y-3">
          {(Object.keys(JENIS_STATUS) as JenisStatus[]).map((jenis) => (
            <div key={jenis} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-sm text-muted-foreground capitalize">{jenis}</span>
              {Object.keys(JENIS_STATUS[jenis]).map((n) => (
                <StatusBadge key={n} jenis={jenis} nilai={n} />
              ))}
            </div>
          ))}
        </div>
      </Bagian>

      <Bagian judul="Kartu KPI (nilai contoh tampilan, bukan data)">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total transaksi" nilai="—" keterangan="Periode terpilih" ikon={ReceiptText} />
          <KpiCard label="Penerimaan pembayaran" nilai="—" ikon={Banknote} />
          <KpiCard label="Dalam perjalanan" nilai="—" ikon={Truck} />
          <KpiCard label="Sudah diambil" nilai="—" ikon={PackageCheck} />
        </div>
      </Bagian>

      <Bagian judul="Tombol, form, dialog konfirmasi, dan toast">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button>Aksi utama</Button>
            <Button variant="outline">Sekunder</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Batalkan transaksi</Button>
            <Button variant="outline" onClick={() => toast.success("Transaksi berhasil disimpan.")}>
              Toast sukses
            </Button>
            <Button variant="outline" onClick={() => toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.")}>
              Toast gagal
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Dialog konfirmasi</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Batalkan transaksi ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Transaksi tidak dihapus, tetapi ditandai batal beserta alasan dan tercatat di audit log.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Kembali</AlertDialogCancel>
                  <AlertDialogAction>Ya, batalkan</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="contoh-telepon">Nomor telepon</Label>
            <Input id="contoh-telepon" placeholder="0812xxxxxxxx" aria-invalid aria-describedby="contoh-telepon-galat" />
            <p id="contoh-telepon-galat" className="text-sm text-danger">
              Nomor telepon harus 10–13 digit, contoh: 081234567890.
            </p>
          </div>
        </div>
      </Bagian>

      <Bagian judul="State: kosong, memuat, galat">
        <div className="grid gap-4 lg:grid-cols-3">
          <EmptyState judul="Belum ada transaksi" deskripsi="Transaksi yang dibuat akan tampil di sini." />
          <TabelSkeleton baris={4} kolom={3} />
          <ErrorState onCobaLagi={() => toast.info("Mencoba memuat ulang…")} />
        </div>
      </Bagian>
    </div>
  );
}
