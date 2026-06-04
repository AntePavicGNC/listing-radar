import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: Die DB-URL für CLI-Befehle (migrate, db pull, studio) steht jetzt hier,
// nicht mehr in schema.prisma. Für Supabase nutzen Migrationen die DIREKTE
// Verbindung (Port 5432) -> DIRECT_URL. Zur Laufzeit verbindet der App-Client
// dagegen über den pg-Driver-Adapter mit der gepoolten DATABASE_URL (siehe lib/prisma.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
