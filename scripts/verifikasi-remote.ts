// Verifikasi READ-ONLY database remote: npm run verifikasi:remote
// Tidak menulis apa pun dan tidak mencetak kunci.
import { createClient } from "@supabase/supabase-js";
import { envPublik, kunciRahasiaServer } from "../src/lib/supabase/env";

process.loadEnvFile(".env.local");
const { url, publishableKey } = envPublik(process.env);
const { kunci } = kunciRahasiaServer(process.env);

const admin = createClient(url, kunci, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });

const TABEL = [
  "pengaturan", "data_pengguna", "data_pelanggan", "data_item", "data_armada", "data_transaksi",
  "detail_transaksi", "pembayaran", "manifes", "manifes_detail", "riwayat_status_pengiriman",
  "riwayat_status_armada", "kendala_perjalanan", "audit_log",
];

async function main() {
  console.log("Tabel (via secret key, melewati RLS):");
  for (const t of TABEL) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${error ? "✗" : "✓"} ${t.padEnd(26)} ${error ? error.code + " " + error.message : count + " baris"}`);
  }

  const { data: s } = await admin.from("pengaturan").select("nama_perusahaan, prefiks_resi, mode_demo, ambang_peringatan_kapasitas_persen").single();
  console.log("\nPengaturan:", s);

  const { data: p } = await admin.from("data_pengguna").select("email, peran, is_active").order("peran");
  console.log("\ndata_pengguna:", p?.length ? p : "(kosong: seed akun belum dijalankan)");

  const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  const demo = (u?.users ?? []).filter((x) => x.email?.startsWith("demo.")).map((x) => x.email);
  console.log("Akun Auth demo:", demo.length ? demo : "(belum ada)");

  console.log("\nUji anon (harus ditolak / kosong):");
  for (const t of ["data_pengguna", "pengaturan", "audit_log"]) {
    const { data, error } = await anon.from(t).select("*").limit(1);
    console.log(`  ${t.padEnd(14)} ${error ? "ditolak (" + error.code + ")" : data?.length + " baris"}`);
  }

}
main().catch((e) => console.error("Galat:", e instanceof Error ? e.message : "tidak dikenal"));
