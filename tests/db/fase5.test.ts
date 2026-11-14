/**
 * Fase 5 — manifes, tonase & kapasitas, status pengiriman, pengambilan,
 * kendala, data Supir, pelacakan publik (PRD §7.10–§7.13, §15 "Armada dan
 * manifes" & "Pengiriman").
 *
 * Setiap skenario berjalan di satu transaksi yang di-rollback; identitas
 * pengguna diganti di tengah transaksi lewat klaim JWT.
 */
import type { Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hitungKapasitas, jumlahGram, keGram } from "@/lib/domain/manifes";
import { buatDb, ID, sebagai, type Db } from "./harness";

const PENGIRIM = "10000000-0000-4000-8000-000000000001";
const PENERIMA = "10000000-0000-4000-8000-000000000002";
const ITEM_KG = "20000000-0000-4000-8000-000000000001"; // kg, Rp1.000
const ARMADA_8T = "30000000-0000-4000-8000-000000000001"; // supir
const ARMADA_4T = "30000000-0000-4000-8000-000000000002"; // supir2

type Siapa = keyof typeof ID;

let db: Db;
beforeAll(async () => {
  db = await buatDb();
});

const jadi = (tx: Transaction, siapa: Siapa) => tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ID[siapa]]);

/** Skenario di satu transaksi yang selalu di-rollback. */
async function skenario<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let hasil!: T;
  await sebagai(db, "pemilik", async (tx) => {
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

/** Transaksi baru (sebagai Admin) sebesar `beratKg`; lunas bila diminta. */
async function transaksi(tx: Transaction, beratKg: number | string, lunas = true) {
  await jadi(tx, "admin");
  const biaya = Math.round(Number(beratKg) * 1000);
  const { rows } = await tx.query<{ r: string }>("select public.buat_transaksi($1, $2, $3::jsonb, $4, null, true) r", [
    PENGIRIM, PENERIMA, JSON.stringify([{ id_item: ITEM_KG, berat_kg: String(beratKg) }]), lunas ? biaya : 0,
  ]);
  return rows[0].r;
}

async function manifes(tx: Transaction, armada = ARMADA_8T, supir: Siapa = "supir", oleh: Siapa = "gudang") {
  await jadi(tx, oleh);
  const { rows } = await tx.query<{ id: string }>("select public.buat_manifes($1, $2, $3) id", [armada, ID[supir], "Gunungsitoli → Teluk Dalam"]);
  return rows[0].id;
}

const tambah = (tx: Transaction, idM: string, resi: string[]) =>
  tx.query("select public.tambah_resi_manifes($1, $2::text[])", [idM, resi]);
const muat = (tx: Transaction, idM: string, alasan: string | null = null) =>
  tx.query("select public.konfirmasi_muat($1, $2)", [idM, alasan]);
const berangkat = (tx: Transaction, idM: string) => tx.query("select public.konfirmasi_berangkat($1)", [idM]);
const tiba = (tx: Transaction, idM: string) => tx.query("select public.konfirmasi_tiba($1, null)", [idM]);
const ambil = (tx: Transaction, resi: string, verifikasi: boolean | null, catatan: string | null = null) =>
  tx.query("select public.konfirmasi_pengambilan($1, $2, $3)", [resi, verifikasi, catatan]);

const statusKirim = (tx: Transaction, resi: string) =>
  tx.query<{ s: string }>("select status_kirim s from public.data_transaksi where no_resi = $1", [resi]).then((r) => r.rows[0].s);
const statusManifes = (tx: Transaction, idM: string) =>
  tx.query<{ s: string }>("select status_manifes s from public.manifes where id_manifes = $1", [idM]).then((r) => r.rows[0].s);
const statusArmada = (tx: Transaction, id: string) =>
  tx.query<{ s: string }>("select status s from public.data_armada where id_armada = $1", [id]).then((r) => r.rows[0].s);

async function aturPengaturan(tx: Transaction, kolom: Record<string, boolean>) {
  await jadi(tx, "pemilik");
  for (const [k, v] of Object.entries(kolom)) await tx.query(`update public.pengaturan set ${k} = $1 where id = 1`, [v]);
}

describe("armada dan manifes (PRD §15 Armada 1–5)", () => {
  it("1. muatan di bawah kapasitas → konfirmasi muat berhasil, resi menjadi Dimuat", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 500);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi.toLowerCase()]); // resi dinormalkan ke huruf besar
      await muat(tx, idM);
      const t = (await tx.query("select status_kirim, id_armada from public.data_transaksi where no_resi = $1", [resi])).rows[0];
      await jadi(tx, "pemilik"); // audit log hanya dibaca Pemilik
      const audit = (await tx.query("select aksi from public.audit_log where entitas = 'manifes' and entitas_id = $1 order by id", [idM])).rows;
      return { t, m: await statusManifes(tx, idM), audit: audit.map((a) => (a as { aksi: string }).aksi) };
    });
    expect(r.t).toEqual({ status_kirim: "dimuat", id_armada: ARMADA_8T });
    expect(r.m).toBe("dimuat");
    expect(r.audit).toEqual(["buat_manifes", "tambah_resi_manifes", "konfirmasi_muat"]);
  });

  it("2. muatan tepat sama dengan kapasitas → dapat diproses", async () => {
    const m = await skenario(async (tx) => {
      const a = await transaksi(tx, 2500);
      const b = await transaksi(tx, "1500.000");
      const idM = await manifes(tx, ARMADA_4T, "supir2");
      await tambah(tx, idM, [a, b]);
      await muat(tx, idM);
      await berangkat(tx, idM);
      return statusManifes(tx, idM);
    });
    expect(m).toBe("berangkat");
  });

  it("3. muatan melebihi kapasitas → diblokir; override hanya Pemilik, bila diizinkan, wajib alasan, tercatat", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, "4000.001");
      const idM = await manifes(tx, ARMADA_4T, "supir2");
      await tambah(tx, idM, [resi]); // draf boleh melebihi (peringatan di UI)
      await gagal(tx, () => muat(tx, idM), /4\.000,001 kg melebihi kapasitas armada BB 1002 AB \(4\.000 kg\)/);
      await gagal(tx, () => muat(tx, idM, "Muatan ringan"), /Hanya Pemilik/);
      await jadi(tx, "pemilik");
      await gagal(tx, () => muat(tx, idM, "Darurat"), /tidak mengizinkan override kapasitas/);
      await aturPengaturan(tx, { izinkan_override_kapasitas: true });
      await gagal(tx, () => muat(tx, idM, "   "), /melebihi kapasitas/);
      await muat(tx, idM, "Selisih 1 gram, disetujui pemilik");
      const m = (await tx.query("select status_manifes, override_kapasitas, override_kapasitas_alasan, override_kapasitas_oleh from public.manifes where id_manifes = $1", [idM])).rows[0];
      const audit = (await tx.query("select alasan, id_pengguna from public.audit_log where aksi = 'override_kapasitas' and entitas_id = $1", [idM])).rows;
      return { m, audit };
    });
    expect(r.m).toEqual({
      status_manifes: "dimuat",
      override_kapasitas: true,
      override_kapasitas_alasan: "Selisih 1 gram, disetujui pemilik",
      override_kapasitas_oleh: ID.pemilik,
    });
    expect(r.audit).toEqual([{ alasan: "Selisih 1 gram, disetujui pemilik", id_pengguna: ID.pemilik }]);
  });

  it("3b. kapasitas diturunkan setelah muat → keberangkatan diblokir", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 3000);
      const idM = await manifes(tx, ARMADA_4T, "supir2");
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await jadi(tx, "pemilik");
      await tx.query("update public.data_armada set kapasitas_ton = 2 where id_armada = $1", [ARMADA_4T]);
      await jadi(tx, "gudang");
      await gagal(tx, () => berangkat(tx, idM), /melebihi kapasitas armada BB 1002 AB\. Keberangkatan diblokir/);
    });
  });

  it("4. armada perbaikan/rusak → tidak dapat dipilih untuk manifes baru", async () => {
    await skenario(async (tx) => {
      for (const status of ["perbaikan", "rusak"]) {
        await jadi(tx, "pemilik");
        await tx.query("select public.ubah_status_armada($1, $2, 'Uji')", [ARMADA_8T, status]);
        await gagal(tx, () => manifes(tx), new RegExp(`berstatus ${status[0].toUpperCase() + status.slice(1)} dan tidak dapat dipilih`));
        await jadi(tx, "pemilik");
        await tx.query("select public.ubah_status_armada($1, 'siaga')", [ARMADA_8T]);
      }
    });
  });

  it("5. armada atau supir dengan perjalanan aktif → tidak dapat ditugaskan ke perjalanan lain", async () => {
    await skenario(async (tx) => {
      await manifes(tx);
      await gagal(tx, () => manifes(tx, ARMADA_8T, "supir2"), /Armada BB 1001 AA masih memiliki perjalanan aktif/);
      await gagal(tx, () => manifes(tx, ARMADA_4T, "supir"), /Supir Uji sedang ditugaskan pada perjalanan aktif dengan armada BB 1001 AA/);
      // Status armada tidak dapat diubah manual selama manifes aktif.
      await jadi(tx, "pemilik");
      await gagal(tx, () => tx.query("select public.ubah_status_armada($1, 'rusak', 'x')", [ARMADA_8T]), /manifes aktif/);
      // Supir dalam perjalanan aktif tidak dapat dinonaktifkan.
      await tx.query("update public.data_armada set id_supir = null where id_armada = $1", [ARMADA_8T]);
      await gagal(tx, () => tx.query("update public.data_pengguna set is_active = false where id_pengguna = $1", [ID.supir]), /perjalanan aktif/);
    });
  });
});

