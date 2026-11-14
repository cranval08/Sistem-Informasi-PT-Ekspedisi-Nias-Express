"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { HasilAksi } from "@/lib/aksi/hasil";
import { dataForm, galatPerField, type GalatField } from "@/lib/domain/skema";
import { cn } from "@/lib/utils";

type Aksi = (formData: FormData) => Promise<HasilAksi<unknown>>;

const PESAN_PUTUS = "Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.";

/**
 * Kirim form ke server action: validasi Zod di klien dulu, lalu server.
 * Tidak memakai `<form action>` agar isian tidak di-reset saat server
 * menolak (React me-reset form setelah action selesai).
 */
export function useKirimForm(aksi: Aksi, skema?: z.ZodType, onBerhasil?: (data: unknown) => void) {
  const [galat, setGalat] = useState<GalatField>({});
  const [pesan, setPesan] = useState<string>();
  const [sedangProses, mulai] = useTransition();

  function bersihkan() {
    setGalat({});
    setPesan(undefined);
  }

  function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (skema) {
      const r = skema.safeParse(dataForm(fd));
      if (!r.success) {
        setGalat(galatPerField(r.error));
        setPesan("Periksa kembali isian yang ditandai.");
        return;
      }
    }
    mulai(async () => {
      let h: HasilAksi<unknown>;
      try {
        h = await aksi(fd);
      } catch {
        h = { ok: false, pesan: PESAN_PUTUS };
      }
      if (h.ok) {
        toast.success(h.pesan ?? "Data tersimpan.");
        bersihkan();
        onBerhasil?.(h.data);
      } else {
        setGalat(h.galat ?? {});
        setPesan(h.pesan);
      }
    });
  }

  return { galat, pesan, sedangProses, kirim, bersihkan };
}

/** Pesan galat umum di atas form. */
export function PesanGalatForm({ pesan }: { pesan?: string }) {
  if (!pesan) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle aria-hidden />
      <AlertDescription>{pesan}</AlertDescription>
    </Alert>
  );
}

/**
 * Dialog berisi form yang dikirim ke server action. Validasi Zod di klien
 * memberi umpan balik cepat; server action memvalidasi ulang dan database
 * menjadi penjaga terakhir. Form tidak di-reset bila server menolak,
 * sehingga isian pengguna tidak hilang.
 */
export function DialogForm({
  judul,
  deskripsi,
  pemicu,
  aksi,
  skema,
  labelKirim = "Simpan",
  className,
  children,
}: {
  judul: string;
  deskripsi?: string;
  pemicu: ReactNode;
  aksi: Aksi;
  skema?: z.ZodType;
  labelKirim?: string;
  className?: string;
  children: (galat: GalatField) => ReactNode;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const { galat, pesan, sedangProses, kirim, bersihkan } = useKirimForm(aksi, skema, () => setTerbuka(false));

  function ubahTerbuka(v: boolean) {
    if (sedangProses) return;
    setTerbuka(v);
    bersihkan();
  }

  return (
    <Dialog open={terbuka} onOpenChange={ubahTerbuka}>
      <DialogTrigger asChild>{pemicu}</DialogTrigger>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle>{judul}</DialogTitle>
          {deskripsi && <DialogDescription>{deskripsi}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={kirim} noValidate className="space-y-4">
          <PesanGalatForm pesan={pesan} />
          {children(galat)}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => ubahTerbuka(false)} disabled={sedangProses}>
              Batal
            </Button>
            <Button type="submit" disabled={sedangProses}>
              {sedangProses && <Loader2 className="animate-spin" aria-hidden />}
              {sedangProses ? "Menyimpan…" : labelKirim}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tombol dengan dialog konfirmasi untuk aksi satu langkah (mis.
 * nonaktifkan / aktifkan). `data` dikirim sebagai field FormData.
 */
export function KonfirmasiAksi({
  judul,
  deskripsi,
  pemicu,
  labelKonfirmasi,
  aksi,
  data,
  bahaya,
}: {
  judul: string;
  deskripsi: ReactNode;
  pemicu: ReactNode;
  labelKonfirmasi: string;
  aksi: Aksi;
  data: Record<string, string>;
  bahaya?: boolean;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [sedangProses, mulai] = useTransition();

  function jalankan(e: React.MouseEvent) {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.set(k, v);
    mulai(async () => {
      let h: HasilAksi<unknown>;
      try {
        h = await aksi(fd);
      } catch {
        h = { ok: false, pesan: PESAN_PUTUS };
      }
      if (h.ok) toast.success(h.pesan ?? "Perubahan tersimpan.");
      else toast.error(h.pesan ?? "Perubahan gagal disimpan.");
      setTerbuka(false);
    });
  }

  return (
    <AlertDialog open={terbuka} onOpenChange={(v) => !sedangProses && setTerbuka(v)}>
      <AlertDialogTrigger asChild>{pemicu}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{judul}</AlertDialogTitle>
          <AlertDialogDescription>{deskripsi}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sedangProses}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={jalankan}
            disabled={sedangProses}
            className={bahaya ? "bg-danger text-white hover:bg-danger/90" : undefined}
          >
            {sedangProses && <Loader2 className="animate-spin" aria-hidden />}
            {labelKonfirmasi}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
