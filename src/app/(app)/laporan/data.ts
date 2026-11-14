import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { paramTunggal, rentangDariParam, type Rentang } from "@/components/app/daftar";
import { awalHariIso, formatTanggalWaktu, tambahHari } from "@/lib/domain/format";
import { LABEL_AKSI_AUDIT, ringkasPerubahan } from "@/lib/domain/audit";
import type { KolomCsv } from "@/lib/domain/laporan";
import { definisiStatus, STATUS_KIRIM } from "@/lib/domain/status";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";

/**
 * Sumber data laporan (PRD §7.14). Halaman dan ekspor CSV memakai fungsi
 * yang sama sehingga ekspor selalu mengikuti filter yang sedang dipilih.
 * Akses: rute laporan hanya untuk Pemilik (RUTE) dan RLS/RPC tetap menjaga.
 */

type Sp = Record<string, string | string[] | undefined>;
type Klien = Awaited<ReturnType<typeof buatKlienServer>>;
type Hasil = PromiseLike<{ data: unknown[] | null; error: PostgrestError | null; count?: number | null }>;

export const UKURAN_HALAMAN = 50;
/** Batas baris ekspor sekali unduh; di atas itu pengguna diminta mempersempit periode. */
export const BATAS_EKSPOR = 20_000;
const UKURAN_BATCH = 1000; // batas baris PostgREST per permintaan

function lempar(e: PostgrestError | null, apa: string): asserts e is null {
  if (e) throw new Error(`${apa} gagal dimuat (${e.code ?? "tanpa kode"}).`);
}

/** Ambil seluruh baris secara bertahap; `terpotong` bila melebihi batas. */
async function semuaBaris<T>(buat: (dari: number, sampai: number) => Hasil, apa: string, batas = BATAS_EKSPOR) {
  const baris: T[] = [];
  for (let dari = 0; dari < batas; dari += UKURAN_BATCH) {
    const { data, error } = await buat(dari, Math.min(dari + UKURAN_BATCH, batas) - 1);
    lempar(error, apa);
    baris.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < UKURAN_BATCH) return { baris, terpotong: false };
  }
  return { baris, terpotong: true };
}

const nama = (v: unknown, kunci = "nama") => (relasiTunggal(v as Record<string, string> | Record<string, string>[] | null)?.[kunci] as string | undefined) ?? "";
const labelKirim = (s: string | null) => (s ? definisiStatus("kirim", s).label : "");

export type Halaman<T> = { baris: T[]; total: number };

// =====================================================================
// Laporan transaksi
// =====================================================================
export type FilterTransaksi = { rentang: Rentang; bayar?: string; kirim?: string; batal?: string };

export function bacaFilterTransaksi(sp: Sp, zona: string): FilterTransaksi {
  const bayar = paramTunggal(sp.bayar);
  const kirim = paramTunggal(sp.kirim);
  return {
    rentang: rentangDariParam(sp, zona, "bulan_ini"),
    bayar: bayar === "lunas" || bayar === "belum_lunas" ? bayar : undefined,
    kirim: kirim && kirim in STATUS_KIRIM ? kirim : undefined,
    batal: paramTunggal(sp.batal) === "ya" ? "ya" : undefined,
  };
}

const KOLOM_TRANSAKSI = `no_resi, waktu_transaksi, tanggal_transaksi, total_berat_kg, total_biaya, total_dibayar, status_bayar, status_kirim, status_void,
  pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama, telepon),
  penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama, telepon),
  detail:detail_transaksi(jumlah, berat_kg, satuan_saat_transaksi, item:data_item(nama_item))`;

export type BarisTransaksi = {
  no_resi: string;
  waktu_transaksi: string;
  total_berat_kg: number;
  total_biaya: number;
  total_dibayar: number;
  status_bayar: string;
  status_kirim: string;
  status_void: boolean;
  pengirim: unknown;
  penerima: unknown;
  detail: { jumlah: number; berat_kg: number; satuan_saat_transaksi: string; item: unknown }[] | null;
};

