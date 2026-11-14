"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Ban, CheckCircle2, ClipboardCheck, Flag, Loader2, PackagePlus, TriangleAlert, Truck, X } from "lucide-react";
import { DialogForm, KonfirmasiAksi, PesanGalatForm, useKirimForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAngka } from "@/lib/domain/format";
import { gramKeKg, hitungKapasitas, JENIS_KENDALA, keGram } from "@/lib/domain/manifes";
import { skemaBatalManifes, skemaKendala, skemaKonfirmasiMuat, skemaPindahResi, skemaTiba } from "@/lib/domain/skema";
import { cn } from "@/lib/utils";
import {
  batalkanManifes,
  konfirmasiBerangkat,
  konfirmasiMuat,
  konfirmasiTiba,
  laporkanKendala,
  lepasResiManifes,
  pindahkanResi,
  selesaikanKendala,
  tambahResiManifes,
} from "./aksi";

/**
 * Konfirmasi muat. Bila muatan melebihi kapasitas: tombol diblokir, kecuali
 * Pemilik dan kebijakan mengizinkan override — maka alasan wajib diisi.
 * Database menegakkan aturan yang sama (konfirmasi_muat).
 */
export function TombolKonfirmasiMuat({
  idManifes,
  melebihi,
  bolehOverride,
  jumlahResi,
}: {
  idManifes: string;
  melebihi: boolean;
  bolehOverride: boolean;
  jumlahResi: number;
}) {
  if (jumlahResi === 0) {
    return (
      <Button size="lg" disabled title="Tambahkan minimal satu resi">
        <ClipboardCheck aria-hidden /> Konfirmasi Muat
      </Button>
    );
  }
  if (melebihi && !bolehOverride) {
    return (
      <Button size="lg" disabled title="Muatan melebihi kapasitas">
        <ClipboardCheck aria-hidden /> Konfirmasi Muat (diblokir)
      </Button>
    );
  }
  return (
    <DialogForm
      judul={melebihi ? "Override kapasitas & konfirmasi muat" : "Konfirmasi muat?"}
      deskripsi={
        melebihi
          ? "Muatan melebihi kapasitas armada. Override hanya boleh dilakukan Pemilik sesuai kebijakan perusahaan; alasan tercatat di audit log."
          : `${jumlahResi} resi akan berstatus Dimuat. Setelah ini resi tidak dapat ditambah atau dilepas, hanya dipindahkan.`
      }
      pemicu={
        <Button size="lg" variant={melebihi ? "destructive" : "default"}>
          <ClipboardCheck aria-hidden /> {melebihi ? "Override & Konfirmasi Muat" : "Konfirmasi Muat"}
        </Button>
      }
      aksi={konfirmasiMuat}
      skema={skemaKonfirmasiMuat}
      labelKirim={melebihi ? "Override & Muat" : "Konfirmasi Muat"}
    >
      {(galat) => (
        <>
          <input type="hidden" name="id_manifes" value={idManifes} />
          {melebihi && (
            <Field id="alasan_override" label="Alasan override kapasitas" wajib galat={galat.alasan_override}>
              <AreaTeks {...ariaField("alasan_override", galat.alasan_override)} name="alasan_override" maxLength={300} />
            </Field>
          )}
        </>
      )}
    </DialogForm>
  );
}

export function TombolBerangkat({ idManifes, plat, ukuran = "lg" }: { idManifes: string; plat: string; ukuran?: "lg" | "default" }) {
  return (
    <KonfirmasiAksi
      judul="Konfirmasi keberangkatan?"
      deskripsi={`Armada ${plat} berstatus Perjalanan dan semua resi di manifes ini menjadi Dalam Perjalanan.`}
      pemicu={
        <Button size={ukuran}>
          <Truck aria-hidden /> Konfirmasi Berangkat
        </Button>
      }
      labelKonfirmasi="Berangkat"
      aksi={konfirmasiBerangkat}
      data={{ id_manifes: idManifes }}
    />
  );
}

export function TombolTiba({ idManifes, ukuran = "lg" }: { idManifes: string; ukuran?: "lg" | "default" }) {
  return (
    <DialogForm
      judul="Konfirmasi tiba di tujuan?"
      deskripsi="Semua resi menjadi Tiba dan siap diambil di loket tujuan. Armada kembali berstatus Siaga."
      pemicu={
        <Button size={ukuran}>
          <Flag aria-hidden /> Konfirmasi Tiba
        </Button>
      }
      aksi={konfirmasiTiba}
      skema={skemaTiba}
      labelKirim="Konfirmasi Tiba"
    >
      {(galat) => (
        <>
          <input type="hidden" name="id_manifes" value={idManifes} />
          <Field id="catatan_tiba" label="Catatan (opsional)" galat={galat.catatan}>
            <AreaTeks {...ariaField("catatan_tiba", galat.catatan)} name="catatan" maxLength={300} placeholder="Contoh: tiba di loket Teluk Dalam" />
          </Field>
        </>
      )}
    </DialogForm>
  );
}

