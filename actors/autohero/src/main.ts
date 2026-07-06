// AutoHero Scraper — die Suchseite lädt Fahrzeuge CLIENTSEITIG per GraphQL
// (der SSR-Apollo-State enthält nur Feature-Flags/CMS). Deshalb Playwright:
// Seite laden, alle GraphQL-/API-JSON-Antworten abgreifen, Fahrzeug-Objekte
// generisch extrahieren. Paginierung über ?page=N.
import { Actor, log } from "apify";
import { PlaywrightCrawler, type Request } from "crawlee";

interface Input {
  startUrls: { url: string }[];
  maxItems?: number;
  maxPages?: number;
  proxyConfiguration?: Parameters<typeof Actor.createProxyConfiguration>[0];
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? { startUrls: [] };
const maxItems = input.maxItems ?? 150;
const maxPages = input.maxPages ?? 8;

const proxyConfiguration = input.proxyConfiguration
  ? await Actor.createProxyConfiguration(input.proxyConfiguration)
  : undefined;

const seenIds = new Set<string>();
let pushed = 0;

/** Fahrzeug-artige Objekte aus beliebigem JSON ziehen (id + preis- und km-artige Felder). */
function extractVehicles(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const el of node) visit(el);
      return;
    }
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      const keys = Object.keys(o).map((k) => k.toLowerCase());
      const hasId = o.id != null || o.adId != null || o.stockNumber != null;
      const hasPrice = keys.some((k) => k.includes("price"));
      const hasMileage = keys.some((k) => k.includes("mileage") || k.includes("km"));
      const hasMake = keys.some(
        (k) => k.includes("manufacturer") || k === "make" || k.includes("model") || k.includes("title"),
      );
      if (hasId && hasPrice && hasMileage && hasMake && keys.length > 6) {
        out.push(o);
        return;
      }
      for (const v of Object.values(o)) visit(v);
    }
  };
  visit(payload);
  return out;
}

function pageUrl(base: string, page: number): string {
  const u = new URL(base);
  u.searchParams.set("page", String(page));
  return u.toString();
}

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxConcurrency: 2,
  requestHandlerTimeoutSecs: 300,
  navigationTimeoutSecs: 90,
  headless: true,

  async requestHandler({ page, request, crawler: c }: { page: any; request: Request; crawler: any }) {
    const { pageNo = 1, searchUrl } = request.userData as { pageNo?: number; searchUrl?: string };
    log.info(`Öffne Suche (Seite ${pageNo}): ${request.url}`);
    const collected: Record<string, unknown>[] = [];
    const apiUrls = new Set<string>();

    page.on("response", async (res: any) => {
      const url: string = res.url();
      const isApi = /graphql|\/api\/|searchv2|search-service/i.test(url);
      if (!isApi) return;
      try {
        const json = await res.json();
        const vehicles = extractVehicles(json);
        const short = url.replace(/^https?:\/\//, "").slice(0, 110);
        if (!apiUrls.has(short)) {
          apiUrls.add(short);
          log.info(`  API: ${short} -> ${vehicles.length} Fahrzeuge`);
        }
        if (vehicles.length > 0) collected.push(...vehicles);
      } catch {
        /* keine JSON-Antwort */
      }
    });

    await page.goto(request.url, { waitUntil: "networkidle" }).catch(() => {});
    for (const sel of ['button:has-text("Akzeptieren")', 'button:has-text("Alle akzeptieren")', '#uc-btn-accept-banner']) {
      await page.locator(sel).first().click({ timeout: 2500 }).catch(() => {});
    }
    await page.waitForTimeout(4000);
    // Scrollen, um Lazy-Loading auszulösen
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 3500);
      await page.waitForTimeout(1200);
    }

    const title = await page.title().catch(() => "?");
    log.info(`Seitentitel: "${title}" | API-Endpoints gesehen: ${apiUrls.size}`);

    let fresh = 0;
    for (const v of collected) {
      const id = String(v.id ?? v.adId ?? v.stockNumber ?? "");
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      if (pushed >= maxItems) break;
      await Actor.pushData({ ...v, _searchUrl: request.url, _scrapedAt: new Date().toISOString() });
      pushed++;
      fresh++;
    }
    log.info(`Seite ${pageNo}: ${fresh} neue Fahrzeuge (gesamt ${pushed})`);

    const base = searchUrl ?? request.url;
    if (fresh > 0 && pageNo < maxPages && pushed < maxItems) {
      await c.addRequests([
        { url: pageUrl(base, pageNo + 1), userData: { pageNo: pageNo + 1, searchUrl: base }, uniqueKey: `${base}#p${pageNo + 1}` },
      ]);
    }
    if (fresh === 0) {
      log.warning("Keine Fahrzeuge extrahiert — gesehene API-Endpoints: " + [...apiUrls].join(" ; ").slice(0, 500));
    }
  },
});

await crawler.run(
  input.startUrls.map((s) => ({ url: s.url, userData: { pageNo: 1, searchUrl: s.url } })),
);
log.info(`🏁 Fertig. ${pushed} Fahrzeuge gespeichert.`);
await Actor.exit();
