/**
 * Fase 2 — data inti (PRD §7.6, §7.7, §7.10, §7.1, §15 "Hak akses").
 * Setiap tes berjalan di transaksinya sendiri dan di-rollback bila
 * mengubah data, sehingga urutan tes tidak saling memengaruhi.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { baris, buatDb, ID, sebagai, type Db } from "./harness";

const ARMADA_1 = "30000000-0000-4000-8000-000000000001";
const ITEM_KG = "20000000-0000-4000-8000-000000000001";

let db: Db;
beforeAll(async () => {
  db = await buatDb();
});

/** Jalankan sebagai peran lalu rollback, kembalikan hasil fn. */
async function coba<T>(siapa: Parameters<typeof sebagai>[1], fn: Parameters<typeof sebagai<T>>[2]): Promise<T> {
  let hasil!: T;
  await sebagai(db, siapa, async (tx) => {
    hasil = await fn(tx);
    await tx.rollback();
  }).catch((e) => {
    if (!/rollback/i.test(String(e))) throw e;
  });
  return hasil;
}

describe("pelanggan (PRD §7.6)", () => {
  it("Admin Loket dapat menambah, mengubah, dan menonaktifkan pelanggan", async () => {
    const r = await coba("admin", async (tx) => {
      const { rows } = await tx.query<{ id_pelanggan: string }>(
        "insert into public.data_pelanggan (nama, telepon) values ('Toko Demo', '0813 1111 2222') returning id_pelanggan",
      );
      const ubah = await tx.query<{ nama: string; is_active: boolean }>(
        "update public.data_pelanggan set nama = 'Toko Demo Baru', is_active = false where id_pelanggan = $1 returning nama, is_active",
        [rows[0].id_pelanggan],
      );
      return ubah.rows[0];
    });
    expect(r).toEqual({ nama: "Toko Demo Baru", is_active: false });
  });

  it("nama kosong ditolak", async () => {
    await expect(
      baris(db, "admin", "insert into public.data_pelanggan (nama, telepon) values ('   ', '081311112223')"),
    ).rejects.toThrow(/check/);
  });

  it("nomor telepon ganda (setelah normalisasi) ditolak", async () => {
    await expect(
      baris(db, "admin", "insert into public.data_pelanggan (nama, telepon) values ('Lain', '+62 812-0000-0001')"),
    ).rejects.toThrow(/unique|duplicate/);
  });

  it("perubahan pelanggan tercatat di audit log dengan pengguna", async () => {
    const log2 = await coba("pemilik", async (tx) => {
      await tx.query("update public.data_pelanggan set nama = 'Pengirim Diubah' where telepon = '081200000001'");
      return (await tx.query<{ id_pengguna: string; detail_perubahan: unknown }>(
        "select id_pengguna, detail_perubahan from public.audit_log where entitas = 'data_pelanggan' and aksi = 'ubah' order by id desc limit 1",
      )).rows[0];
    });
    expect(log2.id_pengguna).toBe(ID.pemilik);
    expect(log2.detail_perubahan).toEqual({ nama: { lama: "Pengirim Uji", baru: "Pengirim Diubah" } });
  });

  it("Supir dan Staf Gudang tidak dapat mengubah pelanggan", async () => {
    for (const siapa of ["supir", "gudang"] as const) {
      const r = await coba(siapa, (tx) => tx.query("update public.data_pelanggan set nama = 'X' returning id_pelanggan"));
      expect(r.rows, siapa).toHaveLength(0);
    }
  });

  it("tidak ada yang dapat menghapus pelanggan (gunakan nonaktif)", async () => {
    await expect(baris(db, "pemilik", "delete from public.data_pelanggan")).rejects.toThrow(/permission denied/);
  });
});

