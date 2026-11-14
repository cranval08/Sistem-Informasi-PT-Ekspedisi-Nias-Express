/**
 * Data Demo Fase 2 (PRD §16). SEMUA nilai di sini fiktif dan hanya contoh:
 *  - nama diawali "[Demo]", nomor telepon dari blok fiktif 0810-0000-1xxx;
 *  - tarif dan kapasitas adalah CONTOH, bukan tarif/kapasitas aktual
 *    perusahaan — Pemilik wajib menggantinya sebelum dipakai operasional;
 *  - plat memakai kode wilayah fiktif "XX".
 */
export const PENANDA_DEMO = "[Demo]";

export const PELANGGAN_DEMO = [
  { nama: "[Demo] Toko Contoh Sejahtera", telepon: "081000001001" },
  { nama: "[Demo] UD Contoh Berkah", telepon: "081000001002" },
  { nama: "[Demo] CV Contoh Makmur", telepon: "081000001003" },
  { nama: "[Demo] Bapak Contoh Satu", telepon: "081000001004" },
  { nama: "[Demo] Ibu Contoh Dua", telepon: "081000001005" },
  { nama: "[Demo] Toko Contoh Bangunan", telepon: "081000001006" },
] as const;

export const ITEM_DEMO = [
  { nama_item: "[Demo] Sembako (tarif contoh)", satuan: "kg", tarif_per_satuan: 1500 },
  { nama_item: "[Demo] Hasil Bumi (tarif contoh)", satuan: "kg", tarif_per_satuan: 1000 },
  { nama_item: "[Demo] Material Bangunan (tarif contoh)", satuan: "ton", tarif_per_satuan: 400000 },
  { nama_item: "[Demo] Paket Kardus (tarif contoh)", satuan: "koli", tarif_per_satuan: 25000 },
  { nama_item: "[Demo] Elektronik (tarif contoh)", satuan: "koli", tarif_per_satuan: 75000 },
] as const;

/** `supirDemo: true` → ditugaskan ke akun demo.supir@example.com bila ada. */
export const ARMADA_DEMO = [
  { plat_nomor: "XX 9001 DM", jenis_unit: "besar", kapasitas_ton: 8, supirDemo: true },
  { plat_nomor: "XX 9002 DM", jenis_unit: "kecil", kapasitas_ton: 3.5, supirDemo: false },
  { plat_nomor: "XX 9003 DM", jenis_unit: "besar", kapasitas_ton: 10, supirDemo: false },
] as const;

export const CATATAN_ARMADA_DEMO = "Data Demo — kapasitas contoh, bukan data aktual perusahaan.";

/**
 * Transaksi demo (dibuat lewat RPC buat_transaksi sebagai akun Demo Admin,
 * sehingga melewati validasi & audit yang sama dengan aplikasi).
 * Indeks merujuk PELANGGAN_DEMO / ITEM_DEMO. bayar: "lunas" = sebesar total.
 */
export const TRANSAKSI_DEMO = [
  { pengirim: 0, penerima: 3, barang: [{ item: 0, berat_kg: "25" }], bayar: "lunas" },
  { pengirim: 1, penerima: 4, barang: [{ item: 3, berat_kg: "12.5", koli: "3" }, { item: 1, berat_kg: "40" }], bayar: 50000 },
  { pengirim: 5, penerima: 2, barang: [{ item: 2, berat_kg: "1500" }], bayar: 0 },
  { pengirim: 2, penerima: 0, barang: [{ item: 4, berat_kg: "8", koli: "2" }], bayar: "lunas" },
] as const satisfies readonly {
  pengirim: number;
  penerima: number;
  barang: readonly { item: number; berat_kg: string; koli?: string }[];
  bayar: number | "lunas";
}[];
