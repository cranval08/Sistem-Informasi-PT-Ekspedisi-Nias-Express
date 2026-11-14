import "server-only";
import { cache } from "react";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";

export type ManifesLengkap = NonNullable<Awaited<ReturnType<typeof ambilManifes>>>;

/**
 * Satu manifes beserta armada, supir, resi, dan kendala. RLS membatasi
 * pembaca (Supir hanya manifes miliknya — tetapi Supir memakai RPC
 * perjalanan_saya, bukan fungsi ini, karena data transaksi tertutup baginya).
 * Hint embed memakai nama constraint FK (manifes punya beberapa FK ke
 * data_pengguna; hint nama kolom dapat ambigu → PGRST201).
 */
export const ambilManifes = cache(async (id: string) => {
  const supabase = await buatKlienServer();
  const { data: m, error } = await supabase
    .from("manifes")
    .select(
      `id_manifes, rute, status_manifes, waktu_dibuat, waktu_dimuat, waktu_berangkat, waktu_tiba, catatan, alasan_batal,
       override_kapasitas, override_kapasitas_alasan,
       armada:data_armada!manifes_id_armada_fkey(id_armada, plat_nomor, jenis_unit, kapasitas_ton, status),
       supir:data_pengguna!manifes_id_supir_fkey(nama_lengkap, nomor_telepon),
       pembuat:data_pengguna!manifes_created_by_fkey(nama_lengkap),
       pengoverride:data_pengguna!manifes_override_kapasitas_oleh_fkey(nama_lengkap),
       detail:manifes_detail!manifes_detail_id_manifes_fkey(no_resi, aktif, ditambahkan_pada,
         transaksi:data_transaksi!manifes_detail_no_resi_fkey(no_resi, total_berat_kg, status_kirim, status_bayar, override_belum_lunas,
           pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama),
           penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama))),
       kendala:kendala_perjalanan!kendala_perjalanan_id_manifes_fkey(id, jenis, deskripsi, status, waktu_lapor, diselesaikan_pada,
         pelapor:data_pengguna!kendala_perjalanan_dilaporkan_oleh_fkey(nama_lengkap),
         penyelesai:data_pengguna!kendala_perjalanan_diselesaikan_oleh_fkey(nama_lengkap))`,
    )
    .eq("id_manifes", id)
    .maybeSingle();
  // Galat query bukan "tidak ditemukan": lempar agar tidak tersamar sebagai 404.
  if (error) throw new Error(`Manifes gagal dimuat (${error.code ?? "tanpa kode"}).`);
  if (!m) return null;

  const armada = relasiTunggal(m.armada);
  return {
    id: m.id_manifes as string,
    rute: m.rute as string,
    status: m.status_manifes as string,
    waktu: { dibuat: m.waktu_dibuat, dimuat: m.waktu_dimuat, berangkat: m.waktu_berangkat, tiba: m.waktu_tiba } as Record<
      "dibuat" | "dimuat" | "berangkat" | "tiba",
      string | null
    >,
    catatan: m.catatan as string | null,
    alasanBatal: m.alasan_batal as string | null,
    override: m.override_kapasitas
      ? { alasan: m.override_kapasitas_alasan as string, oleh: relasiTunggal(m.pengoverride)?.nama_lengkap ?? "—" }
      : null,
    armada: {
      id: armada?.id_armada as string,
      plat: armada?.plat_nomor ?? "—",
      jenis: armada?.jenis_unit as string,
      kapasitasTon: Number(armada?.kapasitas_ton ?? 0),
      status: armada?.status as string,
    },
    supir: relasiTunggal(m.supir) ?? { nama_lengkap: "—", nomor_telepon: "" },
    pembuat: relasiTunggal(m.pembuat)?.nama_lengkap ?? "—",
    resi: (m.detail ?? [])
      .filter((d) => d.aktif)
      .map((d) => {
        const t = relasiTunggal(d.transaksi);
        return {
          noResi: d.no_resi as string,
          berat: t ? String(t.total_berat_kg) : "0",
          statusKirim: (t?.status_kirim ?? "") as string,
          statusBayar: (t?.status_bayar ?? "") as string,
          override: !!t?.override_belum_lunas,
          pengirim: relasiTunggal(t?.pengirim)?.nama ?? "—",
          penerima: relasiTunggal(t?.penerima)?.nama ?? "—",
        };
      })
      .sort((a, b) => a.noResi.localeCompare(b.noResi)),
    kendala: (m.kendala ?? [])
      .map((k) => ({
        id: k.id as string,
        jenis: k.jenis as string,
        deskripsi: k.deskripsi as string,
        status: k.status as string,
        waktu: k.waktu_lapor as string,
        selesaiPada: k.diselesaikan_pada as string | null,
        pelapor: relasiTunggal(k.pelapor)?.nama_lengkap ?? "—",
        penyelesai: relasiTunggal(k.penyelesai)?.nama_lengkap ?? null,
      }))
      .sort((a, b) => b.waktu.localeCompare(a.waktu)),
  };
});

/** Ambang peringatan kapasitas dari pengaturan (NULL = belum diatur) dan kebijakan override. */
export const ambilKebijakanKapasitas = cache(async () => {
  const supabase = await buatKlienServer();
  const { data } = await supabase
    .from("pengaturan")
    .select("ambang_peringatan_kapasitas_persen, izinkan_override_kapasitas, izinkan_override_belum_lunas")
    .maybeSingle();
  return {
    ambang: data?.ambang_peringatan_kapasitas_persen == null ? null : Number(data.ambang_peringatan_kapasitas_persen),
    overrideKapasitas: !!data?.izinkan_override_kapasitas,
    overrideBelumLunas: !!data?.izinkan_override_belum_lunas,
  };
});
