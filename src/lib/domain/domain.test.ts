import { describe, expect, it } from "vitest";
import { formatRupiah, formatTanggalWaktu, normalisasiTelepon, teleponValid } from "./format";
import { bolehAkses, MENU, menuUntuk, RUTE, ruteDariPath, type KunciRute } from "./peran";

describe("format", () => {
  it("Rupiah id-ID tanpa desimal", () => {
    expect(formatRupiah(1250000).replace(/\s/g, " ")).toBe("Rp 1.250.000");
    expect(formatRupiah(null)).toBe("—");
  });

  it("tanggal ditampilkan di zona Asia/Jakarta", () => {
    // 17:30 UTC = 00:30 WIB keesokan hari
    expect(formatTanggalWaktu("2026-01-01T17:30:00Z")).toMatch(/2 Jan 2026.*00[.:]30/);
  });

  it.each([
    ["+62 812-3456-7890", "081234567890"],
    ["6281234567890", "081234567890"],
    ["81234567890", "081234567890"],
    ["0812 3456 7890", "081234567890"],
  ])("normalisasi %s → %s", (masuk, keluar) => {
    expect(normalisasiTelepon(masuk)).toBe(keluar);
  });

  it("validasi panjang 10–13 digit", () => {
    expect(teleponValid("0812345678")).toBe(true);
    expect(teleponValid("0812345678901")).toBe(true);
    expect(teleponValid("081234567")).toBe(false);
    expect(teleponValid("08123456789012")).toBe(false);
  });
});

describe("peta akses peran", () => {
  it("Supir hanya melihat Dashboard dan Perjalanan Saya", () => {
    expect(menuUntuk("supir").flatMap((g) => g.item)).toEqual(["dashboard", "perjalanan"]);
  });

  it("Supir tidak dapat membuka laporan keuangan; Admin tidak dapat membuka master tarif", () => {
    expect(bolehAkses("supir", "laporanBayar")).toBe(false);
    expect(bolehAkses("supir", "rekapKas")).toBe(false);
    expect(bolehAkses("admin_loket", "masterItem")).toBe(false);
    expect(bolehAkses("staf_gudang", "pembayaran")).toBe(false);
    expect(bolehAkses(null, "dashboard")).toBe(false);
  });

  it("Pemilik dapat mengakses seluruh rute kecuali halaman pribadi Supir", () => {
    // "Perjalanan Saya" menampilkan penugasan milik akun Supir yang login; Pemilik
    // melihat seluruh perjalanan di Daftar Manifes.
    for (const k of Object.keys(RUTE) as KunciRute[]) expect(bolehAkses("pemilik", k)).toBe(k !== "perjalanan");
  });

  it("setiap rute ada di menu tepat satu kali", () => {
    const diMenu = MENU.flatMap((g) => g.item);
    expect(new Set(diMenu).size).toBe(diMenu.length);
    expect([...diMenu].sort()).toEqual(Object.keys(RUTE).sort());
  });

  it("rute paling spesifik dipilih dari pathname", () => {
    expect(ruteDariPath("/transaksi/baru")).toBe("transaksiBaru");
    expect(ruteDariPath("/transaksi/NX-20260101-0001")).toBe("transaksi");
    expect(ruteDariPath("/pembayaran/rekap-kas")).toBe("rekapKas");
    expect(ruteDariPath("/tidak-ada")).toBeNull();
  });
});