function kueriTransaksi(s: Klien, kolom: string, f: FilterTransaksi, hitung = false) {
  let q = s
    .from("data_transaksi")
    .select(kolom, hitung ? { count: "exact" } : undefined)
    .gte("tanggal_transaksi", f.rentang.dari)
    .lte("tanggal_transaksi", f.rentang.sampai);
  if (f.batal !== "ya") q = q.eq("status_void", false);
  if (f.bayar) q = q.eq("status_bayar", f.bayar);
  if (f.kirim) q = q.eq("status_kirim", f.kirim);
  return q.order("waktu_transaksi", { ascending: false }).order("no_resi", { ascending: false });
}

export async function ambilLaporanTransaksi(f: FilterTransaksi, halaman: number): Promise<Halaman<BarisTransaksi>> {
  const s = await buatKlienServer();
  const { data, count, error } = await kueriTransaksi(s, KOLOM_TRANSAKSI, f, true).range((halaman - 1) * UKURAN_HALAMAN, halaman * UKURAN_HALAMAN - 1);
  lempar(error, "Laporan transaksi");
  return { baris: (data ?? []) as unknown as BarisTransaksi[], total: count ?? 0 };
}

/** Total seluruh baris yang cocok dengan filter (bukan hanya halaman tampil). */
export async function totalLaporanTransaksi(f: FilterTransaksi) {
  const s = await buatKlienServer();
  const { baris, terpotong } = await semuaBaris<{ total_biaya: number; total_dibayar: number; total_berat_kg: number; status_void: boolean }>(
    (a, b) => kueriTransaksi(s, "total_biaya, total_dibayar, total_berat_kg, status_void", f).range(a, b) as unknown as Hasil,
    "Total laporan transaksi",
  );
  const sah = baris.filter((b) => !b.status_void);
  const jumlah = (k: "total_biaya" | "total_dibayar") => sah.reduce((n, b) => n + Number(b[k]), 0);
  return {
    jumlah: baris.length,
    biaya: jumlah("total_biaya"),
    dibayar: jumlah("total_dibayar"),
    // Berat dalam gram bulat agar penjumlahan desimal tidak membulat salah.
    beratKg: sah.reduce((n, b) => n + Math.round(Number(b.total_berat_kg) * 1000), 0) / 1000,
    terpotong,
  };
}

export async function semuaLaporanTransaksi(f: FilterTransaksi) {
  const s = await buatKlienServer();
  return semuaBaris<BarisTransaksi>((a, b) => kueriTransaksi(s, KOLOM_TRANSAKSI, f).range(a, b) as unknown as Hasil, "Ekspor transaksi");
}

export function rincianBarang(d: BarisTransaksi["detail"]): string {
  return (d ?? [])
    .map((x) => {
      const n = nama(x.item, "nama_item") || "Barang";
      const berat = `${String(Number(x.berat_kg)).replace(".", ",")} kg`;
      return x.satuan_saat_transaksi === "koli" ? `${n} ${Number(x.jumlah)} koli (${berat})` : `${n} ${berat}`;
    })
    .join("; ");
}

export function kolomCsvTransaksi(zona: string): KolomCsv<BarisTransaksi>[] {
  return [
    { judul: "Nomor resi", nilai: (t) => t.no_resi },
    { judul: `Waktu transaksi (${zona})`, nilai: (t) => formatTanggalWaktu(t.waktu_transaksi, zona) },
    { judul: "Pengirim", nilai: (t) => nama(t.pengirim) },
    { judul: "Telepon pengirim", nilai: (t) => nama(t.pengirim, "telepon") },
    { judul: "Penerima", nilai: (t) => nama(t.penerima) },
    { judul: "Telepon penerima", nilai: (t) => nama(t.penerima, "telepon") },
    { judul: "Rincian barang", nilai: (t) => rincianBarang(t.detail) },
    { judul: "Total berat (kg)", nilai: (t) => Number(t.total_berat_kg) },
    { judul: "Total biaya (Rp)", nilai: (t) => Number(t.total_biaya) },
    { judul: "Total dibayar (Rp)", nilai: (t) => Number(t.total_dibayar) },
    { judul: "Sisa (Rp)", nilai: (t) => Number(t.total_biaya) - Number(t.total_dibayar) },
    { judul: "Status pembayaran", nilai: (t) => definisiStatus("bayar", t.status_bayar).label },
    { judul: "Status pengiriman", nilai: (t) => labelKirim(t.status_kirim) },
    { judul: "Dibatalkan", nilai: (t) => t.status_void },
  ];
}

