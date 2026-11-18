"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Loader2, Search, UserPlus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cariPelangganTransaksi, tambahPelangganCepat, type PelangganPilihan } from "../aksi";

/**
 * Pilih pelanggan yang sudah ada (cari nama/telepon) atau tambah baru
 * langsung di form. Nomor telepon yang sudah terdaftar memakai data lama.
 */
export function PemilihPelanggan({
  judul,
  nilai,
  onPilih,
  galat,
}: {
  judul: string;
  nilai: PelangganPilihan | null;
  onPilih: (p: PelangganPilihan | null) => void;
  galat?: string;
}) {
  const id = useId();
  const [mode, setMode] = useState<"cari" | "baru">("cari");
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<PelangganPilihan[] | null>(null);
  const [mencari, setMencari] = useState(false);
  const permintaan = useRef(0);

  useEffect(() => {
    const kunci = q.trim();
    if (kunci.length < 2) return;
    const nomor = ++permintaan.current;
    const t = setTimeout(async () => {
      setMencari(true);
      try {
        const r = await cariPelangganTransaksi(kunci);
        if (nomor === permintaan.current) setHasil(r);
      } catch {
        if (nomor === permintaan.current) setHasil([]);
      } finally {
        if (nomor === permintaan.current) setMencari(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (nilai) {
    return (
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">{judul}</legend>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <UserRound className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium" title={nilai.nama}>{nilai.nama}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{nilai.telepon}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onPilih(null)}>
            Ganti
          </Button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">
        {judul}
        <span className="text-danger" aria-hidden>
          *
        </span>
      </legend>
      {mode === "cari" ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${id}-cari`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (e.target.value.trim().length < 2) setHasil(null);
              }}
              placeholder="Ketik nama atau nomor telepon…"
              className="h-10 pl-8"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              aria-label={`Cari ${judul.toLowerCase()}`}
              aria-invalid={galat ? true : undefined}
              aria-describedby={galat ? `${id}-galat` : undefined}
            />
            {mencari && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          {hasil && (
            <div role="listbox" aria-label={`Hasil pencarian ${judul.toLowerCase()}`} className="divide-y rounded-lg border">
              {hasil.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Tidak ada pelanggan aktif yang cocok.</p>
              ) : (
                hasil.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => onPilih(p)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="font-medium">{p.nama}</span>
                    <span className="text-muted-foreground tabular-nums">{p.telepon}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("baru")}>
            <UserPlus aria-hidden /> Pelanggan baru
          </Button>
        </div>
      ) : (
        <FormPelangganBaru
          idDasar={id}
          namaAwal={/\d/.test(q) ? "" : q}
          teleponAwal={/\d/.test(q) ? q : ""}
          onBatal={() => setMode("cari")}
          onSelesai={(p) => {
            setMode("cari");
            setQ("");
            setHasil(null);
            onPilih(p);
          }}
        />
      )}
      {galat && (
        <p id={`${id}-galat`} className="text-sm text-danger">
          {galat}
        </p>
      )}
    </fieldset>
  );
}

function FormPelangganBaru({
  idDasar,
  namaAwal,
  teleponAwal,
  onBatal,
  onSelesai,
}: {
  idDasar: string;
  namaAwal: string;
  teleponAwal: string;
  onBatal: () => void;
  onSelesai: (p: PelangganPilihan) => void;
}) {
  const [nama, setNama] = useState(namaAwal);
  const [telepon, setTelepon] = useState(teleponAwal);
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [proses, mulai] = useTransition();

  function simpan() {
    mulai(async () => {
      try {
        const h = await tambahPelangganCepat({ nama, telepon });
        if (h.ok && h.data) {
          (h.data.sudahAda ? toast.info : toast.success)(h.pesan);
          onSelesai(h.data.pelanggan);
        } else {
          setGalat(h.galat ?? {});
          if (!h.galat) toast.error(h.pesan ?? "Pelanggan gagal disimpan.");
        }
      } catch {
        toast.error("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  return (
    // Enter menyimpan pelanggan ini, bukan mengirim form transaksi.
    <div
      className="space-y-3 rounded-lg border border-dashed p-3"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          simpan();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Pelanggan baru</p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBatal} aria-label="Batal tambah pelanggan">
          <X aria-hidden />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${idDasar}-nama`} label="Nama" wajib galat={galat.nama}>
          <Input {...ariaField(`${idDasar}-nama`, galat.nama)} value={nama} onChange={(e) => setNama(e.target.value)} maxLength={120} autoComplete="off" />
        </Field>
        <Field id={`${idDasar}-telepon`} label="Nomor telepon" wajib galat={galat.telepon} bantuan="10–13 digit, contoh 081234567890">
          <Input
            {...ariaField(`${idDasar}-telepon`, galat.telepon, true)}
            value={telepon}
            onChange={(e) => setTelepon(e.target.value)}
            inputMode="tel"
            autoComplete="off"
          />
        </Field>
      </div>
      <Button type="button" size="sm" onClick={simpan} disabled={proses}>
        {proses && <Loader2 className="animate-spin" aria-hidden />} Simpan &amp; pilih
      </Button>
    </div>
  );
}
