/**
 * Fase 3 — transaksi & resi (PRD §7.8, §8, §15 "Transaksi").
 * Setiap tes yang menulis berjalan dalam transaksi yang di-rollback.
 */
import type { Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { baris, buatDb, ID, sebagai, type Db } from "./harness";

const PENGIRIM = "10000000-0000-4000-8000-000000000001";
const PENERIMA = "10000000-0000-4000-8000-000000000002";
const ITEM_KG = "20000000-0000-4000-8000-000000000001"; // kg, Rp1.000
const ITEM_KOLI = "20000000-0000-4000-8000-000000000002"; // koli, Rp50.000
const ITEM_TON = "20000000-0000-4000-8000-000000000003"; // ton, Rp400.000 (ditambah di beforeAll)

let db: Db;
let tanggal: string;

beforeAll(async () => {
  db = await buatDb();
  await db.exec(`insert into public.data_item (id_item, nama_item, satuan, tarif_per_satuan) values ('${ITEM_TON}', 'Barang Uji Ton', 'ton', 400000)`);
  tanggal = (await db.query<{ t: string }>("select to_char(public.tanggal_operasional(now()), 'YYYYMMDD') t")).rows[0].t;
});

type Detail = { id_item: string; berat_kg: number | string; koli?: number | string | null };

function buat(tx: Transaction, detail: Detail[], opsi: { bayar?: number; konfirmasi?: boolean; pengirim?: string | null; catatan?: string } = {}) {
  return tx
    .query<{ resi: string }>("select public.buat_transaksi($1, $2, $3::jsonb, $4, $5, $6) resi", [
      opsi.pengirim === undefined ? PENGIRIM : opsi.pengirim,
      PENERIMA,
      JSON.stringify(detail),
      opsi.bayar ?? 0,
      opsi.catatan ?? null,
      opsi.konfirmasi ?? false,
    ])
    .then((r) => r.rows[0].resi);
}

/** Jalankan sebagai peran lalu rollback. */
async function coba<T>(siapa: Parameters<typeof sebagai>[1], fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let hasil!: T;
  await sebagai(db, siapa, async (tx) => {
    hasil = await fn(tx);
    await tx.rollback();
  });
  return hasil;
}

/** Harapkan galat; savepoint menjaga transaksi tetap dapat dipakai. */
async function gagal(tx: Transaction, p: Promise<unknown>, pola: RegExp) {
  await expect(p).rejects.toThrow(pola);
  await tx.query("rollback to savepoint s");
}

describe("pembuatan transaksi (PRD §15 Transaksi 1)", () => {
  it("data lengkap → berhasil, resi PREFIKS-YYYYMMDD-NNNN, tarif tersnapshot, riwayat & audit tercatat", async () => {
    const r = await coba("admin", async (tx) => {
      const resi = await buat(tx, [
        { id_item: ITEM_KG, berat_kg: 12.5 },
        { id_item: ITEM_KOLI, berat_kg: 20, koli: 3 },
        { id_item: ITEM_TON, berat_kg: 1250 },
      ], { catatan: "  Rapuh  " });
      const resi2 = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }]);
      const t = (await tx.query("select * from public.data_transaksi where no_resi = $1", [resi])).rows[0];
      const d = (await tx.query("select satuan_saat_transaksi, jumlah::text, berat_kg::text, tarif_saat_transaksi::text, subtotal::text from public.detail_transaksi where no_resi = $1 order by subtotal", [resi])).rows;
      const riwayat = (await tx.query("select status_baru, id_pengguna from public.riwayat_status_pengiriman where no_resi = $1", [resi])).rows;
      return { resi, resi2, t, d, riwayat };
    });
    expect(r.resi).toBe(`NX-${tanggal}-0001`);
    expect(r.resi2).toBe(`NX-${tanggal}-0002`);
    expect(r.t).toMatchObject({
      id_pengguna: ID.admin,
      status_kirim: "diterima_loket",
      total_berat_kg: "1282.500",
      // 12,5 × 1.000 + 3 × 50.000 + 1,250 × 400.000
      total_biaya: 662500,
      total_dibayar: 0,
      status_bayar: "belum_lunas",
      catatan: "Rapuh",
    });
    expect(r.d).toEqual([
      { satuan_saat_transaksi: "kg", jumlah: "12.500", berat_kg: "12.500", tarif_saat_transaksi: "1000", subtotal: "12500" },
      { satuan_saat_transaksi: "koli", jumlah: "3.000", berat_kg: "20.000", tarif_saat_transaksi: "50000", subtotal: "150000" },
      { satuan_saat_transaksi: "ton", jumlah: "1.250", berat_kg: "1250.000", tarif_saat_transaksi: "400000", subtotal: "500000" },
    ]);
    expect(r.riwayat).toEqual([{ status_baru: "diterima_loket", id_pengguna: ID.admin }]);
  });

  it("audit log mencatat pembuatan transaksi beserta rincian", async () => {
    const log = await coba("pemilik", async (tx) => {
      const resi = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 2 }]);
      return (await tx.query<{ aksi: string; id_pengguna: string; detail_perubahan: Record<string, unknown> }>(
        "select aksi, id_pengguna, detail_perubahan from public.audit_log where entitas = 'data_transaksi' and entitas_id = $1", [resi],
      )).rows;
    });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ aksi: "buat_transaksi", id_pengguna: ID.pemilik });
    expect(log[0].detail_perubahan).toMatchObject({ total_biaya: 2000, total_berat_kg: 2, bayar_awal: 0, duplikat_dikonfirmasi: null });
  });

  it("prefiks resi mengikuti pengaturan", async () => {
    const resi = await coba("admin", async (tx) => {
      await tx.query("reset role");
      await tx.query("update public.pengaturan set prefiks_resi = 'NXT'");
      await tx.query("set local role authenticated");
      return buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }]);
    });
    expect(resi).toMatch(new RegExp(`^NXT-${tanggal}-\\d{4}$`));
  });
});

