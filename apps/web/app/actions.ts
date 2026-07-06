"use server";

// Server Actions (Next 16): User-Flags + manueller Score-Override (SPEC §9/§11).
// Flags gelten gemeinsam für alle Nutzer (SPEC §2), kein Auth nötig (bewusst ohne Login).
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const FLAG_FIELDS = ["favorite", "hidden", "seen"] as const;
type FlagField = (typeof FLAG_FIELDS)[number];

function revalidateListingPaths(listingId: string) {
  revalidatePath("/houses");
  revalidatePath("/land");
  revalidatePath("/cars");
  revalidatePath("/compare");
  revalidatePath(`/listing/${listingId}`);
}

/** Flag (Favorit/raus/gesehen) umschalten — upsert in eigener Tabelle, übersteht Re-Imports. */
export async function toggleFlag(listingId: string, field: FlagField) {
  if (!FLAG_FIELDS.includes(field)) throw new Error("Ungültiges Flag");
  const existing = await prisma.userFlag.findUnique({ where: { listingId } });
  const next = !(existing?.[field] ?? false);
  await prisma.userFlag.upsert({
    where: { listingId },
    create: { listingId, [field]: next },
    update: { [field]: next },
  });
  revalidateListingPaths(listingId);
  return next;
}

/** Manuellen Score setzen/entfernen. Überschreibt die Anzeige, berechneter Score bleibt erhalten. */
export async function setScoreOverride(formData: FormData) {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) throw new Error("listingId fehlt");

  const rawValue = String(formData.get("scoreOverride") ?? "").trim();
  const note = String(formData.get("scoreOverrideNote") ?? "").trim();

  if (rawValue === "") {
    // Leeres Feld = Override entfernen
    await prisma.listing.update({
      where: { id: listingId },
      data: { scoreOverride: null, scoreOverrideNote: null },
    });
  } else {
    const value = Math.max(0, Math.min(100, Math.round(Number(rawValue))));
    if (!Number.isFinite(value)) throw new Error("Ungültiger Score");
    await prisma.listing.update({
      where: { id: listingId },
      data: { scoreOverride: value, scoreOverrideNote: note || null },
    });
  }
  revalidateListingPaths(listingId);
}