// =====================================================================
// Laporan pembayaran / kas
// =====================================================================
export type FilterPembayaran = { rentang: Rentang; status?: string };

export function bacaFilterPembayaran(sp: Sp, zona: string): FilterPembayaran {
  const status = paramTunggal(sp.status);
  return { rentang: rentangDariParam(sp, zona, "bulan_ini"), status: status === "dibatalkan" || status === "semua" ? status : undefined };
}

const KOLOM_PEMBAYARAN = `id_pembayaran, no_resi, waktu_bayar, jumlah_bayar, status_pembayaran_record, catatan, catatan_koreksi,
  pencatat:data_pengguna!pembayaran_id_pengguna_pencatat_fkey(nama_lengkap),
  pembatal:data_pengguna!pembayaran_dibatalkan_oleh_fkey(nama_lengkap),
  transaksi:data_transaksi(pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama))`;

export type BarisPembayaran = {
  id_pembayaran: string;
  no_resi: string;
  waktu_bayar: string;
  jumlah_bayar: number;
  status_pembayaran_record: string;
  catatan: string | null;
  catatan_koreksi: string | null;
  pencatat: unknown;
  pembatal: unknown;
  transaksi: unknown;
};

function kueriPembayaran(s: Klien, f: FilterPembayaran, zona: string, hitung = false) {
  let q = s
    .from("pembayaran")
    .select(KOLOM_PEMBAYARAN, hitung ? { count: "exact" } : undefined)
    .gte("waktu_bayar", awalHariIso(f.rentang.dari, zona))
    .lt("waktu_bayar", awalHariIso(tambahHari(f.rentang.sampai, 1), zona));
  if (f.status !== "semua") q = q.eq("status_pembayaran_record", f.status === "dibatalkan" ? "dibatalkan" : "valid");
  return q.order("waktu_bayar", { ascending: false }).order("id_pembayaran");
}

export async function ambilLaporanPembayaran(f: FilterPembayaran, zona: string, halaman: number): Promise<Halaman<BarisPembayaran>> {
  const s = await buatKlienServer();
  const { data, count, error } = await kueriPembayaran(s, f, zona, true).range((halaman - 1) * UKURAN_HALAMAN, halaman * UKURAN_HALAMAN - 1);
  lempar(error, "Laporan pembayaran");
  return { baris: (data ?? []) as unknown as BarisPembayaran[], total: count ?? 0 };
}

export async function semuaLaporanPembayaran(f: FilterPembayaran, zona: string) {
  const s = await buatKlienServer();
  return semuaBaris<BarisPembayaran>((a, b) => kueriPembayaran(s, f, zona).range(a, b) as unknown as Hasil, "Ekspor pembayaran");
}

export type RekapPencatat = { nama: string; jumlah: number; diterima: number; jumlahBatal: number; dibatalkan: number };

