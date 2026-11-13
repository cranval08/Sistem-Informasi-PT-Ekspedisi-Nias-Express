import { beforeAll, describe, expect, it } from "vitest";
import { buatDb, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await buatDb();
});

describe("migrasi", () => {
  it("seluruh migrasi berjalan dan RLS aktif di semua tabel public", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1`);
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("pengaturan awal tidak mengarang nilai bisnis", async () => {
    const { rows } = await db.query<Record<string, unknown>>("select * from public.pengaturan");
    expect(rows).toHaveLength(1);
    expect(rows[0].ambang_peringatan_kapasitas_persen).toBeNull();
    expect(rows[0].izinkan_override_kapasitas).toBe(false);
    expect(rows[0].izinkan_override_belum_lunas).toBe(false);
    expect(rows[0].mode_demo).toBe(true);
  });
});
