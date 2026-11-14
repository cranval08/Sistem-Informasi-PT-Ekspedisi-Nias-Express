/**
 * Definisi peran & peta akses rute — satu sumber untuk menu sidebar dan
 * pemeriksaan akses di server. RLS di database tetap menjadi penjaga
 * terakhir; pemeriksaan ini mencegah halaman dirender untuk peran lain.
 */
export const DAFTAR_PERAN = ["pemilik", "admin_loket", "staf_gudang", "supir"] as const;
export type Peran = (typeof DAFTAR_PERAN)[number];

export const LABEL_PERAN: Record<Peran, string> = {
  pemilik: "Pemilik",
  admin_loket: "Admin Loket",
  staf_gudang: "Staf Gudang",
  supir: "Supir",
};

export function isPeran(v: unknown): v is Peran {
  return typeof v === "string" && (DAFTAR_PERAN as readonly string[]).includes(v);
}

const SEMUA: readonly Peran[] = DAFTAR_PERAN;
const KANTOR: readonly Peran[] = ["pemilik", "admin_loket"];

/** Rute internal beserta peran yang diizinkan dan fase implementasinya. */
export const RUTE = {
  dashboard:        { href: "/dashboard",              judul: "Dashboard",                peran: SEMUA },
  transaksi:        { href: "/transaksi",              judul: "Daftar Transaksi",         peran: ["pemilik", "admin_loket", "staf_gudang"] },
  transaksiBaru:    { href: "/transaksi/baru",         judul: "Buat Transaksi",           peran: KANTOR },
  pengambilan:      { href: "/pengambilan",            judul: "Pengambilan Barang",       peran: ["pemilik", "admin_loket", "staf_gudang"] },
  pelanggan:        { href: "/pelanggan",              judul: "Daftar Pelanggan",         peran: KANTOR },
  manifes:          { href: "/manifes",                judul: "Daftar Manifes",           peran: ["pemilik", "staf_gudang"] },
  manifesBaru:      { href: "/manifes/baru",           judul: "Buat Manifes",             peran: ["pemilik", "staf_gudang"] },
  perjalanan:       { href: "/perjalanan",             judul: "Perjalanan Saya",          peran: ["supir"] },
  armada:           { href: "/armada",                 judul: "Daftar Armada",            peran: ["pemilik", "staf_gudang"] },
  pembayaran:       { href: "/pembayaran",             judul: "Daftar Pembayaran",        peran: KANTOR },
  rekapKas:         { href: "/pembayaran/rekap-kas",   judul: "Rekap Kas",                peran: KANTOR },
  laporanTransaksi: { href: "/laporan/transaksi",      judul: "Laporan Transaksi",        peran: ["pemilik"] },
  laporanKirim:     { href: "/laporan/pengiriman",     judul: "Laporan Pengiriman",       peran: ["pemilik"] },
  laporanArmada:    { href: "/laporan/armada",         judul: "Laporan Armada & Tonase",  peran: ["pemilik"] },
  laporanBayar:     { href: "/laporan/pembayaran",     judul: "Laporan Pembayaran",       peran: ["pemilik"] },
  masterItem:       { href: "/master/item",            judul: "Jenis Barang & Tarif",     peran: ["pemilik"] },
  masterPengguna:   { href: "/master/pengguna",        judul: "Data Pengguna",            peran: ["pemilik"] },
  pengaturan:       { href: "/pengaturan",             judul: "Pengaturan",               peran: ["pemilik"] },
  auditLog:         { href: "/audit-log",              judul: "Audit Log",                peran: ["pemilik"] },
  sistemDesain:     { href: "/sistem-desain",          judul: "Sistem Desain",            peran: ["pemilik"] },
} as const satisfies Record<string, { href: string; judul: string; peran: readonly Peran[] }>;

export type KunciRute = keyof typeof RUTE;

export function bolehAkses(peran: Peran | null | undefined, rute: KunciRute): boolean {
  return !!peran && (RUTE[rute].peran as readonly Peran[]).includes(peran);
}

/** Struktur menu (PRD §6). Ikon dipetakan di komponen sidebar. */
export type GrupMenu = {
  label: string;
  ikon: string;
  item: KunciRute[];
};

export const MENU: GrupMenu[] = [
  { label: "Dashboard", ikon: "dashboard", item: ["dashboard"] },
  { label: "Transaksi & Resi", ikon: "transaksi", item: ["transaksi", "transaksiBaru", "pengambilan"] },
  { label: "Pelanggan", ikon: "pelanggan", item: ["pelanggan"] },
  { label: "Manifes & Pengiriman", ikon: "manifes", item: ["manifes", "manifesBaru", "perjalanan"] },
  { label: "Armada", ikon: "armada", item: ["armada"] },
  { label: "Pembayaran & Kas", ikon: "pembayaran", item: ["pembayaran", "rekapKas"] },
  { label: "Laporan", ikon: "laporan", item: ["laporanTransaksi", "laporanKirim", "laporanArmada", "laporanBayar"] },
  { label: "Master Data", ikon: "master", item: ["masterItem", "masterPengguna"] },
  { label: "Pengaturan", ikon: "pengaturan", item: ["pengaturan", "sistemDesain"] },
  { label: "Audit Log", ikon: "audit", item: ["auditLog"] },
];

/** Menu yang terlihat untuk suatu peran; grup kosong disembunyikan. */
export function menuUntuk(peran: Peran): GrupMenu[] {
  return MENU.map((g) => ({ ...g, item: g.item.filter((k) => bolehAkses(peran, k)) })).filter((g) => g.item.length > 0);
}

/** Cari rute paling spesifik untuk sebuah pathname (dipakai breadcrumb & judul). */
export function ruteDariPath(pathname: string): KunciRute | null {
  let terbaik: KunciRute | null = null;
  for (const [k, r] of Object.entries(RUTE) as [KunciRute, (typeof RUTE)[KunciRute]][]) {
    if (pathname === r.href || pathname.startsWith(r.href + "/")) {
      if (!terbaik || r.href.length > RUTE[terbaik].href.length) terbaik = k;
    }
  }
  return terbaik;
}