/** Total penerimaan periode dari RPC rekap_kas (dihitung dari baris pembayaran). */
export async function totalPembayaran(f: FilterPembayaran) {
  const s = await buatKlienServer();
  const { data, error } = await s.rpc("rekap_kas", { p_dari: f.rentang.dari, p_sampai: f.rentang.sampai });
  lempar(error, "Rekap kas");
  type Baris = { nama_pencatat: string; jumlah_pembayaran: number; total_diterima: number; jumlah_dibatalkan: number; total_dibatalkan: number };
  const per = new Map<string, RekapPencatat>();
  for (const r of (data ?? []) as Baris[]) {
    const x = per.get(r.nama_pencatat) ?? { nama: r.nama_pencatat, jumlah: 0, diterima: 0, jumlahBatal: 0, dibatalkan: 0 };
    x.jumlah += r.jumlah_pembayaran;
    x.diterima += Number(r.total_diterima);
    x.jumlahBatal += r.jumlah_dibatalkan;
    x.dibatalkan += Number(r.total_dibatalkan);
    per.set(r.nama_pencatat, x);
  }
  const daftar = [...per.values()].sort((a, b) => b.diterima - a.diterima);
  return {
    perPencatat: daftar,
    diterima: daftar.reduce((n, x) => n + x.diterima, 0),
    jumlah: daftar.reduce((n, x) => n + x.jumlah, 0),
    dibatalkan: daftar.reduce((n, x) => n + x.dibatalkan, 0),
    jumlahBatal: daftar.reduce((n, x) => n + x.jumlahBatal, 0),
  };
}

export function kolomCsvPembayaran(zona: string): KolomCsv<BarisPembayaran>[] {
  return [
    { judul: `Waktu pembayaran (${zona})`, nilai: (b) => formatTanggalWaktu(b.waktu_bayar, zona) },
    { judul: "Nomor resi", nilai: (b) => b.no_resi },
    { judul: "Pengirim", nilai: (b) => nama((relasiTunggal(b.transaksi as Record<string, unknown> | Record<string, unknown>[] | null) as { pengirim?: unknown } | null)?.pengirim) },
    { judul: "Jumlah (Rp)", nilai: (b) => Number(b.jumlah_bayar) },
    { judul: "Pencatat", nilai: (b) => nama(b.pencatat, "nama_lengkap") },
    { judul: "Status", nilai: (b) => (b.status_pembayaran_record === "valid" ? "Valid" : "Dibatalkan") },
    { judul: "Catatan", nilai: (b) => b.catatan },
    { judul: "Alasan pembatalan", nilai: (b) => b.catatan_koreksi },
    { judul: "Dibatalkan oleh", nilai: (b) => nama(b.pembatal, "nama_lengkap") },
  ];
}

// =====================================================================
// Laporan armada
// =====================================================================
export type BarisLaporanArmada = {
  id_armada: string;
  plat_nomor: string;
  jenis_unit: string;
  kapasitas_ton: number;
  status: string;
  is_active: boolean;
  supir: string | null;
  id_manifes_aktif: string | null;
  status_manifes_aktif: string | null;
  rute_aktif: string | null;
  muatan_aktif_kg: number | null;
  jumlah_perjalanan: number;
  total_muatan_kg: number;
  rata_utilisasi_persen: number | null;
  maks_utilisasi_persen: number | null;
  jumlah_override: number;
};

export function bacaFilterArmada(sp: Sp, zona: string) {
  return { rentang: rentangDariParam(sp, zona, "bulan_ini") };
}

export async function ambilLaporanArmada(rentang: Rentang): Promise<BarisLaporanArmada[]> {
  const s = await buatKlienServer();
  const { data, error } = await s.rpc("laporan_armada", { p_dari: rentang.dari, p_sampai: rentang.sampai });
  lempar(error, "Laporan armada");
  return (data ?? []) as BarisLaporanArmada[];
}

const angkaAtauKosong = (v: number | null) => (v === null || v === undefined ? null : Number(v));