describe("aturan muat barang belum lunas (PRD §7.8, §11 langkah 9)", () => {
  it("resi belum lunas ditolak; override hanya Pemilik bila diizinkan, wajib alasan, tercatat", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 100, false);
      const idM = await manifes(tx);
      await gagal(tx, () => tambah(tx, idM, [resi]), /belum lunas.*override resmi/);
      const ov = (alasan: string) => tx.query("select public.override_belum_lunas($1, $2)", [resi, alasan]);
      await jadi(tx, "admin");
      await gagal(tx, () => ov("Pelanggan tetap"), /hak akses/);
      await jadi(tx, "pemilik");
      await gagal(tx, () => ov("Pelanggan tetap"), /tidak mengizinkan override pemuatan barang belum lunas/);
      await aturPengaturan(tx, { izinkan_override_belum_lunas: true });
      await gagal(tx, () => ov(" "), /Alasan override wajib/);
      await ov("Pelanggan tetap, bayar di tujuan");
      await gagal(tx, () => ov("lagi"), /sudah memiliki override/);
      await jadi(tx, "gudang");
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await jadi(tx, "pemilik");
      const audit = (await tx.query("select alasan, detail_perubahan->>'sisa' sisa from public.audit_log where aksi = 'override_belum_lunas' and entitas_id = $1", [resi])).rows;
      return { status: await statusKirim(tx, resi), audit };
    });
    expect(r.status).toBe("dimuat");
    expect(r.audit).toEqual([{ alasan: "Pelanggan tetap, bayar di tujuan", sisa: "100000" }]);
  });

  it("pembayaran dibatalkan setelah resi ditambahkan → konfirmasi muat diblokir", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 10);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await jadi(tx, "pemilik");
      const { rows } = await tx.query<{ id: string }>("select id_pembayaran id from public.pembayaran where no_resi = $1", [resi]);
      await tx.query("select public.batalkan_pembayaran($1, 'Salah catat')", [rows[0].id]);
      await jadi(tx, "gudang");
      await gagal(tx, () => muat(tx, idM), new RegExp(`Resi ${resi} belum lunas`));
    });
  });

  it("resi void, sudah di manifes lain, atau sudah dimuat tidak dapat ditambahkan", async () => {
    await skenario(async (tx) => {
      const a = await transaksi(tx, 10, false);
      await jadi(tx, "pemilik");
      await tx.query("select public.batalkan_transaksi($1, 'Uji')", [a]);
      const b = await transaksi(tx, 10);
      const m1 = await manifes(tx);
      const m2 = await manifes(tx, ARMADA_4T, "supir2");
      await gagal(tx, () => tambah(tx, m1, [a]), /sudah dibatalkan/);
      await tambah(tx, m1, [b]);
      await gagal(tx, () => tambah(tx, m2, [b]), /manifes aktif lain/);
      await gagal(tx, () => tambah(tx, m1, ["NX-19000101-0001"]), /tidak ditemukan/);
      await muat(tx, m1);
      await gagal(tx, () => tambah(tx, m1, [b]), /hanya dapat ditambahkan saat manifes berstatus Draf/);
    });
  });
});

