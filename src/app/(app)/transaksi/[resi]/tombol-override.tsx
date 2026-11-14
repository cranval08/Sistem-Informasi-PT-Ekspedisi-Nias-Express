"use client";

import { ShieldAlert } from "lucide-react";
import { DialogForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { skemaOverrideBelumLunas } from "@/lib/domain/skema";
import { overrideBelumLunas } from "../aksi";

export function TombolOverrideBelumLunas({ noResi, sisa }: { noResi: string; sisa: string }) {
  return (
    <DialogForm
      judul="Izinkan dimuat walau belum lunas?"
      deskripsi={`Sisa tagihan ${sisa}. Override hanya oleh Pemilik sesuai kebijakan perusahaan; alasan tercatat di audit log dan tidak dapat dihapus.`}
      pemicu={
        <Button variant="outline" size="default">
          <ShieldAlert aria-hidden /> Override Belum Lunas
        </Button>
      }
      aksi={overrideBelumLunas}
      skema={skemaOverrideBelumLunas}
      labelKirim="Simpan Override"
    >
      {(galat) => (
        <>
          <input type="hidden" name="no_resi" value={noResi} />
          <Field id="alasan_override_lunas" label="Alasan override" wajib galat={galat.alasan}>
            <AreaTeks
              {...ariaField("alasan_override_lunas", galat.alasan)}
              name="alasan"
              maxLength={300}
              placeholder="Contoh: pelanggan tetap, pelunasan di loket tujuan"
            />
          </Field>
        </>
      )}
    </DialogForm>
  );
}
