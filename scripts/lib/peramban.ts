// Peramban headless (Chrome/Edge) lewat Chrome DevTools Protocol, tanpa
// dependensi tambahan. Dipakai uji-responsif.ts dan uji-alur-transaksi.ts.
// Tidak mencetak password maupun kunci.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { envPublik } from "../../src/lib/supabase/env";
import type { Peran } from "../../src/lib/domain/peran";

export const AKUN_DEMO: Record<Peran, string> = {
  pemilik: "demo.pemilik@example.com",
  admin_loket: "demo.admin@example.com",
  staf_gudang: "demo.gudang@example.com",
  supir: "demo.supir@example.com",
};

export const jeda = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cariBrowser(): string {
  const kandidat = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];
  const b = kandidat.find((p) => existsSync(p));
  if (!b) throw new Error("Chrome/Edge tidak ditemukan. Atur CHROME_PATH.");
  return b;
}

/** Login akun demo dengan @supabase/ssr agar format cookie sama dengan aplikasi. */
export async function sesiDemo(email: string) {
  const { url, publishableKey } = envPublik(process.env);
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (d) => d.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
  if (error) throw new Error(`Login ${email} gagal (periksa DEMO_PASSWORD & seed:akun).`);
  return { supabase, cookies: [...jar].map(([name, value]) => ({ name, value })) };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payload protokol CDP tidak bertipe */
/** Klien CDP minimal di atas WebSocket bawaan Node. */
export class Cdp {
  private id = 0;
  private tunggu = new Map<number, { ok: (v: unknown) => void; gagal: (e: Error) => void }>();
  private pendengar: ((m: { method: string; params: any }) => void)[] = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && this.tunggu.has(m.id)) {
        const t = this.tunggu.get(m.id)!;
        this.tunggu.delete(m.id);
        if (m.error) t.gagal(new Error(m.error.message));
        else t.ok(m.result);
      } else if (m.method) this.pendengar.forEach((f) => f(m));
    });
  }
  static async sambung(url: string) {
    const ws = new WebSocket(url);
    await new Promise((ok, gagal) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", gagal, { once: true });
    });
    return new Cdp(ws);
  }
  kirim<T = any>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, gagal) => this.tunggu.set(id, { ok: ok as (v: unknown) => void, gagal }));
  }
  dengar(f: (m: { method: string; params: any }) => void) {
    this.pendengar.push(f);
  }
  sekali(method: string, ms = 30_000) {
    return new Promise<void>((ok, gagal) => {
      const t = setTimeout(() => gagal(new Error(`timeout ${method}`)), ms);
      const f = (m: { method: string }) => {
        if (m.method === method) {
          clearTimeout(t);
          this.pendengar = this.pendengar.filter((x) => x !== f);
          ok();
        }
      };
      this.pendengar.push(f);
    });
  }
  /** Evaluasi ekspresi JS di halaman dan kembalikan nilainya. */
  async nilai<T = any>(ekspresi: string): Promise<T> {
    const r = await this.kirim("Runtime.evaluate", { expression: ekspresi, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`Evaluasi gagal: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  }
  tutup() {
    this.ws.close();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Jalankan peramban headless, beri satu tab, lalu bersihkan setelah `isi` selesai. */
export async function denganPeramban<T>(port: number, isi: (cdp: Cdp) => Promise<T>): Promise<T> {
  const profilDir = mkdtempSync(path.join(tmpdir(), "uji-peramban-"));
  const chrome: ChildProcess = spawn(
    cariBrowser(),
    ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profilDir}`, "--no-first-run", "--hide-scrollbars", "about:blank"],
    { stdio: "ignore" },
  );
  try {
    let daftar: { type: string; webSocketDebuggerUrl: string }[] = [];
    for (let i = 0; i < 50 && !daftar.length; i++) {
      await jeda(200);
      daftar = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
      daftar = daftar.filter((t) => t.type === "page");
    }
    if (!daftar.length) throw new Error("Browser headless tidak merespons.");
    const cdp = await Cdp.sambung(daftar[0].webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map((m) => cdp.kirim(m)));
    try {
      return await isi(cdp);
    } finally {
      cdp.tutup();
    }
  } finally {
    chrome.kill();
    await jeda(300);
    rmSync(profilDir, { recursive: true, force: true, maxRetries: 5 });
  }
}

/** Pasang cookie sesi akun demo pada peramban. */
export async function pasangSesi(cdp: Cdp, app: string, cookies: { name: string; value: string }[]) {
  const host = new URL(app).hostname;
  await cdp.kirim("Network.clearBrowserCookies");
  await cdp.kirim("Network.setCookies", { cookies: cookies.map((c) => ({ ...c, domain: host, path: "/" })) });
}

/** Buka URL dan tunggu event load + jeda hidrasi. */
export async function buka(cdp: Cdp, url: string, jedaMs = 700) {
  const muat = cdp.sekali("Page.loadEventFired");
  await cdp.kirim("Page.navigate", { url });
  await muat;
  await jeda(jedaMs);
}