describe("validasi (PRD §15 Transaksi 2–5, §8)", () => {
  it("pengirim kosong, berat 0/negatif/>3 desimal, item tidak ada/nonaktif → ditolak dengan pesan jelas", async () => {
    await coba("admin", async (tx) => {
      await tx.query("savepoint s");
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }], { pengirim: null }), /Pengirim wajib dipilih/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: 0 }]), /lebih dari 0 kg/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: -3 }]), /lebih dari 0 kg/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: "1.2345" }]), /maksimal 3 angka desimal/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: "abc" }]), /bukan angka/);
      await gagal(tx, buat(tx, [{ id_item: "20000000-0000-4000-8000-0000000000ff", berat_kg: 1 }]), /tidak ada di master item/);
      await gagal(tx, buat(tx, [{ id_item: "bukan-uuid", berat_kg: 1 }]), /tidak ada di master item/);
      await gagal(tx, buat(tx, []), /Minimal satu baris/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KOLI, berat_kg: 5, koli: 1.5 }]), /bilangan bulat/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KOLI, berat_kg: 5 }]), /koli/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_TON, berat_kg: 0.4 }]), /terlalu kecil/);
    });
  });

  it("item nonaktif dan pelanggan nonaktif tidak dapat dipakai", async () => {
    await coba("pemilik", async (tx) => {
      await tx.query("update public.data_item set is_active = false where id_item = $1", [ITEM_KG]);
      await tx.query("savepoint s");
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }]), /nonaktif/);
      await tx.query("update public.data_pelanggan set is_active = false where id_pelanggan = $1", [PENGIRIM]);
      await tx.query("savepoint s");
      await gagal(tx, buat(tx, [{ id_item: ITEM_KOLI, berat_kg: 1, koli: 1 }]), /Pengirim tidak ditemukan atau nonaktif/);
    });
  });

  it("tidak ada data yang tertulis bila salah satu baris tidak valid (atomik)", async () => {
    const jumlah = await coba("admin", async (tx) => {
      await tx.query("savepoint s");
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }, { id_item: ITEM_KG, berat_kg: 0 }]), /lebih dari 0/);
      return (await tx.query<{ n: number }>("select count(*)::int n from public.data_transaksi")).rows[0].n;
    });
    expect(jumlah).toBe(0);
  });
});

