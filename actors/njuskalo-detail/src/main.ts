// Njuskalo Detail Scraper — besucht einzelne Inserats-Detailseiten und zieht,
// was die Such-API nicht liefert: ALLE Bilder, die "Osnovni podaci"-Tabelle
// (Baujahr, Zimmer, Etagen, Flächen, Heizung …), Ausstattungslisten und die
// volle Beschreibung. Extraktion bewusst generisch (dt/dd-Paare + JSON-LD),
// damit Markup-Umbauten den Actor nicht sofort brechen.
import { Actor, log } from "apify";
import { PlaywrightCrawler, type Request } from "crawlee";

interface Input {
  queueUrl?: string;
  startUrls?: { url: string }[];
  maxItems?: number;
  proxyConfiguration?: Parameters<typeof Actor.createProxyConfiguration>[0];
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? {};
const maxItems = input.maxItems ?? 100;

// Zu besuchende URLs: direkt aus dem Input und/oder von der App-Queue geholt
const urls: string[] = (input.startUrls ?? []).map((s) => s.url);
if (input.queueUrl) {
  try {
    const res = await fetch(input.queueUrl);
    const data = (await res.json()) as { items?: { url: string }[] } | { url: string }[];
    const items = Array.isArray(data) ? data : (data.items ?? []);
    for (const it of items) if (it?.url) urls.push(it.url);
    log.info(`Queue geliefert: ${items.length} URLs`);
  } catch (e) {
    log.error(`Queue-URL nicht lesbar: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const unique = [...new Set(urls)].slice(0, maxItems);
log.info(`Starte mit ${unique.length} Detailseiten (max ${maxItems}).`);

const proxyConfiguration = input.proxyConfiguration
  ? await Actor.createProxyConfiguration(input.proxyConfiguration)
  : undefined;

let pushed = 0;
let blocked = 0;

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxConcurrency: 2,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: 120,
  navigationTimeoutSecs: 60,
  headless: true,
  // Neue Browser-Fingerprints je Session; bei Block Session verwerfen
  useSessionPool: true,
  persistCookiesPerSession: true,

  async requestHandler({ page, request, session }: { page: any; request: Request; session?: any }) {
    await page.goto(request.url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);

    // Bot-Schutz (DataDome) erkennen -> Session verwerfen und neu versuchen
    const title = (await page.title().catch(() => "")) ?? "";
    const blockedNow = /captcha|access denied|blocked|ddos/i.test(title);
    if (blockedNow) {
      blocked++;
      session?.retire();
      throw new Error(`Bot-Schutz auf ${request.url} (Titel: "${title}")`);
    }

    // Cookie-Banner (Didomi/OneTrust) wegklicken, falls vorhanden
    for (const sel of [
      "#didomi-notice-agree-button",
      'button:has-text("Prihvati")',
      'button:has-text("Slažem se")',
      "#onetrust-accept-btn-handler",
    ]) {
      await page.locator(sel).first().click({ timeout: 1500 }).catch(() => {});
    }

    const data = await page.evaluate(() => {
      const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

      // 1) Alle dt/dd-Paare der Seite ("Osnovni podaci" u. a.)
      const specs: Record<string, string> = {};
      document.querySelectorAll("dl").forEach((dl) => {
        const dts = dl.querySelectorAll("dt");
        const dds = dl.querySelectorAll("dd");
        dts.forEach((dt, i) => {
          const k = clean(dt.textContent);
          const v = clean(dds[i]?.textContent);
          if (k && v && !(k in specs)) specs[k] = v;
        });
      });

      // 2) JSON-LD (Bilder, Preis, Adresse)
      const jsonLd: unknown[] = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          jsonLd.push(JSON.parse(s.textContent ?? ""));
        } catch {
          /* ignorieren */
        }
      });

      // 3) Bilder: og:image + Galerie-Bilder + Links auf Originalbilder
      const imgs = new Set<string>();
      const add = (u: string | null | undefined) => {
        if (!u) return;
        const abs = u.startsWith("//") ? "https:" + u : u;
        if (/^https?:\/\//.test(abs) && /njuskalo|image/i.test(abs) && !/\.svg|sprite|logo|icon/i.test(abs)) {
          imgs.add(abs.split("?")[0]);
        }
      };
      document
        .querySelectorAll('meta[property="og:image"]')
        .forEach((m) => add(m.getAttribute("content")));
      document.querySelectorAll("img").forEach((img) => {
        add(img.getAttribute("src"));
        add(img.getAttribute("data-src"));
        add(img.getAttribute("data-original"));
        const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
        if (srcset) add(srcset.split(",").pop()?.trim().split(" ")[0]);
      });
      document.querySelectorAll('a[href*="image-original"], a[href*="img.njuskalo"]').forEach((a) => {
        add(a.getAttribute("href"));
      });

      // 4) Beschreibung: dedizierter Container, sonst Meta-Description
      const descEl =
        document.querySelector('[class*="ClassifiedDetailDescription"]') ??
        document.querySelector('[class*="escription"] .cf, [id*="description"]');
      const description =
        clean(descEl?.textContent) ||
        clean(document.querySelector('meta[name="description"]')?.getAttribute("content"));

      // 5) Ausstattungslisten (ul-Punkte in Detail-Abschnitten, z. B. "Bazen", "Klima uređaj")
      const features: string[] = [];
      document
        .querySelectorAll('[class*="ClassifiedDetailBasicDetails"] li, [class*="ClassifiedDetail"] ul li')
        .forEach((li) => {
          const t = clean(li.textContent);
          if (t && t.length < 80) features.push(t);
        });

      const h1 = clean(document.querySelector("h1")?.textContent);
      const priceMeta =
        document.querySelector('[data-testid="classified-price"], .ClassifiedDetailSummary-priceDomestic') ??
        document.querySelector('[class*="price"]');

      return {
        title: h1,
        specs,
        jsonLd,
        images: [...imgs],
        description,
        features: [...new Set(features)].slice(0, 120),
        priceText: clean(priceMeta?.textContent),
      };
    });

    // adId aus der URL (…-oglas-44724863) oder aus JSON-LD ziehen
    const adId = /oglas-(\d{5,})/.exec(request.url)?.[1] ?? null;
    if (!adId) {
      log.warning(`Keine adId in URL: ${request.url}`);
    }
    if (!data.title && data.images.length === 0 && Object.keys(data.specs).length === 0) {
      session?.retire();
      throw new Error(`Leere Seite (vermutlich geblockt): ${request.url}`);
    }

    await Actor.pushData({
      adId,
      detailUrl: request.url,
      ...data,
      _scrapedAt: new Date().toISOString(),
    });
    pushed++;
    log.info(
      `OK ${request.url} -> ${data.images.length} Bilder, ${Object.keys(data.specs).length} Datenfelder`,
    );
  },

  failedRequestHandler({ request }: { request: Request }) {
    log.warning(`Aufgegeben: ${request.url}`);
  },
});

await crawler.run(unique);
log.info(`🏁 Fertig. ${pushed}/${unique.length} Detailseiten gespeichert, ${blocked} Block-Versuche.`);
await Actor.exit();
