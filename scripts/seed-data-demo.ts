/**
 * Mengisi Data Demo Fase 2 (pelanggan, jenis barang & tarif contoh,
 * armada contoh) ke Supabase. Idempoten: baris yang sudah ada (telepon /
 * nama item / plat sama) dilewati, bukan ditimpa — perubahan yang dibuat
 * Pemilik lewat aplikasi tidak hilang.
 *
 *   npm run seed:demo
 *
 * Membutuhkan SUPABASE_SECRET_KEY di .env.local (nilai tidak pernah dicetak).
 * Jalankan `npm run seed:akun` lebih dulu agar armada contoh mendapat supir demo.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { envPublik, kunciRahasiaServer } from "../src/lib/supabase/env";
import { hitungTotal, type Satuan } from "../src/lib/domain/transaksi";
import { ARMADA_DEMO, CATATAN_ARMADA_DEMO, ITEM_DEMO, PELANGGAN_DEMO, TRANSAKSI_DEMO } from "./data-demo";

config({ path: ".env.local", quiet: true });

function gagal(pesan: string): never {
  console.error(`✗ ${pesan}`);
  process.exit(1);
}

let url: string;
let kunci: string;
let publishableKey: string;
try {
  ({ url, publishableKey } = envPublik(process.env));
  ({ kunci } = kunciRahasiaServer(process.env));
} catch (e) {
  gagal((e as Error).message);
}

const supabase = createClient(url, kunci, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: pengaturan, error: e0 } = await supabase.from("pengaturan").select("mode_demo").maybeSingle();
  if (e0) throw e0;
  if (pengaturan && !pengaturan.mode_demo) {
    gagal("Mode demo nonaktif di Pengaturan. Data demo tidak diisi agar tidak tercampur dengan data operasional.");
  }

  // Pelanggan
  const { data: adaPel, error: e1 } = await supabase.from("data_pelanggan").select("telepon");
  if (e1) throw e1;
  const telpAda = new Set((adaPel ?? []).map((p) => p.telepon));
  const pelBaru = PELANGGAN_DEMO.filter((p) => !telpAda.has(p.telepon));
  if (pelBaru.length) {
    const { error } = await supabase.from("data_pelanggan").insert(pelBaru);
    if (error) throw error;
  }
  console.log(`✓ Pelanggan demo   : ${pelBaru.length} ditambahkan, ${PELANGGAN_DEMO.length - pelBaru.length} sudah ada`);

  // Jenis barang
  const { data: adaItem, error: e2 } = await supabase.from("data_item").select("nama_item");
  if (e2) throw e2;
  const namaAda = new Set((adaItem ?? []).map((i) => i.nama_item.toLowerCase()));
  const itemBaru = ITEM_DEMO.filter((i) => !namaAda.has(i.nama_item.toLowerCase()));
  if (itemBaru.length) {
    const { error } = await supabase.from("data_item").insert(itemBaru);
    if (error) throw error;
  }
  console.log(`✓ Jenis barang demo: ${itemBaru.length} ditambahkan, ${ITEM_DEMO.length - itemBaru.length} sudah ada`);

  // Armada
  const { data: supir } = await supabase
    .from("data_pengguna")
    .select("id_pengguna")
    .eq("email", "demo.supir@example.com")
    .eq("peran", "supir")
    .eq("is_active", true)
    .maybeSingle();
  const { data: adaArmada, error: e3 } = await supabase.from("data_armada").select("plat_nomor");
  if (e3) throw e3;
  const platAda = new Set((adaArmada ?? []).map((a) => a.plat_nomor));
  const armadaBaru = ARMADA_DEMO.filter((a) => !platAda.has(a.plat_nomor)).map(({ supirDemo, ...a }) => ({
    ...a,
    id_supir: supirDemo ? (supir?.id_pengguna ?? null) : null,
    catatan: CATATAN_ARMADA_DEMO,
  }));
  if (armadaBaru.length) {
    const { error } = await supabase.from("data_armada").insert(armadaBaru);
    if (error) throw error;
  }
  console.log(`✓ Armada demo      : ${armadaBaru.length} ditambahkan, ${ARMADA_DEMO.length - armadaBaru.length} sudah ada`);
  if (!supir) console.log("  (akun demo.supir@example.com belum ada — jalankan npm run seed:akun lalu tugaskan supir lewat menu Armada)");

  await seedTransaksi();

  console.log("\nSelesai. Semua data berlabel [Demo]; tarif & kapasitas hanya contoh dan wajib diganti Pemilik.");
}

/**
 * Transaksi demo dibuat sebagai Demo Admin lewat RPC buat_transaksi (aturan,
 * nomor resi, & audit sama persis dengan aplikasi). Dilewati bila sudah ada
 * transaksi dengan pengirim demo.
 */
