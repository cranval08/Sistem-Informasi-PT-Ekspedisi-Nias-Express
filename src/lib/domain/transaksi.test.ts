import { describe, expect, it } from "vitest";
import { skemaTransaksi } from "./skema";
import { hitungBaris, hitungTotal, keKoli, keMili, miliKeTeks, subtotal } from "./transaksi";

describe("parsing angka", () => {
  it("keMili menerima koma/titik desimal maksimal 3 angka; menolak 0, negatif, teks", () => {
    expect(keMili("12,5")).toBe(12500);
    expect(keMili("0.001")).toBe(1);
    expect(keMili("7")).toBe(7000);
    for (const s of ["", "0", "0.000", "-1", "1.2345", "abc", "1,2,3"]) expect(keMili(s), s).toBeNull();
  });

  it("keKoli hanya bilangan bulat > 0", () => {
    expect(keKoli("3")).toBe(3);
    for (const s of ["0", "1.5", "-2", ""]) expect(keKoli(s), s).toBeNull();
  });

  it("miliKeTeks tanpa galat floating", () => {
    expect(miliKeTeks(12500)).toBe("12.5");
    expect(miliKeTeks(1)).toBe("0.001");
    expect(miliKeTeks(3000)).toBe("3");
  });
});

describe("perhitungan biaya (PRD §7.8 aturan 6)", () => {
  it("kg: berat × tarif; ton: berat/1000 dibulatkan 3 desimal; koli: jumlah koli × tarif", () => {
    expect(hitungBaris({ satuan: "kg", tarif: 1000, berat: "12,5", koli: "" }).subtotal).toBe(12500);
    expect(hitungBaris({ satuan: "ton", tarif: 400000, berat: "1250", koli: "" })).toEqual({ beratMili: 1250000, jumlahMili: 1250, subtotal: 500000 });
    expect(hitungBaris({ satuan: "ton", tarif: 400000, berat: "1234,567", koli: "" }).jumlahMili).toBe(1235);
    expect(hitungBaris({ satuan: "koli", tarif: 50000, berat: "20", koli: "3" }).subtotal).toBe(150000);
    expect(hitungBaris({ satuan: "koli", tarif: 50000, berat: "20", koli: "" }).subtotal).toBeNull();
  });

  it("pembulatan subtotal setengah ke atas tanpa galat floating", () => {
    expect(subtotal(1, 500)).toBe(1); // 0,001 × 500 = 0,5 → 1
    expect(subtotal(1, 499)).toBe(0);
    expect(subtotal(333, 1500)).toBe(500); // 0,333 × 1.500 = 499,5 → 500
  });

  it("total hanya lengkap bila semua baris valid", () => {
    const a = { satuan: "kg" as const, tarif: 1000, berat: "2", koli: "" };
    expect(hitungTotal([a, { ...a, berat: "3" }])).toEqual({ beratMili: 5000, biaya: 5000, lengkap: true });
    expect(hitungTotal([a, { ...a, berat: "" }]).lengkap).toBe(false);
    expect(hitungTotal([]).lengkap).toBe(false);
  });
});

describe("skema transaksi", () => {
  const dasar = {
    id_pengirim: "10000000-0000-4000-8000-000000000001",
    id_penerima: "10000000-0000-4000-8000-000000000002",
    detail: [{ id_item: "20000000-0000-4000-8000-000000000001", berat_kg: "1,5", koli: "" }],
    alasan_belum_bayar: "Bayar di tujuan",
  };

  it("menormalkan berat, bayar kosong = 0, koli kosong = null", () => {
    expect(skemaTransaksi.parse({ ...dasar, alasan_belum_bayar: "  Bayar di tujuan " })).toMatchObject({
      detail: [{ berat_kg: "1.5", koli: null }],
      bayar_awal: 0,
      catatan: null,
      alasan_belum_bayar: "Bayar di tujuan",
      konfirmasi_duplikat: false,
    });
    expect(skemaTransaksi.parse({ ...dasar, bayar_awal: "15.000" }).bayar_awal).toBe(15000);
  });

  it("pembayaran awal Rp0 wajib beralasan; alasan dibuang bila ada pembayaran awal", () => {
    const r = skemaTransaksi.safeParse({ ...dasar, bayar_awal: "", alasan_belum_bayar: "  " });
    expect(r.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["alasan_belum_bayar", "Alasan belum bayar wajib diisi bila pembayaran awal Rp0."],
    ]);
    expect(skemaTransaksi.parse({ ...dasar, bayar_awal: "1000", alasan_belum_bayar: "x" }).alasan_belum_bayar).toBeNull();
  });

  it("pengirim kosong, tanpa barang, berat salah, bayar negatif → ditolak", () => {
    const pesan = (v: unknown) => skemaTransaksi.safeParse(v).error?.issues.map((i) => i.message);
    expect(pesan({ ...dasar, id_pengirim: "" })).toEqual(["Pilih atau tambahkan pengirim."]);
    expect(pesan({ ...dasar, detail: [] })).toEqual(["Minimal satu baris barang wajib diisi."]);
    expect(pesan({ ...dasar, detail: [{ ...dasar.detail[0], berat_kg: "0" }] })).toEqual(["Berat harus lebih dari 0 kg."]);
    expect(pesan({ ...dasar, detail: [{ ...dasar.detail[0], berat_kg: "1.2345" }] })?.[0]).toMatch(/maksimal 3 angka desimal/);
    expect(pesan({ ...dasar, bayar_awal: "-5" })?.[0]).toMatch(/minimal 0/);
  });
});