export function TombolBatalManifes({ idManifes, dimuat }: { idManifes: string; dimuat: boolean }) {
  return (
    <DialogForm
      judul="Batalkan manifes?"
      deskripsi={
        dimuat
          ? "Manifes tidak dihapus. Resi yang sudah Dimuat dikembalikan ke Diterima Loket (tercatat di riwayat) dan dapat dimuat ke manifes lain."
          : "Manifes tidak dihapus, tetapi ditandai dibatalkan. Resi di dalamnya kembali ke daftar siap dimuat."
      }
      pemicu={
        <Button size="lg" variant="outline">
          <Ban aria-hidden /> Batalkan
        </Button>
      }
      aksi={batalkanManifes}
      skema={skemaBatalManifes}
      labelKirim="Batalkan Manifes"
    >
      {(galat) => (
        <>
          <input type="hidden" name="id_manifes" value={idManifes} />
          <Field id="alasan_batal_manifes" label="Alasan pembatalan" wajib galat={galat.alasan}>
            <AreaTeks {...ariaField("alasan_batal_manifes", galat.alasan)} name="alasan" maxLength={300} />
          </Field>
        </>
      )}
    </DialogForm>
  );
}

export function TombolLepasResi({ idManifes, noResi }: { idManifes: string; noResi: string }) {
  return (
    <KonfirmasiAksi
      judul={`Lepas ${noResi} dari manifes?`}
      deskripsi="Resi kembali ke daftar siap dimuat."
      pemicu={
        <Button variant="ghost" size="sm" aria-label={`Lepas ${noResi}`}>
          <X aria-hidden /> Lepas
        </Button>
      }
      labelKonfirmasi="Lepas"
      aksi={lepasResiManifes}
      data={{ id_manifes: idManifes, no_resi: noResi }}
    />
  );
}