describe("status pengiriman & pengambilan (PRD §15 Pengiriman 1–4)", () => {
  it("1 & 4. alur normal berurutan; pengambilan mencatat waktu, petugas, dan riwayat", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 750);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await jadi(tx, "supir");
      await berangkat(tx, idM);
      const armadaJalan = await statusArmada(tx, ARMADA_8T);
      await tiba(tx, idM);
      const armadaTiba = await statusArmada(tx, ARMADA_8T);
      await jadi(tx, "admin");
      await ambil(tx, resi, true, "KTP sesuai nama penerima");
      const t = (await tx.query(
        "select status_kirim, waktu_diambil is not null diambil, diambil_diproses_oleh, identitas_terverifikasi, catatan_pengambilan from public.data_transaksi where no_resi = $1",
        [resi],
      )).rows[0];
      const riwayat = (await tx.query("select status_baru, id_pengguna, catatan from public.riwayat_status_pengiriman where no_resi = $1 order by id", [resi])).rows;
      return { armadaJalan, armadaTiba, t, riwayat };
    });
    expect(r.armadaJalan).toBe("perjalanan");
    expect(r.armadaTiba).toBe("siaga");
    expect(r.t).toEqual({
      status_kirim: "sudah_diambil",
      diambil: true,
      diambil_diproses_oleh: ID.admin,
      identitas_terverifikasi: true,
      catatan_pengambilan: "KTP sesuai nama penerima",
    });
    expect(r.riwayat.map((x) => (x as { status_baru: string }).status_baru)).toEqual([
      "diterima_loket", "dimuat", "dalam_perjalanan", "tiba", "sudah_diambil",
    ]);
    expect(r.riwayat[2]).toMatchObject({ id_pengguna: ID.supir, catatan: "Berangkat dengan armada BB 1001 AA — Gunungsitoli → Teluk Dalam" });
    expect(r.riwayat[4]).toMatchObject({ id_pengguna: ID.admin, catatan: "Identitas penerima diverifikasi petugas. KTP sesuai nama penerima" });
  });

  it("2. lompat dari Diterima Loket ke Sudah Diambil → ditolak (trigger & RPC)", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 5);
      await jadi(tx, "gudang");
      await gagal(tx, () => ambil(tx, resi, true), /belum tiba di loket tujuan \(status Diterima Loket\)/);
      // Penulisan langsung ditolak hak akses; trigger tetap menjaga bahkan untuk pemilik tabel.
      await gagal(tx, () => tx.query("update public.data_transaksi set status_kirim = 'sudah_diambil' where no_resi = $1", [resi]), /permission denied/);
      await tx.query("reset role");
      await gagal(
        tx,
        () => tx.query("update public.data_transaksi set status_kirim = 'tiba' where no_resi = $1", [resi]),
        /Perubahan status pengiriman tidak valid: diterima_loket → tiba/,
      );
    });
  });

  it("3. pengambilan tanpa verifikasi identitas → tidak dapat dikonfirmasi", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 5);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await berangkat(tx, idM);
      await tiba(tx, idM);
      await jadi(tx, "gudang");
      await gagal(tx, () => ambil(tx, resi, false), /Verifikasi identitas penerima wajib/);
      await gagal(tx, () => ambil(tx, resi, null), /Verifikasi identitas penerima wajib/);
      expect(await statusKirim(tx, resi)).toBe("tiba");
      await jadi(tx, "supir");
      await gagal(tx, () => ambil(tx, resi, true), /hak akses/);
      await jadi(tx, "gudang");
      await ambil(tx, resi, true);
      await gagal(tx, () => ambil(tx, resi, true), /sudah diambil/);
    });
  });

  it("urutan manifes dijaga: berangkat sebelum muat & tiba sebelum berangkat ditolak", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 5);
      const idM = await manifes(tx);
      await gagal(tx, () => muat(tx, idM), /belum memiliki resi/);
      await tambah(tx, idM, [resi]);
      await gagal(tx, () => berangkat(tx, idM), /setelah muat dikonfirmasi \(status sekarang Draf\)/);
      await gagal(tx, () => tiba(tx, idM), /sudah berangkat \(status sekarang Draf\)/);
      await muat(tx, idM);
      await gagal(tx, () => muat(tx, idM), /hanya untuk manifes berstatus Draf/);
    });
  });
});

