# Listing Radar

Private App zum Scrapen, Vereinheitlichen und Vergleichen von Inseraten in drei Ansichten:
**Häuser** und **Grundstücke** (Umgebung Zadar) sowie **Autos** (Deutschland).
Datenfluss: Apify-Actors → Webhook → App (normalisiert, dedupt, scort, KI) → Postgres → Frontend.
Die App scrapt selbst nicht. Vollständige Spezifikation: [SPEC.md](./SPEC.md).

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**, **Tailwind v4** + **shadcn/ui**
- **Prisma 7** (Driver-Adapter `@prisma/adapter-pg`) auf **Supabase** (Postgres)
- **Anthropic SDK** für KI-Bildbewertung & Auto-Recherche (ab M8)
- Deploy auf **Vercel**, Zugriff per unlisted URL (bewusst ohne Login, siehe SPEC §2)

## Struktur (Monorepo, npm workspaces)

```
apps/web/
  app/        # Seiten + Route Handler (/api/health, /api/ingest; später /api/enrich)
  lib/        # prisma.ts, apify.ts, config.ts, normalize/, score.ts; später ai/
  prisma/     # schema.prisma (Datenmodell)
actors/       # eigener Index-Oglasi-Crawlee-Actor (ab M6)
```

## Lokale Entwicklung

1. `npm install` (im Repo-Root)
2. `apps/web/.env` anlegen — Vorlage: [.env.example](./.env.example)
3. `npm run dev` → http://localhost:3000 (kein Login)
4. DB-Status prüfen: `GET /api/health` → `{"db":"ok"}`

> **Sonderzeichen im DB-Passwort** in den Verbindungs-URLs **prozent-kodieren** (`$`→`%24`, `!`→`%21`).

## Environment-Variablen

Siehe [.env.example](./.env.example). Lokal in `apps/web/.env`, auf Vercel als Project Environment Variables:

| Variable | Zweck |
| --- | --- |
| `DATABASE_URL` | Supabase Transaction Pooler (6543) — App-Laufzeit |
| `DIRECT_URL` | Supabase Session Pooler (5432) — Prisma-Migrationen / `db push` |
| `INGEST_SECRET` | Schutz für `POST /api/ingest` (ab M3) |
| `APIFY_TOKEN` | Apify-Runs & Datasets (ab M3) |
| `ANTHROPIC_API_KEY` | KI-Features (ab M8) |
| `NEXT_PUBLIC_APP_URL` | öffentliche App-URL |

## Datenbank

Prisma-Schema in [apps/web/prisma/schema.prisma](./apps/web/prisma/schema.prisma).
Schema anwenden: `cd apps/web && npx prisma db push`. Client: `npx prisma generate` (läuft auch via `postinstall`/`build`).

## Vercel-Deploy (GitHub-Import → Auto-Deploys)

1. https://vercel.com/new → Repo importieren.
2. **Root Directory = `apps/web`** (wichtig im Monorepo).
3. Environment Variables setzen (siehe Tabelle; Werte aus `apps/web/.env`).
4. **Deploy.** Buildbefehl ist `prisma generate && next build`.

## Meilensteine

Siehe [SPEC.md](./SPEC.md) §13. Stand: **M1 (Fundament) ✓**, **M2 (Datenmodell) ✓**. Nächster: **M3 (Apify-Ingest)** — benötigt `APIFY_TOKEN`.
