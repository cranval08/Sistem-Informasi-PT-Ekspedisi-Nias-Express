"use client";

import { Loader2 } from "lucide-react";
import { PesanGalatForm, useKirimForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field, KotakCentang } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { skemaPengaturan } from "@/lib/domain/skema";
import { simpanPengaturan } from "./aksi";

export type NilaiPengaturan = {
  nama_perusahaan: string;
  alamat: string | null;
  telepon: string | null;
  prefiks_resi: string;
  ambang_peringatan_kapasitas_persen: number | null;
  izinkan_override_kapasitas: boolean;
  izinkan_override_belum_lunas: boolean;
  mode_demo: boolean;
};

export function FormPengaturan({ awal, contohResi }: { awal: NilaiPengaturan; contohResi: string }) {
  const { galat, pesan, sedangProses, kirim } = useKirimForm(simpanPengaturan, skemaPengaturan);

  return (
    <form onSubmit={kirim} noValidate className="space-y-6">
      <PesanGalatForm pesan={pesan} />

      <Card>
        <CardHeader>
          <CardTitle>Identitas perusahaan</CardTitle>
          <CardDescription>Ditampilkan pada resi dan kop laporan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="nama_perusahaan" label="Nama perusahaan" wajib galat={galat.nama_perusahaan}>
            <Input {...ariaField("nama_perusahaan", galat.nama_perusahaan)} name="nama_perusahaan" defaultValue={awal.nama_perusahaan} maxLength={150} />
          </Field>
          <Field id="alamat" label="Alamat" galat={galat.alamat} bantuan={awal.alamat ? undefined : "Perlu dilengkapi untuk dicetak pada resi."}>
            <AreaTeks {...ariaField("alamat", galat.alamat, !awal.alamat)} name="alamat" defaultValue={awal.alamat ?? ""} maxLength={300} />
          </Field>
          <Field id="telepon" label="Telepon perusahaan" galat={galat.telepon} bantuan={awal.telepon ? undefined : "Perlu dilengkapi untuk dicetak pada resi."}>
            <Input {...ariaField("telepon", galat.telepon, !awal.telepon)} name="telepon" inputMode="tel" defaultValue={awal.telepon ?? ""} maxLength={30} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nomor resi</CardTitle>
          <CardDescription>Format: PREFIKS-YYYYMMDD-NNNN, nomor urut per hari (zona waktu Asia/Jakarta).</CardDescription>
        </CardHeader>
        <CardContent>
          <Field
            id="prefiks_resi"
            label="Prefiks resi"
            wajib
            galat={galat.prefiks_resi}
            bantuan={`Contoh resi: ${contohResi}. Perubahan hanya berlaku untuk resi baru.`}
            className="max-w-xs"
          >
            <Input {...ariaField("prefiks_resi", galat.prefiks_resi, true)} name="prefiks_resi" defaultValue={awal.prefiks_resi} maxLength={6} className="uppercase" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kapasitas & kebijakan override</CardTitle>
          <CardDescription>
            Nilai ini ditentukan perusahaan; sistem tidak mengisinya otomatis. Override hanya dapat dilakukan Pemilik, wajib alasan, dan
            tercatat di audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="ambang_peringatan_kapasitas_persen"
            label="Ambang peringatan kapasitas truk (%)"
            galat={galat.ambang_peringatan_kapasitas_persen}
            bantuan={
              awal.ambang_peringatan_kapasitas_persen == null
                ? "Belum diatur — perlu dilengkapi. Peringatan muncul saat muatan mencapai persentase ini dari kapasitas."
                : "Peringatan muncul saat muatan mencapai persentase ini dari kapasitas. Muatan di atas 100% tetap diblokir."
            }
            className="max-w-sm"
          >
            <Input
              {...ariaField("ambang_peringatan_kapasitas_persen", galat.ambang_peringatan_kapasitas_persen, true)}
              name="ambang_peringatan_kapasitas_persen"
              inputMode="decimal"
              defaultValue={awal.ambang_peringatan_kapasitas_persen?.toString().replace(".", ",") ?? ""}
              placeholder="Perlu dilengkapi"
            />
          </Field>
          <KotakCentang
            id="izinkan_override_kapasitas"
            name="izinkan_override_kapasitas"
            label="Izinkan Pemilik meng-override muatan melebihi kapasitas"
            keterangan="Bila tidak dicentang, manifes yang melebihi kapasitas selalu diblokir."
            defaultChecked={awal.izinkan_override_kapasitas}
          />
          <KotakCentang
            id="izinkan_override_belum_lunas"
            name="izinkan_override_belum_lunas"
            label="Izinkan Pemilik meng-override pemuatan barang yang belum lunas"
            keterangan="Bila tidak dicentang, barang belum lunas tidak dapat dimuat ke truk."
            defaultChecked={awal.izinkan_override_belum_lunas}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mode demo</CardTitle>
          <CardDescription>Menampilkan label &ldquo;Data Demo&rdquo; di seluruh aplikasi selama data contoh masih dipakai.</CardDescription>
        </CardHeader>
        <CardContent>
          <KotakCentang
            id="mode_demo"
            name="mode_demo"
            label="Tampilkan label Data Demo"
            keterangan="Matikan hanya setelah data contoh dibersihkan dan aplikasi memakai data operasional sebenarnya."
            defaultChecked={awal.mode_demo}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={sedangProses}>
          {sedangProses && <Loader2 className="animate-spin" aria-hidden />}
          {sedangProses ? "Menyimpan…" : "Simpan Pengaturan"}
        </Button>
      </div>
    </form>
  );
}
