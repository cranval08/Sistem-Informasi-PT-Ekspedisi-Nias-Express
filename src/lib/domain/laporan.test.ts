import { describe, expect, it } from "vitest";
import { angkaRingkas, jumlahHari, keCsv, namaBerkasCsv, satuanGrafik, selCsv, skalaSumbu } from "./laporan";

describe("CSV laporan", () => {
  it("BOM, pemisah titik koma, CRLF, koma desimal", () => {
    const csv = keCsv([{ judul: "Resi", nilai: (r: { r: string; b: number }) => r.r }, { judul: "Berat (kg)", nilai: (r) => r.b }], [
      { r: "NX-20261114-0001", b: 12.5 },
    ]);
    expect(csv).toBe("﻿Resi;Berat (kg)\r\nNX-20261114-0001;12,5\r\n");
  });

  it("mengutip sel berisi pemisah, kutip, atau baris baru", () => {
    expect(selCsv('Toko "Maju"; Jaya')).toBe('"Toko ""Maju""; Jaya"');
    expect(selCsv("baris\nbaru")).toBe('"baris\nbaru"');
    expect(selCsv(null)).toBe("");
    expect(selCsv(true)).toBe("Ya");
  });

  it("menetralkan sel yang diawali karakter rumus (formula injection)", () => {
    for (const s of ["=HYPERLINK(\"x\")", "+62812", "-1+1", "@SUM(A1)"]) expect(selCsv(s).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
    expect(selCsv(-1500)).toBe("-1500"); // angka negatif tetap angka
  });

  it("nama berkas mengikuti periode", () => {
    expect(namaBerkasCsv("transaksi", "2026-11-14", "2026-11-14")).toBe("laporan-transaksi-2026-11-14.csv");
    expect(namaBerkasCsv("kas", "2026-11-01", "2026-11-14")).toBe("laporan-kas-2026-11-01_2026-11-14.csv");
  });
});

describe("grafik", () => {
  it("satuan otomatis berdasarkan panjang periode; pilihan pengguna dihormati", () => {
    expect(jumlahHari("2026-11-01", "2026-11-14")).toBe(14);
    expect(satuanGrafik("2026-11-14", "2026-11-14")).toBe("hari");
    expect(satuanGrafik("2026-10-15", "2026-11-14")).toBe("hari"); // 31 hari
    expect(satuanGrafik("2026-08-01", "2026-11-14")).toBe("minggu");
    expect(satuanGrafik("2026-01-01", "2026-11-14")).toBe("bulan");
    expect(satuanGrafik("2026-01-01", "2026-11-14", "hari")).toBe("hari");
    expect(satuanGrafik("2026-01-01", "2026-11-14", "tahun")).toBe("bulan");
  });

  it("skala sumbu bulat & tidak pecahan", () => {
    expect(skalaSumbu(0)).toEqual({ atas: 4, langkah: 1 });
    expect(skalaSumbu(3)).toEqual({ atas: 3, langkah: 1 });
    expect(skalaSumbu(17)).toEqual({ atas: 20, langkah: 5 });
    expect(skalaSumbu(1_234_000)).toEqual({ atas: 1_500_000, langkah: 500_000 });
  });

  it("angka ringkas id-ID", () => {
    expect(angkaRingkas(950)).toBe("950");
    expect(angkaRingkas(15_000)).toBe("15 rb");
    expect(angkaRingkas(2_500_000)).toBe("2,5 jt");
  });
});

describe("label tanggal", () => {
  it("ember & rentang dalam bahasa Indonesia", async () => {
    const { labelEmber, labelRentang } = await import("./laporan");
    expect(labelEmber("2026-11-14", "2026-11-14", "hari").label).toBe("14 Nov");
    expect(labelEmber("2026-11-09", "2026-11-15", "minggu").labelPanjang).toBe("9 Nov – 15 Nov 2026");
    expect(labelEmber("2026-11-01", "2026-11-14", "bulan").labelPanjang).toBe("November 2026");
    expect(labelRentang("2026-11-14", "2026-11-14")).toBe("14 November 2026");
  });
});
