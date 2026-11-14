/**
 * Fase 4 — pembayaran & kas (PRD §7.9, §15 "Pembayaran").
 */
import type { Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { baris, buatDb, ID, sebagai, type Db } from "./harness";

const PENGIRIM = "10000000-0000-4000-8000-000000000001";
const PENERIMA = "10000000-0000-4000-8000-000000000002";
const ITEM_KG = "20000000-0000-4000-8000-000000000001"; // kg, Rp1.000

let db: Db;
beforeAll(async () => {
  db = await buatDb();
});

/** Transaksi baru sebesar berat × Rp1.000, dengan pembayaran awal opsional. */
async function transaksi(tx: Transaction, beratKg: number, bayarAwal = 0) {
  const { rows } = await tx.query<{ r: string }>("select public.buat_transaksi($1, $2, $3::jsonb, $4, null, true) r", [
    PENGIRIM, PENERIMA, JSON.stringify([{ id_item: ITEM_KG, berat_kg: beratKg }]), bayarAwal,
  ]);
  return rows[0].r;
}

const bayar = (tx: Transaction, resi: string, jumlah: number, catatan: string | null = null) =>
  tx.query<{ id: string }>("select public.catat_pembayaran($1, $2, $3) id", [resi, jumlah, catatan]).then((r) => r.rows[0].id);

const status = (tx: Transaction, resi: string) =>
  tx
    .query<{ total_dibayar: number; sisa: number; status_bayar: string }>(
      "select total_dibayar, total_biaya - total_dibayar sisa, status_bayar from public.data_transaksi where no_resi = $1",
      [resi],
    )
    .then((r) => r.rows[0]);

async function coba<T>(siapa: Parameters<typeof sebagai>[1], fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let hasil!: T;
  await sebagai(db, siapa, async (tx) => {
    hasil = await fn(tx);
    await tx.rollback();
  });
  return hasil;
}

/** `aksi` berupa fungsi agar kueri baru dikirim SETELAH savepoint dibuat. */
async function gagal(tx: Transaction, aksi: () => Promise<unknown>, pola: RegExp) {
  await tx.query("savepoint s");
  await expect(aksi()).rejects.toThrow(pola);
  await tx.query("rollback to savepoint s");
}

const sebagaiPengguna = (tx: Transaction, id: string) => tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);

describe("pencatatan pembayaran (PRD §15 Pembayaran 1–4)", () => {
  it("1. pembayaran 0 → status belum lunas (nominal 0 tidak dicatat)", async () => {
    const r = await coba("admin", async (tx) => {
      const resi = await transaksi(tx, 10);
      await gagal(tx, () => bayar(tx, resi, 0), /lebih dari Rp0/);
      return status(tx, resi);
    });
    expect(r).toEqual({ total_dibayar: 0, sisa: 10000, status_bayar: "belum_lunas" });
  });

  it("2–3. pembayaran sebagian → belum lunas dengan sisa benar; akumulasi = total → lunas", async () => {
    const r = await coba("admin", async (tx) => {
      const resi = await transaksi(tx, 10, 1000);
      await bayar(tx, resi, 4000);
      const sebagian = await status(tx, resi);
      await bayar(tx, resi, 5000, "Pelunasan");
      const lunas = await status(tx, resi);
      const catatan = (await tx.query("select jumlah_bayar, catatan, id_pengguna_pencatat from public.pembayaran where no_resi = $1 order by waktu_bayar, jumlah_bayar", [resi])).rows;
      return { sebagian, lunas, catatan };
    });
    expect(r.sebagian).toEqual({ total_dibayar: 5000, sisa: 5000, status_bayar: "belum_lunas" });
    expect(r.lunas).toEqual({ total_dibayar: 10000, sisa: 0, status_bayar: "lunas" });
    expect(r.catatan.every((c) => (c as { id_pengguna_pencatat: string }).id_pengguna_pencatat === ID.admin)).toBe(true);
  });

  it("4. pembayaran melebihi sisa → ditolak dengan sisa disebutkan; transaksi lunas tidak dapat dibayar lagi", async () => {
    await coba("admin", async (tx) => {
      const resi = await transaksi(tx, 1234, 1000); // total Rp1.234.000, sisa Rp1.233.000
      await gagal(tx, () => bayar(tx, resi, 1_233_001), /melebihi sisa biaya \(sisa Rp1\.233\.000\)/);
      await bayar(tx, resi, 1_233_000);
      await gagal(tx, () => bayar(tx, resi, 1), /sudah lunas/);
    });
  });

  it("nominal negatif, resi tidak ada, dan transaksi dibatalkan → ditolak", async () => {
    await coba("pemilik", async (tx) => {
      const resi = await transaksi(tx, 3);
      await gagal(tx, () => bayar(tx, resi, -100), /lebih dari Rp0/);
      await gagal(tx, () => bayar(tx, "NX-19000101-0001", 100), /tidak ditemukan/);
      await tx.query("select public.batalkan_transaksi($1, 'Salah input')", [resi]);
      await gagal(tx, () => bayar(tx, resi, 100), /sudah dibatalkan/);
    });
  });

  it("pencatatan tercatat di audit log dengan sisa sebelum/sesudah", async () => {
    const log = await coba("pemilik", async (tx) => {
      const resi = await transaksi(tx, 10);
      const id = await bayar(tx, resi, 2500);
      return (await tx.query<{ aksi: string; id_pengguna: string; detail_perubahan: unknown }>(
        "select aksi, id_pengguna, detail_perubahan from public.audit_log where entitas = 'pembayaran' and entitas_id = $1", [id],
      )).rows;
    });
    expect(log).toEqual([
      { aksi: "catat_pembayaran", id_pengguna: ID.pemilik, detail_perubahan: expect.objectContaining({ jumlah_bayar: 2500, sisa_sebelum: 10000, sisa_sesudah: 7500 }) },
    ]);
  });
});