export const KOLOM_CSV_ARMADA: KolomCsv<BarisLaporanArmada>[] = [
  { judul: "Plat nomor", nilai: (a) => a.plat_nomor },
  { judul: "Jenis unit", nilai: (a) => (a.jenis_unit === "besar" ? "Besar" : "Kecil") },
  { judul: "Kapasitas (ton)", nilai: (a) => Number(a.kapasitas_ton) },
  { judul: "Supir", nilai: (a) => a.supir },
  { judul: "Status armada", nilai: (a) => definisiStatus("armada", a.status).label },
  { judul: "Aktif", nilai: (a) => a.is_active },
  { judul: "Manifes aktif", nilai: (a) => (a.status_manifes_aktif ? definisiStatus("manifes", a.status_manifes_aktif).label : "") },
  { judul: "Muatan aktif (kg)", nilai: (a) => angkaAtauKosong(a.muatan_aktif_kg) },
  { judul: "Utilisasi aktif (%)", nilai: (a) => (a.muatan_aktif_kg === null ? null : Math.round((Number(a.muatan_aktif_kg) / (Number(a.kapasitas_ton) * 1000)) * 1000) / 10) },
  { judul: "Perjalanan dalam periode", nilai: (a) => a.jumlah_perjalanan },
  { judul: "Total muatan periode (kg)", nilai: (a) => Number(a.total_muatan_kg) },
  { judul: "Rata-rata utilisasi (%)", nilai: (a) => angkaAtauKosong(a.rata_utilisasi_persen) },
  { judul: "Utilisasi tertinggi (%)", nilai: (a) => angkaAtauKosong(a.maks_utilisasi_persen) },
  { judul: "Override kapasitas", nilai: (a) => a.jumlah_override },
];

// =====================================================================
// Laporan pengiriman — riwayat perubahan status dalam periode
// =====================================================================
export type FilterPengiriman = { rentang: Rentang; status?: string };

export function bacaFilterPengiriman(sp: Sp, zona: string): FilterPengiriman {
  const status = paramTunggal(sp.status);
  return { rentang: rentangDariParam(sp, zona, "7_hari"), status: status && status in STATUS_KIRIM ? status : undefined };
}

export type BarisRiwayat = {
  id: number;
  no_resi: string;
  status_sebelumnya: string | null;
  status_baru: string;
  waktu_perubahan: string;
  catatan: string | null;
  pengguna: unknown;
};

function kueriRiwayat(s: Klien, f: FilterPengiriman, zona: string, hitung = false) {
  let q = s
    .from("riwayat_status_pengiriman")
    .select("id, no_resi, status_sebelumnya, status_baru, waktu_perubahan, catatan, pengguna:data_pengguna(nama_lengkap)", hitung ? { count: "exact" } : undefined)
    .gte("waktu_perubahan", awalHariIso(f.rentang.dari, zona))
    .lt("waktu_perubahan", awalHariIso(tambahHari(f.rentang.sampai, 1), zona));
  if (f.status) q = q.eq("status_baru", f.status);
  return q.order("waktu_perubahan", { ascending: false }).order("id", { ascending: false });
}

export async function ambilRiwayatPengiriman(f: FilterPengiriman, zona: string, halaman: number): Promise<Halaman<BarisRiwayat>> {
  const s = await buatKlienServer();
  const { data, count, error } = await kueriRiwayat(s, f, zona, true).range((halaman - 1) * UKURAN_HALAMAN, halaman * UKURAN_HALAMAN - 1);
  lempar(error, "Riwayat status");
  return { baris: (data ?? []) as unknown as BarisRiwayat[], total: count ?? 0 };
}

export async function semuaRiwayatPengiriman(f: FilterPengiriman, zona: string) {
  const s = await buatKlienServer();
  return semuaBaris<BarisRiwayat>((a, b) => kueriRiwayat(s, f, zona).range(a, b) as unknown as Hasil, "Ekspor riwayat status");
}

export function kolomCsvRiwayat(zona: string): KolomCsv<BarisRiwayat>[] {
  return [
    { judul: `Waktu perubahan (${zona})`, nilai: (r) => formatTanggalWaktu(r.waktu_perubahan, zona) },
    { judul: "Nomor resi", nilai: (r) => r.no_resi },
    { judul: "Status sebelumnya", nilai: (r) => labelKirim(r.status_sebelumnya) },
    { judul: "Status baru", nilai: (r) => labelKirim(r.status_baru) },
    { judul: "Diubah oleh", nilai: (r) => nama(r.pengguna, "nama_lengkap") || "Sistem" },
    { judul: "Catatan", nilai: (r) => r.catatan },
  ];
}

