/**
 * Uji pengaman arsitektur (statis, tanpa jaringan): aturan keamanan yang
 * mudah terlupa saat menambah halaman/aksi baru. Membaca kode sumber dan
 * gagal bila sebuah pola wajib hilang.
 *
 *  - setiap page.tsx internal memanggil wajibAksesRute dengan kunci rute yang
 *    sesuai path-nya dan menandai `instant = false` (Cache Components);
 *  - setiap server action memeriksa peran (profilUntukAksi) sebelum apa pun;
 *  - route handler internal memeriksa peran;
 *  - secret key hanya dipakai di modul yang diizinkan;
 *  - process.env hanya dibaca di lib/supabase/env.ts;
 *  - tidak ada klaim "real-time" di teks UI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RUTE, ruteDariPath, type KunciRute } from "@/lib/domain/peran";

const AKAR = path.resolve(import.meta.dirname, "..");
const SRC = path.join(AKAR, "src");
const APP_INTERNAL = path.join(SRC, "app", "(app)");

function semuaBerkas(dir: string, cocok: (f: string) => boolean): string[] {
  const hasil: string[] = [];
  for (const nama of readdirSync(dir)) {
    const p = path.join(dir, nama);
    if (statSync(p).isDirectory()) hasil.push(...semuaBerkas(p, cocok));
    else if (cocok(p)) hasil.push(p);
  }
  return hasil;
}
const relatif = (p: string) => path.relative(AKAR, p).replaceAll("\\", "/");
const baca = (p: string) => readFileSync(p, "utf8").replaceAll("\r\n", "\n");

/** Path URL dari berkas page.tsx; segmen dinamis diganti contoh nilai. */
function pathUrl(berkasPage: string): string {
  const seg = path
    .relative(APP_INTERNAL, path.dirname(berkasPage))
    .split(path.sep)
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith("[") ? "contoh" : s));
  return "/" + seg.join("/");
}

describe("halaman internal", () => {
  const halaman = semuaBerkas(APP_INTERNAL, (f) => f.endsWith(`${path.sep}page.tsx`));

  it("ditemukan (sanity)", () => {
    expect(halaman.length).toBeGreaterThanOrEqual(Object.keys(RUTE).length);
  });

  it.each(halaman.map(relatif))("%s: wajibAksesRute dengan kunci sesuai path & instant = false", (rel) => {
    const isi = baca(path.join(AKAR, rel));
    expect(isi, "export const instant = false").toMatch(/export const instant = false/);
    const m = isi.match(/await wajibAksesRute\("(\w+)"\)/);
    expect(m, "await wajibAksesRute(...)").not.toBeNull();
    const kunci = m![1] as KunciRute;
    expect(Object.keys(RUTE)).toContain(kunci);
    // Kunci yang dipakai = rute paling spesifik untuk path halaman itu.
    expect(ruteDariPath(pathUrl(path.join(AKAR, rel))), "kunci rute tidak sesuai path").toBe(kunci);
  });

  it("setiap rute di RUTE punya halaman", () => {
    const path2 = new Set(halaman.map(pathUrl));
    for (const r of Object.values(RUTE)) expect(path2, r.href).toContain(r.href);
  });
});

describe("server action", () => {
  // lib/auth/aksi.ts (login/logout) sengaja publik — dikecualikan.
  const berkasAksi = semuaBerkas(APP_INTERNAL, (f) => f.endsWith(`${path.sep}aksi.ts`));

  it.each(berkasAksi.map(relatif))("%s: \"use server\" dan setiap aksi memeriksa peran lebih dulu", (rel) => {
    const isi = baca(path.join(AKAR, rel));
    expect(isi.trimStart().startsWith('"use server"')).toBe(true);
    const aksi = [...isi.matchAll(/^export async function (\w+)\([^]*?\{\n([^\n]*)/gm)];
    expect(aksi.length).toBeGreaterThan(0);
    for (const [, nama, barisPertama] of aksi) {
      expect(barisPertama, `${nama}: baris pertama harus memeriksa profilUntukAksi`).toMatch(/await profilUntukAksi\(/);
    }
    // Tidak boleh ada fungsi ekspor non-async (semua ekspor "use server" adalah aksi).
    expect(isi).not.toMatch(/^export (const|function) /m);
  });
});

describe("route handler internal", () => {
  it("ekspor laporan memeriksa peran Pemilik sebelum membaca data", () => {
    const isi = baca(path.join(APP_INTERNAL, "laporan", "ekspor", "[jenis]", "route.ts"));
    const awal = isi.indexOf("export async function GET");
    const cek = isi.indexOf('profilUntukAksi("pemilik")', awal);
    const data = isi.indexOf("semua", cek);
    expect(cek).toBeGreaterThan(awal);
    expect(data).toBeGreaterThan(cek);
  });
});

describe("kunci & environment", () => {
  const sumber = semuaBerkas(SRC, (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));

  it("process.env hanya dibaca di lib/supabase/env.ts", () => {
    const pelanggar = sumber.filter((f) => /process\.env/.test(baca(f))).map(relatif);
    expect(pelanggar).toEqual(["src/lib/supabase/env.ts"]);
  });

  it("klien secret key (buatKlienAdmin) hanya di admin.ts dan aksi Data Pengguna, setelah cek Pemilik", () => {
    const pemakai = sumber.filter((f) => /buatKlienAdmin|kunciRahasiaServer/.test(baca(f))).map(relatif).sort();
    expect(pemakai).toEqual(["src/app/(app)/master/pengguna/aksi.ts", "src/lib/supabase/admin.ts", "src/lib/supabase/env.ts"]);
    expect(baca(path.join(SRC, "lib", "supabase", "admin.ts"))).toMatch(/^import "server-only";/);
  });

  it("tidak ada komponen klien yang mengimpor modul server-only", () => {
    const klien = sumber.filter((f) => /^\s*["']use client["']/.test(baca(f)));
    for (const f of klien) {
      expect(baca(f), relatif(f)).not.toMatch(/from "@\/lib\/(supabase\/(admin|server)|auth\/sesi)"/);
    }
  });

  it(".env.example tidak berisi nilai kunci", () => {
    const isi = baca(path.join(AKAR, ".env.example"));
    expect(isi).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9]/);
    expect(isi).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT lama
  });
});

describe("teks UI", () => {
  it('tidak ada klaim "real-time" (PRD: jangan menyebut real-time bila bukan)', () => {
    const tsx = semuaBerkas(SRC, (f) => f.endsWith(".tsx"));
    for (const f of tsx) {
      // Abaikan komentar; yang diperiksa hanya teks yang dirender.
      const tanpaKomentar = baca(f).replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(tanpaKomentar, relatif(f)).not.toMatch(/real[- ]?time/i);
    }
  });
});