describe("duplikasi (PRD §15 Transaksi 6)", () => {
  it("kombinasi pengirim + penerima + tanggal + berat sama → peringatan; konfirmasi tercatat di audit", async () => {
    const r = await coba("admin", async (tx) => {
      const pertama = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 10 }]);
      await tx.query("savepoint s");
      // Total berat sama walau rincian berbeda
      await gagal(tx, buat(tx, [{ id_item: ITEM_KOLI, berat_kg: 4, koli: 1 }, { id_item: ITEM_KG, berat_kg: 6 }]), new RegExp(`Kemungkinan transaksi ganda: ${pertama}`));
      const kode = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 10 }]).catch((e) => (e as { code?: string }).code);
      await tx.query("rollback to savepoint s");
      const kedua = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 10 }], { konfirmasi: true });
      // Admin tidak dapat membaca audit log (RLS); periksa sebagai pemilik basis data.
      await tx.query("reset role");
      const log = (await tx.query<{ detail_perubahan: { duplikat_dikonfirmasi: string[] }; alasan: string }>(
        "select detail_perubahan, alasan from public.audit_log where entitas_id = $1", [kedua],
      )).rows[0];
      await tx.query("set local role authenticated");
      const dup = (await tx.query("select no_resi from public.cari_duplikat_transaksi($1, $2, 10)", [PENGIRIM, PENERIMA])).rows;
      const beda = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 10.5 }]); // berat beda → tidak dianggap duplikat
      return { pertama, kode, log, dup, beda };
    });
    expect(r.kode).toBe("NX001");
    expect(r.log.detail_perubahan.duplikat_dikonfirmasi).toEqual([r.pertama]);
    expect(r.log.alasan).toMatch(/Dikonfirmasi/);
    expect(r.dup).toHaveLength(2);
    expect(r.beda).toBeTruthy();
  });

  it("transaksi yang dibatalkan tidak dihitung sebagai duplikat", async () => {
    await coba("pemilik", async (tx) => {
      const resi = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 7 }]);
      await tx.query("select public.batalkan_transaksi($1, 'Salah input')", [resi]);
      await expect(buat(tx, [{ id_item: ITEM_KG, berat_kg: 7 }])).resolves.toBeTruthy();
    });
  });
});

describe("snapshot tarif (PRD §15 Transaksi 7)", () => {
  it("tarif master berubah → tarif & total transaksi lama tidak berubah", async () => {
    const r = await coba("pemilik", async (tx) => {
      const resi = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 5 }]);
      await tx.query("update public.data_item set tarif_per_satuan = 9999 where id_item = $1", [ITEM_KG]);
      const lama = (await tx.query("select d.tarif_saat_transaksi::text tarif, t.total_biaya::text total from public.detail_transaksi d join public.data_transaksi t using (no_resi) where no_resi = $1", [resi])).rows[0];
      const baru = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 5 }], { konfirmasi: true });
      const total = (await tx.query<{ t: string }>("select total_biaya::text t from public.data_transaksi where no_resi = $1", [baru])).rows[0].t;
      return { lama, total };
    });
    expect(r.lama).toEqual({ tarif: "1000", total: "5000" });
    expect(r.total).toBe("49995");
  });
});

describe("pembayaran awal (PRD §7.8 aturan 7–9)", () => {
  it("0 → belum lunas tanpa baris pembayaran; sebagian → belum lunas; penuh → lunas; melebihi → ditolak", async () => {
    const r = await coba("admin", async (tx) => {
      const nol = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }]);
      const sebagian = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 2 }], { bayar: 500 });
      const penuh = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 3 }], { bayar: 3000 });
      await tx.query("savepoint s");
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: 4 }], { bayar: 4001 }), /melebihi total biaya/);
      await gagal(tx, buat(tx, [{ id_item: ITEM_KG, berat_kg: 4 }], { bayar: -1 }), /minimal 0/);
      const status = (await tx.query<{ no_resi: string; status_bayar: string; total_dibayar: string }>(
        "select no_resi, status_bayar, total_dibayar::text from public.data_transaksi where no_resi = any($1)", [[nol, sebagian, penuh]],
      )).rows;
      const pembayaran = (await tx.query<{ no_resi: string; id_pengguna_pencatat: string }>(
        "select no_resi, id_pengguna_pencatat from public.pembayaran order by no_resi",
      )).rows;
      return { nol, sebagian, penuh, status, pembayaran };
    });
    const s = Object.fromEntries(r.status.map((x) => [x.no_resi, [x.status_bayar, x.total_dibayar]]));
    expect(s[r.nol]).toEqual(["belum_lunas", "0"]);
    expect(s[r.sebagian]).toEqual(["belum_lunas", "500"]);
    expect(s[r.penuh]).toEqual(["lunas", "3000"]);
    expect(r.pembayaran.map((p) => p.no_resi)).toEqual([r.sebagian, r.penuh]);
    expect(r.pembayaran.every((p) => p.id_pengguna_pencatat === ID.admin)).toBe(true);
  });
});

