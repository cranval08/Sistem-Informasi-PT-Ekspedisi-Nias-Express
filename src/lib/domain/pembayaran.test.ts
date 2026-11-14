import { describe, expect, it } from "vitest";
import { rentangDariParam } from "@/components/app/daftar";
import { awalHariIso, tambahHari, tanggalOperasional } from "./format";
import { skemaBatalPembayaran, skemaCatatPembayaran, tanggalValid } from "./skema";

describe("skema pembayaran", () => {
  it("resi dinormalkan ke huruf besar; nominal bulat > 0, pemisah ribuan diabaikan", () => {
    expect(skemaCatatPembayaran.parse({ no_resi: " nx-20261114-0001 ", jumlah: "50.000" })).toEqual({
      no_resi: "NX-20261114-0001",
      jumlah: 50000,
      catatan: null,
    });
    for (const j of ["0", "-1", "1500,5", ""]) expect(skemaCatatPembayaran.safeParse({ no_resi: "NX-1", jumlah: j }).success, j).toBe(false);
  });

  it("pembatalan wajib alasan", () => {
    expect(skemaBatalPembayaran.safeParse({ id_pembayaran: "30000000-0000-4000-8000-000000000001", alasan: "  " }).success).toBe(false);
  });
});

describe("tanggal operasional", () => {
  it("tanggalValid menolak format & tanggal mustahil", () => {
    expect(tanggalValid("2026-11-14")).toBe(true);
    for (const t of ["2026-02-30", "14-11-2026", "2026-1-1", undefined]) expect(tanggalValid(t), String(t)).toBe(false);
  });

  it("awal hari Jakarta memakai offset +07:00; tambahHari melewati batas bulan/tahun", () => {
    expect(awalHariIso("2026-11-14", "Asia/Jakarta")).toBe("2026-11-14T00:00:00+07:00");
    expect(tambahHari("2026-12-31", 1)).toBe("2027-01-01");
    expect(tambahHari("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("tanggal operasional mengikuti Jakarta, bukan UTC (pukul 20.00 UTC = esok hari WIB)", () => {
    expect(tanggalOperasional("Asia/Jakarta", 0, new Date("2026-11-14T20:00:00Z"))).toBe("2026-11-15");
  });

  it("rentang: tanggal khusus valid dipakai; tidak valid/terbalik → preset bawaan", () => {
    expect(rentangDariParam({ dari: "2026-11-01", sampai: "2026-11-14" }, "Asia/Jakarta")).toEqual({
      dari: "2026-11-01",
      sampai: "2026-11-14",
      periode: "khusus",
    });
    const hariIni = tanggalOperasional("Asia/Jakarta");
    expect(rentangDariParam({ dari: "2026-11-14", sampai: "2026-11-01" }, "Asia/Jakarta")).toEqual({ dari: hariIni, sampai: hariIni, periode: "hari_ini" });
    expect(rentangDariParam({ periode: "7_hari" }, "Asia/Jakarta")).toEqual({ dari: tambahHari(hariIni, -6), sampai: hariIni, periode: "7_hari" });
    expect(rentangDariParam({ periode: "bulan_ini" }, "Asia/Jakarta").dari).toBe(`${hariIni.slice(0, 8)}01`);
  });
});
