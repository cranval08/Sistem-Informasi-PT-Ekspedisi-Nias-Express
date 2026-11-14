"use client";

import { useState } from "react";
import { Ban, Banknote, Loader2 } from "lucide-react";
import { DialogForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/domain/format";
import { skemaBatalPembayaran, skemaCatatPembayaran } from "@/lib/domain/skema";
import { batalkanPembayaran, catatPembayaran, infoTagihan, type InfoTagihan } from "./aksi";

/**
 * Dialog catat pembayaran. Dengan `tagihan` (dari detail transaksi) resi
 * sudah terisi; tanpa itu (dari daftar pembayaran) resi diketik lalu
 * ringkasan tagihan dimuat dari server.
 */
export function TombolCatatPembayaran({ tagihan, ukuran = "lg" }: { tagihan?: InfoTagihan; ukuran?: "lg" | "default" }) {
  return (
    <DialogForm
      judul="Catat Pembayaran"
      deskripsi="Waktu pembayaran dicatat otomatis oleh server. Total pembayaran tidak boleh melebihi total biaya."
      pemicu={
        <Button size={ukuran}>
          <Banknote aria-hidden /> Catat Pembayaran
        </Button>
      }
      aksi={catatPembayaran}
      skema={skemaCatatPembayaran}
      labelKirim="Simpan Pembayaran"
    >
      {(galat) => <IsianPembayaran galat={galat} awal={tagihan} />}
    </DialogForm>
  );
}

function IsianPembayaran({ galat, awal }: { galat: Record<string, string>; awal?: InfoTagihan }) {
  const [info, setInfo] = useState<InfoTagihan | null | undefined>(awal);
  const [memuat, setMemuat] = useState(false);
  const [jumlah, setJumlah] = useState("");

  async function muat(resi: string) {
    if (!resi.trim()) return setInfo(undefined);
    setMemuat(true);
    try {
      setInfo(await infoTagihan(resi));
    } catch {
      setInfo(undefined);
    } finally {
      setMemuat(false);
    }
  }

  return (
    <>
      {awal ? (
        <input type="hidden" name="no_resi" value={awal.noResi} />
      ) : (
        <Field id="no_resi" label="Nomor resi" wajib galat={galat.no_resi} bantuan="Contoh: NX-20261114-0001">
          <div className="relative">
            <Input
              {...ariaField("no_resi", galat.no_resi, true)}
              name="no_resi"
              autoComplete="off"
              className="uppercase"
              onBlur={(e) => muat(e.currentTarget.value)}
            />
            {memuat && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
          </div>
        </Field>
      )}

      {info === null && !galat.no_resi && <p className="text-sm text-danger">Nomor resi tidak ditemukan.</p>}
      {info && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm" role="status">
          <p className="font-medium">
            {info.noResi} · {info.pengirim} → {info.penerima}
          </p>
          <dl className="grid grid-cols-3 gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="tabular-nums">{formatRupiah(info.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Dibayar</dt>
              <dd className="tabular-nums">{formatRupiah(info.dibayar)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sisa</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(info.sisa)}</dd>
            </div>
          </dl>
          {info.dibatalkan && <p className="text-danger">Transaksi ini sudah dibatalkan.</p>}
          {!info.dibatalkan && info.sisa === 0 && <p className="text-success">Transaksi sudah lunas.</p>}
        </div>
      )}

      <Field id="jumlah" label="Nominal pembayaran (Rp)" wajib galat={galat.jumlah} bantuan="Bilangan bulat, contoh: 50000">
        <div className="flex gap-2">
          <Input
            {...ariaField("jumlah", galat.jumlah, true)}
            name="jumlah"
            inputMode="numeric"
            autoComplete="off"
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
          />
          {info && info.sisa > 0 && !info.dibatalkan && (
            <Button type="button" variant="outline" onClick={() => setJumlah(String(info.sisa))}>
              Lunasi
            </Button>
          )}
        </div>
      </Field>
      <Field id="catatan_bayar" label="Catatan (opsional)" galat={galat.catatan}>
        <AreaTeks {...ariaField("catatan_bayar", galat.catatan)} name="catatan" maxLength={300} placeholder="Contoh: tunai, transfer" />
      </Field>
    </>
  );
}

export function TombolBatalPembayaran({ idPembayaran, ringkasan }: { idPembayaran: string; ringkasan: string }) {
  return (
    <DialogForm
      judul="Batalkan pembayaran?"
      deskripsi={`${ringkasan}. Pembayaran tidak dihapus: ditandai dibatalkan beserta alasan, dan total dibayar dihitung ulang.`}
      pemicu={
        <Button variant="ghost" size="sm" aria-label={`Batalkan pembayaran ${ringkasan}`}>
          <Ban aria-hidden /> Batalkan
        </Button>
      }
      aksi={batalkanPembayaran}
      skema={skemaBatalPembayaran}
      labelKirim="Batalkan Pembayaran"
    >
      {(galat) => (
        <>
          <input type="hidden" name="id_pembayaran" value={idPembayaran} />
          <Field id="alasan_batal_bayar" label="Alasan pembatalan" wajib galat={galat.alasan}>
            <AreaTeks {...ariaField("alasan_batal_bayar", galat.alasan)} name="alasan" maxLength={300} placeholder="Contoh: salah nominal, seharusnya Rp50.000" />
          </Field>
        </>
      )}
    </DialogForm>
  );
}
