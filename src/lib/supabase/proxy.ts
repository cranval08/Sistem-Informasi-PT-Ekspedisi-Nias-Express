import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { envPublik } from "./env";

/** Rute yang dapat dibuka tanpa login. */
const RUTE_PUBLIK = ["/login", "/lacak", "/keluar"];

function rutePublik(pathname: string) {
  return RUTE_PUBLIK.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/**
 * Menyegarkan token sesi Supabase pada setiap request dan mengalihkan
 * pengguna yang belum login ke halaman login. Ini pemeriksaan optimistis;
 * otorisasi peran tetap dilakukan di halaman (server) dan RLS.
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
