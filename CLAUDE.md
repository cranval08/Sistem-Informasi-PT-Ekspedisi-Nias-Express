# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Nias Express Operations Dashboard**: an operations web app for PT. Ekspedisi Nias Express (freight). `PRD.md` is the source of truth for business requirements; read the relevant section before implementing a module. Work proceeds in the phase order of PRD §18, with one commit per completed phase. Phase 1 (foundation) is done; modules not yet built render `ModulBelumTersedia` with their phase number.

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
npm run cek:env                     # validate .env.local offline; prints variable names/status only, never values
npm run seed:akun                   # create/update the 4 demo accounts (needs SUPABASE_SECRET_KEY, DEMO_PASSWORD)
```

The Supabase project is **cloud only**: no local Supabase/Docker. Never commit `.env.local`. Don't run `db:push` or `seed:akun` until the user confirms.

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
- **Role helpers:**
  - `peran_saya()` returns NULL for inactive or unregistered users, so every policy denies them.
  - Supir has no access to transaction, payment, or customer tables. Supir data must come from definer RPCs that return non-financial fields only.
- **Business values the company hasn't decided are never invented.** Capacity warning threshold, override policies, and tariffs are owner-configured in `pengaturan` or master tables. NULL means "perlu dilengkapi".

**App layer (`src/`):**
- `lib/domain/peran.ts`: the single route map (`RUTE`) with allowed roles plus the sidebar `MENU`. Every internal `page.tsx` must call `await wajibAksesRute("<key>")` from `lib/auth/sesi.ts`. The layout check alone is not enough because layouts don't re-render on client navigation.
- `src/proxy.ts` (Next 16 renamed middleware to proxy) refreshes the Supabase session and redirects to `/login` when there is no session. It does an optimistic check only.
- Next 16.4 has **Cache Components enabled**. Session-dependent segments use `export const instant = false` (see `(app)/layout.tsx`); otherwise reading cookies outside `<Suspense>` fails the build. Read `node_modules/next/dist/docs/` before using Next APIs, since they differ from older versions.
- Status labels and badge tones live in `lib/domain/status.ts`. Rupiah, `Asia/Jakarta` dates, and phone normalization live in `lib/domain/format.ts`; phone normalization mirrors SQL `normalisasi_telepon`.
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
