/**
 * Fase 6 — agregasi dashboard & laporan (PRD §3 indikator, §7.2, §7.14).
 * Angka harus berasal dari tabel transaksi; setiap skenario di-rollback.
 */
import type { Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buatDb, ID, sebagai, type Db } from "./harness";

const PENGIRIM = "10000000-0000-4000-8000-000000000001";
const PENERIMA = "10000000-0000-4000-8000-000000000002";
const ITEM_KG = "20000000-0000-4000-8000-000000000001"; // kg, Rp1.000
const ARMADA_8T = "30000000-0000-4000-8000-000000000001";

type Siapa = keyof typeof ID;

let db: Db;
let hariIni: string;
beforeAll(async () => {
  db = await buatDb();
  hariIni = (await db.query<{ t: string }>("select public.tanggal_operasional(now())::text t")).rows[0].t;
});

const jadi = (tx: Transaction, siapa: Siapa) => tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ID[siapa]]);

async function skenario<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let hasil!: T;
  await sebagai(db, "pemilik", async (tx) => {
    hasil = await fn(tx);
    await tx.rollback();
  });
  return hasil;
}

async function gagal(tx: Transaction, aksi: () => Promise<unknown>, pola: RegExp) {
  await tx.query("savepoint s");
  await expect(aksi()).rejects.toThrow(pola);
  await tx.query("rollback to savepoint s");
}

async function transaksi(tx: Transaction, beratKg: number, bayar: number, konfirmasi = true) {
  await jadi(tx, "admin");
  const { rows } = await tx.query<{ r: string }>("select public.buat_transaksi($1, $2, $3::jsonb, $4, null, $5, 'Bayar di tujuan') r", [
    PENGIRIM, PENERIMA, JSON.stringify([{ id_item: ITEM_KG, berat_kg: beratKg }]), bayar, konfirmasi,
  ]);
  return rows[0].r;
}

const ringkasan = (tx: Transaction, dari = hariIni, sampai = hariIni) =>
  tx.query<Record<string, number | string | null>>("select * from public.ringkasan_operasional($1::date, $2::date)", [dari, sampai]).then((r) => r.rows[0]);

describe("ringkasan_operasional (KPI dashboard Pemilik)", () => {
  it("menghitung transaksi, status bayar & kirim, penerimaan, void, dan duplikat dari data periode", async () => {
    const r = await skenario(async (tx) => {
      const sebelum = await ringkasan(tx);
      await transaksi(tx, 10, 10000); // lunas
      const b = await transaksi(tx, 5, 2000); // sebagian, juga duplikat? tidak: berat berbeda
      await transaksi(tx, 5, 0); // duplikat dari b (pengirim/penerima/berat sama) → dikonfirmasi
      const v = await transaksi(tx, 3, 0);
      await jadi(tx, "pemilik");
      await tx.query("select public.batalkan_transaksi($1, 'Uji')", [v]);
      const { rows } = await tx.query<{ id: string }>("select id_pembayaran id from public.pembayaran where no_resi = $1", [b]);
      await tx.query("select public.batalkan_pembayaran($1, 'Salah nominal')", [rows[0].id]);
      await tx.query("select public.catat_peringatan_duplikat($1, $2, 5)", [PENGIRIM, PENERIMA]);
      return { sebelum, sesudah: await ringkasan(tx) };
    });
    const selisih = (k: string) => Number(r.sesudah[k]) - Number(r.sebelum[k]);
    expect(selisih("jumlah_transaksi")).toBe(3); // void tidak dihitung
    expect(selisih("jumlah_void")).toBe(1);
    expect(selisih("total_biaya")).toBe(20000);
    expect(selisih("jumlah_lunas")).toBe(1);
    expect(selisih("jumlah_belum_lunas")).toBe(2);
    expect(selisih("sisa_tagihan")).toBe(10000); // 5.000 + 5.000 (pembayaran b dibatalkan)
    expect(selisih("jumlah_diterima_loket")).toBe(3);
    expect(selisih("total_diterima")).toBe(10000);
    expect(selisih("jumlah_pembayaran")).toBe(1);
    expect(selisih("total_dibatalkan")).toBe(2000);
    expect(selisih("jumlah_pembayaran_dibatalkan")).toBe(1);
    expect(selisih("duplikat_dikonfirmasi")).toBe(1);
    expect(selisih("peringatan_duplikat")).toBe(1);
    expect(r.sesudah.peringatan_kapasitas).toBeNull(); // ambang belum diisi → perlu dilengkapi
  });

  it("transaksi di luar periode tidak dihitung; rentang tidak valid ditolak", async () => {
    await skenario(async (tx) => {
      await transaksi(tx, 10, 0);
      await jadi(tx, "pemilik");
      const kemarin = (await tx.query<{ t: string }>("select ($1::date - 1)::text t", [hariIni])).rows[0].t;
      const r = await ringkasan(tx, kemarin, kemarin);
      expect(r.jumlah_transaksi).toBe(0);
      await gagal(tx, () => ringkasan(tx, hariIni, kemarin), /Rentang tanggal tidak valid/);
      await gagal(tx, () => ringkasan(tx, "2025-01-01", "2026-06-01"), /maksimal 1 tahun/);
    });
  });

  it("peringatan & override kapasitas mengikuti ambang Pengaturan", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 7000, 7_000_000); // 87,5% dari 8 ton
      await jadi(tx, "pemilik");
      await tx.query("update public.pengaturan set ambang_peringatan_kapasitas_persen = 85 where id = 1");
      await jadi(tx, "gudang");
      const { rows } = await tx.query<{ id: string }>("select public.buat_manifes($1, $2, 'Uji') id", [ARMADA_8T, ID.supir]);
      await tx.query("select public.tambah_resi_manifes($1, $2::text[])", [rows[0].id, [resi]]);
      await tx.query("select public.konfirmasi_muat($1, null)", [rows[0].id]);
      await jadi(tx, "pemilik");
      return ringkasan(tx);
    });
    expect(r.peringatan_kapasitas).toBe(1);
    expect(r.override_kapasitas).toBe(0);
  });
});

