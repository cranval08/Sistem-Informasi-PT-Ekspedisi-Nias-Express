import type { NextRequest } from "next/server";
import { ambilPengaturan, profilUntukAksi } from "@/lib/auth/sesi";
import { keCsv, namaBerkasCsv } from "@/lib/domain/laporan";
import {
  ambilLaporanArmada,
  bacaFilterArmada,
  bacaFilterAudit,
  bacaFilterPembayaran,
  bacaFilterPengiriman,
  bacaFilterTransaksi,
  BATAS_EKSPOR,
  KOLOM_CSV_ARMADA,
  kolomCsvAudit,
  kolomCsvPembayaran,
  kolomCsvRiwayat,
  kolomCsvTransaksi,
  semuaAudit,
  semuaLaporanPembayaran,
  semuaLaporanTransaksi,
  semuaRiwayatPengiriman,
} from "../../data";

/**
 * Ekspor CSV laporan (PRD §7.14): mengikuti filter yang sama dengan halaman
 * (parameter URL identik) dan hanya untuk Pemilik. Proxy memastikan sesi;
 * peran diperiksa di sini, RLS/RPC tetap menjadi penjaga terakhir.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/laporan/ekspor/[jenis]">) {
  const { jenis } = await ctx.params;
  if (!(await profilUntukAksi("pemilik"))) return teks(403, "Anda tidak memiliki hak akses untuk mengekspor laporan ini.");

  const { zonaWaktu } = await ambilPengaturan();
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());

  try {
    switch (jenis) {
      case "transaksi": {
        const f = bacaFilterTransaksi(sp, zonaWaktu);
        const { baris, terpotong } = await semuaLaporanTransaksi(f);
        return terpotong ? terlaluBanyak() : csv(keCsv(kolomCsvTransaksi(zonaWaktu), baris), namaBerkasCsv("transaksi", f.rentang.dari, f.rentang.sampai));
      }
      case "pembayaran": {
        const f = bacaFilterPembayaran(sp, zonaWaktu);
        const { baris, terpotong } = await semuaLaporanPembayaran(f, zonaWaktu);
        return terpotong ? terlaluBanyak() : csv(keCsv(kolomCsvPembayaran(zonaWaktu), baris), namaBerkasCsv("pembayaran", f.rentang.dari, f.rentang.sampai));
      }
      case "armada": {
        const { rentang } = bacaFilterArmada(sp, zonaWaktu);
        return csv(keCsv(KOLOM_CSV_ARMADA, await ambilLaporanArmada(rentang)), namaBerkasCsv("armada", rentang.dari, rentang.sampai));
      }
      case "pengiriman": {
        const f = bacaFilterPengiriman(sp, zonaWaktu);
        const { baris, terpotong } = await semuaRiwayatPengiriman(f, zonaWaktu);
        return terpotong ? terlaluBanyak() : csv(keCsv(kolomCsvRiwayat(zonaWaktu), baris), namaBerkasCsv("riwayat-status", f.rentang.dari, f.rentang.sampai));
      }
      case "audit": {
        const f = bacaFilterAudit(sp, zonaWaktu);
        const { baris, terpotong } = await semuaAudit(f, zonaWaktu);
        return terpotong ? terlaluBanyak() : csv(keCsv(kolomCsvAudit(zonaWaktu), baris), namaBerkasCsv("audit-log", f.rentang.dari, f.rentang.sampai));
      }
      default:
        return teks(404, "Jenis laporan tidak dikenal.");
    }
  } catch (e) {
    // Pesan galat dari lapisan data hanya memuat kode PostgREST, bukan data.
    return teks(500, e instanceof Error ? e.message : "Ekspor gagal. Coba lagi.");
  }
}

function csv(isi: string, namaBerkas: string) {
  return new Response(isi, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${namaBerkas}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function teks(status: number, pesan: string) {
  return new Response(pesan, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

const terlaluBanyak = () => teks(413, `Lebih dari ${BATAS_EKSPOR.toLocaleString("id-ID")} baris cocok dengan filter. Persempit periode lalu ekspor lagi.`);
