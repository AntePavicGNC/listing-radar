// Index Oglasi Scraper — index.hr/oglasi ist eine React-SPA; die Suchergebnisse
// kommen über die interne API (…/oglasi/api/aditem/widget-search). Statt die
// API-Parameter nachzubauen, lädt der Actor die Suchseite in Playwright und
// greift die JSON-Antworten der App direkt ab (robust gegen Param-Änderungen).
import { Actor, log } from "apify";
import { PlaywrightCrawler, type Request } from "crawlee";

interface Input {
  startUrls: { url: string }[];
  maxItems?: number;
  maxScrollRounds?: number;
  proxyConfiguration?: Parameters<typeof Actor.createProxyConfiguration>[0];
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? { startUrls: [] };
const maxItems = input.maxItems ?? 200;
const maxScrollRounds = input.maxScrollRounds ?? 12;

const proxyConfiguration = input.proxyConfiguration
  ? await Actor.createProxyConfiguration(input.proxyConfiguration)
  : undefined;

const seenIds = new Set<string>();
let pushed = 0;

/** Kandidaten-Arrays mit Inseraten aus beliebig verschachtelten API-Antworten ziehen. */
function extractAds(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const el of node) visit(el);
      return;
    }
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      // Ein Inserat erkennen wir an id + (title|price)-artigen Feldern
      const hasId = o.id != null || o.adId != null;
      const hasTitle = typeof o.title === "string" || typeof o.name === "string";
      const hasPrice = o.price != null || o.priceEur != null || o.amount != null;
      if (hasId && hasTitle && hasPrice) {
        out.push(o);
        return; // nicht weiter in ein erkanntes Inserat absteigen
      }
      for (const v of Object.values(o)) visit(v);
    }
  };
  visit(payload);
  return out;
}

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxConcurrency: 2,
  requestHandlerTimeoutSecs: 300,
  navigationTimeoutSecs: 90,
  headless: true,

  async requestHandler({ page, request }: { page: any; request: Request }) {
    log.info(`Öffne Suche: ${request.url}`);
    const collected: Record<string, unknown>[] = [];
    const apiUrls = new Set<string>();
    // Location-Datasource (id -> Name) mitschneiden: Inserate referenzieren Orte nur per UUID
    const locationNames = new Map<string, string>();

    const harvestLocations = (node: unknown) => {
      if (Array.isArray(node)) {
        for (const el of node) harvestLocations(el);
        return;
      }
      if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        if (typeof o.id === "string" && (typeof o.name === "string" || typeof o.title === "string")) {
          locationNames.set(o.id, String(o.name ?? o.title));
        }
        for (const v of Object.values(o)) harvestLocations(v);
      }
    };

    // ALLE API-Antworten der SPA abgreifen (Endpoint-Namen können sich ändern)
    page.on("response", async (res: any) => {
      const url = res.url();
      if (!/\/oglasi\/api\//.test(url)) return;
      try {
        const json = await res.json();
        if (/configuration\/datasource\/location/.test(url)) {
          harvestLocations(json);
          log.info(`  Location-Datasource: ${locationNames.size} Orte aufgelöst`);
          return;
        }
        const ads = extractAds(json);
        const short = url.replace(/^https?:\/\/[^/]+/, "").slice(0, 110);
        if (!apiUrls.has(short)) {
          apiUrls.add(short);
          log.info(`  API: ${short} -> ${ads.length} Inserate`);
        }
        if (ads.length > 0) {
          collected.push(...ads);
        }
      } catch {
        /* keine JSON-Antwort */
      }
    });

    await page.goto(request.url, { waitUntil: "networkidle" }).catch(() => {});
    // Cookie-/Consent-Banner wegklicken, falls vorhanden
    for (const sel of ['button:has-text("Prihvaćam")', 'button:has-text("Slažem se")', '[id*="accept"]']) {
      await page.locator(sel).first().click({ timeout: 2500 }).catch(() => {});
    }
    await page.waitForTimeout(2500);

    // Paginierung: scrollen (Infinite Scroll) und ggf. "weiter"-Buttons klicken
    for (let round = 0; round < maxScrollRounds; round++) {
      if (pushed + collected.length >= maxItems) break;
      const before = collected.length;
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1500);
      const nextBtn = page
        .locator('a[rel="next"], button[aria-label*="ljede"], li.next a, [class*="pagination"] a[class*="next"]')
        .first();
      if ((await nextBtn.count()) > 0) {
        await nextBtn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      if (collected.length === before && round >= 2) break; // nichts Neues mehr
    }

    // Dedupe + pushen (Orts-UUIDs zu Namen auflösen, soweit Datasource geladen wurde)
    let fresh = 0;
    for (const ad of collected) {
      const id = String(ad.id ?? ad.adId ?? "");
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      if (pushed >= maxItems) break;
      const _locationNames = ["settlementId", "cityId", "countyId"]
        .map((k) => locationNames.get(String(ad[k] ?? "")))
        .filter(Boolean);
      await Actor.pushData({
        ...ad,
        _locationNames,
        _searchUrl: request.url,
        _scrapedAt: new Date().toISOString(),
      });
      pushed++;
      fresh++;
    }
    log.info(`Fertig ${request.url}: ${fresh} neue Inserate (gesamt ${pushed})`);
    if (fresh === 0) {
      const title = await page.title().catch(() => "?");
      const h1 = await page.locator("h1").first().textContent({ timeout: 2000 }).catch(() => "?");
      log.warning(
        `Keine Inserate abgegriffen. Seitentitel="${title}" h1="${h1}" | gesehene API-Endpoints: ${[...apiUrls].join(" ; ").slice(0, 600) || "(keine)"}`,
      );
    }
  },
});

await crawler.run(input.startUrls.map((s) => s.url));
log.info(`🏁 Fertig. ${pushed} Inserate gespeichert.`);
await Actor.exit();
