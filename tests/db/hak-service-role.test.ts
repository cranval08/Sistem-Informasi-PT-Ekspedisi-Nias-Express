/**
 * Hak service_role (secret key) — migrasi …20261118000100. Harness tidak
 * memberi hak bawaan apa pun pada service_role, sama seperti project
 * Supabase baru, sehingga tes ini membuktikan migrasi cukup untuk seed &
 * verifikasi tanpa membuka tulis ke tabel transaksional.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buatDb, ID, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await buatDb();
});

async function sebagaiServiceRole<T>(sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query<T>(sql, params)).rows;
  });
}

const TABEL_SEMUA = [
  "pengaturan", "data_pengguna", "data_pelanggan", "data_item", "data_armada",
  "data_transaksi", "detail_transaksi", "pembayaran", "penghitung_resi", "manifes",
  "manifes_detail", "riwayat_status_pengiriman", "riwayat_status_armada",
  "kendala_perjalanan", "audit_log",
];

describe("service_role (secret key)", () => {
  it.each(TABEL_SEMUA)("dapat membaca %s", async (tabel) => {
    await expect(sebagaiServiceRole(`select * from public.${tabel} limit 1`)).resolves.toBeDefined();
  });

  it("seed: menambah pelanggan & jenis barang, upsert data_pengguna — tercatat di audit log", async () => {
    await sebagaiServiceRole(`insert into public.data_pelanggan (nama, telepon) values ('[Demo] Uji service_role', '081200000999')`);
    await sebagaiServiceRole(
      `insert into public.data_item (nama_item, satuan, tarif_per_satuan) values ('[Demo] Uji service_role', 'kg', 1000)`,
    );
    await sebagaiServiceRole(`update public.data_pengguna set nomor_telepon = '081200000998' where id_pengguna = $1`, [ID.admin]);
    const log = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_log where entitas in ('data_pelanggan', 'data_item', 'data_pengguna')`,
    );
    expect(log.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["menulis transaksi langsung", `insert into public.data_transaksi (no_resi, tanggal_transaksi, id_pengirim, id_penerima, id_pengguna, total_berat_kg, total_biaya) values ('NX-SR-0001', current_date, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '${ID.admin}', 1, 1)`],
    ["menulis pembayaran langsung", `insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat) values ('NX-SR-0001', 1, '${ID.admin}')`],
    ["menulis audit_log langsung", `insert into public.audit_log (aksi, entitas) values ('palsu', 'x')`],
    ["menghapus pelanggan", `delete from public.data_pelanggan`],
    ["mengosongkan tabel", `truncate public.data_item`],
  ])("tidak dapat %s", async (_nama, sql) => {
    await expect(sebagaiServiceRole(sql)).rejects.toThrow(/permission denied/);
  });

  it("tidak dapat memanggil catat_audit", async () => {
    await expect(sebagaiServiceRole(`select public.catat_audit('palsu', 'x', null, null, null)`)).rejects.toThrow(/permission denied/);
  });
});
