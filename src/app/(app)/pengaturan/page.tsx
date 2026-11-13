import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatTanggalWaktu } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";
import { FormPengaturan } from "./form-pengaturan";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function HalamanPengaturan() {
  await wajibAksesRute("pengaturan");
  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();
  const { data, error } = await supabase
    .from("pengaturan")
    .select(
      "nama_perusahaan, alamat, telepon, prefiks_resi, ambang_peringatan_kapasitas_persen, izinkan_override_kapasitas, izinkan_override_belum_lunas, mode_demo, updated_at",
    )
    .eq("id", 1)
    .maybeSingle();

  // Contoh resi hari ini (tanggal operasional), hanya untuk ilustrasi format.
  const tanggal = new Intl.DateTimeFormat("en-CA", { timeZone: zonaWaktu, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replaceAll("-", "");

  return (
    <>
      <PageHeader
        judul="Pengaturan"
        deskripsi={
          data ? `Konfigurasi perusahaan. Terakhir diubah ${formatTanggalWaktu(data.updated_at, zonaWaktu)}.` : "Konfigurasi perusahaan."
        }
      />
      {error || !data ? (
        <EmptyState judul="Pengaturan gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : (
        <div className="max-w-3xl">
          <FormPengaturan
            awal={{
              ...data,
              ambang_peringatan_kapasitas_persen:
                data.ambang_peringatan_kapasitas_persen == null ? null : Number(data.ambang_peringatan_kapasitas_persen),
            }}
            contohResi={`${data.prefiks_resi}-${tanggal}-0001`}
          />
        </div>
      )}
    </>
  );
}
