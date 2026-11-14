"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PesanGalatForm, useKirimForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAngka } from "@/lib/domain/format";
import { skemaManifes } from "@/lib/domain/skema";
import { buatManifes } from "../aksi";

export type PilihanArmada = {
  id: string;
  plat: string;
  jenis: string;
  kapasitasTon: number;
  idSupir: string | null;
  /** Alasan tidak dapat dipilih (status / perjalanan aktif); null = tersedia. */
  kendala: string | null;
};
export type PilihanSupirManifes = { id: string; nama: string; kendala: string | null };

export function FormManifes({ armada, supir }: { armada: PilihanArmada[]; supir: PilihanSupirManifes[] }) {
  const router = useRouter();
  const [idArmada, setIdArmada] = useState("");
  const [idSupir, setIdSupir] = useState("");
  const { galat, pesan, sedangProses, kirim } = useKirimForm(buatManifes, skemaManifes, (data) => {
    const id = (data as { id?: string } | undefined)?.id;
    router.push(id ? `/manifes/${id}` : "/manifes");
  });

  function pilihArmada(id: string) {
    setIdArmada(id);
    // Supir bawaan dari master armada, bila tersedia; petugas tetap dapat menggantinya.
    const bawaan = armada.find((a) => a.id === id)?.idSupir;
    if (bawaan && supir.some((s) => s.id === bawaan && !s.kendala)) setIdSupir(bawaan);
  }

  const dipilih = armada.find((a) => a.id === idArmada);

  return (
    <form onSubmit={kirim} noValidate className="space-y-4">
      <PesanGalatForm pesan={pesan} />
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="id_armada"
              label="Armada"
              wajib
              galat={galat.id_armada}
              bantuan={dipilih ? `Kapasitas ${formatAngka(dipilih.kapasitasTon)} ton · unit ${dipilih.jenis}` : "Hanya armada aktif berstatus Siaga tanpa perjalanan aktif."}
            >
              <Select name="id_armada" value={idArmada} onValueChange={pilihArmada}>
                <SelectTrigger {...ariaField("id_armada", galat.id_armada, true)} className="w-full">
                  <SelectValue placeholder="Pilih armada" />
                </SelectTrigger>
                <SelectContent>
                  {armada.map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={!!a.kendala}>
                      {a.plat} · {formatAngka(a.kapasitasTon)} ton{a.kendala ? ` — ${a.kendala}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="id_supir" label="Supir" wajib galat={galat.id_supir} bantuan="Terisi otomatis dari supir armada, dapat diganti.">
              <Select name="id_supir" value={idSupir} onValueChange={setIdSupir}>
                <SelectTrigger {...ariaField("id_supir", galat.id_supir, true)} className="w-full">
                  <SelectValue placeholder="Pilih supir" />
                </SelectTrigger>
                <SelectContent>
                  {supir.map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={!!s.kendala}>
                      {s.nama}
                      {s.kendala ? ` — ${s.kendala}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field id="rute" label="Rute" wajib galat={galat.rute} bantuan="Teks bebas, contoh: Gunungsitoli → Teluk Dalam">
            <Input {...ariaField("rute", galat.rute, true)} name="rute" maxLength={200} autoComplete="off" />
          </Field>
          <Field id="catatan" label="Catatan (opsional)" galat={galat.catatan}>
            <AreaTeks {...ariaField("catatan", galat.catatan)} name="catatan" maxLength={500} />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={sedangProses}>
          {sedangProses && <Loader2 className="animate-spin" aria-hidden />}
          {sedangProses ? "Menyimpan…" : "Buat Manifes"}
        </Button>
      </div>
    </form>
  );
}
