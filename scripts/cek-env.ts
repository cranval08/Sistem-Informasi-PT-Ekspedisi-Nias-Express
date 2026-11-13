/**
 * Memeriksa kelengkapan & format .env.local TANPA koneksi jaringan dan
 * TANPA mencetak nilai kunci — hanya nama variabel dan statusnya.
 *
 *   npm run cek:env
 */
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { envPublik, kunciRahasiaServer } from "../src/lib/supabase/env";

config({ path: ".env.local", quiet: true });

let adaMasalah = false;
const ok = (p: string) => console.log(`✓ ${p}`);
const salah = (p: string) => {
  adaMasalah = true;
  console.log(`✗ ${p}`);
};

// Format kunci diperiksa hanya dari awalannya, nilainya tidak ditampilkan.
const formatKunci = (v: string | undefined) =>
  !v?.trim() ? "kosong" : v.trim().startsWith("sb_publishable_") ? "format sb_publishable_" : v.trim().startsWith("sb_secret_") ? "format sb_secret_" : "format lama (JWT)";

try {
  const { url } = envPublik(process.env);
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) ok("NEXT_PUBLIC_SUPABASE_URL terisi (https://<ref>.supabase.co)");
  else salah("NEXT_PUBLIC_SUPABASE_URL tidak berformat https://<project-ref>.supabase.co");

  const namaPublik = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    : "NEXT_PUBLIC_SUPABASE_ANON_KEY";
  ok(`${namaPublik} terisi (${formatKunci(process.env[namaPublik])})`);
} catch (e) {
  salah((e as Error).message);
}

try {
  const { sumber } = kunciRahasiaServer(process.env);
  ok(`${sumber} terisi (${formatKunci(process.env[sumber])}), khusus server`);
  if (sumber === "SUPABASE_SERVICE_ROLE_KEY") console.log("  (nama lama: disarankan pindah ke SUPABASE_SECRET_KEY)");
} catch (e) {
  salah((e as Error).message);
}

const pw = process.env.DEMO_PASSWORD;
if (pw && pw.length >= 8) ok("DEMO_PASSWORD terisi (≥ 8 karakter)");
else salah("DEMO_PASSWORD belum diisi atau kurang dari 8 karakter");

try {
  execFileSync("git", ["check-ignore", "-q", ".env.local"]);
  ok(".env.local diabaikan Git");
} catch {
  salah(".env.local TIDAK diabaikan Git: periksa .gitignore");
}

console.log(adaMasalah ? "\nKonfigurasi belum siap." : "\nKonfigurasi siap.");
process.exit(adaMasalah ? 1 : 0);
