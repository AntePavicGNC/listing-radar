import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 verbindet zur Laufzeit über einen Driver-Adapter (kein Connection-String
// im Konstruktor mehr). Wir nutzen den pg-Adapter mit der gepoolten DATABASE_URL.
// Singleton, damit Next.js' Hot-Reload nicht bei jedem Request neue Pools öffnet.

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  // Wir parsen DATABASE_URL selbst und übergeben EXPLIZITE Felder an den Adapter.
  // Grund: @prisma/adapter-pg dekodiert prozent-kodierte Passwörter (z. B. %24 -> $)
  // im connectionString NICHT zuverlässig — explizite Felder umgehen das.
  // (|| statt ?? fängt auch den leeren String beim Build ohne gesetzte URL ab.)
  const u = new URL(process.env.DATABASE_URL || "postgresql://localhost:5432/postgres");
  const adapter = new PrismaPg({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres",
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
