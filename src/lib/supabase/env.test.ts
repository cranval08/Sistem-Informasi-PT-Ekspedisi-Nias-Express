import { describe, expect, it } from "vitest";
import { envPublik, kunciRahasiaServer, normalisasiUrlSupabase } from "./env";

const URL = "https://contoh.supabase.co";
const PUB = "sb_publishable_UJI_PUBLIK_123";
const SEC = "sb_secret_UJI_RAHASIA_456";
const LAMA = "eyJ.lama.service_role";

function pesanGalat(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("diharapkan melempar galat");
}

describe("envPublik", () => {
  it("memakai publishable key baru", () => {
    expect(envPublik({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB })).toEqual({
      url: URL,
      publishableKey: PUB,
    });
  });

  it("kompatibel dengan NEXT_PUBLIC_SUPABASE_ANON_KEY lama; nama baru diutamakan", () => {
    expect(envPublik({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }).publishableKey).toBe("anon");
    expect(
      envPublik({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })
        .publishableKey,
    ).toBe(PUB);
  });

  it("menolak secret key yang diletakkan di variabel NEXT_PUBLIC_ tanpa membocorkan nilainya", () => {
    const pesan = pesanGalat(() =>
      envPublik({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SEC }),
    );
    expect(pesan).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY berisi secret key/);
    expect(pesan).not.toContain(SEC);
  });

  it("galat bila belum lengkap", () => {
    expect(pesanGalat(() => envPublik({}))).toMatch(/belum lengkap/);
  });
});

describe("normalisasiUrlSupabase", () => {
  it.each([
    ["https://abcdefghijklmnopqrst.supabase.co", false],
    ["https://abcdefghijklmnopqrst.supabase.co/", true],
    ["https://abcdefghijklmnopqrst.supabase.co/rest/v1", true],
    ["https://abcdefghijklmnopqrst.supabase.co/rest/v1/", true],
  ])("%s → URL dasar", (masuk, dinormalisasi) => {
    expect(normalisasiUrlSupabase(masuk)).toEqual({ url: "https://abcdefghijklmnopqrst.supabase.co", dinormalisasi });
  });

  it("menolak path lain, http, dan URL tidak valid tanpa menampilkan nilainya", () => {
    const rahasia = "https://abcdefghijklmnopqrst.supabase.co/auth/v1";
    const pesan = pesanGalat(() => normalisasiUrlSupabase(rahasia));
    expect(pesan).toMatch(/URL dasar proyek tanpa path/);
    expect(pesan).not.toContain("abcdefghijklmnopqrst");
    expect(pesanGalat(() => normalisasiUrlSupabase("http://x.supabase.co"))).toMatch(/https/);
    expect(pesanGalat(() => normalisasiUrlSupabase("bukan url"))).toMatch(/bukan URL yang valid/);
  });

  it("envPublik memakai URL yang sudah dinormalisasi", () => {
    expect(
      envPublik({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co/rest/v1/", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB }).url,
    ).toBe("https://abcdefghijklmnopqrst.supabase.co");
  });
});

describe("kunciRahasiaServer", () => {
  it("memakai SUPABASE_SECRET_KEY dan melaporkan nama sumbernya", () => {
    expect(kunciRahasiaServer({ SUPABASE_SECRET_KEY: SEC })).toEqual({ kunci: SEC, sumber: "SUPABASE_SECRET_KEY" });
  });

  it("kompatibel dengan SUPABASE_SERVICE_ROLE_KEY lama; nama baru diutamakan", () => {
    expect(kunciRahasiaServer({ SUPABASE_SERVICE_ROLE_KEY: LAMA }).sumber).toBe("SUPABASE_SERVICE_ROLE_KEY");
    expect(kunciRahasiaServer({ SUPABASE_SECRET_KEY: SEC, SUPABASE_SERVICE_ROLE_KEY: LAMA }).kunci).toBe(SEC);
    expect(kunciRahasiaServer({ SUPABASE_SECRET_KEY: "  ", SUPABASE_SERVICE_ROLE_KEY: LAMA }).kunci).toBe(LAMA);
  });

  it("menolak publishable key yang salah tempat tanpa mencetak nilainya", () => {
    const pesan = pesanGalat(() => kunciRahasiaServer({ SUPABASE_SECRET_KEY: PUB }));
    expect(pesan).toMatch(/berisi publishable key/);
    expect(pesan).not.toContain(PUB);
  });

  it("menolak bila ada secret key di variabel NEXT_PUBLIC_ mana pun", () => {
    const pesan = pesanGalat(() => kunciRahasiaServer({ SUPABASE_SECRET_KEY: SEC, NEXT_PUBLIC_SECRET: SEC }));
    expect(pesan).toMatch(/NEXT_PUBLIC_SECRET/);
    expect(pesan).not.toContain(SEC);
  });

  it("galat jelas bila belum diisi", () => {
    expect(pesanGalat(() => kunciRahasiaServer({}))).toMatch(/SUPABASE_SECRET_KEY belum diisi/);
  });
});
