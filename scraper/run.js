// PhantaCassandra — aggiornamento automatico (gira su GitHub Actions, senza Claude).
// Apre ogni sito con un browser senza interfaccia, legge il testo e scrive docs/data.json.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const X = require("./extractors");
const { build } = require("./build");

const OUT = path.join(__dirname, "..", "docs", "data.json");
const MODE = process.env.MODE || "automatico";

const PLAN = [
  { key: "fantacalcio", url: "https://www.fantacalcio.it/probabili-formazioni-serie-a", fn: X.fantacalcio },
  { key: "sky", hub: "https://sport.sky.it/calcio/serie-a", link: /sport\.sky\.it\/calcio\/serie-a\/\d{4}\/\d{2}\/\d{2}\/probabili-formazioni-serie-a[^"#?\s]*/, fn: X.lineFormat },
  { key: "gazzetta", url: "https://www.gazzetta.it/Calcio/prob_form/", fn: X.gazzetta },
  { key: "corriere", url: "https://www.corrieredellosport.it/probabili-formazioni/calcio/serie-a", fn: X.corriere },
  { key: "tmw", hub: "https://www.tuttomercatoweb.com/probabili-formazioni/", link: /tuttomercatoweb\.com\/probabili-formazioni\/probabili-formazioni-serie-a-ultime-\d+a-giornata[^"#?\s]*/, fn: X.lineFormat },
  { key: "sosfanta", url: "https://www.sosfanta.com/lista-formazioni/probabili-formazioni-serie-a/", fn: X.sosfanta },
  { key: "eurosport", hub: "https://www.eurosport.it/calcio/serie-a/", multi: /eurosport\.it\/calcio\/serie-a\/[^"#?\s]*-probabili-formazioni-statistiche[^"#?\s]*story\.shtml/, fn: X.lineFormat },
  { key: "goal", hub: "https://www.goal.com/it/notizie", link: /goal\.com\/it\/liste\/probabili-formazioni-serie-a-giornata-\d+[^"#?\s]*/, fn: X.lineFormat },
];

async function open(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  // chiude i banner dei cookie scegliendo il rifiuto quando c'è
  for (const label of ["Rifiuta", "Rifiuta tutto", "Continua senza accettare", "Non accetto"]) {
    const b = page.getByRole("button", { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(800); break; }
  }
}
const links = (page, re) => page.$$eval("a[href]", (as, src) => { const r = new RegExp(src); return [...new Set(as.map(a => a.href).filter(h => r.test(h)))]; }, re.source);

async function readSource(page, s) {
  if (s.url) { await open(page, s.url); return { ...(await page.evaluate(s.fn)), url: s.url }; }
  await open(page, s.hub);
  if (s.multi) {
    const seen = new Set(await links(page, s.multi)); const done = new Set(); const all = { giornata: null, teams: {}, out: {}, updated: "" };
    while (done.size < 10) {
      const next = [...seen].find(u => !done.has(u)); if (!next) break; done.add(next);
      try { await open(page, next); const r = await page.evaluate(s.fn); Object.assign(all.teams, r.teams); all.giornata = all.giornata ?? r.giornata; (await links(page, s.multi)).forEach(u => seen.add(u)); } catch (e) {}
    }
    return { ...all, url: s.hub };
  }
  const found = await links(page, s.link);
  if (!found.length) throw new Error("articolo della giornata non trovato");
  // l'articolo con il numero di giornata più alto
  const pick = found.sort((a, b) => (+(b.match(/(\d+)a?-giornata|giornata-(\d+)/) || []).slice(1).find(Boolean) || 0) - (+(a.match(/(\d+)a?-giornata|giornata-(\d+)/) || []).slice(1).find(Boolean) || 0))[0];
  await open(page, pick);
  return { ...(await page.evaluate(s.fn)), url: pick };
}

(async () => {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "it-IT", timezoneId: "Europe/Rome", viewport: { width: 1280, height: 2000 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
  // niente immagini, video e font: le pagine si caricano molto più in fretta
  await ctx.route("**/*", route => ["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue());
  const page = await ctx.newPage();
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ": troppo lento, saltato")), ms))]);
  const raw = {};
  for (const s of PLAN) {
    const t0 = Date.now();
    try { raw[s.key] = await withTimeout(readSource(page, s), s.multi ? 240000 : 120000, s.key); console.log(`letto ${s.key}: giornata ${raw[s.key].giornata ?? "?"}, ${Object.keys(raw[s.key].teams || {}).length} squadre (${Math.round((Date.now() - t0) / 1000)}s)`); }
    catch (e) { raw[s.key] = { error: String(e.message || e).slice(0, 120) }; console.log(`errore ${s.key}: ${raw[s.key].error}`); }
  }
  await browser.close();
  try {
    const data = build(raw, prev, MODE);
    fs.writeFileSync(OUT, JSON.stringify(data));
    const off = Object.values(data.teams).filter(t => t.official).length;
    console.log(`OK: ${data.giornata}ª giornata, ${data.sources.filter(s => s.ok).length} fonti, ${off} formazioni ufficiali. Salvato ${data.generated}.`);
  } catch (e) {
    console.error("Aggiornamento non salvato: " + e.message);
    process.exit(1);
  }
})();
