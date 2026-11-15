import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { bolehAkses, DAFTAR_PERAN, isPeran, RUTE, ruteDariPath } from "@/lib/domain/peran";
import { envPublik } from "./env";

/** Rute yang dapat dibuka tanpa login. */
const RUTE_PUBLIK = ["/login", "/lacak", "/keluar"];

function rutePublik(pathname: string) {
  return RUTE_PUBLIK.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/**
 * Menyegarkan token sesi Supabase pada setiap request, mengalihkan
 * pengguna yang belum login ke halaman login, dan mengalihkan peran yang
 * tidak berhak ke /akses-ditolak.
 *
 * Pemeriksaan peran di sini diperlukan agar respons berupa HTTP 307 yang
 * sesungguhnya: dengan Cache Components, redirect dari dalam page.tsx di
 * build produksi baru terjadi setelah respons 200 mulai dikirim (dialihkan
 * lewat skrip di browser). Lapisan berikutnya tetap berlaku:
 * wajibAksesRute() di setiap halaman, lalu RLS/RPC di database.
 */
export async function perbaruiSesi(request: NextRequest) {
  const { url, publishableKey } = envPublik();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(daftar) {
        for (const { name, value } of daftar) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of daftar) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() memverifikasi JWT; jangan ada kode di antara createServerClient dan baris ini.
  const { data } = await supabase.auth.getClaims();
  const sudahLogin = !!data?.claims?.sub;
  const { pathname, search } = request.nextUrl;

  if (!sudahLogin && !rutePublik(pathname)) {
    const tujuan = request.nextUrl.clone();
    tujuan.pathname = "/login";
    tujuan.search = "";
    if (pathname !== "/") tujuan.searchParams.set("lanjut", pathname + search);
    const redirect = NextResponse.redirect(tujuan);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  // Peran hanya diperiksa untuk rute yang tidak terbuka bagi semua peran
  // (Dashboard tidak memerlukan kueri tambahan).
  const rute = sudahLogin ? ruteDariPath(pathname) : null;
  if (rute && RUTE[rute].peran.length < DAFTAR_PERAN.length) {
    const { data: peran, error } = await supabase.rpc("peran_saya");
    // Galat kueri atau akun nonaktif (NULL): diteruskan ke halaman, yang
    // menangani keduanya (wajibLogin → /keluar, galat → error boundary).
    if (!error && isPeran(peran) && !bolehAkses(peran, rute)) {
      const tujuan = request.nextUrl.clone();
      tujuan.pathname = "/akses-ditolak";
      tujuan.search = "";
      const redirect = NextResponse.redirect(tujuan);
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      return redirect;
    }
  }

  if (sudahLogin && pathname === "/login") {
    const tujuan = request.nextUrl.clone();
    tujuan.pathname = "/dashboard";
    tujuan.search = "";
    const redirect = NextResponse.redirect(tujuan);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}
