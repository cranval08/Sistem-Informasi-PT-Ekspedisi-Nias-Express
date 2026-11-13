"use client";

import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { DialogForm, KonfirmasiAksi } from "@/components/app/form/dialog-form";
import { ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LABEL_SATUAN, SATUAN, skemaItem } from "@/lib/domain/skema";
import { simpanItem, ubahStatusItem } from "./aksi";

export type BarisItem = { id: string; nama: string; satuan: (typeof SATUAN)[number]; tarif: number; aktif: boolean };

function IsianItem({ galat, awal }: { galat: Record<string, string>; awal?: BarisItem }) {
  return (
    <>
      {awal && <input type="hidden" name="id_item" value={awal.id} />}
      <Field id="nama_item" label="Nama jenis barang" wajib galat={galat.nama_item} bantuan="Nama baku yang dipilih admin dari dropdown saat transaksi.">
        <Input {...ariaField("nama_item", galat.nama_item, true)} name="nama_item" defaultValue={awal?.nama} maxLength={100} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="satuan" label="Satuan tarif" wajib galat={galat.satuan}>
          <Select name="satuan" defaultValue={awal?.satuan}>
            <SelectTrigger {...ariaField("satuan", galat.satuan)} className="w-full">
              <SelectValue placeholder="Pilih satuan" />
            </SelectTrigger>
            <SelectContent>
              {SATUAN.map((s) => (
                <SelectItem key={s} value={s}>
                  {LABEL_SATUAN[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="tarif_per_satuan" label="Tarif per satuan (Rp)" wajib galat={galat.tarif_per_satuan} bantuan="Bilangan bulat, contoh: 15000">
          <Input
            {...ariaField("tarif_per_satuan", galat.tarif_per_satuan, true)}
            name="tarif_per_satuan"
            inputMode="numeric"
            defaultValue={awal?.tarif}
            autoComplete="off"
          />
        </Field>
      </div>
      {awal && (
        <p className="rounded-lg bg-info-subtle p-3 text-sm text-foreground/90">
          Perubahan tarif hanya berlaku untuk transaksi baru. Transaksi lama tetap memakai tarif saat transaksi dibuat.
        </p>
      )}
    </>
  );
}

export function TombolTambahItem() {
  return (
    <DialogForm
      judul="Tambah Jenis Barang"
      deskripsi="Tarif ditentukan oleh Pemilik. Sistem tidak mengisi tarif secara otomatis."
      pemicu={
        <Button size="lg">
          <Plus aria-hidden /> Tambah Jenis Barang
        </Button>
      }
      aksi={simpanItem}
      skema={skemaItem}
    >
      {(galat) => <IsianItem galat={galat} />}
    </DialogForm>
  );
}

export function AksiBarisItem({ item }: { item: BarisItem }) {
  return (
    <div className="flex justify-end gap-1">
      <DialogForm
        judul="Ubah Jenis Barang & Tarif"
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`Ubah ${item.nama}`}>
            <Pencil aria-hidden /> Ubah
          </Button>
        }
        aksi={simpanItem}
        skema={skemaItem}
      >
        {(galat) => <IsianItem galat={galat} awal={item} />}
      </DialogForm>
      <KonfirmasiAksi
        judul={item.aktif ? `Nonaktifkan ${item.nama}?` : `Aktifkan kembali ${item.nama}?`}
        deskripsi={
          item.aktif
            ? "Jenis barang nonaktif tidak dapat dipilih pada transaksi baru. Transaksi lama tidak terpengaruh."
            : "Jenis barang akan dapat dipilih kembali pada transaksi baru."
        }
        labelKonfirmasi={item.aktif ? "Nonaktifkan" : "Aktifkan"}
        bahaya={item.aktif}
        aksi={ubahStatusItem}
        data={{ id_item: item.id, aktif: String(!item.aktif) }}
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`${item.aktif ? "Nonaktifkan" : "Aktifkan"} ${item.nama}`}>
            {item.aktif ? <PowerOff aria-hidden /> : <Power aria-hidden />}
            {item.aktif ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        }
      />
    </div>
  );
}
