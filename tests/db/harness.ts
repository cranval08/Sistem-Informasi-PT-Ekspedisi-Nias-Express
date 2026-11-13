/**
 * Harness pengujian database: menjalankan seluruh migrasi Supabase di
 * PGlite (Postgres dalam WASM) dengan shim minimal skema `auth` & role
 * Supabase. Tidak menyentuh database cloud.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const MIGRASI_DIR = path.resolve(__dirname, "../../supabase/migrations");

const SHIM_SUPABASE = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
`;

export const ID = {
  pemilik: "00000000-0000-4000-8000-000000000001",
  admin: "00000000-0000-4000-8000-000000000002",
  gudang: "00000000-0000-4000-8000-000000000003",
  supir: "00000000-0000-4000-8000-000000000004",
  supir2: "00000000-0000-4000-8000-000000000005",
  nonaktif: "00000000-0000-4000-8000-000000000006",
} as const;

/** Fixture minimal: satu akun per peran + data master contoh. */
const FIXTURE = /* sql */ `
  insert into auth.users (id, email) values
    ('${ID.pemilik}', 'pemilik@test.local'),
    ('${ID.admin}', 'admin@test.local'),
    ('${ID.gudang}', 'gudang@test.local'),
    ('${ID.supir}', 'supir@test.local'),
    ('${ID.supir2}', 'supir2@test.local'),
    ('${ID.nonaktif}', 'nonaktif@test.local');
  insert into public.data_pengguna (id_pengguna, nama_lengkap, peran, nomor_telepon, email, is_active) values
    ('${ID.pemilik}', 'Pemilik Uji', 'pemilik', '081100000001', 'pemilik@test.local', true),
    ('${ID.admin}', 'Admin Uji', 'admin_loket', '081100000002', 'admin@test.local', true),
    ('${ID.gudang}', 'Gudang Uji', 'staf_gudang', '081100000003', 'gudang@test.local', true),
    ('${ID.supir}', 'Supir Uji', 'supir', '081100000004', 'supir@test.local', true),
    ('${ID.supir2}', 'Supir Dua', 'supir', '081100000005', 'supir2@test.local', true),
    ('${ID.nonaktif}', 'Admin Nonaktif', 'admin_loket', '081100000006', 'nonaktif@test.local', false);
  insert into public.data_pelanggan (id_pelanggan, nama, telepon) values
    ('10000000-0000-4000-8000-000000000001', 'Pengirim Uji', '081200000001'),
    ('10000000-0000-4000-8000-000000000002', 'Penerima Uji', '081200000002');
  insert into public.data_item (id_item, nama_item, satuan, tarif_per_satuan) values
    ('20000000-0000-4000-8000-000000000001', 'Barang Uji Kg', 'kg', 1000),
    ('20000000-0000-4000-8000-000000000002', 'Barang Uji Koli', 'koli', 50000);
  insert into public.data_armada (id_armada, plat_nomor, jenis_unit, kapasitas_ton, id_supir) values
    ('30000000-0000-4000-8000-000000000001', 'bb 1001 aa', 'besar', 8, '${ID.supir}'),
    ('30000000-0000-4000-8000-000000000002', 'BB 1002 AB', 'kecil', 4, '${ID.supir2}');
`;

export type Db = PGlite;

export async function buatDb({ fixture = true } = {}): Promise<Db> {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(SHIM_SUPABASE);
  const berkas = readdirSync(MIGRASI_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of berkas) {
    try {
      await db.exec(readFileSync(path.join(MIGRASI_DIR, f), "utf8"));
    } catch (e) {
      throw new Error(`Migrasi ${f} gagal: ${(e as Error).message}`);
    }
  }
  if (fixture) await db.exec(FIXTURE);
  return db;
}

type Peran = keyof typeof ID | "anon";

/**
 * Jalankan `fn` sebagai pengguna tertentu (role `authenticated` + klaim
 * JWT `sub`) atau sebagai `anon`, di dalam transaksi tersendiri.
 */
export async function sebagai<T>(db: Db, siapa: Peran, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (siapa === "anon") {
      await tx.exec("set local role anon");
    } else {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ID[siapa]]);
    }
    return fn(tx);
  });
}

/** Ambil semua baris dari query sebagai pengguna tertentu. */
export async function baris<T = Record<string, unknown>>(db: Db, siapa: Peran, sql: string, params: unknown[] = []) {
  return sebagai(db, siapa, async (tx) => (await tx.query<T>(sql, params)).rows);
}
