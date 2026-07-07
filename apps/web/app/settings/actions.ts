"use server";

// Server Action für /settings: Overrides speichern und alles neu berechnen.
import { revalidatePath } from "next/cache";
import { saveSettingOverrides, type WeightOverrides, type FilterOverrides } from "@/lib/settings";
import { rescoreAll } from "@/lib/rescore";

export interface SaveSettingsResult {
  ok: boolean;
  rescored?: number;
  dropped?: number;
  revived?: number;
  error?: string;
}

export async function saveSettings(
  weights: WeightOverrides,
  filters: FilterOverrides,
): Promise<SaveSettingsResult> {
  try {
    await saveSettingOverrides("weights", weights);
    await saveSettingOverrides("filters", filters);
    const r = await rescoreAll();
    revalidatePath("/", "layout"); // alle Listen/Detailseiten mit neuen Scores
    return { ok: true, rescored: r.rescored, dropped: r.dropped, revived: r.revived };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