export function TombolPindahResi({ noResi, tujuan }: { noResi: string; tujuan: { id: string; label: string }[] }) {
  const [idTujuan, setIdTujuan] = useState("");
  if (!tujuan.length) return null;
  return (
    <DialogForm
      judul={`Pindahkan ${noResi}`}
      deskripsi="Pindahkan ke manifes Draf lain (mis. armada cadangan). Bila resi sudah Dimuat, statusnya dikembalikan ke Diterima Loket. Tercatat di riwayat dan audit log."
      pemicu={
        <Button variant="ghost" size="sm" aria-label={`Pindahkan ${noResi}`}>
          <ArrowRightLeft aria-hidden /> Pindahkan
        </Button>
      }
      aksi={pindahkanResi}
      skema={skemaPindahResi}
      labelKirim="Pindahkan"
    >
      {(galat) => (
        <>
          <input type="hidden" name="no_resi" value={noResi} />
          <Field id="id_manifes_tujuan" label="Manifes tujuan" wajib galat={galat.id_manifes_tujuan}>
            <Select name="id_manifes_tujuan" value={idTujuan} onValueChange={setIdTujuan}>
              <SelectTrigger {...ariaField("id_manifes_tujuan", galat.id_manifes_tujuan)} className="w-full">
                <SelectValue placeholder="Pilih manifes Draf" />
              </SelectTrigger>
              <SelectContent>
                {tujuan.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="alasan_pindah" label="Alasan pemindahan" wajib galat={galat.alasan}>
            <AreaTeks {...ariaField("alasan_pindah", galat.alasan)} name="alasan" maxLength={300} placeholder="Contoh: muatan melebihi kapasitas" />
          </Field>
        </>
      )}
    </DialogForm>
  );
}

export type KandidatResi = {
  noResi: string;
  berat: string;
  pengirim: string;
  penerima: string;
  /** Lunas, atau belum lunas dengan override resmi. */
  bolehDimuat: boolean;
  override: boolean;
};

/** Pilih resi siap dimuat; pratinjau muatan setelah ditambah dihitung di klien. */
export function FormTambahResi({
  idManifes,
  kandidat,
  muatanGram,
  kapasitasTon,
  ambang,
}: {
  idManifes: string;
  kandidat: KandidatResi[];
  muatanGram: number;
  kapasitasTon: number;
  ambang: number | null;
}) {
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const { pesan, sedangProses, kirim } = useKirimForm(tambahResiManifes, undefined, () => setDipilih(new Set()));
  const pratinjau = useMemo(() => {
    const tambahan = kandidat.filter((k) => dipilih.has(k.noResi)).reduce((t, k) => t + keGram(k.berat), 0);
    return hitungKapasitas(muatanGram + tambahan, kapasitasTon, ambang);
  }, [dipilih, kandidat, muatanGram, kapasitasTon, ambang]);

  function ubah(resi: string, centang: boolean) {
    setDipilih((s) => {
      const baru = new Set(s);
      if (centang) baru.add(resi);
      else baru.delete(resi);
      return baru;
    });
  }

  return (
    <form onSubmit={kirim} noValidate className="space-y-3">
      <input type="hidden" name="id_manifes" value={idManifes} />
      <PesanGalatForm pesan={pesan} />
      <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
        {kandidat.map((k) => (
          <li key={k.noResi}>
            <label
              className={cn(
                "flex items-start gap-3 p-2.5 text-sm",
                k.bolehDimuat ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed text-muted-foreground",
              )}
            >
              <input
                type="checkbox"
                name="resi"
                value={k.noResi}
                disabled={!k.bolehDimuat}
                checked={dipilih.has(k.noResi)}
                onChange={(e) => ubah(k.noResi, e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{k.noResi}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {k.pengirim} → {k.penerima}
                </span>
                {!k.bolehDimuat && (
                  <span className="block text-xs text-warning">
                    Belum lunas — perlu pelunasan atau override Pemilik di{" "}
                    <Link href={`/transaksi/${k.noResi}`} className="underline">
                      detail transaksi
                    </Link>
                    .
                  </span>
                )}
                {k.override && <span className="block text-xs text-warning">Belum lunas, dengan override resmi</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatAngka(k.berat)} kg</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", pratinjau.tingkat === "melebihi" ? "text-danger" : "text-muted-foreground")} aria-live="polite">
          {dipilih.size} dipilih · muatan setelah ditambah {formatAngka(gramKeKg(pratinjau.muatanGram))} kg ({formatAngka(pratinjau.persen, 1)}%)
          {pratinjau.tingkat === "melebihi" && (
            <span className="ml-1 inline-flex items-center gap-1">
              <TriangleAlert className="size-3.5" aria-hidden /> melebihi kapasitas — konfirmasi muat akan diblokir
            </span>
          )}
        </p>
        <Button type="submit" disabled={sedangProses || dipilih.size === 0}>
          {sedangProses ? <Loader2 className="animate-spin" aria-hidden /> : <PackagePlus aria-hidden />}
          Tambahkan ke Manifes
        </Button>
      </div>
    </form>
  );
}

export function TombolLaporKendala({ idManifes, ukuran = "default" }: { idManifes: string; ukuran?: "lg" | "default" }) {
  const [jenis, setJenis] = useState("");
  return (
    <DialogForm
      judul="Laporkan kendala perjalanan"
      deskripsi="Laporan tampil di detail manifes untuk Staf Gudang dan Pemilik. Status armada tidak berubah otomatis."
      pemicu={
        <Button variant="outline" size={ukuran}>
          <TriangleAlert aria-hidden /> Laporkan Kendala
        </Button>
      }
      aksi={laporkanKendala}
      skema={skemaKendala}
      labelKirim="Kirim Laporan"
    >
      {(galat) => (
        <>
          <input type="hidden" name="id_manifes" value={idManifes} />
          <Field id="jenis_kendala" label="Jenis kendala" wajib galat={galat.jenis}>
            <Select name="jenis" value={jenis} onValueChange={setJenis}>
              <SelectTrigger {...ariaField("jenis_kendala", galat.jenis)} className="w-full">
                <SelectValue placeholder="Pilih jenis" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(JENIS_KENDALA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="deskripsi_kendala" label="Uraian" wajib galat={galat.deskripsi}>
            <AreaTeks {...ariaField("deskripsi_kendala", galat.deskripsi)} name="deskripsi" maxLength={1000} placeholder="Contoh: ban belakang bocor di km 40" />
          </Field>
        </>
      )}
    </DialogForm>
  );
}

export function TombolSelesaikanKendala({ idKendala }: { idKendala: string }) {
  return (
    <KonfirmasiAksi
      judul="Tandai kendala selesai?"
      deskripsi="Kendala ditandai selesai beserta nama dan waktu penyelesaian."
      pemicu={
        <Button variant="ghost" size="sm">
          <CheckCircle2 aria-hidden /> Selesai
        </Button>
      }
      labelKonfirmasi="Tandai Selesai"
      aksi={selesaikanKendala}
      data={{ id_kendala: idKendala }}
    />
  );
}
