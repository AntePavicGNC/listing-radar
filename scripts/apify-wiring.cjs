// AUSFÜHREN: node scripts/apify-wiring.cjs  (aus dem Repo-Root; liest apps/web/.env)
// Verdrahtung (SPEC §7): Webhook "Run succeeded" -> POST /api/ingest je Quelle,
// plus Schedules (DEAKTIVIERT angelegt — Aktivierung/Kosten entscheidet Ante).
// Liest Secrets aus apps/web/.env; nichts auf der Kommandozeile.
require("dotenv").config({ path: "apps/web/.env" });

const TOKEN = process.env.APIFY_TOKEN;
const SECRET = process.env.INGEST_SECRET;
const APP = "https://listing-radar-one.vercel.app";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const ACTORS = [
  { id: "logiover~njuskalo-hr-property-scraper", source: "njuskalo" },
  { id: "memo23~autoscout24-scraper", source: "autoscout24" },
  { id: "memo23~mobile-de-scraper", source: "mobilede" },
  { id: "cinnamon_badge~autohero-scraper", source: "autohero" },
  { id: "cinnamon_badge~index-oglasi-scraper", source: "indexoglasi" },
];

const SLUGS = ["zadar","bibinje","sukosan","nin","privlaka","razanac","vrsi","petrcane","zaton","radovin","poljica","ljubac","sveti-petar-na-moru","jovici"];
const PROXY_HR = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "HR" };
const PROXY_DE = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] };

const AS24_URL =
  "https://www.autoscout24.de/lst?atype=C&cy=D&damaged_listing=exclude&desc=0&fregfrom=2023&gear=A&kmto=70000&powerfrom=81&powertype=kw&pricefrom=18000&priceto=30000&sort=standard&ustate=N%2CU&zip=85737&zipr=200";
const MOBILE_URL =
  "https://suchen.mobile.de/fahrzeuge/search.html?dam=false&isSearchRequest=true&fr=2023%3A&ml=%3A70000&p=18000%3A30000&tr=AUTOMATIC_GEAR&pw=81%3A&ll=48.2236%2C11.6717&rd=200&s=Car&vc=Car";

async function api(method, path, body) {
  const r = await fetch(`https://api.apify.com/v2${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, data: d.data ?? d };
}

(async () => {
  // ---- 1) Webhooks: Run succeeded -> /api/ingest?source=&secret= (Dataset-ID aus Payload)
  const existing = await api("GET", "/webhooks?limit=100");
  const have = new Set(
    (existing.data.items ?? []).map((w) => `${w.condition?.actorId ?? ""}|${w.requestUrl ?? ""}`),
  );

  for (const a of ACTORS) {
    // actorId der Actors auflösen (Webhook-Condition braucht die ID, nicht den Namen)
    const info = await api("GET", `/acts/${a.id}`);
    const actorId = info.data?.id;
    if (!actorId) {
      console.log(`WEBHOOK ${a.source}: Actor ${a.id} nicht gefunden (${info.status})`);
      continue;
    }
    const requestUrl = `${APP}/api/ingest?source=${a.source}&secret=${SECRET}`;
    if ([...have].some((k) => k.startsWith(`${actorId}|`) && k.includes(`source=${a.source}`))) {
      console.log(`WEBHOOK ${a.source}: existiert schon`);
      continue;
    }
    const res = await api("POST", "/webhooks", {
      eventTypes: ["ACTOR.RUN.SUCCEEDED"],
      condition: { actorId },
      requestUrl,
      shouldInterpolateStrings: false,
    });
    console.log(`WEBHOOK ${a.source}: ${res.status === 201 ? "angelegt" : res.status + " " + JSON.stringify(res.data).slice(0, 120)}`);
  }

  // ---- 2) Schedules (DEAKTIVIERT): Immobilien 1x/Tag, Autos 2x/Tag (SPEC §7)
  const schedules = [
    {
      name: "listing-radar-njuskalo-daily",
      cronExpression: "30 5 * * *",
      actorId: "logiover~njuskalo-hr-property-scraper",
      runs: [
        { locationSlugs: SLUGS, transaction: "sale", propertyType: "land", priceMin: 5000, priceMax: 115000, maxListings: 250, maxPagesPerTask: 3, proxyConfiguration: PROXY_HR },
        { locationSlugs: SLUGS, transaction: "sale", propertyType: "house", priceMin: 100000, priceMax: 400000, areaMin: 80, maxListings: 250, maxPagesPerTask: 3, proxyConfiguration: PROXY_HR },
      ],
    },
    {
      name: "listing-radar-autoscout24-2x",
      cronExpression: "0 6,18 * * *",
      actorId: "memo23~autoscout24-scraper",
      runs: [{ startUrls: [{ url: AS24_URL }], filterCountries: ["D"], maxItems: 120, proxy: PROXY_DE }],
    },
    {
      name: "listing-radar-mobilede-2x",
      cronExpression: "15 6,18 * * *",
      actorId: "memo23~mobile-de-scraper",
      runs: [{ startUrls: [{ url: MOBILE_URL }], maxItems: 150, proxy: PROXY_DE }],
    },
  ];

  const existingSchedules = await api("GET", "/schedules?limit=100");
  const haveSched = new Set((existingSchedules.data.items ?? []).map((s) => s.name));

  for (const s of schedules) {
    if (haveSched.has(s.name)) {
      console.log(`SCHEDULE ${s.name}: existiert schon`);
      continue;
    }
    const info = await api("GET", `/acts/${s.actorId}`);
    const actorId = info.data?.id;
    if (!actorId) {
      console.log(`SCHEDULE ${s.name}: Actor nicht gefunden`);
      continue;
    }
    const actions = s.runs.map((input) => ({
      type: "RUN_ACTOR",
      actorId,
      runInput: { body: JSON.stringify(input), contentType: "application/json; charset=utf-8" },
    }));
    const res = await api("POST", "/schedules", {
      name: s.name,
      cronExpression: s.cronExpression,
      timezone: "Europe/Berlin",
      isEnabled: false, // bewusst AUS — Kosten-Entscheidung liegt bei Ante
      isExclusive: true,
      actions,
    });
    console.log(`SCHEDULE ${s.name}: ${res.status === 201 ? "angelegt (deaktiviert)" : res.status + " " + JSON.stringify(res.data).slice(0, 160)}`);
  }
})();