describe("tren_operasional", () => {
  it("setiap ember muncul (0 bila kosong); minggu dimulai Senin dan dipotong ke periode", async () => {
    const r = await skenario(async (tx) => {
      await transaksi(tx, 2, 2000);
      await jadi(tx, "pemilik");
      const hari = (await tx.query("select awal::text, akhir::text, jumlah_transaksi, total_biaya, total_diterima from public.tren_operasional(($1::date - 2), $1::date, 'hari')", [hariIni])).rows;
      const minggu = (await tx.query("select awal::text, akhir::text from public.tren_operasional('2026-11-04', '2026-11-20', 'minggu')")).rows;
      const bulan = (await tx.query("select awal::text, akhir::text from public.tren_operasional('2026-10-15', '2026-11-14', 'bulan')")).rows;
      await gagal(tx, () => tx.query("select * from public.tren_operasional($1, $1, 'tahun')", [hariIni]), /hari, minggu, atau bulan/);
      return { hari, minggu, bulan };
    });
    expect(r.hari).toHaveLength(3);
    expect(r.hari.slice(0, 2).every((h) => (h as { jumlah_transaksi: number }).jumlah_transaksi === 0)).toBe(true);
    expect(r.hari[2]).toMatchObject({ awal: hariIni, jumlah_transaksi: 1, total_biaya: 2000, total_diterima: 2000 });
    // 4 Nov 2026 = Rabu → ember pertama dipotong ke 4 Nov; Senin berikutnya 9 & 16 Nov.
    expect(r.minggu).toEqual([
      { awal: "2026-11-04", akhir: "2026-11-08" },
      { awal: "2026-11-09", akhir: "2026-11-15" },
      { awal: "2026-11-16", akhir: "2026-11-20" },
    ]);
    expect(r.bulan).toEqual([
      { awal: "2026-10-15", akhir: "2026-10-31" },
      { awal: "2026-11-01", akhir: "2026-11-14" },
    ]);
  });
});

