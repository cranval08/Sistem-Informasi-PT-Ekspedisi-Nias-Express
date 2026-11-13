"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { DialogForm, KonfirmasiAksi } from "@/components/app/form/dialog-form";
import { ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { skemaPelanggan } from "@/lib/domain/skema";
import { cekTeleponPelanggan, simpanPelanggan, ubahStatusPelanggan } from "./aksi";

export type BarisPelanggan = { id: string; nama: string; telepon: string; aktif: boolean };

function IsianPelanggan({ galat, awal }: { galat: Record<string, string>; awal?: BarisPelanggan }) {
  const [peringatan, setPeringatan] = useState<string | null>(null);

  async function periksa(nilai: string) {
    if (awal && nilai === awal.telepon) return setPeringatan(null);
    try {
      setPeringatan(await cekTeleponPelanggan(nilai, awal?.id));
    } catch {
      setPeringatan(null);
    }
  }

  return (
    <>
      {awal && <input type="hidden" name="id_pelanggan" value={awal.id} />}
      <Field id="nama" label="Nama pelanggan" wajib galat={galat.nama}>
        <Input {...ariaField("nama", galat.nama)} name="nama" defaultValue={awal?.nama} autoComplete="off" maxLength={120} />
      </Field>
      <Field
        id="telepon"
        label="Nomor telepon"
        wajib
        galat={galat.telepon}
        bantuan="Boleh diketik dengan +62, spasi, atau tanda hubung. Disimpan dalam format 08xx (10–13 digit)."
      >
        <Input
          {...ariaField("telepon", galat.telepon, true)}
          name="telepon"
          inputMode="tel"
          autoComplete="off"
          defaultValue={awal?.telepon}
          onBlur={(e) => periksa(e.currentTarget.value)}
        />
      </Field>
      {peringatan && !galat.telepon && (
        <p role="status" className="flex gap-2 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-foreground/90">{peringatan}</span>
        </p>
      )}
    </>
  );
}

export function TombolTambahPelanggan() {
  return (
    <DialogForm
      judul="Tambah Pelanggan"
      deskripsi="Pelanggan dapat menjadi pengirim maupun penerima pada transaksi."
      pemicu={
        <Button size="lg">
          <Plus aria-hidden /> Tambah Pelanggan
        </Button>
      }
      aksi={simpanPelanggan}
      skema={skemaPelanggan}
    >
      {(galat) => <IsianPelanggan galat={galat} />}
    </DialogForm>
  );
}

export function AksiBarisPelanggan({ p }: { p: BarisPelanggan }) {
  return (
    <div className="flex justify-end gap-1">
      <DialogForm
        judul="Ubah Pelanggan"
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`Ubah ${p.nama}`}>
            <Pencil aria-hidden /> Ubah
          </Button>
        }
        aksi={simpanPelanggan}
        skema={skemaPelanggan}
      >
        {(galat) => <IsianPelanggan galat={galat} awal={p} />}
      </DialogForm>
      <KonfirmasiAksi
        judul={p.aktif ? `Nonaktifkan ${p.nama}?` : `Aktifkan kembali ${p.nama}?`}
        deskripsi={
          p.aktif
            ? "Pelanggan nonaktif tidak muncul saat membuat transaksi baru. Riwayat transaksinya tetap tersimpan dan data dapat diaktifkan kembali."
            : "Pelanggan akan dapat dipilih kembali saat membuat transaksi."
        }
        labelKonfirmasi={p.aktif ? "Nonaktifkan" : "Aktifkan"}
        bahaya={p.aktif}
        aksi={ubahStatusPelanggan}
        data={{ id_pelanggan: p.id, aktif: String(!p.aktif) }}
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`${p.aktif ? "Nonaktifkan" : "Aktifkan"} ${p.nama}`}>
            {p.aktif ? <PowerOff aria-hidden /> : <Power aria-hidden />}
            {p.aktif ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        }
      />
    </div>
  );
}