describe("hak akses", () => {
  it.each(["gudang", "supir", "nonaktif"] as const)("%s tidak dapat membuat transaksi atau memeriksa duplikat", async (siapa) => {
    await expect(
      baris(db, siapa, "select public.buat_transaksi($1, $2, $3::jsonb)", [PENGIRIM, PENERIMA, JSON.stringify([{ id_item: ITEM_KG, berat_kg: 1 }])]),
    ).rejects.toThrow(/hak akses|Sesi tidak valid/);
    await expect(baris(db, siapa, "select * from public.cari_duplikat_transaksi($1, $2, 1)", [PENGIRIM, PENERIMA])).rejects.toThrow(
      /hak akses|Sesi tidak valid/,
    );
  });

  it("anon tidak dapat memanggil fungsi transaksi; tidak ada yang dapat memanggil pembuat resi langsung", async () => {
    await expect(baris(db, "anon", "select public.buat_transaksi(null, null, '[]'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(baris(db, "pemilik", "select public.buat_nomor_resi()")).rejects.toThrow(/permission denied/);
  });
});

describe("pembatalan / void (PRD §7.8 aturan 12)", () => {
  it("hanya Pemilik, wajib alasan, tercatat di audit; tidak dapat dibatalkan dua kali", async () => {
    const r = await coba("pemilik", async (tx) => {
      const resi = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }]);
      await tx.query("savepoint s");
      await gagal(tx, tx.query("select public.batalkan_transaksi($1, '  ')", [resi]), /Alasan pembatalan wajib/);
      await tx.query("select public.batalkan_transaksi($1, 'Pelanggan batal kirim')", [resi]);
      await tx.query("savepoint s");
      await gagal(tx, tx.query("select public.batalkan_transaksi($1, 'lagi')", [resi]), /sudah dibatalkan/);
      const t = (await tx.query("select status_void, void_reason, void_oleh from public.data_transaksi where no_resi = $1", [resi])).rows[0];
      const log = (await tx.query<{ aksi: string }>("select aksi, alasan from public.audit_log where entitas_id = $1 order by id", [resi])).rows;
      return { t, log };
    });
    expect(r.t).toEqual({ status_void: true, void_reason: "Pelanggan batal kirim", void_oleh: ID.pemilik });
    expect(r.log.map((l) => l.aksi)).toEqual(["buat_transaksi", "batalkan_transaksi"]);
  });

  it("Admin Loket tidak dapat membatalkan; transaksi berpembayaran tidak dapat dibatalkan", async () => {
    await coba("admin", async (tx) => {
      const resi = await buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }], { bayar: 100 });
      await tx.query("savepoint s");
      await gagal(tx, tx.query("select public.batalkan_transaksi($1, 'x')", [resi]), /hak akses/);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ID.pemilik]);
      await tx.query("savepoint s");
      await gagal(tx, tx.query("select public.batalkan_transaksi($1, 'x')", [resi]), /sudah memiliki pembayaran/);
    });
  });

  it("transaksi tidak dapat dihapus permanen", async () => {
    await coba("pemilik", async (tx) => {
      await buat(tx, [{ id_item: ITEM_KG, berat_kg: 1 }]);
      await tx.query("reset role");
      await tx.query("savepoint s");
      await gagal(tx, tx.query("delete from public.data_transaksi"), /tidak dapat dihapus permanen/);
    });
  });
});