describe("master item & tarif (PRD §7.7, §15 Hak akses 2)", () => {
  it("Admin mencoba mengubah tarif → ditolak", async () => {
    const r = await coba("admin", (tx) =>
      tx.query("update public.data_item set tarif_per_satuan = 1 where id_item = $1 returning id_item", [ITEM_KG]),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("Pemilik menambah item; nama baku unik tanpa memandang huruf besar/spasi", async () => {
    await expect(
      baris(db, "pemilik", "insert into public.data_item (nama_item, satuan, tarif_per_satuan) values ('  barang   uji KG ', 'kg', 5)"),
    ).rejects.toThrow(/unique|duplicate/);
  });

  it("tarif wajib bilangan positif", async () => {
    for (const tarif of ["0", "-5"]) {
      await expect(
        baris(db, "pemilik", `insert into public.data_item (nama_item, satuan, tarif_per_satuan) values ('Baru', 'kg', ${tarif})`),
      ).rejects.toThrow(/check/);
    }
  });

  it("perubahan tarif dicatat beserta nilai lama dan baru", async () => {
    const log = await coba("pemilik", async (tx) => {
      await tx.query("update public.data_item set tarif_per_satuan = 2500, is_active = false where id_item = $1", [ITEM_KG]);
      return (await tx.query<{ detail_perubahan: unknown }>(
        "select detail_perubahan from public.audit_log where entitas = 'data_item' and entitas_id = $1 order by id desc limit 1",
        [ITEM_KG],
      )).rows[0];
    });
    expect(log.detail_perubahan).toEqual({
      tarif_per_satuan: { lama: 1000, baru: 2500 },
      is_active: { lama: true, baru: false },
    });
  });

  it("tidak ada yang dapat menghapus item", async () => {
    await expect(baris(db, "pemilik", "delete from public.data_item")).rejects.toThrow(/permission denied/);
  });
});

describe("armada (PRD §7.10)", () => {
  it("Pemilik menambah armada; plat dinormalisasi, kapasitas wajib diisi", async () => {
    const r = await coba("pemilik", (tx) =>
      tx.query<{ plat_nomor: string; status: string }>(
        "insert into public.data_armada (plat_nomor, jenis_unit, kapasitas_ton) values (' bb  77 xy', 'kecil', 2.5) returning plat_nomor, status",
      ),
    );
    expect(r.rows[0]).toEqual({ plat_nomor: "BB 77 XY", status: "siaga" });
  });

  it("Staf Gudang hanya membaca; tidak dapat menambah atau mengubah armada", async () => {
    expect(await baris(db, "gudang", "select id_armada from public.data_armada")).toHaveLength(2);
    await expect(
      baris(db, "gudang", "insert into public.data_armada (plat_nomor, jenis_unit, kapasitas_ton) values ('BB 1 A', 'kecil', 1)"),
    ).rejects.toThrow(/row-level security/);
    const r = await coba("gudang", (tx) => tx.query("update public.data_armada set kapasitas_ton = 99 returning id_armada"));
    expect(r.rows).toHaveLength(0);
  });

  it("status hanya dapat diubah lewat ubah_status_armada, bukan UPDATE langsung", async () => {
    await expect(
      baris(db, "pemilik", "update public.data_armada set status = 'rusak'"),
    ).rejects.toThrow(/permission denied/);
  });

  it("ubah_status_armada: hanya Pemilik, catatan wajib untuk perbaikan/rusak, Perjalanan tidak manual", async () => {
    await expect(
      baris(db, "gudang", `select public.ubah_status_armada('${ARMADA_1}', 'rusak', 'Mesin')`),
    ).rejects.toThrow(/hak akses/);
    await expect(
      baris(db, "pemilik", `select public.ubah_status_armada('${ARMADA_1}', 'rusak', '  ')`),
    ).rejects.toThrow(/Catatan wajib/);
    await expect(
      baris(db, "pemilik", `select public.ubah_status_armada('${ARMADA_1}', 'perjalanan')`),
    ).rejects.toThrow(/otomatis dari manifes/);
    await expect(
      baris(db, "pemilik", `select public.ubah_status_armada('${ARMADA_1}', 'siaga')`),
    ).rejects.toThrow(/sudah siaga/);

    const riwayat = await coba("pemilik", async (tx) => {
      await tx.query(`select public.ubah_status_armada('${ARMADA_1}', 'rusak', 'Rem blong')`);
      await tx.query(`select public.ubah_status_armada('${ARMADA_1}', 'siaga')`);
      return (await tx.query<{ status_baru: string; catatan: string | null; id_pengguna: string }>(
        "select status_baru, catatan, id_pengguna from public.riwayat_status_armada where id_armada = $1 order by id",
        [ARMADA_1],
      )).rows;
    });
    expect(riwayat.map((r) => [r.status_baru, r.catatan])).toEqual([
      ["siaga", null],
      ["rusak", "Rem blong"],
      ["siaga", null],
    ]);
    expect(riwayat[1].id_pengguna).toBe(ID.pemilik);
  });

  it("armada dengan manifes aktif tidak dapat diubah statusnya atau dinonaktifkan", async () => {
    await coba("pemilik", async (tx) => {
      await tx.query("reset role");
      await tx.query(
        "insert into public.manifes (id_armada, id_supir, rute, created_by) values ($1, $2, 'Rute Uji', $3)",
        [ARMADA_1, ID.supir, ID.gudang],
      );
      await tx.query("set local role authenticated");
      await expect(
        tx.query("savepoint s1").then(() => tx.query(`select public.ubah_status_armada('${ARMADA_1}', 'perbaikan', 'Servis')`)),
      ).rejects.toThrow(/manifes aktif/);
      await tx.query("rollback to savepoint s1");
      await expect(
        tx.query("update public.data_armada set is_active = false where id_armada = $1", [ARMADA_1]),
      ).rejects.toThrow(/manifes aktif/);
    });
  });

  it("supir armada harus pengguna aktif berperan Supir", async () => {
    await expect(
      baris(db, "pemilik", `update public.data_armada set id_supir = '${ID.gudang}' where id_armada = '${ARMADA_1}'`),
    ).rejects.toThrow(/peran Supir/);
  });
});

describe("pengguna (PRD §7.1)", () => {
  it("Pemilik tidak dapat menonaktifkan atau mengubah peran akunnya sendiri", async () => {
    // Tambah pemilik kedua agar aturan "minimal satu pemilik" tidak yang memicu galat.
    await coba("pemilik", async (tx) => {
      await tx.query("reset role");
      await tx.query("update public.data_pengguna set peran = 'pemilik' where id_pengguna = $1", [ID.admin]);
      await tx.query("set local role authenticated");
      await tx.query("savepoint s1");
      await expect(
        tx.query("update public.data_pengguna set is_active = false where id_pengguna = $1", [ID.pemilik]),
      ).rejects.toThrow(/akun Anda sendiri/);
      await tx.query("rollback to savepoint s1");
      await expect(
        tx.query("update public.data_pengguna set peran = 'admin_loket' where id_pengguna = $1", [ID.pemilik]),
      ).rejects.toThrow(/akun Anda sendiri/);
    });
  });

  it("Pemilik dapat menonaktifkan pengguna lain; akun nonaktif kehilangan akses", async () => {
    const r = await coba("pemilik", async (tx) => {
      await tx.query("update public.data_pengguna set is_active = false where id_pengguna = $1", [ID.gudang]);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ID.gudang]);
      return (await tx.query<{ p: string | null }>("select public.peran_saya() p")).rows[0].p;
    });
    expect(r).toBeNull();
  });

  it("supir yang masih ditugaskan ke armada tidak dapat dinonaktifkan atau dipindah peran", async () => {
    await expect(
      baris(db, "pemilik", `update public.data_pengguna set is_active = false where id_pengguna = '${ID.supir}'`),
    ).rejects.toThrow(/masih ditugaskan ke armada BB 1001 AA/);
    await expect(
      baris(db, "pemilik", `update public.data_pengguna set peran = 'staf_gudang' where id_pengguna = '${ID.supir}'`),
    ).rejects.toThrow(/masih ditugaskan/);
  });

  it("Admin Loket tidak dapat mengubah pengguna", async () => {
    const r = await coba("admin", (tx) =>
      tx.query("update public.data_pengguna set peran = 'pemilik' returning id_pengguna"),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("daftarkan_pengguna: hanya Pemilik, akun Auth harus ada dengan email cocok, tercatat di audit", async () => {
    const BARU = "00000000-0000-4000-8000-0000000000aa";
    await db.query("insert into auth.users (id, email) values ($1, 'baru@test.local')", [BARU]);
    const panggil = (siapa: "admin" | "pemilik", email = "baru@test.local") =>
      baris(db, siapa, "select * from public.daftarkan_pengguna($1, ' Pengguna  Baru ', 'staf_gudang', '+62 811-9999-0000', $2)", [BARU, email]);

    await expect(panggil("admin")).rejects.toThrow(/hak akses/);
    await expect(panggil("pemilik", "lain@test.local")).rejects.toThrow(/email tidak cocok/);

    const log = await coba("pemilik", async (tx) => {
      const { rows } = await tx.query<{ nama_lengkap: string; nomor_telepon: string; email: string }>(
        "select * from public.daftarkan_pengguna($1, ' Pengguna  Baru ', 'staf_gudang', '+62 811-9999-0000', 'BARU@test.local')",
        [BARU],
      );
      expect(rows[0]).toMatchObject({ nama_lengkap: "Pengguna Baru", nomor_telepon: "081199990000", email: "baru@test.local" });
      return (await tx.query<{ aksi: string; id_pengguna: string }>(
        "select aksi, id_pengguna from public.audit_log where entitas = 'data_pengguna' and entitas_id = $1",
        [BARU],
      )).rows;
    });
    expect(log).toEqual([{ aksi: "tambah", id_pengguna: ID.pemilik }]);
  });

  it("catat_aksi_akun: hanya Pemilik dan aksi yang dikenal", async () => {
    await expect(baris(db, "admin", `select public.catat_aksi_akun('${ID.gudang}', 'atur_ulang_password')`)).rejects.toThrow(/hak akses/);
    await expect(baris(db, "pemilik", `select public.catat_aksi_akun('${ID.gudang}', 'hapus_semua')`)).rejects.toThrow(/tidak dikenal/);
    const log = await coba("pemilik", async (tx) => {
      await tx.query(`select public.catat_aksi_akun('${ID.gudang}', 'atur_ulang_password')`);
      return (await tx.query<{ aksi: string; detail_perubahan: unknown }>(
        "select aksi, detail_perubahan from public.audit_log order by id desc limit 1",
      )).rows[0];
    });
    expect(log).toEqual({ aksi: "atur_ulang_password", detail_perubahan: null });
  });
});

describe("pengaturan perusahaan", () => {
  it("Pemilik mengubah ambang & kebijakan; tercatat di audit dengan pengguna", async () => {
    const log = await coba("pemilik", async (tx) => {
      await tx.query("update public.pengaturan set ambang_peringatan_kapasitas_persen = 90, izinkan_override_kapasitas = true");
      return (await tx.query<{ id_pengguna: string; detail_perubahan: Record<string, unknown> }>(
        "select id_pengguna, detail_perubahan from public.audit_log where entitas = 'pengaturan' order by id desc limit 1",
      )).rows[0];
    });
    expect(log.id_pengguna).toBe(ID.pemilik);
    expect(Object.keys(log.detail_perubahan).sort()).toEqual(
      ["ambang_peringatan_kapasitas_persen", "izinkan_override_kapasitas", "updated_by"].sort(),
    );
  });

  it("ambang di luar 1–100 dan prefiks resi tidak valid ditolak", async () => {
    await expect(baris(db, "pemilik", "update public.pengaturan set ambang_peringatan_kapasitas_persen = 120")).rejects.toThrow(/check/);
    await expect(baris(db, "pemilik", "update public.pengaturan set prefiks_resi = 'nx-1'")).rejects.toThrow(/check/);
  });
});

describe("Data Demo Fase 2", () => {
  it("lolos seluruh constraint database", async () => {
    const { ARMADA_DEMO, CATATAN_ARMADA_DEMO, ITEM_DEMO, PELANGGAN_DEMO } = await import("../../scripts/data-demo");
    await db.transaction(async (tx) => {
      for (const p of PELANGGAN_DEMO) await tx.query("insert into public.data_pelanggan (nama, telepon) values ($1, $2)", [p.nama, p.telepon]);
      for (const i of ITEM_DEMO) {
        await tx.query("insert into public.data_item (nama_item, satuan, tarif_per_satuan) values ($1, $2, $3)", [i.nama_item, i.satuan, i.tarif_per_satuan]);
      }
      for (const a of ARMADA_DEMO) {
        await tx.query("insert into public.data_armada (plat_nomor, jenis_unit, kapasitas_ton, id_supir, catatan) values ($1, $2, $3, $4, $5)", [
          a.plat_nomor, a.jenis_unit, a.kapasitas_ton, a.supirDemo ? ID.supir : null, CATATAN_ARMADA_DEMO,
        ]);
      }
      await tx.rollback();
    });
  });
});
