# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Nias Express Operations Dashboard**: an operations web app for PT. Ekspedisi Nias Express (freight). `PRD.md` is the source of truth for business requirements; read the relevant section before implementing a module. Work proceeds in the phase order of PRD §18, with one commit per completed phase. Phases 1 (foundation), 2 (core data: pelanggan, item/tarif, armada, pengguna, pengaturan), 3 (transactions, receipt numbers, receipt printing), 4 (payments, rekap kas), and 5 (manifes, capacity, shipment status, pickup, Supir trips, public tracking) are done; modules not yet built render `ModulBelumTersedia` with their phase number.

@AGENTS.md

## Commands

```bash
npm run dev                         # dev server
npm test                            # all Vitest tests (DB tests run in PGlite, no cloud/Docker)
npx vitest run tests/db/rls.test.ts # single file
npx vitest run -t "Supir"           # tests matching a name
npm run typecheck                   # next typegen + tsc (route types like PageProps need typegen)
npm run lint
npm run build
npm run check                       # typecheck + lint + test + build — run before declaring work done
npm run db:push                     # apply supabase/migrations to the linked cloud project (CLI v3 needs --remote; script includes it)
npm run verifikasi:remote           # read-only check of the cloud DB (tables, settings, demo accounts, anon denial)
npm run test:remote                 # RLS smoke tests against cloud as the 4 demo accounts (skipped by `npm test`)
npm run test:halaman                # with `npm run dev` running: every route × every role → 200 or /akses-ditolak (UJI_APP_URL to override port)
npm run cek:env                     # validate .env.local offline; prints variable names/status only, never values
npm run seed:akun                   # create/update the 4 demo accounts (needs SUPABASE_SECRET_KEY, DEMO_PASSWORD)
npm run seed:demo                   # demo data: [Demo] customers, example tariffs/capacities, armada, and transactions (created via buat_transaksi as Demo Admin); skips existing rows
```

The Supabase project is **cloud only**: no local Supabase/Docker. Never commit `.env.local`. Don't run `db:push`, `seed:akun`, or `seed:demo` until the user confirms.

