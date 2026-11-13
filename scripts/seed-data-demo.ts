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
import { ARMADA_DEMO, CATATAN_ARMADA_DEMO, ITEM_DEMO, PELANGGAN_DEMO } from "./data-demo";

config({ path: ".env.local", quiet: true });

function gagal(pesan: string): never {
  console.error(`✗ ${pesan}`);
  process.exit(1);
}

let url: string;
let kunci: string;
try {
  ({ url } = envPublik(process.env));
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

  console.log("\nSelesai. Semua data berlabel [Demo]; tarif & kapasitas hanya contoh dan wajib diganti Pemilik.");
}

main().catch((e) => gagal(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Galat tidak dikenal saat seed."));
