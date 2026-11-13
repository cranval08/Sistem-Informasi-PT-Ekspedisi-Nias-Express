import { NextResponse, type NextRequest } from "next/server";
import { buatKlienServer } from "@/lib/supabase/server";

const ALASAN_VALID = new Set(["nonaktif", "keluar"]);

/**
 * Mengakhiri sesi lalu kembali ke halaman login. Dipakai saat sesi Auth
 * masih ada tetapi akun tidak terdaftar/nonaktif.
 */
export async function GET(request: NextRequest) {
  const supabase = await buatKlienServer();
  await supabase.auth.signOut();

  const alasan = request.nextUrl.searchParams.get("alasan");
  const tujuan = new URL("/login", request.url);
  if (alasan && ALASAN_VALID.has(alasan)) tujuan.searchParams.set("alasan", alasan);
  return NextResponse.redirect(tujuan);
}
