import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { paramTunggal } from "@/components/app/daftar";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu } from "@/lib/domain/format";
import { definisiStatus } from "@/lib/domain/status";
import { buatKlienServer } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ambilTransaksi } from "../../data";
import { ToolbarCetak } from "./toolbar-cetak";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export async function generateMetadata(props: PageProps<"/transaksi/[resi]/cetak">): Promise<Metadata> {
  const { resi } = await props.params;
  return { title: `Cetak ${decodeURIComponent(resi).toUpperCase()}` };
}

const UKURAN_HALAMAN: Record<string, string> = {
  standar: "A5 portrait; margin: 10mm",
  thermal80: "80mm auto; margin: 3mm",
  thermal58: "58mm auto; margin: 2mm",
};

export default async function HalamanCetakResi(props: PageProps<"/transaksi/[resi]/cetak">) {
  await wajibAksesRute("transaksi");
  const { resi } = await props.params;
  const sp = await props.searchParams;
  const formatMentah = paramTunggal(sp.format) ?? "standar";
  const format = formatMentah in UKURAN_HALAMAN ? formatMentah : "standar";
  const thermal = format !== "standar";

  const t = await ambilTransaksi(resi);
  if (!t) notFound();

  const pengaturan = await ambilPengaturan();
  const supabase = await buatKlienServer();
  const { data: s } = await supabase.from("pengaturan").select("nama_perusahaan, alamat, telepon").maybeSingle();
  const sisa = t.totalBiaya - t.totalDibayar;

  return (
    <>
      {/* Ukuran kertas mengikuti format yang dipilih. */}
      <style>{`@page { size: ${UKURAN_HALAMAN[format]}; }`}</style>
      <ToolbarCetak noResi={t.noResi} format={format} otomatis={paramTunggal(sp.otomatis) === "1"} />

      {t.void && (
        <p className="no-print rounded-lg bg-danger-subtle p-3 text-sm text-danger">
          Transaksi ini sudah dibatalkan. Resi tidak boleh diberikan kepada pelanggan.
        </p>
      )}

      <article
        aria-label={`Resi ${t.noResi}`}
        className={cn(
          "mx-auto bg-white text-black shadow-sm ring-1 ring-black/10 print:shadow-none print:ring-0",
          thermal ? "p-2 font-mono text-[11px] leading-snug" : "max-w-[148mm] p-6 text-sm print:max-w-none print:p-0",
          format === "thermal80" && "w-[76mm] print:w-full",
          format === "thermal58" && "w-[54mm] print:w-full",
        )}
      >
        {pengaturan.modeDemo && (
          <p className="mb-2 border border-black px-1 py-0.5 text-center text-[10px] font-bold tracking-wide uppercase">
            Data Demo — bukan resi resmi
          </p>
        )}
        {t.void && <p className="mb-2 border-2 border-black py-1 text-center font-bold uppercase">Dibatalkan</p>}

        <header className={cn("border-b border-dashed border-black pb-2", thermal ? "text-center" : "flex items-start justify-between gap-4")}>
          <div>
            <p className={cn("font-bold", thermal ? "text-xs" : "text-base")}>{s?.nama_perusahaan ?? pengaturan.namaPerusahaan}</p>
            {s?.alamat && <p className="whitespace-pre-line">{s.alamat}</p>}
            {s?.telepon && <p>Telp. {s.telepon}</p>}
          </div>
          <div className={thermal ? "mt-2" : "text-right"}>
            <p className="text-[10px] uppercase">Nomor resi</p>
            <p className={cn("font-bold tracking-wide", thermal ? "text-sm" : "text-lg")}>{t.noResi}</p>
            <p>{formatTanggalWaktu(t.waktu, pengaturan.zonaWaktu)}</p>
          </div>
        </header>

        <section className={cn("grid gap-2 border-b border-dashed border-black py-2", !thermal && "grid-cols-2")}>
          <Pihak label="Pengirim" p={t.pengirim} />
          <Pihak label="Penerima" p={t.penerima} />
        </section>

        <section className="border-b border-dashed border-black py-2">
          {thermal ? (
            <ul className="space-y-1">
              {t.detail.map((d) => (
                <li key={d.id}>
                  <p>{d.nama}</p>
                  <p className="flex justify-between gap-2">
                    <span>
                      {formatAngka(d.jumlah)} {d.satuan} × {formatRupiah(d.tarif)}
                      {d.satuan !== "kg" && ` (${formatAngka(d.berat)} kg)`}
                    </span>
                    <span>{formatRupiah(d.subtotal)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[11px] uppercase">
                  <th className="pb-1 font-semibold">Barang</th>
                  <th className="pb-1 text-right font-semibold">Berat</th>
                  <th className="pb-1 text-right font-semibold">Jumlah × tarif</th>
                  <th className="pb-1 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {t.detail.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-0.5">{d.nama}</td>
                    <td className="py-0.5 text-right tabular-nums">{formatAngka(d.berat)} kg</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {formatAngka(d.jumlah)} {d.satuan} × {formatRupiah(d.tarif)}
                    </td>
                    <td className="py-0.5 text-right tabular-nums">{formatRupiah(d.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-0.5 border-b border-dashed border-black py-2 tabular-nums">
          <Baris label="Total berat" nilai={`${formatAngka(t.totalBerat)} kg`} />
          <Baris label="Total biaya" nilai={formatRupiah(t.totalBiaya)} tebal />
          <Baris label="Dibayar" nilai={formatRupiah(t.totalDibayar)} />
          <Baris label="Sisa" nilai={formatRupiah(sisa)} />
          <Baris label="Status bayar" nilai={definisiStatus("bayar", t.statusBayar).label} tebal />
          <Baris label="Status kirim" nilai={definisiStatus("kirim", t.statusKirim).label} />
        </section>

        <footer className="pt-2 text-center text-[10px]">
          <p>Dicatat oleh {t.pencatat}</p>
          <p>Simpan resi ini. Tunjukkan nomor resi dan identitas saat pengambilan barang.</p>
        </footer>
      </article>
    </>
  );
}

function Pihak({ label, p }: { label: string; p: { nama: string; telepon: string } }) {
  return (
    <div>
      <p className="text-[10px] uppercase">{label}</p>
      <p className="font-semibold">{p.nama}</p>
      <p>{p.telepon}</p>
    </div>
  );
}

function Baris({ label, nilai, tebal }: { label: string; nilai: string; tebal?: boolean }) {
  return (
    <p className={cn("flex justify-between gap-2", tebal && "font-bold")}>
      <span>{label}</span>
      <span>{nilai}</span>
    </p>
  );
}