describe("koreksi sebelum berangkat: batal manifes & pindah ke armada cadangan", () => {
  it("batalkan manifes Dimuat → resi kembali Diterima Loket (tercatat) dan dapat dimuat ulang", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 20);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await gagal(tx, () => tx.query("select public.batalkan_manifes($1, '')", [idM]), /Alasan pembatalan manifes wajib/);
      await tx.query("select public.batalkan_manifes($1, 'Truk tidak jadi jalan')", [idM]);
      const t = (await tx.query("select status_kirim, id_armada from public.data_transaksi where no_resi = $1", [resi])).rows[0];
      const riwayat = (await tx.query("select status_baru, catatan from public.riwayat_status_pengiriman where no_resi = $1 order by id desc limit 1", [resi])).rows[0];
      const m2 = await manifes(tx);
      await tambah(tx, m2, [resi]);
      return { t, riwayat, m: await statusManifes(tx, idM), armada: await statusArmada(tx, ARMADA_8T) };
    });
    expect(r.t).toEqual({ status_kirim: "diterima_loket", id_armada: null });
    expect(r.riwayat).toEqual({ status_baru: "diterima_loket", catatan: "Manifes dibatalkan: Truk tidak jadi jalan" });
    expect(r.m).toBe("dibatalkan");
    expect(r.armada).toBe("siaga");
  });

  it("manifes yang sudah berangkat tidak dapat dibatalkan; resinya tidak dapat dipindah", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 20);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await berangkat(tx, idM);
      const cadangan = await manifes(tx, ARMADA_4T, "supir2");
      await gagal(tx, () => tx.query("select public.batalkan_manifes($1, 'x')", [idM]), /berstatus Berangkat tidak dapat dibatalkan/);
      await gagal(tx, () => tx.query("select public.pindahkan_resi($1, $2, 'x')", [resi, cadangan]), /berstatus Berangkat tidak dapat dipindahkan/);
    });
  });

  it("pindahkan resi dari manifes Dimuat ke manifes Draf armada cadangan", async () => {
    const r = await skenario(async (tx) => {
      const a = await transaksi(tx, 3000);
      const b = await transaksi(tx, 2000);
      const utama = await manifes(tx, ARMADA_4T, "supir2");
      await tambah(tx, utama, [a, b]);
      await gagal(tx, () => muat(tx, utama), /melebihi kapasitas/);
      const cadangan = await manifes(tx, ARMADA_8T, "supir");
      await gagal(tx, () => tx.query("select public.pindahkan_resi($1, $2, '')", [b, cadangan]), /Alasan pemindahan wajib/);
      await tx.query("select public.pindahkan_resi($1, $2, 'Muatan melebihi kapasitas')", [b, cadangan]);
      await muat(tx, utama);
      // Setelah dimuat pun resi masih dapat dipindah (status dikoreksi mundur).
      await tx.query("select public.pindahkan_resi($1, $2, 'Pindah ke truk besar')", [a, cadangan]);
      const aktif = (await tx.query("select id_manifes, no_resi from public.manifes_detail where aktif order by no_resi")).rows;
      const riwayatA = (await tx.query("select status_baru, catatan from public.riwayat_status_pengiriman where no_resi = $1 order by id desc limit 1", [a])).rows[0];
      return { aktif, riwayatA, statusA: await statusKirim(tx, a), utama, cadangan };
    });
    expect(r.aktif).toEqual([
      { id_manifes: r.cadangan, no_resi: expect.any(String) },
      { id_manifes: r.cadangan, no_resi: expect.any(String) },
    ]);
    expect(r.statusA).toBe("diterima_loket");
    expect(r.riwayatA).toEqual({ status_baru: "diterima_loket", catatan: "Dipindahkan ke manifes armada BB 1001 AA: Pindah ke truk besar" });
  });

  it("lepas resi hanya saat Draf; resi yang dilepas dapat ditambahkan lagi", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 10);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await tx.query("select public.lepas_resi_manifes($1, $2)", [idM, resi]);
      await gagal(tx, () => tx.query("select public.lepas_resi_manifes($1, $2)", [idM, resi]), /tidak tercantum/);
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await gagal(tx, () => tx.query("select public.lepas_resi_manifes($1, $2)", [idM, resi]), /Gunakan Pindahkan/);
    });
  });
});

