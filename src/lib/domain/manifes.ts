/**
 * Perhitungan tonase & kapasitas manifes untuk tampilan. Database
 * (`konfirmasi_muat`, `konfirmasi_berangkat`) tetap sumber kebenaran dan
 * memakai aturan yang sama:
 *   muatan   = Σ total_berat_kg resi aktif
 *   kapasitas = kapasitas_ton × 1000 kg
 *   muatan = kapasitas → boleh diproses; muatan > kapasitas → diblokir.
 * Berat diolah sebagai bilangan bulat gram (kg × 1000) agar bebas galat
 * floating point, sama seperti numeric di Postgres.
 */

export type TingkatKapasitas = "kosong" | "aman" | "peringatan" | "penuh" | "melebihi";

export type HasilKapasitas = {
  muatanGram: number;
  kapasitasGram: number;
  /**
   * Persentase utilisasi 1 desimal untuk tampilan: dibulatkan ke bawah bila
   * belum melebihi (99,97% tidak tampil "100%") dan ke atas bila melebihi.
   */
  persen: number;
  sisaGram: number;
  tingkat: TingkatKapasitas;
  /** Muatan melebihi kapasitas → konfirmasi muat/berangkat diblokir (kecuali override). */
  diblokir: boolean;
};

/** Desimal (number dari PostgREST atau string) dengan maks 3 desimal → bilangan bulat ×1000. */
export function keGram(nilai: number | string): number {
  const s = typeof nilai === "number" ? nilai.toFixed(3) : nilai.trim();
  const m = /^(\d+)(?:\.(\d{1,3})\d*)?$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
}

export function jumlahGram(daftar: (number | string)[]): number {
  return daftar.reduce<number>((t, n) => t + keGram(n), 0);
}

/**
 * @param muatanGram total berat resi (gram, lihat keGram)
 * @param kapasitasTon kapasitas armada dari master (ton)
 * @param ambangPersen ambang peringatan dari pengaturan; null = belum diatur
 *   (tidak ada tingkat "peringatan" — sistem tidak mengarang ambang).
 */
export function hitungKapasitas(muatanGram: number, kapasitasTon: number | string, ambangPersen: number | null): HasilKapasitas {
  // kapasitas_ton numeric(8,3) → kg ×1000 → gram ×1000.
  const kapasitasGram = keGram(kapasitasTon) * 1000;
  const permil = kapasitasGram > 0 ? (muatanGram * 1000) / kapasitasGram : 0;
  const persen = (muatanGram > kapasitasGram ? Math.ceil(permil) : Math.floor(permil)) / 10;
  let tingkat: TingkatKapasitas;
  if (muatanGram === 0) tingkat = "kosong";
  else if (muatanGram > kapasitasGram) tingkat = "melebihi";
  else if (muatanGram === kapasitasGram) tingkat = "penuh";
  // Bandingkan muatan × 100 ≥ ambang × kapasitas tanpa pembulatan persen.
  else if (ambangPersen !== null && muatanGram * 100 >= ambangPersen * kapasitasGram) tingkat = "peringatan";
  else tingkat = "aman";
  return { muatanGram, kapasitasGram, persen, sisaGram: kapasitasGram - muatanGram, tingkat, diblokir: tingkat === "melebihi" };
}

/** Gram → kg untuk formatAngka (maks 3 desimal, eksak). */
export function gramKeKg(gram: number): number {
  return gram / 1000;
}

export const STATUS_MANIFES_AKTIF = ["draft", "dimuat", "berangkat"] as const;

export const JENIS_KENDALA = {
  kerusakan: "Kerusakan",
  keterlambatan: "Keterlambatan",
  lainnya: "Lainnya",
} as const;
export type JenisKendala = keyof typeof JENIS_KENDALA;
