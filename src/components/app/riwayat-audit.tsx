// Server Component: riwayat perubahan master data dari audit_log.
// Audit log hanya dapat dibaca Pemilik (RLS); peran lain mendapat daftar kosong.
import { History } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { LABEL_AKSI_AUDIT, ringkasPerubahan } from "@/lib/domain/audit";
import { formatTanggalWaktu } from "@/lib/domain/format";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";

export async function RiwayatAudit({
  entitas,
  entitasId,
  namaEntitas,
  zonaWaktu,
  batas = 30,
}: {
  entitas: string;
  entitasId?: string;
  /** Nama tampilan per entitas_id (mis. nama barang). */
  namaEntitas?: Record<string, string>;
  zonaWaktu: string;
  batas?: number;
}) {
  const supabase = await buatKlienServer();
  let kueri = supabase
    .from("audit_log")
    .select("id, aksi, entitas_id, detail_perubahan, alasan, waktu, data_pengguna(nama_lengkap)")
    .eq("entitas", entitas)
    .order("waktu", { ascending: false })
    .limit(batas);
  if (entitasId) kueri = kueri.eq("entitas_id", entitasId);
  const { data, error } = await kueri;

  if (error) return <EmptyState ikon={History} judul="Riwayat gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />;
  if (!data?.length) return <EmptyState ikon={History} judul="Belum ada riwayat perubahan" />;

  return (
    <ol className="divide-y rounded-lg border bg-card">
      {data.map((log) => {
        const perubahan = ringkasPerubahan(entitas, log.aksi, log.detail_perubahan);
        const pengguna = relasiTunggal(log.data_pengguna)?.nama_lengkap ?? "Sistem";
        return (
          <li key={log.id} className="space-y-1.5 p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p>
                <span className="font-medium">{LABEL_AKSI_AUDIT[log.aksi] ?? log.aksi}</span>
                {!entitasId && log.entitas_id && namaEntitas?.[log.entitas_id] && (
                  <span className="text-muted-foreground"> · {namaEntitas[log.entitas_id]}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTanggalWaktu(log.waktu, zonaWaktu)} · oleh {pengguna}
              </p>
            </div>
            {perubahan.length > 0 && (
              <ul className="space-y-0.5 text-muted-foreground">
                {perubahan.map((p) => (
                  <li key={p.label}>
                    <span className="text-foreground/80">{p.label}:</span>{" "}
                    {p.lama !== undefined ? (
                      <>
                        <del className="decoration-muted-foreground/60">{p.lama}</del> → <span className="text-foreground">{p.baru}</span>
                      </>
                    ) : (
                      <span className="text-foreground">{p.baru}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {log.alasan && <p className="text-muted-foreground">Alasan: {log.alasan}</p>}
          </li>
        );
      })}
    </ol>
  );
}