**Keys** use the new Supabase format. Every read goes through `src/lib/supabase/env.ts`; never read `process.env` for keys anywhere else.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) is the public key. The old name `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still accepted as a fallback.
- `SUPABASE_SECRET_KEY` (`sb_secret_…`) is server-only. The old name `SUPABASE_SERVICE_ROLE_KEY` is still accepted as a fallback.
- The secret key is used only in `scripts/` and `src/lib/supabase/admin.ts` (`server-only`).
- `env.ts` throws if a secret key appears in any `NEXT_PUBLIC_*` variable or if a publishable key is placed in the secret variable.
- Error messages and logs may name variables, never print their values.

## Architecture

**Business rules live in Postgres, not JS.** `supabase/migrations/` holds the full schema (`…0100`), functions and triggers (`…0200`), and RLS (`…0300`). Add new rules as new migration files; never edit applied ones.

- **Master tables** (`data_pelanggan`, `data_item`, `data_armada`, `data_pengguna`, `pengaturan`): clients write directly, gated by RLS policies. A generic audit trigger (`trg_audit_perubahan`) logs every change.
- **Transactional tables** (`data_transaksi`, `detail_transaksi`, `pembayaran`, `manifes*`, `riwayat_*`, `audit_log`): `authenticated` has SELECT only. Writes must go through `SECURITY DEFINER` RPC functions with `set search_path = ''`. Those functions call `wajib_peran(...)`, validate inputs, and call `catat_audit(...)`; `catat_audit` cannot be called by clients.
- **Invariants enforced by triggers and constraints regardless of caller:**
  - Server timestamps.
  - Status order `diterima_loket → … → sudah_diambil`. Going backward requires setting `app.koreksi_status = 'on'` in the transaction.
  - Every status change is logged to `riwayat_status_pengiriman`.
  - `total_dibayar` is recomputed from valid payments under a row lock; `status_bayar` is a generated column.
  - No hard deletes on transactions and payments.
  - `audit_log` is immutable.
  - At least one active Pemilik must always exist.
  - One active manifest per truck; one active manifest per receipt number.
  - Optional status-change notes come from `app.catatan_status`.
- **Phase 2 rules (`…0400`):** `data_armada.status` is not client-writable; it changes only via `ubah_status_armada` (Pemilik; notes required for perbaikan/rusak; `perjalanan` is set by manifests). Users can't deactivate or change the role of their own account; a supir still assigned to an active armada can't be deactivated or re-roled. New accounts: server action creates the Auth user with the secret key, then calls `daftarkan_pengguna` with the Pemilik's session so the audit log records the actor.
- **Phase 3 rules (`…0500`):** transactions are created only by `buat_transaksi` (Pemilik/Admin Loket): one DB transaction that validates every row, generates the receipt via internal `buat_nomor_resi()` (`penghitung_resi` upsert, per Jakarta date), snapshots tariffs, records the optional initial payment, and audits. `jumlah` is derived, not entered: kg = berat, ton = round(berat/1000, 3), koli = integer count (`jumlah_satuan`). A possible duplicate (same sender + recipient + Jakarta date + total weight, not void) raises SQLSTATE `NX001` with the matching receipts in HINT; the caller retries with `p_konfirmasi_duplikat = true`, which is audited. `batalkan_transaksi` (Pemilik, reason required) voids only `diterima_loket` transactions with no valid payment and no active manifest.
- **Phase 4 rules (`…0600`):** payments are written only by `catat_pembayaran` (Pemilik/Admin Loket; integer > 0 and ≤ remaining balance, locks the transaction row; rejects void or already-paid transactions) and corrected only by `batalkan_pembayaran` (Pemilik only, reason required; marks the row `dibatalkan`, never deletes). A Rp0 initial payment means "unpaid" and creates no row. `rekap_kas(dari, sampai)` aggregates valid vs. cancelled payments per Jakarta date × recorder (max 1 year). Date-range filters use `rentangDariParam`/`FilterRentang` in `components/app/daftar.tsx` and `awalHariIso` for timestamptz bounds.
- **Phase 5 rules (`…0700`):** manifests are written only by RPCs: `buat_manifes` (Pemilik/Gudang; armada active + Siaga + no active manifest; supir active + no active manifest, also a partial unique index), `tambah_resi_manifes`/`lepas_resi_manifes` (Draf only; resi must be `diterima_loket`, not void, and lunas or `override_belum_lunas`), `konfirmasi_muat` (Draf → Dimuat; re-checks every resi; blocks when Σ`total_berat_kg` > `kapasitas_ton`×1000 unless Pemilik + `izinkan_override_kapasitas` + reason), `konfirmasi_berangkat` (→ resi `dalam_perjalanan`, armada `perjalanan`; re-checks capacity) and `konfirmasi_tiba` (→ resi `tiba`, armada `siaga`) — Supir may call both for own manifests only, `pindahkan_resi`/`batalkan_manifes` (before departure; Dimuat resi are corrected back via `app.koreksi_status`), `override_belum_lunas` (Pemilik, `izinkan_override_belum_lunas`, reason), `konfirmasi_pengambilan` (`tiba` only, `p_identitas_terverifikasi` must be true, and since `…0800` the resi must be lunas — no override; `override_belum_lunas` covers loading only), `laporkan_kendala`/`selesaikan_kendala`. Equal to capacity is allowed. Supir data comes from `perjalanan_saya()`/`muatan_perjalanan()`. Public tracking is `lacak_resi()` (anon; resi/status/waktu only; empty unless `pengaturan.pelacakan_publik_aktif`). UI capacity math is `lib/domain/manifes.ts` (integer grams), cross-checked in `tests/db/fase5.test.ts`.
- **Role helpers:**
  - `peran_saya()` returns NULL for inactive or unregistered users, so every policy denies them.
  - Supir has no access to transaction, payment, or customer tables. Supir data must come from definer RPCs that return non-financial fields only.
- **Business values the company hasn't decided are never invented.** Capacity warning threshold, override policies, and tariffs are owner-configured in `pengaturan` or master tables. NULL means "perlu dilengkapi".

**App layer (`src/`):**
- `lib/domain/peran.ts`: the single route map (`RUTE`) with allowed roles plus the sidebar `MENU`. Every internal `page.tsx` must call `await wajibAksesRute("<key>")` from `lib/auth/sesi.ts`. The layout check alone is not enough because layouts don't re-render on client navigation.
- `src/proxy.ts` (Next 16 renamed middleware to proxy) refreshes the Supabase session and redirects to `/login` when there is no session. It does an optimistic check only.
- Next 16.4 has **Cache Components enabled**. Session-dependent segments use `export const instant = false` on the layout **and on every `(app)` page** (the layout flag doesn't cover navigations between sibling pages); otherwise reading cookies outside `<Suspense>` fails the build. `buatKlienServer()` calls `await connection()` after `cookies()` because supabase-js reads `Date.now()`; without both, dev logs `blocking-prerender-current-time` / `blocking-prerender-dynamic` on every route. Those dev warnings go to the dev console, not only `.next/dev/logs`, so check both. Read `node_modules/next/dist/docs/` before using Next APIs, since they differ from older versions.
- **Forms & server actions:** Zod schemas in `lib/domain/skema.ts` are shared by client forms and server actions. Each module keeps `"use server"` actions in `aksi.ts`; every action calls `profilUntukAksi(...)` (actions are reachable by direct POST), returns `HasilAksi` from `lib/aksi/hasil.ts` (`gagalDb` maps Postgres errors to Indonesian messages), and calls `refresh()` from `next/cache` after writing. Client forms use `DialogForm`/`useKirimForm` (`components/app/form/dialog-form.tsx`), which submit via `onSubmit` instead of `<form action>` so fields aren't reset when the server rejects. List pages use URL search params with `components/app/daftar.tsx` (search, filter links, pagination).
- **Money math in the UI** (`lib/domain/transaksi.ts`) uses integer milli-units and BigInt so the live preview matches Postgres exactly; `tests/db/fase3.test.ts` cross-checks it against `jumlah_satuan`. Tables with several FKs to the same table need embed hints by FK constraint name, e.g. `pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama)` (column-name hints like `!id_pengguna` are ambiguous → PGRST201). Never turn a query error into `notFound()`.
- PostgREST many-to-one embeds are typed as arrays without generated DB types; read them with `relasiTunggal()` from `lib/supabase/relasi.ts`.
- Status labels and badge tones live in `lib/domain/status.ts`. Rupiah, `Asia/Jakarta` dates, and phone normalization live in `lib/domain/format.ts`; phone normalization mirrors SQL `normalisasi_telepon`.
- **Server → client boundary:**
  - Server Components cannot pass functions to Client Components, and lucide icon components count as functions.
  - Keep components that take an `ikon` prop or that are rendered from server pages free of `"use client"`; `components/app/states.tsx` is the example.
  - Put interactive pieces in their own client file, as with `error-state.tsx`.
  - `npm run build` does not render dynamic pages, so after UI changes run `npm run test:halaman` against `npm run dev`.
- Design tokens are in `src/app/globals.css`: navy sidebar, blue primary, and semantic `success/warning/danger/info/neutral` with `-subtle` variants. Reusable components are in `components/app/`; `/sistem-desain` (Pemilik only) previews them.

**DB tests:** `tests/db/harness.ts` boots PGlite, adds a shim for Supabase's `auth.uid()` and the `anon`/`authenticated` roles, applies all migrations, and loads a fixture. `sebagai(db, "supir", tx => …)` runs queries as a role. Cover every new RPC or rule there, mapped to the PRD §15 scenarios.

## Non-negotiable domain rules

- All UI text is in Bahasa Indonesia. Use Rupiah `id-ID`/`IDR` and dates in `Asia/Jakarta`.
- Never invent business values; seed and demo data must be labeled **Data Demo** and use fictitious names and phone numbers.
- Don't fake integrations (GPS, WhatsApp, payment gateway, Sheets, Bluetooth printer), and don't call anything "real-time" unless it is.
- RBAC is enforced in the backend (RLS and RPC), not just by hiding UI.
- The transaction is the single source of truth. Don't make users enter the same data twice.
- `total_biaya = Σ jumlah × tarif_saat_transaksi`, where `jumlah` is in the item's unit. `berat_kg` is always required for tonnage.
- Payments are integers ≥ 0 and their cumulative total can never exceed `total_biaya`.
- Duplicate warning on sender + recipient + date + weight; the user must confirm.
- Unpaid transactions and overloaded trucks are blocked by default. Only Pemilik can override, only when `pengaturan` allows it, and the override requires a reason and an audit-log entry.
- `sudah_diambil` requires explicit identity verification.
- The public tracking page shows only receipt number, status, and time.
- Approved defaults:
  - Receipt format `PREFIX-YYYYMMDD-NNNN`, prefix `NX` (configurable).
  - Email + password login.
  - Phones stored as `08xx`.
  - Route is free text on the manifest.
