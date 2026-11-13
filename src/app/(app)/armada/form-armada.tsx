"use client";

import { Activity, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { DialogForm, KonfirmasiAksi } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JENIS_UNIT, skemaArmada, skemaStatusArmada, STATUS_ARMADA_MANUAL } from "@/lib/domain/skema";
import { STATUS_ARMADA } from "@/lib/domain/status";
import { simpanArmada, ubahKeaktifanArmada, ubahStatusArmada } from "./aksi";

export type BarisArmada = {
  id: string;
  plat: string;
  jenis: (typeof JENIS_UNIT)[number];
  kapasitas: string;
  idSupir: string | null;
  status: keyof typeof STATUS_ARMADA;
  aktif: boolean;
  catatan: string | null;
};

/** Supir aktif + armada lain yang sudah memakai supir tersebut (untuk peringatan). */
export type PilihanSupir = { id: string; nama: string; armada: { id: string; plat: string }[] };

function IsianArmada({ galat, awal, supir }: { galat: Record<string, string>; awal?: BarisArmada; supir: PilihanSupir[] }) {
  return (
    <>
      {awal && <input type="hidden" name="id_armada" value={awal.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="plat_nomor" label="Plat nomor" wajib galat={galat.plat_nomor} bantuan="Contoh: BB 1234 AB">
          <Input
            {...ariaField("plat_nomor", galat.plat_nomor, true)}
            name="plat_nomor"
            defaultValue={awal?.plat}
            autoComplete="off"
            className="uppercase"
          />
        </Field>
        <Field id="jenis_unit" label="Jenis unit" wajib galat={galat.jenis_unit}>
          <Select name="jenis_unit" defaultValue={awal?.jenis}>
            <SelectTrigger {...ariaField("jenis_unit", galat.jenis_unit)} className="w-full">
              <SelectValue placeholder="Pilih jenis unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kecil">Kecil</SelectItem>
              <SelectItem value="besar">Besar</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field
        id="kapasitas_ton"
        label="Kapasitas muatan (ton)"
        wajib
        galat={galat.kapasitas_ton}
        bantuan="Isi sesuai kapasitas aktual unit. Maksimal 3 angka desimal, contoh: 7,5"
      >
        <Input
          {...ariaField("kapasitas_ton", galat.kapasitas_ton, true)}
          name="kapasitas_ton"
          inputMode="decimal"
          defaultValue={awal?.kapasitas.replace(".", ",")}
          autoComplete="off"
        />
      </Field>
      <Field
        id="id_supir"
        label="Supir"
        galat={galat.id_supir}
        bantuan={supir.length ? "Dipilih dari pengguna aktif berperan Supir." : "Belum ada pengguna aktif berperan Supir. Tambahkan di menu Data Pengguna."}
      >
        <Select name="id_supir" defaultValue={awal?.idSupir ?? "tanpa"}>
          <SelectTrigger {...ariaField("id_supir", galat.id_supir, true)} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tanpa">— Belum ditugaskan —</SelectItem>
            {supir.map((s) => {
              const lain = s.armada.filter((a) => a.id !== awal?.id).map((a) => a.plat);
              return (
                <SelectItem key={s.id} value={s.id}>
                  {s.nama}
                  {lain.length > 0 && <span className="text-muted-foreground"> · juga di {lain.join(", ")}</span>}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>
      <Field id="catatan" label="Catatan" galat={galat.catatan}>
        <AreaTeks {...ariaField("catatan", galat.catatan)} name="catatan" defaultValue={awal?.catatan ?? ""} maxLength={500} />
      </Field>
    </>
  );
}

export function TombolTambahArmada({ supir }: { supir: PilihanSupir[] }) {
  return (
    <DialogForm
      judul="Tambah Armada"
      deskripsi="Armada baru berstatus Siaga. Kapasitas wajib diisi; sistem tidak memakai nilai bawaan."
      pemicu={
        <Button size="lg">
          <Plus aria-hidden /> Tambah Armada
        </Button>
      }
      aksi={simpanArmada}
      skema={skemaArmada}
    >
      {(galat) => <IsianArmada galat={galat} supir={supir} />}
    </DialogForm>
  );
}

export function AksiBarisArmada({ a, supir }: { a: BarisArmada; supir: PilihanSupir[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <DialogForm
        judul={`Ubah Armada ${a.plat}`}
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`Ubah ${a.plat}`}>
            <Pencil aria-hidden /> Ubah
          </Button>
        }
        aksi={simpanArmada}
        skema={skemaArmada}
      >
        {(galat) => <IsianArmada galat={galat} awal={a} supir={supir} />}
      </DialogForm>
      {a.aktif && <DialogStatusArmada a={a} />}
      <KonfirmasiAksi
        judul={a.aktif ? `Nonaktifkan ${a.plat}?` : `Aktifkan kembali ${a.plat}?`}
        deskripsi={
          a.aktif
            ? "Armada nonaktif tidak dapat dipilih untuk manifes baru. Riwayat perjalanan tetap tersimpan."
            : "Armada akan dapat dipilih kembali untuk manifes."
        }
        labelKonfirmasi={a.aktif ? "Nonaktifkan" : "Aktifkan"}
        bahaya={a.aktif}
        aksi={ubahKeaktifanArmada}
        data={{ id_armada: a.id, aktif: String(!a.aktif) }}
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`${a.aktif ? "Nonaktifkan" : "Aktifkan"} ${a.plat}`}>
            {a.aktif ? <PowerOff aria-hidden /> : <Power aria-hidden />}
            {a.aktif ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        }
      />
    </div>
  );
}

function DialogStatusArmada({ a }: { a: BarisArmada }) {
  const pilihan = STATUS_ARMADA_MANUAL.filter((s) => s !== a.status);
  return (
    <DialogForm
      judul={`Ubah Status ${a.plat}`}
      deskripsi={`Status saat ini: ${STATUS_ARMADA[a.status].label}. Status Perjalanan diatur otomatis dari manifes.`}
      pemicu={
        <Button variant="ghost" size="sm" aria-label={`Ubah status ${a.plat}`}>
          <Activity aria-hidden /> Status
        </Button>
      }
      aksi={ubahStatusArmada}
      skema={skemaStatusArmada}
      labelKirim="Simpan Status"
    >
      {(galat) => (
        <>
          <input type="hidden" name="id_armada" value={a.id} />
          <Field id="status" label="Status baru" wajib galat={galat.status}>
            <Select name="status">
              <SelectTrigger {...ariaField("status", galat.status)} className="w-full">
                <SelectValue placeholder="Pilih status" />
              </SelectTrigger>
              <SelectContent>
                {pilihan.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_ARMADA[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="catatan_status" label="Catatan" galat={galat.catatan} bantuan="Wajib untuk Perbaikan atau Rusak, mis. jenis kerusakan.">
            <AreaTeks {...ariaField("catatan_status", galat.catatan, true)} name="catatan" maxLength={500} />
          </Field>
        </>
      )}
    </DialogForm>
  );
}