// =====================================================================
// Audit log (PRD §7.15)
// =====================================================================
export type FilterAudit = { rentang: Rentang; aksi?: string; entitas?: string; pengguna?: string; q?: string };

export function bacaFilterAudit(sp: Sp, zona: string): FilterAudit {
  const uuid = /^[0-9a-f-]{36}$/i;
  const teks = (v: string | undefined) => (v && /^[a-z_]{1,60}$/.test(v) ? v : undefined);
  const pengguna = paramTunggal(sp.pengguna);
  return {
    rentang: rentangDariParam(sp, zona, "7_hari"),
    aksi: teks(paramTunggal(sp.aksi)),
    entitas: teks(paramTunggal(sp.entitas)),
    pengguna: pengguna && uuid.test(pengguna) ? pengguna : undefined,
    q: paramTunggal(sp.q)?.replace(/[^\p{L}\p{N}\- ]/gu, "").slice(0, 60) || undefined,
  };
}

export type BarisAudit = {
  id: number;
  aksi: string;
  entitas: string;
  entitas_id: string | null;
  detail_perubahan: unknown;
  alasan: string | null;
  waktu: string;
  pengguna: unknown;
};

function kueriAudit(s: Klien, f: FilterAudit, zona: string, hitung = false) {
  let q = s
    .from("audit_log")
    .select("id, aksi, entitas, entitas_id, detail_perubahan, alasan, waktu, pengguna:data_pengguna(nama_lengkap, peran)", hitung ? { count: "exact" } : undefined)
    .gte("waktu", awalHariIso(f.rentang.dari, zona))
    .lt("waktu", awalHariIso(tambahHari(f.rentang.sampai, 1), zona));
  if (f.aksi) q = q.eq("aksi", f.aksi);
  if (f.entitas) q = q.eq("entitas", f.entitas);
  if (f.pengguna) q = q.eq("id_pengguna", f.pengguna);
  if (f.q) q = q.ilike("entitas_id", `%${f.q}%`);
  return q.order("waktu", { ascending: false }).order("id", { ascending: false });
}

export async function ambilAudit(f: FilterAudit, zona: string, halaman: number): Promise<Halaman<BarisAudit>> {
  const s = await buatKlienServer();
  const { data, count, error } = await kueriAudit(s, f, zona, true).range((halaman - 1) * UKURAN_HALAMAN, halaman * UKURAN_HALAMAN - 1);
  lempar(error, "Audit log");
  return { baris: (data ?? []) as unknown as BarisAudit[], total: count ?? 0 };
}

export async function semuaAudit(f: FilterAudit, zona: string) {
  const s = await buatKlienServer();
  return semuaBaris<BarisAudit>((a, b) => kueriAudit(s, f, zona).range(a, b) as unknown as Hasil, "Ekspor audit log");
}

export function kolomCsvAudit(zona: string): KolomCsv<BarisAudit>[] {
  return [
    { judul: "ID", nilai: (l) => l.id },
    { judul: `Waktu (${zona})`, nilai: (l) => formatTanggalWaktu(l.waktu, zona) },
    { judul: "Pengguna", nilai: (l) => nama(l.pengguna, "nama_lengkap") || "Sistem" },
    { judul: "Aksi", nilai: (l) => LABEL_AKSI_AUDIT[l.aksi] ?? l.aksi },
    { judul: "Kode aksi", nilai: (l) => l.aksi },
    { judul: "Entitas", nilai: (l) => l.entitas },
    { judul: "ID entitas", nilai: (l) => l.entitas_id },
    {
      judul: "Ringkasan perubahan",
      nilai: (l) =>
        ringkasPerubahan(l.entitas, l.aksi, l.detail_perubahan)
          .map((p) => (p.lama !== undefined ? `${p.label}: ${p.lama} → ${p.baru}` : `${p.label}: ${p.baru}`))
          .join("; "),
    },
    { judul: "Detail (JSON)", nilai: (l) => (l.detail_perubahan ? JSON.stringify(l.detail_perubahan) : null) },
    { judul: "Alasan", nilai: (l) => l.alasan },
  ];
}
