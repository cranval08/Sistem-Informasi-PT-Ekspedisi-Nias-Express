import { describe, expect, it } from "vitest";
import { hitungKapasitas, jumlahGram, keGram } from "./manifes";

describe("keGram", () => {
  it("mengubah number/string desimal menjadi gram tanpa galat floating", () => {
    expect(keGram("4000.001")).toBe(4_000_001);
    expect(keGram(0.1)).toBe(100);
    expect(keGram(12.5)).toBe(12_500);
    expect(keGram("7")).toBe(7_000);
    expect(jumlahGram([0.1, 0.2])).toBe(300);
  });
});

describe("hitungKapasitas (PRD §7.11, §15 Armada 1–3)", () => {
  it("di bawah kapasitas → aman; sama dengan kapasitas → penuh tapi tidak diblokir", () => {
    expect(hitungKapasitas(keGram(3999), 4, null)).toMatchObject({ tingkat: "aman", diblokir: false, persen: 99.9 });
    expect(hitungKapasitas(keGram(4000), "4.000", null)).toMatchObject({ tingkat: "penuh", diblokir: false, persen: 100, sisaGram: 0 });
  });

  it("melebihi kapasitas walau 1 gram → diblokir", () => {
    expect(hitungKapasitas(keGram("4000.001"), 4, null)).toMatchObject({ tingkat: "melebihi", diblokir: true, sisaGram: -1, persen: 100.1 });
  });

  it("ambang peringatan dari pengaturan; NULL berarti tidak ada tingkat peringatan", () => {
    expect(hitungKapasitas(keGram(3400), 4, 85).tingkat).toBe("peringatan");
    expect(hitungKapasitas(keGram(3399.999), 4, 85).tingkat).toBe("aman");
    expect(hitungKapasitas(keGram(3999), 4, null).tingkat).toBe("aman");
  });

  it("manifes kosong", () => {
    expect(hitungKapasitas(0, 8, 90)).toMatchObject({ tingkat: "kosong", persen: 0, diblokir: false });
  });
});