describe("hak akses (PRD §15 Pembayaran 5)", () => {
  it.each(["gudang", "supir", "nonaktif"] as const)("%s mencoba mencatat pembayaran → ditolak", async (siapa) => {
    const resi = await sebagai(db, "admin", (tx) => transaksi(tx, 1)); // permanen untuk tes ini
    await expect(baris(db, siapa, "select public.catat_pembayaran($1, 100)", [resi])).rejects.toThrow(/hak akses|Sesi tidak valid/);
    await expect(baris(db, siapa, "select * from public.rekap_kas(current_date, current_date)")).rejects.toThrow(/hak akses|Sesi tidak valid/);
  });

  it("tidak ada yang dapat menulis tabel pembayaran secara langsung", async () => {
    await expect(
      baris(db, "admin", `insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat) values ('x', 1, '${ID.admin}')`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("pembatalan / koreksi pembayaran", () => {
  it("hanya Pemilik, wajib alasan; total dihitung ulang; tidak dapat dibatalkan dua kali; tercatat di audit", async () => {
    const r = await coba("admin", async (tx) => {
      const resi = await transaksi(tx, 10);
      const id = await bayar(tx, resi, 10000);
      await gagal(tx, () => tx.query("select public.batalkan_pembayaran($1, 'Salah nominal')", [id]), /hak akses/);
      await sebagaiPengguna(tx, ID.pemilik);
      await gagal(tx, () => tx.query("select public.batalkan_pembayaran($1, '  ')", [id]), /Alasan pembatalan pembayaran wajib/);
      await tx.query("select public.batalkan_pembayaran($1, 'Salah nominal')", [id]);
      const setelah = await status(tx, resi);
      await gagal(tx, () => tx.query("select public.batalkan_pembayaran($1, 'lagi')", [id]), /sudah dibatalkan/);
      const b = (await tx.query("select status_pembayaran_record, catatan_koreksi, dibatalkan_oleh, jumlah_bayar from public.pembayaran where id_pembayaran = $1", [id])).rows[0];
      const log = (await tx.query("select aksi, alasan from public.audit_log where entitas_id = $1 order by id", [id])).rows;
      // Setelah pembayaran dibatalkan, transaksi dapat di-void.
      await tx.query("select public.batalkan_transaksi($1, 'Pelanggan batal')", [resi]);
      return { setelah, b, log };
    });
    expect(r.setelah).toEqual({ total_dibayar: 0, sisa: 10000, status_bayar: "belum_lunas" });
    expect(r.b).toEqual({ status_pembayaran_record: "dibatalkan", catatan_koreksi: "Salah nominal", dibatalkan_oleh: ID.pemilik, jumlah_bayar: 10000 });
    expect(r.log).toEqual([
      { aksi: "catat_pembayaran", alasan: null },
      { aksi: "batalkan_pembayaran", alasan: "Salah nominal" },
    ]);
  });
});

describe("rekap kas", () => {
  it("menjumlahkan hanya pembayaran valid, per tanggal Jakarta & pencatat; dibatalkan dilaporkan terpisah", async () => {
    const r = await coba("admin", async (tx) => {
      const a = await transaksi(tx, 10, 2000); // admin: 2.000 (awal)
      await bayar(tx, a, 3000); // admin: 3.000
      await sebagaiPengguna(tx, ID.pemilik);
      const b = await transaksi(tx, 5);
      const id = await bayar(tx, b, 5000); // pemilik: 5.000 lalu dibatalkan
      await tx.query("select public.batalkan_pembayaran($1, 'Uji')", [id]);
      await bayar(tx, b, 4000); // pemilik: 4.000
      // Pembayaran kemarin (ditulis langsung sebagai pemilik basis data) tidak masuk rentang hari ini.
      await tx.query("reset role");
      await tx.query("alter table public.pembayaran disable trigger pembayaran_sebelum");
      await tx.query(`insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat, waktu_bayar) values ($1, 100, '${ID.admin}', now() - interval '1 day')`, [a]);
      await tx.query("alter table public.pembayaran enable trigger pembayaran_sebelum");
      await tx.query("set local role authenticated");
      const hariIni = (await tx.query<{ t: string }>("select public.tanggal_operasional(now())::text t")).rows[0].t;
      const rekap = (await tx.query("select tanggal::text, nama_pencatat, jumlah_pembayaran, total_diterima, jumlah_dibatalkan, total_dibatalkan from public.rekap_kas($1::date, $1::date)", [hariIni])).rows;
      return { hariIni, rekap };
    });
    expect(r.rekap).toEqual([
      { tanggal: r.hariIni, nama_pencatat: "Admin Uji", jumlah_pembayaran: 2, total_diterima: 5000, jumlah_dibatalkan: 0, total_dibatalkan: 0 },
      { tanggal: r.hariIni, nama_pencatat: "Pemilik Uji", jumlah_pembayaran: 1, total_diterima: 4000, jumlah_dibatalkan: 1, total_dibatalkan: 5000 },
    ]);
  });

  it("rentang tidak valid atau lebih dari 1 tahun ditolak", async () => {
    await expect(baris(db, "admin", "select * from public.rekap_kas('2026-02-01', '2026-01-01')")).rejects.toThrow(/tidak valid/);
    await expect(baris(db, "admin", "select * from public.rekap_kas('2024-01-01', '2026-01-01')")).rejects.toThrow(/maksimal 1 tahun/);
  });
});
