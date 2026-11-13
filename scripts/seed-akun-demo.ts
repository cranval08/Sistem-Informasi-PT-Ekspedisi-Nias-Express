/**
 * Membuat / memperbarui 4 akun demo (satu per peran) di Supabase.
 * Idempoten — aman dijalankan ulang. Berjalan lokal dengan service role key
 * dari .env.local; key tersebut tidak pernah dikirim ke browser.
 *
 *   npm run seed:akun
 *
 * Seluruh akun bertanda "Demo" dan memakai nomor telepon fiktif.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;

function gagal(pesan: string): never {
  console.error(`✗ ${pesan}`);
  process.exit(1);
}

if (!url) gagal("NEXT_PUBLIC_SUPABASE_URL belum diisi di .env.local.");
if (!serviceKey) gagal("SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local (khusus server, jangan diberi awalan NEXT_PUBLIC_).");
if (!password || password.length < 8) gagal("DEMO_PASSWORD belum diisi di .env.local (minimal 8 karakter).");

const AKUN_DEMO = [
  { email: "demo.pemilik@example.com", nama: "Demo Pemilik", peran: "pemilik", telepon: "081000000001" },
  { email: "demo.admin@example.com", nama: "Demo Admin Loket", peran: "admin_loket", telepon: "081000000002" },
  { email: "demo.gudang@example.com", nama: "Demo Staf Gudang", peran: "staf_gudang", telepon: "081000000003" },
  { email: "demo.supir@example.com", nama: "Demo Supir", peran: "supir", telepon: "081000000004" },
] as const;

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function cariUserId(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  for (const akun of AKUN_DEMO) {
    let id = await cariUserId(akun.email);
    if (id) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: akun.email,
        password,
        email_confirm: true,
        user_metadata: { demo: true },
      });
      if (error) throw error;
      id = data.user.id;
    }

    const { error } = await supabase.from("data_pengguna").upsert(
      {
        id_pengguna: id,
        nama_lengkap: akun.nama,
        peran: akun.peran,
        nomor_telepon: akun.telepon,
        email: akun.email,
        is_active: true,
      },
      { onConflict: "id_pengguna" },
    );
    if (error) throw error;
    console.log(`✓ ${akun.peran.padEnd(12)} ${akun.email}`);
  }
  console.log("\nSelesai. Password semua akun demo = nilai DEMO_PASSWORD di .env.local.");
}

main().catch((e) => gagal(e instanceof Error ? e.message : JSON.stringify(e)));