describe("laporan_armada", () => {
  it("muatan aktif, jumlah perjalanan, utilisasi rata-rata & maksimum dari manifes yang berangkat", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 6000, 6_000_000);
      await jadi(tx, "gudang");
      const id = (await tx.query<{ id: string }>("select public.buat_manifes($1, $2, 'Gunungsitoli → Teluk Dalam') id", [ARMADA_8T, ID.supir])).rows[0].id;
      await tx.query("select public.tambah_resi_manifes($1, $2::text[])", [id, [resi]]);
      await jadi(tx, "pemilik");
      const draf = (await tx.query("select * from public.laporan_armada($1, $1) where id_armada = $2", [hariIni, ARMADA_8T])).rows[0];
      await jadi(tx, "gudang");
      await tx.query("select public.konfirmasi_muat($1, null)", [id]);
      await tx.query("select public.konfirmasi_berangkat($1)", [id]);
      await jadi(tx, "pemilik");
      const jalan = (await tx.query("select * from public.laporan_armada($1, $1) where id_armada = $2", [hariIni, ARMADA_8T])).rows[0];
      return { draf, jalan };
    });
    expect(r.draf).toMatchObject({ status_manifes_aktif: "draft", jumlah_perjalanan: 0, rata_utilisasi_persen: null, supir: "Supir Uji" });
    expect(Number((r.draf as { muatan_aktif_kg: string }).muatan_aktif_kg)).toBe(6000);
    expect(r.jalan).toMatchObject({ status: "perjalanan", status_manifes_aktif: "berangkat", jumlah_perjalanan: 1, jumlah_override: 0 });
    expect(Number((r.jalan as { rata_utilisasi_persen: string }).rata_utilisasi_persen)).toBe(75);
    expect(Number((r.jalan as { maks_utilisasi_persen: string }).maks_utilisasi_persen)).toBe(75);
  });
});

describe("peringatan_data (data yang perlu diperiksa)", () => {
  it("menandai barang tiba belum lunas dan ketidakkonsistenan yang dipaksakan di basis data", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 10, 10000);
      // Paksa selisih total_dibayar (mensimulasikan data rusak) sebagai pemilik basis data.
      await tx.query("reset role");
      await tx.query("alter table public.data_transaksi disable trigger user");
      await tx.query("update public.data_transaksi set total_dibayar = 4000 where no_resi = $1", [resi]);
      await tx.query("alter table public.data_transaksi enable trigger user");
      await tx.query("set local role authenticated");
      await jadi(tx, "admin");
      return (await tx.query<{ jenis: string; no_resi: string }>("select jenis, no_resi from public.peringatan_data()")).rows;
    });
    expect(r).toContainEqual({ jenis: "selisih_pembayaran", no_resi: expect.any(String) });
  });
});

describe("catat_peringatan_duplikat", () => {
  it("hanya mencatat bila duplikat memang ada", async () => {
    const r = await skenario(async (tx) => {
      await jadi(tx, "admin");
      const kosong = (await tx.query<{ n: number }>("select public.catat_peringatan_duplikat($1, $2, 99) n", [PENGIRIM, PENERIMA])).rows[0].n;
      const resi = await transaksi(tx, 4, 4000);
      const ada = (await tx.query<{ n: number }>("select public.catat_peringatan_duplikat($1, $2, 4) n", [PENGIRIM, PENERIMA])).rows[0].n;
      await jadi(tx, "pemilik");
      const log = (await tx.query("select entitas_id, detail_perubahan->'resi_mirip' resi from public.audit_log where aksi = 'peringatan_duplikat'")).rows;
      return { kosong, ada, log, resi };
    });
    expect(r.kosong).toBe(0);
    expect(r.ada).toBe(1);
    expect(r.log).toEqual([{ entitas_id: r.resi, resi: [r.resi] }]);
  });
});

describe("hak akses laporan", () => {
  it.each(["admin", "gudang", "supir"] as const)("%s tidak dapat membaca agregat khusus Pemilik", async (siapa) => {
    await skenario(async (tx) => {
      await jadi(tx, siapa);
      await gagal(tx, () => ringkasan(tx), /hak akses/);
      await gagal(tx, () => tx.query("select * from public.tren_operasional($1, $1)", [hariIni]), /hak akses/);
      await gagal(tx, () => tx.query("select * from public.laporan_armada($1, $1)", [hariIni]), /hak akses/);
    });
  });

  it("Staf Gudang & Supir tidak dapat membaca peringatan data atau mencatat peringatan duplikat; anon ditolak", async () => {
    await skenario(async (tx) => {
      for (const siapa of ["gudang", "supir"] as const) {
        await jadi(tx, siapa);
        await gagal(tx, () => tx.query("select * from public.peringatan_data()"), /hak akses/);
        await gagal(tx, () => tx.query("select public.catat_peringatan_duplikat($1, $2, 1)", [PENGIRIM, PENERIMA]), /hak akses/);
      }
    });
    await sebagai(db, "anon", async (tx) => {
      await gagal(tx, () => tx.query("select * from public.ringkasan_operasional(current_date, current_date)"), /permission denied/);
      await tx.rollback();
    });
    await sebagai(db, "pemilik", async (tx) => {
      await gagal(tx, () => tx.query("select * from public.batas_periode(current_date, current_date)"), /permission denied/);
      await tx.rollback();
    });
  });
});