describe("jumlah_satuan (dicocokkan dengan perhitungan UI)", () => {
  it.each([
    ["kg", "12.345", null, "12.345"],
    ["ton", "1234.567", null, "1.235"],
    ["ton", "0.5", null, "0.001"],
    ["koli", "8", "3", "3"],
  ])("%s berat %s koli %s → %s", async (satuan, berat, koli, hasil) => {
    const r = await db.query<{ j: string }>("select public.jumlah_satuan($1, $2, $3)::text j", [satuan, berat, koli]);
    expect(Number(r.rows[0].j)).toBe(Number(hasil));
  });
});

describe("perhitungan UI identik dengan database", () => {
  it("subtotal dari hitungBaris() sama dengan round(jumlah_satuan × tarif) di Postgres", async () => {
    const { hitungBaris } = await import("../../src/lib/domain/transaksi");
    const kasus: [string, string, string, number][] = [];
    for (const berat of ["0.5", "0.001", "1", "12.345", "999.999", "1234.567", "5000"]) {
      for (const tarif of [1, 499, 500, 1500, 400000, 123457]) {
        kasus.push(["kg", berat, "", tarif], ["ton", berat, "", tarif], ["koli", berat, "7", tarif]);
      }
    }
    const { rows } = await db.query<{ s: number }>(
      `select round(public.jumlah_satuan(k.satuan::public.satuan_item, k.berat::numeric, nullif(k.koli, '')::numeric) * k.tarif)::bigint s
       from jsonb_to_recordset($1::jsonb) as k(i int, satuan text, berat text, koli text, tarif bigint) order by k.i`,
      [JSON.stringify(kasus.map(([satuan, berat, koli, tarif], i) => ({ i, satuan, berat, koli, tarif })))],
    );
    const ui = kasus.map(([satuan, berat, koli, tarif]) => hitungBaris({ satuan: satuan as "kg", tarif, berat, koli }).subtotal ?? 0);
    expect(ui).toEqual(rows.map((r) => Number(r.s)));
  });
});

describe("Data Demo transaksi", () => {
  it("TRANSAKSI_DEMO dapat dibuat lewat buat_transaksi dan menghasilkan status bayar berbeda", async () => {
    const { ITEM_DEMO, PELANGGAN_DEMO, TRANSAKSI_DEMO } = await import("../../scripts/data-demo");
    const { hitungTotal } = await import("../../src/lib/domain/transaksi");
    const status = await coba("admin", async (tx) => {
      await tx.query("reset role");
      const pel: string[] = [];
      for (const p of PELANGGAN_DEMO) {
        pel.push((await tx.query<{ id: string }>("insert into public.data_pelanggan (nama, telepon) values ($1, $2) returning id_pelanggan id", [p.nama, p.telepon])).rows[0].id);
      }
      const item: string[] = [];
      for (const i of ITEM_DEMO) {
        item.push((await tx.query<{ id: string }>("insert into public.data_item (nama_item, satuan, tarif_per_satuan) values ($1, $2, $3) returning id_item id", [i.nama_item, i.satuan, i.tarif_per_satuan])).rows[0].id);
      }
      await tx.query("set local role authenticated");
      const hasil: string[] = [];
      for (const t of TRANSAKSI_DEMO) {
        const total = hitungTotal(t.barang.map((b) => ({ satuan: ITEM_DEMO[b.item].satuan, tarif: ITEM_DEMO[b.item].tarif_per_satuan, berat: b.berat_kg, koli: "koli" in b ? b.koli : "" }))).biaya;
        const resi = (await tx.query<{ r: string }>("select public.buat_transaksi($1, $2, $3::jsonb, $4, 'Data Demo', true) r", [
          pel[t.pengirim], pel[t.penerima],
          JSON.stringify(t.barang.map((b) => ({ id_item: item[b.item], berat_kg: b.berat_kg, koli: "koli" in b ? b.koli : null }))),
          t.bayar === "lunas" ? total : t.bayar,
        ])).rows[0].r;
        hasil.push((await tx.query<{ s: string }>("select status_bayar s from public.data_transaksi where no_resi = $1", [resi])).rows[0].s);
      }
      return hasil;
    });
    expect(status).toEqual(["lunas", "belum_lunas", "belum_lunas", "lunas"]);
  });
});
