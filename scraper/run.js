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
  { key: "sky", hub: ["https://sport.sky.it/calcio/serie-a/probabili-formazioni", "https://sport.sky.it/calcio/serie-a"], link: /sport\.sky\.it\/calcio\/serie-a\/\d{4}\/\d{2}\/\d{2}\/probabili-formazioni-serie-a[^"#?\s]*/, fn: X.lineFormat,
    // nei turni infrasettimanali Sky pubblica un articolo per partita
    perMatch: { hubs: ["https://sport.sky.it/calcio/serie-a/probabili-formazioni", "https://sport.sky.it/calcio/serie-a"], link: /sport\.sky\.it\/calcio\/serie-a\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+-probabili-formazioni-\d+-giornata/, fn: X.skyMatch } },
  { key: "gazzetta", url: "https://www.gazzetta.it/Calcio/prob_form/", fn: X.gazzetta },
  { key: "corriere", url: "https://www.corrieredellosport.it/probabili-formazioni/calcio/serie-a", fn: X.corriere },
  { key: "tmw", hub: "https://www.tuttomercatoweb.com/probabili-formazioni/", link: /tuttomercatoweb\.com\/probabili-formazioni\/probabili-formazioni-serie-a-ultime-\d+a-giornata[^"#?\s]*/, fn: X.lineFormat },
  { key: "sosfanta", url: "https://www.sosfanta.com/lista-formazioni/probabili-formazioni-serie-a/", fn: X.sosfanta },
  { key: "eurosport", hub: "https://www.eurosport.it/calcio/serie-a/", summary: /eurosport\.it\/calcio\/serie-a\/[^"#?\s]*probabili-formazioni-\d+a-giornata[^"#?\s]*story\.shtml/, multi: /eurosport\.it\/calcio\/serie-a\/[^"#?\s]*-probabili-formazioni-statistiche[^"#?\s]*story\.shtml/, fn: X.lineFormat },
  // formazioni ufficiali dalla Lega Serie A (una pagina per partita)
  { key: "lega", legaHub: "https://www.legaseriea.it/it/serie-a", link: /legaseriea\.it\/(?:it\/)?serie-a\/match\/[0-9a-f]{32}\/[a-z0-9-]+-vs-[a-z0-9-]+/, fn: X.lega },
  { key: "goal", hub: "https://www.goal.com/it/notizie", link: /goal\.com\/it\/liste\/probabili-formazioni-serie-a-giornata-\d+[^"#?\s]*/, fn: X.lineFormat },
  // SportMediaset: hub con tab per partita (?match=idCasa:idTrasferta) — chiave "spm" come nel frontend
  { key: "spm", hub: "https://www.sportmediaset.mediaset.it/probabili-formazioni/serie-a/", multi: /sportmediaset\.mediaset\.it\/probabili-formazioni\/serie-a\/\?match=[0-9%A-Fa-f:]+/, fn: X.sportmediaset },
];

async function open(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  // chiude i banner dei cookie scegliendo il rifiuto quando c'è
  for (const label of ["Rifiuta", "Rifiuta tutto", "Continua senza accettare", "Non accetto"]) {
    const b = page.getByRole("button", { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(800); break; }
  }
}
// legge la pagina; se il sito la ricarica mentre leggiamo (es. Gazzetta con ?refresh_ce) aspetta e riprova
async function evalSafe(page, fn) {
  for (let i = 0; ; i++) {
    try {
      await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
      const r = await page.evaluate(fn);
      if (i < 2 && r && r.teams && !Object.keys(r.teams).length) { await page.waitForTimeout(3000); continue; } // pagina non ancora pronta
      return r;
    } catch (e) {
      if (i >= 2 || !/context|navigat|destroyed/i.test(String(e.message))) throw e;
      await page.waitForTimeout(3000);
    }
  }
}
// link presenti nella pagina, anche quelli scritti nel codice e non come <a>
async function allLinks(page, re) {
  const a = await links(page, re);
  const html = await page.content();
  const b = [...html.matchAll(new RegExp(re.source, "g"))].map(m => m[0].startsWith("http") ? m[0] : (m[0].split("/")[0].split(".").length >= 3 ? "https://" : "https://www.") + m[0]);
  const host = new URL(page.url()).origin;
  const c = [...html.matchAll(/"(\/[^"\s]+?story\.shtml)"/g)].map(m => host + m[1]).filter(u => re.test(u));
  return [...new Set([...a, ...b, ...c])];
}
const links = (page, re) => page.$$eval("a[href]", (as, src) => { const r = new RegExp(src); return [...new Set(as.map(a => a.href).filter(h => r.test(h)))]; }, re.source);

// un articolo per partita: prende quelli della giornata più alta e li legge uno per uno
async function readPerMatch(page, s) {
  const P = s.perMatch, all = new Set();
  for (const h of P.hubs) { try { await open(page, h); (await allLinks(page, P.link)).forEach(u => all.add(u.replace(/[?#].*$/, ""))); } catch (e) {} }
  const gOf = u => +((u.match(/-(\d+)-giornata/) || [])[1] || 0);
  const g = Math.max(0, ...[...all].map(gOf));
  const urls = [...all].filter(u => gOf(u) === g).slice(0, 10);
  if (!urls.length) throw new Error("articoli delle partite non trovati");
  const res = { giornata: g || null, teams: {}, out: {}, updated: "" };
  for (const u of urls) {
    try { await open(page, u); const r = await evalSafe(page, P.fn); Object.assign(res.teams, r.teams); if (r.updated > res.updated) res.updated = r.updated; } catch (e) {}
  }
  return { ...res, url: P.hubs[0] };
}

async function readLega(page, s) {
  await open(page, s.legaHub);
  const byId = {};
  for (const u of await allLinks(page, s.link)) {
    const id = (u.match(/match\/([0-9a-f]{32})/) || [])[1];
    if (id && !byId[id]) byId[id] = u.replace(/[?#].*$/, "").replace(/\/lineups\/?$/, "");
  }
  const urls = Object.values(byId).slice(0, 10);
  if (!urls.length) throw new Error("partite non trovate");
  const res = { teams: {} };
  for (const u of urls) {
    try {
      // preferisci /lineups (post-gara: panchina + minuti ingresso); fallback pagina match
      let r = null;
      try { await open(page, u.replace(/\/?$/, "") + "/lineups"); r = await evalSafe(page, s.fn); }
      catch (e) { r = null; }
      if (!r || !Object.keys(r.teams || {}).length) { await open(page, u); r = await evalSafe(page, s.fn); }
      Object.assign(res.teams, r.teams || {});
    } catch (e) {}
  }
  return { ...res, url: s.legaHub };
}

async function readSource(page, s) {
  if (s.legaHub) return readLega(page, s);
  if (s.url) { await open(page, s.url); return { ...(await evalSafe(page, s.fn)), url: s.url }; }
  if (s.pages) { // l'articolo della giornata si trova scorrendo le pagine delle notizie
    for (let i = 1; i <= 8; i++) {
      await open(page, s.pages + i);
      const u = (await allLinks(page, s.link))[0];
      if (u) { await open(page, u); return { ...(await evalSafe(page, s.fn)), url: u }; }
    }
    throw new Error("articolo della giornata non trovato");
  }
  const hubs = [].concat(s.hub);
  await open(page, hubs[0]);
  if (s.multi) {
    const seen = new Set(await allLinks(page, s.multi));
    if (s.summary) { // pagina riassuntiva della giornata: contiene i link a tutte le partite
      const sum = (await links(page, s.summary))[0];
      if (sum) { await open(page, sum); (await allLinks(page, s.multi)).forEach(u => seen.add(u)); }
    }
    const done = new Set(); const all = { giornata: null, teams: {}, out: {}, updated: "" };
    while (done.size < 10) {
      const next = [...seen].find(u => !done.has(u)); if (!next) break; done.add(next);
      try { await open(page, next); const r = await evalSafe(page, s.fn); Object.assign(all.teams, r.teams); all.giornata = all.giornata ?? r.giornata; (await allLinks(page, s.multi)).forEach(u => seen.add(u)); } catch (e) {}
    }
    return { ...all, url: hubs[0] };
  }
  let found = await allLinks(page, s.link);
  for (const h of hubs.slice(1)) { if (found.length) break; await open(page, h); found = await allLinks(page, s.link); }
  if (!found.length && s.perMatch) return readPerMatch(page, s);
  if (!found.length) throw new Error("articolo della giornata non trovato");
  // l'articolo con il numero di giornata più alto
  const pick = found.sort((a, b) => (+(b.match(/(\d+)a?-giornata|giornata-(\d+)/) || []).slice(1).find(Boolean) || 0) - (+(a.match(/(\d+)a?-giornata|giornata-(\d+)/) || []).slice(1).find(Boolean) || 0))[0];
  await open(page, pick);
  return { ...(await evalSafe(page, s.fn)), url: pick };
}

// legge piu' siti insieme (ognuno nella sua scheda): il giro dura 2-3 minuti invece di 8
const PARALLEL = 5;
// tutto quello che viene scritto nel registro finisce anche in docs/ultimo-giro.txt (utile per capire cosa non va)
const LOG = [];
for (const k of ["log", "error"]) { const o = console[k].bind(console); console[k] = (...a) => { LOG.push(a.join(" ")); o(...a); }; }
const saveLog = () => { try { fs.writeFileSync(path.join(__dirname, "..", "docs", "ultimo-giro.txt"), LOG.join("\n") + "\n"); } catch (e) {} };

function romeMinutes(str) { // "28/10/2026 10:23" -> minuti dall'epoca (ora di Roma, basta per confronti vicini)
  const m = String(str || "").match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/); if (!m) return null;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) / 60000;
}

(async () => {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  // giro automatico di riserva di GitHub: se cron-job.org ha gia' aggiornato da poco, non serve rifarlo
  if (process.env.EVENT === "schedule" && prev) {
    const { full } = require("./build").nowRome();
    const a = romeMinutes(prev.generated), b = romeMinutes(full);
    if (a != null && b != null && b - a >= 0 && b - a < 25) { console.log(`Dati gia' aggiornati alle ${prev.generated}: giro di riserva saltato.`); return; }
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "it-IT", timezoneId: "Europe/Rome", viewport: { width: 1280, height: 2000 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
  // niente immagini, video e font: le pagine si caricano molto piu' in fretta
  await ctx.route("**/*", route => ["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue());
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ": troppo lento, saltato")), ms))]);
  const raw = {};
  const T0 = Date.now();
  const queue = [...PLAN];
  async function worker() {
    for (let s; (s = queue.shift());) {
      const page = await ctx.newPage(), t0 = Date.now();
      try { raw[s.key] = await withTimeout(readSource(page, s), (s.multi || s.perMatch || s.legaHub) ? 240000 : 120000, s.key); console.log(`letto ${s.key}: giornata ${raw[s.key].giornata ?? "?"}, ${Object.keys(raw[s.key].teams || {}).length} squadre (${Math.round((Date.now() - t0) / 1000)}s)`); }
      catch (e) { raw[s.key] = { error: String(e.message || e).slice(0, 120) }; console.log(`errore ${s.key}: ${raw[s.key].error}`); }
      await page.close().catch(() => {});
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(`Siti letti in ${Math.round((Date.now() - T0) / 1000)}s`);
  await browser.close();
  try {
    const data = build(raw, prev, MODE, console.log);
    for (const T of Object.values(data.teams || {})) delete T._legaPost;
    fs.writeFileSync(OUT, JSON.stringify(data));
    try {
      const { mergeHistory } = require("./history");
      const { matchName, sameTeam } = require("./names");
      const LG = raw.lega;
      if (LG && !LG.error && data.giornata) {
        const payload = {}, outMap = {};
        for (const [tn, L] of Object.entries(LG.teams || {})) {
          const t = Object.keys(data.teams).find(x => sameTeam(x, tn));
          if (!t || !L.xi) continue;
          const roster = data.teams[t].roster || [];
          const cands = [...roster, ...(L.bench || []), ...(L.xi || [])];
          payload[t] = {
            xi: L.xi.map(p => matchName(p, roster, t) || p),
            bench: (L.bench || []).map(p => matchName(p, cands, t) || p),
            subs: (L.subs || []).map(s => ({ n: matchName(s.n, cands, t) || s.n, min: s.min })),
          };
          if (data.teams[t].out?.length) outMap[t] = data.teams[t].out;
        }
        if (Object.keys(payload).length) mergeHistory(data.giornata, payload, outMap, console.log);
      }
    } catch (e) { console.log("History giocatori: " + e.message); }
    const off = Object.values(data.teams).filter(t => t.official).length;
    const nOut = Object.values(data.teams).reduce((a, t) => a + t.out.length, 0);
    console.log(`OK: ${data.giornata}ª giornata, ${data.sources.filter(s => s.ok).length} fonti, ${off} formazioni ufficiali, ${nOut} indisponibili. Salvato ${data.generated}.`);
    saveLog();
  } catch (e) {
    console.error("Aggiornamento non salvato: " + e.message); saveLog();
    process.exit(1);
  }
})();
