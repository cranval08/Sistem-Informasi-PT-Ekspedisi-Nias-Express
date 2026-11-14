"use client";

import { Loader2, UserCheck } from "lucide-react";
import { PesanGalatForm, useKirimForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { skemaPengambilan } from "@/lib/domain/skema";
import { konfirmasiPengambilan } from "./aksi";

export function FormPengambilan({ noResi, namaPenerima }: { noResi: string; namaPenerima: string }) {
  const { galat, pesan, sedangProses, kirim } = useKirimForm(konfirmasiPengambilan, skemaPengambilan);
  return (
    <form onSubmit={kirim} noValidate className="space-y-4">
      <input type="hidden" name="no_resi" value={noResi} />
      <PesanGalatForm pesan={pesan} />
      <div className="space-y-1.5">
        <label
          htmlFor="identitas_terverifikasi"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-warning/40 bg-warning-subtle/50 p-3"
        >
          <input
            id="identitas_terverifikasi"
            name="identitas_terverifikasi"
            type="checkbox"
            aria-invalid={galat.identitas_terverifikasi ? true : undefined}
            aria-describedby={galat.identitas_terverifikasi ? "identitas_terverifikasi-galat" : undefined}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="text-sm">
            <span className="block font-medium">Saya sudah memeriksa identitas pengambil secara fisik</span>
            <span className="block text-muted-foreground">
              Identitas cocok dengan penerima <strong>{namaPenerima}</strong> sesuai prosedur perusahaan. Nomor resi saja tidak cukup sebagai bukti.
            </span>
          </span>
        </label>
        {galat.identitas_terverifikasi && (
          <p id="identitas_terverifikasi-galat" className="text-sm text-danger">
            {galat.identitas_terverifikasi}
          </p>
        )}
      </div>
      <Field id="catatan_pengambilan" label="Catatan (opsional)" galat={galat.catatan} bantuan="Contoh: jenis identitas yang diperiksa, diambil oleh keluarga dengan surat kuasa.">
        <AreaTeks {...ariaField("catatan_pengambilan", galat.catatan, true)} name="catatan" maxLength={300} />
      </Field>
      <Button type="submit" size="lg" disabled={sedangProses}>
        {sedangProses ? <Loader2 className="animate-spin" aria-hidden /> : <UserCheck aria-hidden />}
        Konfirmasi Pengambilan
      </Button>
    </form>
  );
}
