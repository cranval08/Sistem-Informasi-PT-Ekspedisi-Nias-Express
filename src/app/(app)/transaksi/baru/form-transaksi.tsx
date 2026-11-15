"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PesanGalatForm } from "@/components/app/form/dialog-form";
import { AreaTeks, ariaField, Field } from "@/components/app/form/field";
import { BadgeNada } from "@/components/app/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { BATAS_BARIS_BARANG, skemaTransaksi } from "@/lib/domain/skema";
import { hitungBaris, hitungTotal, miliKeTeks, type Satuan } from "@/lib/domain/transaksi";
import { simpanTransaksi, type Duplikat, type PelangganPilihan } from "../aksi";
import { PemilihPelanggan } from "./pemilih-pelanggan";

export type ItemPilihan = { id: string; nama: string; satuan: Satuan; tarif: number };

type Baris = { kunci: number; idItem: string; berat: string; koli: string };

const LABEL_SATUAN_PENDEK: Record<Satuan, string> = { kg: "kg", ton: "ton", koli: "koli" };

export function FormTransaksi({ items, zonaWaktu }: { items: ItemPilihan[]; zonaWaktu: string }) {
  const router = useRouter();
  const kunciBerikut = useRef(1);
  const [pengirim, setPengirim] = useState<PelangganPilihan | null>(null);
  const [penerima, setPenerima] = useState<PelangganPilihan | null>(null);
  const [baris, setBaris] = useState<Baris[]>([{ kunci: 0, idItem: "", berat: "", koli: "" }]);
  const [bayar, setBayar] = useState("");
  const [catatan, setCatatan] = useState("");
  const [alasanBelumBayar, setAlasanBelumBayar] = useState("");
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [pesan, setPesan] = useState<string>();
  const [duplikat, setDuplikat] = useState<{ daftar: Duplikat[]; cetak: boolean } | null>(null);
  const [konfirmasiBatal, setKonfirmasiBatal] = useState(false);
  const [proses, mulai] = useTransition();
  // Penjaga double-submit (PRD §13 butir 13): sinkron, tidak menunggu render ulang.
  const terkirim = useRef(false);

  const peta = new Map(items.map((i) => [i.id, i]));
  const hitung = baris.map((b) => {
    const item = peta.get(b.idItem);
    return item ? { item, ...hitungBaris({ satuan: item.satuan, tarif: item.tarif, berat: b.berat, koli: b.koli }) } : null;
  });
  const total = hitungTotal(
    baris.flatMap((b) => {
      const item = peta.get(b.idItem);
      return item ? [{ satuan: item.satuan, tarif: item.tarif, berat: b.berat, koli: b.koli }] : [];
    }),
  );
  const bayarAngka = /^\d+$/.test(bayar.replace(/[.\s]/g, "")) ? Number(bayar.replace(/[.\s]/g, "")) : bayar.trim() === "" ? 0 : NaN;
  const sisa = Number.isFinite(bayarAngka) ? total.biaya - bayarAngka : null;
  const semuaLengkap = total.lengkap && baris.every((b) => peta.has(b.idItem));
  const belumBayar = bayarAngka === 0;

  function ubahBaris(kunci: number, ubah: Partial<Baris>) {
    setBaris((bs) => bs.map((b) => (b.kunci === kunci ? { ...b, ...ubah } : b)));
  }

  /** Validasi klien; mengembalikan galat per field (kunci `detail.N.field` untuk baris). */
  function validasi(): Record<string, string> {
    const g: Record<string, string> = {};
    const r = skemaTransaksi.safeParse({
      id_pengirim: pengirim?.id ?? "",
      id_penerima: penerima?.id ?? "",
      detail: baris.map((b) => ({ id_item: b.idItem, berat_kg: b.berat, koli: b.koli })),
      bayar_awal: bayar,
      catatan,
      alasan_belum_bayar: alasanBelumBayar,
    });
    if (!r.success) {
      for (const isu of r.error.issues) {
        const k = isu.path[0] === "detail" && isu.path.length > 2 ? `detail.${String(isu.path[1])}.${String(isu.path[2])}` : String(isu.path[0]);
        g[k] ??= isu.message;
      }
    }
    baris.forEach((b, i) => {
      const item = peta.get(b.idItem);
      if (item?.satuan === "koli" && !b.koli.trim()) g[`detail.${i}.koli`] ??= "Jumlah koli wajib diisi untuk barang bersatuan koli.";
      if (item?.satuan === "ton" && hitung[i]?.beratMili && !hitung[i]?.jumlahMili) g[`detail.${i}.berat_kg`] ??= "Berat terlalu kecil untuk satuan ton (minimal 0,5 kg).";
    });
    if (Number.isFinite(bayarAngka) && semuaLengkap && bayarAngka > total.biaya) {
      g.bayar_awal ??= `Pembayaran awal tidak boleh melebihi total biaya (${formatRupiah(total.biaya)}).`;
    }
    return g;
  }

  function kirim(cetak: boolean, konfirmasiDuplikat = false) {
    if (terkirim.current) return;
    const g = validasi();
    setGalat(g);
    if (Object.keys(g).length) {
      setPesan("Periksa kembali isian yang ditandai.");
      return;
    }
    setPesan(undefined);
    terkirim.current = true;
    mulai(async () => {
      try {
        const h = await simpanTransaksi({
          id_pengirim: pengirim!.id,
          id_penerima: penerima!.id,
          detail: baris.map((b) => ({ id_item: b.idItem, berat_kg: b.berat, koli: peta.get(b.idItem)?.satuan === "koli" ? b.koli : "" })),
          bayar_awal: bayar,
          catatan,
          alasan_belum_bayar: belumBayar ? alasanBelumBayar : "",
          konfirmasi_duplikat: konfirmasiDuplikat,
        });
        if (h.ok && h.data?.resi) {
          // Tetap terkunci sampai halaman berpindah agar tidak tersimpan dua kali.
          toast.success(h.pesan);
          router.push(cetak ? `/transaksi/${h.data.resi}/cetak?otomatis=1` : `/transaksi/${h.data.resi}`);
          return;
        }
        terkirim.current = false;
        if (h.data?.duplikat) {
          setDuplikat({ daftar: h.data.duplikat, cetak });
          return;
        }
        setGalat(h.galat ?? {});
        setPesan(h.pesan);
      } catch {
        terkirim.current = false;
        // Respons hilang ≠ pasti gagal. Bila ternyata tersimpan, mengirim ulang
        // akan memicu peringatan duplikasi — bukan transaksi ganda diam-diam.
        setPesan(
          "Tidak dapat terhubung ke server, sehingga belum dapat dipastikan apakah transaksi tersimpan. Periksa koneksi, lalu cek Daftar Transaksi sebelum menyimpan ulang. Bila Anda menyimpan ulang dan transaksi ternyata sudah ada, sistem akan menampilkan peringatan duplikasi.",
        );
      }
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tombol = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    kirim(tombol?.value === "cetak");
  }

  function reset() {
    setPengirim(null);
    setPenerima(null);
    setBaris([{ kunci: kunciBerikut.current++, idItem: "", berat: "", koli: "" }]);
    setBayar("");
    setCatatan("");
    setAlasanBelumBayar("");
    setGalat({});
    setPesan(undefined);
    setKonfirmasiBatal(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <PesanGalatForm pesan={pesan} />

        <Card>
          <CardHeader>
            <CardTitle>A–B. Pengirim &amp; penerima</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <PemilihPelanggan judul="Pengirim" nilai={pengirim} onPilih={setPengirim} galat={galat.id_pengirim} />
            <PemilihPelanggan judul="Penerima" nilai={penerima} onPilih={setPenerima} galat={galat.id_penerima} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>C. Barang</CardTitle>
            <span className="text-xs text-muted-foreground">Tarif otomatis dari master jenis barang</span>
          </CardHeader>
          <CardContent className="space-y-4">
            {galat.detail && <p className="text-sm text-danger">{galat.detail}</p>}
            {baris.map((b, i) => {
              const h = hitung[i];
              const item = h?.item;
              const idDasar = `baris-${b.kunci}`;
              const gItem = galat[`detail.${i}.id_item`];
              const gBerat = galat[`detail.${i}.berat_kg`];
              const gKoli = galat[`detail.${i}.koli`];
              return (
                <div key={b.kunci} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Barang {i + 1}</p>
                    {baris.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setBaris((bs) => bs.filter((x) => x.kunci !== b.kunci))}
                        aria-label={`Hapus baris barang ${i + 1}`}
                      >
                        <Trash2 aria-hidden /> Hapus
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Field id={`${idDasar}-item`} label="Jenis barang" wajib galat={gItem}>
                      <Select value={b.idItem} onValueChange={(v) => ubahBaris(b.kunci, { idItem: v })}>
                        <SelectTrigger {...ariaField(`${idDasar}-item`, gItem)} className="h-10 w-full">
                          <SelectValue placeholder="Pilih jenis barang" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.nama} · {formatRupiah(it.tarif)}/{LABEL_SATUAN_PENDEK[it.satuan]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field id={`${idDasar}-berat`} label="Berat (kg)" wajib galat={gBerat} bantuan="Maks. 3 desimal">
                      <Input
                        {...ariaField(`${idDasar}-berat`, gBerat, true)}
                        value={b.berat}
                        onChange={(e) => ubahBaris(b.kunci, { berat: e.target.value })}
                        inputMode="decimal"
                        autoComplete="off"
                        className="h-10"
                      />
                    </Field>
                    {item?.satuan === "koli" ? (
                      <Field id={`${idDasar}-koli`} label="Jumlah koli" wajib galat={gKoli}>
                        <Input
                          {...ariaField(`${idDasar}-koli`, gKoli)}
                          value={b.koli}
                          onChange={(e) => ubahBaris(b.kunci, { koli: e.target.value })}
                          inputMode="numeric"
                          autoComplete="off"
                          className="h-10"
                        />
                      </Field>
                    ) : (
                      <div className="hidden sm:block" />
                    )}
                  </div>
                  {item && (
                    <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Tarif</dt>
                        <dd className="tabular-nums">
                          {formatRupiah(item.tarif)}/{LABEL_SATUAN_PENDEK[item.satuan]}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Jumlah ditagih</dt>
                        <dd className="tabular-nums">
                          {h?.jumlahMili ? `${formatAngka(miliKeTeks(h.jumlahMili))} ${LABEL_SATUAN_PENDEK[item.satuan]}` : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted-foreground">Subtotal</dt>
                        <dd className="font-medium tabular-nums">{h?.subtotal != null ? formatRupiah(h.subtotal) : "—"}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() => setBaris((bs) => [...bs, { kunci: kunciBerikut.current++, idItem: "", berat: "", koli: "" }])}
              disabled={baris.length >= BATAS_BARIS_BARANG}
            >
              <Plus aria-hidden /> Tambah baris barang
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>D. Ringkasan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total berat</dt>
                <dd className="tabular-nums">{formatAngka(miliKeTeks(total.beratMili))} kg</dd>
              </div>
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-medium">Total biaya</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatRupiah(total.biaya)}</dd>
              </div>
              {!semuaLengkap && <dd className="text-xs text-muted-foreground">Lengkapi semua baris barang untuk total final.</dd>}
            </dl>
            <Field id="bayar_awal" label="Pembayaran awal (Rp)" galat={galat.bayar_awal} bantuan="Kosongkan atau isi 0 bila belum bayar (alasan wajib diisi).">
              <Input
                {...ariaField("bayar_awal", galat.bayar_awal, true)}
                value={bayar}
                onChange={(e) => setBayar(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                className="h-10"
              />
            </Field>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Sisa pembayaran</dt>
                <dd className="font-medium tabular-nums">{sisa === null ? "—" : formatRupiah(Math.max(sisa, 0))}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Status pembayaran</dt>
                <dd>
                  {semuaLengkap && sisa === 0 && total.biaya > 0 ? (
                    <BadgeNada nada="success" label="Lunas" />
                  ) : (
                    <BadgeNada nada="warning" label="Belum Lunas" />
                  )}
                </dd>
              </div>
            </dl>
            {belumBayar && (
              <Field
                id="alasan_belum_bayar"
                label="Alasan belum bayar"
                wajib
                galat={galat.alasan_belum_bayar}
                bantuan="Wajib bila pembayaran awal Rp0. Tersimpan di transaksi dan audit log agar dapat dilacak; tidak masuk rekap kas."
              >
                <AreaTeks
                  {...ariaField("alasan_belum_bayar", galat.alasan_belum_bayar, true)}
                  value={alasanBelumBayar}
                  onChange={(e) => setAlasanBelumBayar(e.target.value)}
                  maxLength={300}
                  placeholder="Contoh: pelanggan melunasi di loket tujuan sebelum barang diambil"
                />
              </Field>
            )}
            <Field id="catatan" label="Catatan (opsional)" galat={galat.catatan}>
              <AreaTeks {...ariaField("catatan", galat.catatan)} value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={500} />
            </Field>
            <p className="text-xs text-muted-foreground">Waktu transaksi dan nomor resi dibuat otomatis oleh server saat disimpan.</p>
          </CardContent>
        </Card>

        <div className="grid gap-2">
          <Button type="submit" name="aksi" value="cetak" size="lg" className="h-11" disabled={proses}>
            {proses ? <Loader2 className="animate-spin" aria-hidden /> : <Printer aria-hidden />} Simpan &amp; Cetak Resi
          </Button>
          <Button type="submit" name="aksi" value="simpan" variant="outline" size="lg" className="h-11" disabled={proses}>
            <Save aria-hidden /> Simpan Transaksi
          </Button>
          <Button type="button" variant="ghost" onClick={() => setKonfirmasiBatal(true)} disabled={proses}>
            Batalkan input
          </Button>
        </div>
      </div>

      <AlertDialog open={!!duplikat} onOpenChange={(v) => !v && setDuplikat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" aria-hidden /> Kemungkinan transaksi ganda
            </AlertDialogTitle>
            <AlertDialogDescription>
              Hari ini sudah ada transaksi dengan pengirim, penerima, dan total berat yang sama. Periksa dulu agar tidak tercatat dua
              kali. Bila memang transaksi berbeda, simpan dan konfirmasi Anda akan tercatat di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="divide-y rounded-lg border text-sm">
            {duplikat?.daftar.map((d) => (
              <li key={d.no_resi} className="flex items-center justify-between gap-2 p-2.5">
                <Link href={`/transaksi/${d.no_resi}`} target="_blank" className="font-medium text-primary hover:underline">
                  {d.no_resi}
                </Link>
                <span className="text-muted-foreground">
                  {formatTanggalWaktu(d.waktu_transaksi, zonaWaktu)} · {formatRupiah(d.total_biaya)}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Periksa lagi</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const cetak = duplikat?.cetak ?? false;
                setDuplikat(null);
                kirim(cetak, true);
              }}
            >
              Bukan duplikat, tetap simpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={konfirmasiBatal} onOpenChange={setKonfirmasiBatal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan input transaksi?</AlertDialogTitle>
            <AlertDialogDescription>Semua isian di form ini akan dikosongkan. Belum ada data yang tersimpan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lanjutkan mengisi</AlertDialogCancel>
            <AlertDialogAction onClick={reset} className="bg-danger text-white hover:bg-danger/90">
              Kosongkan form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