describe("hak akses manifes & data Supir", () => {
  it("Admin Loket dan Supir tidak dapat membuat/mengelola manifes; klien tidak dapat menulis langsung", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 10);
      await gagal(tx, () => manifes(tx, ARMADA_8T, "supir", "admin"), /hak akses/);
      await gagal(tx, () => manifes(tx, ARMADA_8T, "supir", "supir"), /hak akses/);
      const idM = await manifes(tx);
      await jadi(tx, "supir");
      await gagal(tx, () => tambah(tx, idM, [resi]), /hak akses/);
      await gagal(tx, () => muat(tx, idM), /hak akses/);
      await jadi(tx, "gudang");
      await gagal(tx, () => tx.query("update public.manifes set status_manifes = 'berangkat' where id_manifes = $1", [idM]), /permission denied/);
      await gagal(
        tx,
        () => tx.query("insert into public.manifes_detail (id_manifes, no_resi, ditambahkan_oleh) values ($1, $2, $3)", [idM, resi, ID.gudang]),
        /permission denied/,
      );
      await gagal(tx, () => tx.query("select public.muatan_manifes_kg($1)", [idM]), /permission denied/);
    });
  });

  it("Supir hanya dapat memberangkatkan/menyelesaikan manifes miliknya", async () => {
    await skenario(async (tx) => {
      const resi = await transaksi(tx, 10);
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await muat(tx, idM);
      await jadi(tx, "supir2");
      await gagal(tx, () => berangkat(tx, idM), /tidak ditugaskan kepada Anda/);
      await jadi(tx, "supir");
      await berangkat(tx, idM);
      await jadi(tx, "supir2");
      await gagal(tx, () => tiba(tx, idM), /tidak ditugaskan kepada Anda/);
    });
  });

  it("perjalanan_saya & muatan_perjalanan hanya berisi data non-finansial milik Supir", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, "12.5");
      const idM = await manifes(tx);
      await tambah(tx, idM, [resi]);
      await jadi(tx, "supir");
      const perjalanan = (await tx.query("select * from public.perjalanan_saya()")).rows;
      const muatan = (await tx.query("select * from public.muatan_perjalanan($1)", [idM])).rows;
      await jadi(tx, "supir2");
      const lain = (await tx.query("select * from public.perjalanan_saya()")).rows;
      await gagal(tx, () => tx.query("select * from public.muatan_perjalanan($1)", [idM]), /tidak ditugaskan/);
      await jadi(tx, "gudang");
      await gagal(tx, () => tx.query("select * from public.perjalanan_saya()"), /hak akses/);
      return { perjalanan, muatan, lain, resi };
    });
    expect(r.lain).toEqual([]);
    expect(r.perjalanan).toHaveLength(1);
    expect(Object.keys(r.perjalanan[0] as object).sort()).toEqual([
      "catatan", "id_manifes", "jenis_unit", "jumlah_resi", "kapasitas_ton", "kendala_terbuka", "plat_nomor", "rute",
      "status_manifes", "total_berat_kg", "waktu_berangkat", "waktu_dibuat", "waktu_dimuat", "waktu_tiba",
    ]);
    expect(r.perjalanan[0]).toMatchObject({ plat_nomor: "BB 1001 AA", jumlah_resi: 1, status_manifes: "draft" });
    expect(Number((r.perjalanan[0] as { total_berat_kg: string }).total_berat_kg)).toBe(12.5);
    expect(r.muatan).toEqual([{ no_resi: r.resi, status_kirim: "diterima_loket", total_berat_kg: "12.500", jumlah_baris: 1, jumlah_koli: "0" }]);
  });

  it("Supir melaporkan kendala; Staf Gudang menyelesaikannya; tercatat di audit", async () => {
    const r = await skenario(async (tx) => {
      const idM = await manifes(tx);
      await jadi(tx, "supir");
      const lapor = (jenis: string, uraian: string) =>
        tx.query<{ id: string }>("select public.laporkan_kendala($1, $2, $3) id", [idM, jenis, uraian]).then((x) => x.rows[0].id);
      await gagal(tx, () => lapor("banjir", "x"), /Pilih jenis kendala/);
      await gagal(tx, () => lapor("kerusakan", "  "), /Uraian kendala wajib/);
      const id = await lapor("kerusakan", "Ban belakang bocor");
      await gagal(tx, () => tx.query("select public.selesaikan_kendala($1)", [id]), /hak akses/);
      await jadi(tx, "supir2");
      await gagal(tx, () => lapor("lainnya", "x"), /tidak ditugaskan/);
      await jadi(tx, "gudang");
      await tx.query("select public.selesaikan_kendala($1, 'Ban diganti')", [id]);
      const k = (await tx.query("select status, dilaporkan_oleh, diselesaikan_oleh from public.kendala_perjalanan where id = $1", [id])).rows[0];
      await jadi(tx, "pemilik");
      const audit = (await tx.query("select aksi from public.audit_log where entitas_id = $1 and aksi like '%kendala' order by id", [idM])).rows;
      return { k, audit };
    });
    expect(r.k).toEqual({ status: "selesai", dilaporkan_oleh: ID.supir, diselesaikan_oleh: ID.gudang });
    expect(r.audit).toEqual([{ aksi: "laporkan_kendala" }, { aksi: "selesaikan_kendala" }]);
  });
});

