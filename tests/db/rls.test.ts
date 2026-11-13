/**
 * Hak akses per peran di tingkat database (PRD §4, §13, §15 "Hak akses").
 * Ini lapisan yang tetap berlaku walau URL/API dipanggil langsung.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { baris, buatDb, ID, sebagai, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await buatDb();
  // Satu transaksi + pembayaran contoh (ditulis sebagai superuser, setara RPC).
  await db.exec(`
    insert into public.data_transaksi (no_resi, tanggal_transaksi, id_pengirim, id_penerima, id_pengguna, total_berat_kg, total_biaya)
    values ('NX-UJI-0001', current_date, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '${ID.admin}', 10, 10000);
    insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat) values ('NX-UJI-0001', 4000, '${ID.admin}');
  `);
});

const TABEL_SEMUA = [
  "pengaturan", "data_pengguna", "data_pelanggan", "data_item", "data_armada",
  "data_transaksi", "detail_transaksi", "pembayaran", "penghitung_resi", "manifes",
  "manifes_detail", "riwayat_status_pengiriman", "riwayat_status_armada",
  "kendala_perjalanan", "audit_log",
];

describe("pengguna belum login (anon)", () => {
  it.each(TABEL_SEMUA)("tidak dapat membaca %s", async (tabel) => {
    await expect(baris(db, "anon", `select * from public.${tabel}`)).rejects.toThrow(/permission denied/);
  });
});

describe("akun nonaktif", () => {
  it("tidak melihat data apa pun walau sesinya masih ada", async () => {
    for (const tabel of ["data_pelanggan", "data_transaksi", "data_item", "pengaturan", "data_pengguna"]) {
      expect(await baris(db, "nonaktif", `select * from public.${tabel}`)).toHaveLength(0);
    }
  });

  it("peran_saya() bernilai NULL", async () => {
    const [r] = await baris<{ p: string | null }>(db, "nonaktif", "select public.peran_saya() as p");
    expect(r.p).toBeNull();
  });
});

describe("Supir", () => {
  it("tidak dapat melihat data keuangan maupun pelanggan", async () => {
    for (const tabel of ["data_transaksi", "detail_transaksi", "pembayaran", "data_pelanggan", "audit_log"]) {
      expect(await baris(db, "supir", `select * from public.${tabel}`), tabel).toHaveLength(0);
    }
  });

  it("hanya melihat armada yang ditugaskan kepadanya", async () => {
    const armada = await baris<{ plat_nomor: string }>(db, "supir", "select plat_nomor from public.data_armada");
    expect(armada.map((a) => a.plat_nomor)).toEqual(["BB 1001 AA"]);
  });

  it("hanya melihat data pengguna dirinya sendiri", async () => {
    const p = await baris<{ id_pengguna: string }>(db, "supir", "select id_pengguna from public.data_pengguna");
    expect(p.map((x) => x.id_pengguna)).toEqual([ID.supir]);
  });

  it("tidak dapat mengubah status armada secara langsung", async () => {
    await sebagai(db, "supir", async (tx) => {
      const r = await tx.query("update public.data_armada set status = 'perjalanan' returning id_armada");
      expect(r.rows).toHaveLength(0);
    });
  });
});

describe("Admin Loket", () => {
  it("dapat membaca transaksi dan pembayaran", async () => {
    expect(await baris(db, "admin", "select * from public.data_transaksi")).toHaveLength(1);
    expect(await baris(db, "admin", "select * from public.pembayaran")).toHaveLength(1);
  });

  it("dapat menambah pelanggan", async () => {
    await sebagai(db, "admin", async (tx) => {
      const r = await tx.query<{ telepon: string }>(
        "insert into public.data_pelanggan (nama, telepon) values ('Pelanggan Baru', '+62 813-0000-0001') returning telepon",
      );
      expect(r.rows[0].telepon).toBe("081300000001");
      await tx.rollback();
    });
  });

  it("tidak dapat mengubah tarif (master item)", async () => {
    await sebagai(db, "admin", async (tx) => {
      const r = await tx.query("update public.data_item set tarif_per_satuan = 1 returning id_item");
      expect(r.rows).toHaveLength(0);
    });
    const [item] = await db.query<{ t: string }>(
      "select tarif_per_satuan::text t from public.data_item where nama_item = 'Barang Uji Kg'",
    ).then((r) => r.rows);
    expect(item.t).toBe("1000");
  });

  it("tidak dapat menambah jenis barang", async () => {
    await expect(
      baris(db, "admin", "insert into public.data_item (nama_item, satuan, tarif_per_satuan) values ('X', 'kg', 1)"),
    ).rejects.toThrow(/row-level security/);
  });

  it("tidak dapat mengubah kapasitas armada", async () => {
    await sebagai(db, "admin", async (tx) => {
      const r = await tx.query("update public.data_armada set kapasitas_ton = 99 returning id_armada");
      expect(r.rows).toHaveLength(0);
    });
  });

  it("tidak dapat membaca audit log", async () => {
    expect(await baris(db, "admin", "select * from public.audit_log")).toHaveLength(0);
  });

  it("tidak dapat mengubah pengaturan", async () => {
    await sebagai(db, "admin", async (tx) => {
      const r = await tx.query("update public.pengaturan set mode_demo = false returning id");
      expect(r.rows).toHaveLength(0);
    });
  });
});

describe("Staf Gudang", () => {
  it("tidak dapat membaca pembayaran", async () => {
    expect(await baris(db, "gudang", "select * from public.pembayaran")).toHaveLength(0);
  });

  it("melihat status bayar transaksi (untuk daftar siap muat) tanpa bisa mengubahnya", async () => {
    const [t] = await baris<{ status_bayar: string }>(db, "gudang", "select status_bayar from public.data_transaksi");
    expect(t.status_bayar).toBe("belum_lunas");
    await expect(
      baris(db, "gudang", "update public.data_transaksi set total_dibayar = 10000"),
    ).rejects.toThrow(/permission denied/);
  });

  it("tidak dapat menambah pelanggan", async () => {
    await expect(
      baris(db, "gudang", "insert into public.data_pelanggan (nama, telepon) values ('X', '081300000009')"),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("tabel transaksional hanya dapat ditulis lewat fungsi server", () => {
  it.each(["pemilik", "admin"] as const)("%s tidak dapat insert langsung ke data_transaksi/pembayaran", async (siapa) => {
    await expect(
      baris(db, siapa, `insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat) values ('NX-UJI-0001', 1, '${ID.admin}')`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      baris(db, siapa, "update public.data_transaksi set status_kirim = 'dimuat'"),
    ).rejects.toThrow(/permission denied/);
  });

  it("tidak ada yang dapat menulis audit log", async () => {
    await expect(
      baris(db, "pemilik", "insert into public.audit_log (aksi, entitas) values ('palsu', 'x')"),
    ).rejects.toThrow(/permission denied/);
  });

  it("fungsi internal catat_audit tidak dapat dipanggil klien", async () => {
    await expect(
      baris(db, "pemilik", "select public.catat_audit('palsu', 'x', null)"),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Pemilik", () => {
  it("dapat membaca semua data termasuk audit log", async () => {
    expect((await baris(db, "pemilik", "select * from public.data_pengguna")).length).toBe(6); // termasuk akun nonaktif
    expect((await baris(db, "pemilik", "select * from public.audit_log")).length).toBeGreaterThan(0);
  });

  it("perubahan tarif tercatat di audit log beserta pengguna", async () => {
    await sebagai(db, "pemilik", async (tx) => {
      await tx.query("update public.data_item set tarif_per_satuan = 1500 where nama_item = 'Barang Uji Kg'");
      const r = await tx.query<{ id_pengguna: string; detail_perubahan: Record<string, unknown> }>(
        "select id_pengguna, detail_perubahan from public.audit_log where entitas = 'data_item' and aksi = 'ubah' order by id desc limit 1",
      );
      expect(r.rows[0].id_pengguna).toBe(ID.pemilik);
      expect(r.rows[0].detail_perubahan).toEqual({ tarif_per_satuan: { lama: 1000, baru: 1500 } });
      await tx.rollback();
    });
  });

  it("tidak dapat mengubah email/ID pengguna secara langsung", async () => {
    await expect(
      baris(db, "pemilik", `update public.data_pengguna set email = 'x@y.z' where id_pengguna = '${ID.admin}'`),
    ).rejects.toThrow(/permission denied/);
  });
});
