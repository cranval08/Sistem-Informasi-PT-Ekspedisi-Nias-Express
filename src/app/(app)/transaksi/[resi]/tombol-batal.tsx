"use client";

import { Ban } from "lucide-react";
import { DialogForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { skemaBatalTransaksi } from "@/lib/domain/skema";
import { batalkanTransaksi } from "../aksi";

export function TombolBatalTransaksi({ noResi }: { noResi: string }) {
  return (
    <DialogForm
      judul={`Batalkan transaksi ${noResi}?`}
      deskripsi="Transaksi tidak dihapus, tetapi ditandai dibatalkan dan tidak dapat diproses lagi. Alasan tercatat di audit log."
      pemicu={
        <Button variant="destructive" size="lg">
          <Ban aria-hidden /> Batalkan Transaksi
        </Button>
      }
      aksi={batalkanTransaksi}
      skema={skemaBatalTransaksi}
      labelKirim="Batalkan Transaksi"
    >
      {(galat) => (
        <>
          <input type="hidden" name="no_resi" value={noResi} />
          <Field id="alasan" label="Alasan pembatalan" wajib galat={galat.alasan}>
            <AreaTeks {...ariaField("alasan", galat.alasan)} name="alasan" maxLength={300} placeholder="Contoh: pelanggan membatalkan pengiriman" />
          </Field>
        </>
      )}
    </DialogForm>
  );
}
