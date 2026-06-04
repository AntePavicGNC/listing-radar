// lib/apify.ts — dünner Apify-Wrapper (SPEC §7): Runs triggern + Datasets lesen.
import { ApifyClient } from "apify-client";

function getClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN ist nicht gesetzt.");
  return new ApifyClient({ token });
}

/** Startet einen Actor-Run und wartet auf das Ergebnis (u. a. defaultDatasetId). */
export async function triggerActor(actorId: string, input: Record<string, unknown>) {
  return getClient().actor(actorId).call(input);
}

/** Liest ALLE Items eines Datasets (paginiert). */
export async function getDatasetItems<T = Record<string, unknown>>(
  datasetId: string,
): Promise<T[]> {
  const client = getClient();
  const items: T[] = [];
  const limit = 1000;
  let offset = 0;
  for (;;) {
    const page = await client.dataset(datasetId).listItems({ offset, limit, clean: true });
    items.push(...(page.items as T[]));
    if (page.items.length < limit) break;
    offset += limit;
  }
  return items;
}