async function seedTransaksi() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    console.log("• Transaksi demo   : dilewati (DEMO_PASSWORD belum diisi)");
    return;
  }
  const { data: pel } = await supabase.from("data_pelanggan").select("id_pelanggan, telepon, is_active");
  const idPel = new Map((pel ?? []).map((p) => [p.telepon, p.id_pelanggan]));
  const pelAktif = new Set((pel ?? []).filter((p) => p.is_active).map((p) => p.telepon));
  const idsDemo = PELANGGAN_DEMO.map((p) => idPel.get(p.telepon)).filter((x): x is string => !!x);
  const { count } = await supabase.from("data_transaksi").select("*", { count: "exact", head: true }).in("id_pengirim", idsDemo);
  if (count) {
    console.log(`• Transaksi demo   : dilewati (${count} transaksi demo sudah ada)`);
    return;
  }
  const { data: items } = await supabase.from("data_item").select("id_item, nama_item, satuan, tarif_per_satuan, is_active");
  const item = new Map((items ?? []).map((i) => [i.nama_item.toLowerCase(), i]));

  const admin = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await admin.auth.signInWithPassword({ email: "demo.admin@example.com", password });
  if (eLogin) {
    console.log("• Transaksi demo   : dilewati (login demo.admin@example.com gagal — jalankan npm run seed:akun)");
    return;
  }

  let dibuat = 0;
  const dilewati: string[] = [];
  for (const t of TRANSAKSI_DEMO) {
    // Data demo yang dinonaktifkan (mis. saat uji manual) tidak diaktifkan ulang diam-diam.
    const nonaktif = [
      ...[PELANGGAN_DEMO[t.pengirim], PELANGGAN_DEMO[t.penerima]].filter((p) => !pelAktif.has(p.telepon)).map((p) => p.nama),
      ...t.barang.map((b) => ITEM_DEMO[b.item].nama_item).filter((n) => !item.get(n.toLowerCase())?.is_active),
    ];
    if (nonaktif.length) {
      dilewati.push(`${PELANGGAN_DEMO[t.pengirim].nama} → ${PELANGGAN_DEMO[t.penerima].nama} (nonaktif: ${[...new Set(nonaktif)].join(", ")})`);
      continue;
    }
    const barang = t.barang.map((b) => {
      const data = item.get(ITEM_DEMO[b.item].nama_item.toLowerCase());
      if (!data) throw new Error(`Jenis barang demo "${ITEM_DEMO[b.item].nama_item}" tidak ditemukan.`);
      return { data, berat: b.berat_kg, koli: "koli" in b ? b.koli : "" };
    });
    const total = hitungTotal(
      barang.map((b) => ({ satuan: b.data.satuan as Satuan, tarif: Number(b.data.tarif_per_satuan), berat: b.berat, koli: b.koli })),
    ).biaya;
    const { error } = await admin.rpc("buat_transaksi", {
      p_id_pengirim: idPel.get(PELANGGAN_DEMO[t.pengirim].telepon),
      p_id_penerima: idPel.get(PELANGGAN_DEMO[t.penerima].telepon),
      p_detail: barang.map((b) => ({ id_item: b.data.id_item, berat_kg: b.berat, koli: b.koli || null })),
      p_bayar_awal: t.bayar === "lunas" ? total : t.bayar,
      p_catatan: "Data Demo",
      p_konfirmasi_duplikat: true,
    });
    if (error) throw error;
    dibuat++;
  }
  await admin.auth.signOut();
  console.log(`✓ Transaksi demo   : ${dibuat} dibuat`);
  for (const d of dilewati) console.log(`  dilewati: ${d}`);
}

main().catch((e) => gagal(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Galat tidak dikenal saat seed."));
