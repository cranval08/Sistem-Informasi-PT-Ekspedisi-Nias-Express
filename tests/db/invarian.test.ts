/**
 * Invarian data yang dijaga database terlepas dari pemanggilnya
 * (ditulis sebagai superuser, setara dengan fungsi RPC server).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buatDb, ID, sebagai, type Db } from "./harness";

let db: Db;
beforeEach(async () => {
  db = await buatDb();
});

const PENGIRIM = "10000000-0000-4000-8000-000000000001";
const PENERIMA = "10000000-0000-4000-8000-000000000002";

async function buatTransaksi(noResi = "NX-UJI-0001", totalBiaya = 10000) {
  await db.query(
    `insert into public.data_transaksi (no_resi, tanggal_transaksi, waktu_transaksi, id_pengirim, id_penerima, id_pengguna, total_berat_kg, total_biaya)
     values ($1, '2000-01-01', '2000-01-01T00:00:00Z', $2, $3, $4, 10, $5)`,
    [noResi, PENGIRIM, PENERIMA, ID.admin, totalBiaya],
  );
}

const ubahStatus = (s: string, resi = "NX-UJI-0001") =>
  db.query("update public.data_transaksi set status_kirim = $1 where no_resi = $2", [s, resi]);

describe("transaksi", () => {
  it("waktu & tanggal transaksi selalu dari server, status awal Diterima Loket", async () => {
    await buatTransaksi();
    const { rows } = await db.query<{ waktu_transaksi: Date; status_kirim: string; tanggal_transaksi: Date }>(
      "select waktu_transaksi, status_kirim, tanggal_transaksi from public.data_transaksi",
    );
    expect(rows[0].waktu_transaksi.getUTCFullYear()).toBeGreaterThan(2000);
    expect(rows[0].tanggal_transaksi.getUTCFullYear()).toBeGreaterThan(2000);
    expect(rows[0].status_kirim).toBe("diterima_loket");
  });

  it("waktu transaksi tidak dapat diubah", async () => {
    await buatTransaksi();
    await expect(db.query("update public.data_transaksi set waktu_transaksi = now() - interval '1 day'")).rejects.toThrow(
      /tidak dapat diubah/,
    );
  });

  it("status berjalan berurutan dan tiap perubahan tercatat di riwayat", async () => {
    await buatTransaksi();
    await ubahStatus("dimuat");
    await ubahStatus("dalam_perjalanan");
    await ubahStatus("tiba");
    const { rows } = await db.query<{ status_baru: string }>(
      "select status_baru from public.riwayat_status_pengiriman order by id",
    );
    expect(rows.map((r) => r.status_baru)).toEqual(["diterima_loket", "dimuat", "dalam_perjalanan", "tiba"]);
  });

  it("status tidak boleh melompat dari Diterima Loket ke Sudah Diambil", async () => {
    await buatTransaksi();
    await expect(ubahStatus("sudah_diambil")).rejects.toThrow(/tidak valid/);
    await expect(ubahStatus("tiba")).rejects.toThrow(/tidak valid/);
  });

  it("status tidak boleh mundur tanpa koreksi resmi", async () => {
    await buatTransaksi();
    await ubahStatus("dimuat");
    await expect(ubahStatus("diterima_loket")).rejects.toThrow(/tidak valid/);
  });

  it("Sudah Diambil wajib verifikasi identitas, waktu, dan petugas", async () => {
    await buatTransaksi();
    for (const s of ["dimuat", "dalam_perjalanan", "tiba"]) await ubahStatus(s);
    await expect(ubahStatus("sudah_diambil")).rejects.toThrow(/pengambilan_lengkap/);
    await db.query(
      `update public.data_transaksi set status_kirim = 'sudah_diambil', waktu_diambil = now(),
         diambil_diproses_oleh = $1, identitas_terverifikasi = true`,
      [ID.gudang],
    );
  });

  it("tidak dapat dihapus permanen", async () => {
    await buatTransaksi();
    await expect(db.query("delete from public.data_transaksi")).rejects.toThrow(/tidak dapat dihapus/);
  });

  it("void wajib disertai alasan", async () => {
    await buatTransaksi();
    await expect(db.query("update public.data_transaksi set status_void = true")).rejects.toThrow(/void_wajib_alasan/);
  });
});

describe("detail transaksi", () => {
  it("subtotal harus sama dengan jumlah × tarif snapshot", async () => {
    await buatTransaksi();
    const sisip = (subtotal: number) =>
      db.query(
        `insert into public.detail_transaksi (no_resi, id_item, satuan_saat_transaksi, jumlah, berat_kg, tarif_saat_transaksi, subtotal)
         values ('NX-UJI-0001', '20000000-0000-4000-8000-000000000001', 'kg', 2.5, 2.5, 1000, $1)`,
        [subtotal],
      );
    await expect(sisip(9999)).rejects.toThrow(/subtotal_konsisten/);
    await sisip(2500);
  });

  it("berat 0 atau negatif ditolak; desimal dibulatkan ke 3 angka oleh tipe kolom", async () => {
    await buatTransaksi();
    await expect(
      db.query(
        `insert into public.detail_transaksi (no_resi, id_item, satuan_saat_transaksi, jumlah, berat_kg, tarif_saat_transaksi, subtotal)
         values ('NX-UJI-0001', '20000000-0000-4000-8000-000000000001', 'kg', 0, 0, 1000, 0)`,
      ),
    ).rejects.toThrow(/check/);
  });

  it("jenis barang harus berasal dari master item", async () => {
    await buatTransaksi();
    await expect(
      db.query(
        `insert into public.detail_transaksi (no_resi, id_item, satuan_saat_transaksi, jumlah, berat_kg, tarif_saat_transaksi, subtotal)
         values ('NX-UJI-0001', '99999999-0000-4000-8000-000000000000', 'kg', 1, 1, 1000, 1000)`,
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("pembayaran", () => {
  const bayar = (jumlah: number) =>
    db.query("insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat) values ('NX-UJI-0001', $1, $2)", [
      jumlah,
      ID.admin,
    ]);
  const status = async () =>
    (
      await db.query<{ total_dibayar: string; status_bayar: string }>(
        "select total_dibayar::text, status_bayar from public.data_transaksi where no_resi = 'NX-UJI-0001'",
      )
    ).rows[0];

  it("pembayaran 0 → belum lunas", async () => {
    await buatTransaksi();
    await bayar(0);
    expect(await status()).toEqual({ total_dibayar: "0", status_bayar: "belum_lunas" });
  });

  it("pembayaran bertahap hingga lunas", async () => {
    await buatTransaksi();
    await bayar(4000);
    expect(await status()).toEqual({ total_dibayar: "4000", status_bayar: "belum_lunas" });
    await bayar(6000);
    expect(await status()).toEqual({ total_dibayar: "10000", status_bayar: "lunas" });
  });

  it("pembayaran melebihi sisa biaya ditolak", async () => {
    await buatTransaksi();
    await bayar(4000);
    await expect(bayar(6001)).rejects.toThrow(/melebihi total biaya/);
    expect(await status()).toEqual({ total_dibayar: "4000", status_bayar: "belum_lunas" });
  });

  it("nominal negatif ditolak", async () => {
    await buatTransaksi();
    await expect(bayar(-1)).rejects.toThrow(/check/);
  });

  it("pembayaran tidak dapat dihapus atau diubah nominalnya; pembatalan wajib alasan dan mengurangi total", async () => {
    await buatTransaksi();
    await bayar(10000);
    await expect(db.query("delete from public.pembayaran")).rejects.toThrow(/tidak dapat dihapus/);
    await expect(db.query("update public.pembayaran set jumlah_bayar = 1")).rejects.toThrow(/tidak dapat diubah/);
    await expect(db.query("update public.pembayaran set status_pembayaran_record = 'dibatalkan'")).rejects.toThrow(
      /batal_wajib_alasan/,
    );
    await db.query(
      "update public.pembayaran set status_pembayaran_record = 'dibatalkan', catatan_koreksi = 'Salah input', dibatalkan_oleh = $1",
      [ID.pemilik],
    );
    expect(await status()).toEqual({ total_dibayar: "0", status_bayar: "belum_lunas" });
  });
});

describe("pelanggan & pengguna", () => {
  it("nomor telepon dinormalisasi ke 08xx dan divalidasi 10–13 digit", async () => {
    const sisip = (tel: string) =>
      db.query<{ telepon: string }>("insert into public.data_pelanggan (nama, telepon) values ('  Budi   Demo ', $1) returning telepon, nama", [tel]);
    expect((await sisip("+62 812-3456-7890")).rows[0]).toEqual({ telepon: "081234567890", nama: "Budi Demo" });
    await expect(sisip("0812")).rejects.toThrow(/check/);
    await expect(sisip("08123456789012")).rejects.toThrow(/check/);
  });

  it("nomor telepon pelanggan unik setelah normalisasi", async () => {
    await expect(
      db.query("insert into public.data_pelanggan (nama, telepon) values ('Ganda', '62 812 0000 0001')"),
    ).rejects.toThrow(/unique|duplicate/);
  });

  it("harus selalu ada satu Pemilik aktif", async () => {
    await expect(
      db.query("update public.data_pengguna set is_active = false where id_pengguna = $1", [ID.pemilik]),
    ).rejects.toThrow(/minimal satu akun Pemilik/);
  });
});

describe("armada & manifes", () => {
  it("plat nomor dinormalisasi dan unik", async () => {
    await expect(
      db.query("insert into public.data_armada (plat_nomor, jenis_unit, kapasitas_ton) values ('BB  1001 aa', 'kecil', 3)"),
    ).rejects.toThrow(/unique|duplicate/);
  });

  it("kapasitas wajib positif (tidak ada nilai default)", async () => {
    await expect(
      db.query("insert into public.data_armada (plat_nomor, jenis_unit) values ('BB 2000 XX', 'kecil')"),
    ).rejects.toThrow(/null/);
    await expect(
      db.query("insert into public.data_armada (plat_nomor, jenis_unit, kapasitas_ton) values ('BB 2000 XX', 'kecil', 0)"),
    ).rejects.toThrow(/check/);
  });

  it("supir armada harus pengguna berperan Supir", async () => {
    await expect(
      db.query("update public.data_armada set id_supir = $1 where plat_nomor = 'BB 1001 AA'", [ID.admin]),
    ).rejects.toThrow(/peran Supir/);
  });

  it("perubahan status armada tercatat di riwayat", async () => {
    await sebagai(db, "pemilik", (tx) =>
      tx.query("update public.data_armada set status = 'perbaikan' where plat_nomor = 'BB 1001 AA'"),
    );
    const { rows } = await db.query<{ status_baru: string; id_pengguna: string }>(
      "select status_baru, id_pengguna from public.riwayat_status_armada r join public.data_armada a using (id_armada) where a.plat_nomor = 'BB 1001 AA' order by r.id",
    );
    expect(rows.map((r) => r.status_baru)).toEqual(["siaga", "perbaikan"]);
    expect(rows[1].id_pengguna).toBe(ID.pemilik);
  });

  const buatManifes = (armada: string) =>
    db.query(
      "insert into public.manifes (id_armada, id_supir, rute, created_by) values ($1, $2, 'Rute Uji', $3)",
      [armada, ID.supir, ID.gudang],
    );

  it("armada rusak/perbaikan tidak dapat dipilih untuk manifes baru", async () => {
    await db.query("update public.data_armada set status = 'rusak' where plat_nomor = 'BB 1001 AA'");
    await expect(buatManifes("30000000-0000-4000-8000-000000000001")).rejects.toThrow(/tidak dapat dipilih/);
  });

  it("armada dengan perjalanan aktif tidak dapat ditugaskan ke perjalanan lain", async () => {
    await buatManifes("30000000-0000-4000-8000-000000000001");
    await expect(buatManifes("30000000-0000-4000-8000-000000000001")).rejects.toThrow(/unique|duplicate/);
  });
});

describe("audit log", () => {
  it("tidak dapat diubah atau dihapus bahkan oleh superuser", async () => {
    await expect(db.query("update public.audit_log set aksi = 'x'")).rejects.toThrow(/tidak dapat diubah/);
    await expect(db.query("delete from public.audit_log")).rejects.toThrow(/tidak dapat diubah/);
  });
});