describe("pelacakan publik (PRD §7.12, §13 butir 5)", () => {
  it("nonaktif secara default; bila aktif hanya mengembalikan resi, status, dan waktu", async () => {
    const r = await skenario(async (tx) => {
      const resi = await transaksi(tx, 10);
      const lacak = async (siapa: "anon" | "admin", nilai: string) => {
        if (siapa === "anon") await tx.query("set local role anon");
        else await jadi(tx, siapa);
        const rows = (await tx.query("select * from public.lacak_resi($1)", [nilai])).rows;
        await tx.query("set local role authenticated");
        return rows;
      };
      const nonaktif = await lacak("anon", resi);
      await aturPengaturan(tx, { pelacakan_publik_aktif: true });
      const aktif = await lacak("anon", ` ${resi.toLowerCase()} `);
      const tidakAda = await lacak("anon", "NX-19000101-0001");
      // anon tetap tidak dapat membaca tabel apa pun secara langsung.
      await tx.query("set local role anon");
      await gagal(tx, () => tx.query("select * from public.data_transaksi"), /permission denied/);
      const status = (await tx.query<{ a: boolean }>("select public.pelacakan_publik_aktif() a")).rows[0].a;
      await tx.query("set local role authenticated");
      await jadi(tx, "pemilik");
      const batal = await transaksi(tx, 11, false);
      await jadi(tx, "pemilik");
      await tx.query("select public.batalkan_transaksi($1, 'Uji')", [batal]);
      const dibatalkan = await lacak("anon", batal);
      return { nonaktif, aktif, tidakAda, status, dibatalkan, resi };
    });
    expect(r.nonaktif).toEqual([]);
    expect(r.status).toBe(true);
    expect(r.aktif).toEqual([{ no_resi: r.resi, status: "diterima_loket", waktu: expect.any(Date) }]);
    expect(r.tidakAda).toEqual([]);
    expect(r.dibatalkan).toEqual([{ no_resi: expect.any(String), status: "dibatalkan", waktu: expect.any(Date) }]);
  });

  it("anon tidak dapat memanggil RPC operasional", async () => {
    await sebagai(db, "anon", async (tx) => {
      await gagal(tx, () => tx.query("select public.perjalanan_saya()"), /permission denied/);
      await gagal(tx, () => tx.query("select public.konfirmasi_pengambilan('X', true)"), /permission denied/);
      await gagal(tx, () => tx.query("select public.buat_manifes(null, null, 'x')"), /permission denied/);
    });
  });
});

describe("perhitungan kapasitas UI = database", () => {
  it.each([
    [["0.1", "0.2", "3999.7"], false],
    [["0.1", "0.2", "3999.701"], true],
    [["1333.333", "1333.333", "1333.334"], false],
  ])("berat %j pada armada 4 ton → diblokir %s", async (berat, diblokir) => {
    const r = await skenario(async (tx) => {
      const resi = [];
      for (const b of berat) resi.push(await transaksi(tx, b));
      const idM = await manifes(tx, ARMADA_4T, "supir2");
      await tambah(tx, idM, resi);
      await tx.query("reset role"); // helper internal tidak di-grant ke klien
      return (await tx.query<{ kg: string; lebih: boolean }>(
        "select public.muatan_manifes_kg($1)::text kg, public.muatan_melebihi_kapasitas($1, $2) lebih", [idM, ARMADA_4T],
      )).rows[0];
    });
    const ui = hitungKapasitas(jumlahGram(berat), 4, null);
    expect(ui.muatanGram).toBe(keGram(r.kg));
    expect(ui.diblokir).toBe(r.lebih);
    expect(r.lebih).toBe(diblokir);
  });
});
