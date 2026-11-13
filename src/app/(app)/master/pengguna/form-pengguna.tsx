"use client";

import { KeyRound, Pencil, Power, PowerOff, UserPlus } from "lucide-react";
import { DialogForm, KonfirmasiAksi } from "@/components/app/form/dialog-form";
import { ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LABEL_PERAN, type Peran } from "@/lib/domain/peran";
import { PERAN, skemaAturPassword, skemaPenggunaBaru, skemaUbahPengguna } from "@/lib/domain/skema";
import { aturUlangPassword, tambahPengguna, ubahKeaktifanPengguna, ubahPengguna } from "./aksi";

export type BarisPengguna = {
  id: string;
  nama: string;
  email: string;
  telepon: string;
  peran: Peran;
  aktif: boolean;
  diriSendiri: boolean;
};

function IsianProfil({ galat, awal }: { galat: Record<string, string>; awal?: BarisPengguna }) {
  return (
    <>
      <Field id="nama_lengkap" label="Nama lengkap" wajib galat={galat.nama_lengkap}>
        <Input {...ariaField("nama_lengkap", galat.nama_lengkap)} name="nama_lengkap" defaultValue={awal?.nama} maxLength={120} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nomor_telepon" label="Nomor telepon" wajib galat={galat.nomor_telepon} bantuan="10–13 digit, disimpan 08xx">
          <Input {...ariaField("nomor_telepon", galat.nomor_telepon, true)} name="nomor_telepon" inputMode="tel" defaultValue={awal?.telepon} autoComplete="off" />
        </Field>
        <Field
          id="peran"
          label="Peran"
          wajib
          galat={galat.peran}
          bantuan={awal?.diriSendiri ? "Anda tidak dapat mengubah peran akun Anda sendiri." : undefined}
        >
          {awal?.diriSendiri ? (
            <>
              <input type="hidden" name="peran" value={awal.peran} />
              <Input id="peran" value={LABEL_PERAN[awal.peran]} disabled aria-describedby="peran-bantuan" />
            </>
          ) : (
            <Select name="peran" defaultValue={awal?.peran}>
              <SelectTrigger {...ariaField("peran", galat.peran)} className="w-full">
                <SelectValue placeholder="Pilih peran" />
              </SelectTrigger>
              <SelectContent>
                {PERAN.map((p) => (
                  <SelectItem key={p} value={p}>
                    {LABEL_PERAN[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
    </>
  );
}

function IsianPassword({ galat, label = "Password" }: { galat: Record<string, string>; label?: string }) {
  return (
    <Field id="password" label={label} wajib galat={galat.password} bantuan="Minimal 8 karakter. Sampaikan langsung kepada pengguna, jangan lewat grup.">
      <Input {...ariaField("password", galat.password, true)} name="password" type="password" autoComplete="new-password" />
    </Field>
  );
}

export function TombolTambahPengguna() {
  return (
    <DialogForm
      judul="Tambah Pengguna"
      deskripsi="Akun login dibuat langsung oleh Pemilik. Pengguna masuk dengan email dan password awal ini."
      pemicu={
        <Button size="lg">
          <UserPlus aria-hidden /> Tambah Pengguna
        </Button>
      }
      aksi={tambahPengguna}
      skema={skemaPenggunaBaru}
      labelKirim="Buat Akun"
    >
      {(galat) => (
        <>
          <IsianProfil galat={galat} />
          <Field id="email" label="Email login" wajib galat={galat.email} bantuan="Tidak dapat diubah setelah akun dibuat.">
            <Input {...ariaField("email", galat.email, true)} name="email" type="email" inputMode="email" autoComplete="off" />
          </Field>
          <IsianPassword galat={galat} label="Password awal" />
        </>
      )}
    </DialogForm>
  );
}

export function AksiBarisPengguna({ p }: { p: BarisPengguna }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <DialogForm
        judul={`Ubah ${p.nama}`}
        deskripsi={`Email login: ${p.email}`}
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`Ubah ${p.nama}`}>
            <Pencil aria-hidden /> Ubah
          </Button>
        }
        aksi={ubahPengguna}
        skema={skemaUbahPengguna}
      >
        {(galat) => (
          <>
            <input type="hidden" name="id_pengguna" value={p.id} />
            <IsianProfil galat={galat} awal={p} />
          </>
        )}
      </DialogForm>
      <DialogForm
        judul={`Atur Ulang Password ${p.nama}`}
        deskripsi="Password lama tidak lagi berlaku setelah disimpan. Aksi ini tercatat di audit log (tanpa nilai password)."
        pemicu={
          <Button variant="ghost" size="sm" aria-label={`Atur ulang password ${p.nama}`}>
            <KeyRound aria-hidden /> Password
          </Button>
        }
        aksi={aturUlangPassword}
        skema={skemaAturPassword}
        labelKirim="Simpan Password"
      >
        {(galat) => (
          <>
            <input type="hidden" name="id_pengguna" value={p.id} />
            <IsianPassword galat={galat} label="Password baru" />
            <Field id="konfirmasi" label="Ulangi password baru" wajib galat={galat.konfirmasi}>
              <Input {...ariaField("konfirmasi", galat.konfirmasi)} name="konfirmasi" type="password" autoComplete="new-password" />
            </Field>
          </>
        )}
      </DialogForm>
      {!p.diriSendiri && (
        <KonfirmasiAksi
          judul={p.aktif ? `Nonaktifkan ${p.nama}?` : `Aktifkan kembali ${p.nama}?`}
          deskripsi={
            p.aktif
              ? "Pengguna nonaktif tidak dapat login dan tidak dapat mengakses data apa pun. Riwayat aktivitasnya tetap tersimpan."
              : "Pengguna akan dapat login kembali dengan password terakhirnya."
          }
          labelKonfirmasi={p.aktif ? "Nonaktifkan" : "Aktifkan"}
          bahaya={p.aktif}
          aksi={ubahKeaktifanPengguna}
          data={{ id_pengguna: p.id, aktif: String(!p.aktif) }}
          pemicu={
            <Button variant="ghost" size="sm" aria-label={`${p.aktif ? "Nonaktifkan" : "Aktifkan"} ${p.nama}`}>
              {p.aktif ? <PowerOff aria-hidden /> : <Power aria-hidden />}
              {p.aktif ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          }
        />
      )}
    </div>
  );
}
