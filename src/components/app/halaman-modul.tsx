import { PageHeader } from "@/components/app/page-header";
import { ModulBelumTersedia } from "@/components/app/states";
import { wajibAksesRute } from "@/lib/auth/sesi";
import { RUTE, type KunciRute } from "@/lib/domain/peran";

/**
 * Halaman modul yang belum diimplementasikan. Hak akses sudah ditegakkan
 * di server; isi halaman menyatakan dengan jujur bahwa modul belum siap.
 */
export async function HalamanModul({ rute, fase }: { rute: KunciRute; fase: number }) {
  await wajibAksesRute(rute);
  return (
    <>
      <PageHeader judul={RUTE[rute].judul} />
      <ModulBelumTersedia fase={fase} />
    </>
  );
}
