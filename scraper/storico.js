// PhantaCassandra — storico giocatori dai tabellini della Gazzetta (gira su GitHub Actions).
// Per ogni giornata già (anche solo in parte) giocata apre il calendario della Gazzetta,
// legge il tabellino di ogni partita FINITA e archivia in docs/history-players.json:
// T = titolare, ↓ = titolare sostituito (minuto), ↑ = entrato (minuto), P = in panchina,
// I / S = indisponibile / squalificato (dagli indisponibili raccolti prima della partita).
// Le partite già archiviate non vengono rilette: il primo giro recupera tutta la stagione.
//
// Variabili facoltative:
//   HIST_GIORNATE="1-9" oppure "8,9"  → rilegge queste giornate (anche se già archiviate)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const X = require("./extractors");
const { norm, matchName, sameTeam } = require("./names");
const { load, save, mergeMatch } = require("./history");

const DATA = path.join(__dirname, "..", "docs", "data.json");
const LOGF = path.join(__dirname, "..", "docs", "ultimo-storico.txt");
const CAL = g => `https://www.gazzetta.it/calcio/serie-a/calendario-risultati?giornata=${g}`;
const MATCH_RE = /gazzetta\.it\/calcio\/serie-a\/partita\/[a-z0-9-]+\/(\d+)\/?/;
const MATCH_TIMEOUT = 45000, CONCURRENCY = 4, MAX_GIORNATE = 12;

const LOG = [];
const log = (...a) => { const s = a.join(" "); LOG.push(s); console.log(s); };

async function open(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (const label of ["Rifiuta", "Rifiuta tutto", "Continua senza accettare", "Non accetto"]) {
    const b = page.getByRole("button", { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(800); break; }
  }
}

function parseList(s) {
  const out = new Set();
  for (const part of String(s || "").split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (!m) continue;
    for (let g = +m[1]; g <= +(m[2] || m[1]); g++) if (g >= 1 && g <= 38) out.add(g);
  }
  return [...out].sort((a, b) => a - b);
}

// "Hellas Verona" ↔ "Verona", "Inter" ↔ "Internazionale"...
function teamKeyFor(teams, name) {
  const keys = Object.keys(teams);
  const k = keys.find(t => sameTeam(t, name)); if (k) return k;
  const n = norm(name).join(" ");
  return keys.find(t => { const x = norm(t).join(" "); return x.length >= 4 && (n.includes(x) || x.includes(n)); }) || null;
}

// Abbina i nomi completi della Gazzetta ("Malick Cissé") ai nomi della rosa ("Cissè A."):
// se il nome in rosa ha un'iniziale, deve combaciare con il nome di battesimo; ogni nome della rosa si usa una volta sola.
function nameMapper(cands, team) {
  const used = new Set(), map = {};
  const ok = (full, c) => {
    const nc = norm(c); let b = nc.length; while (b > 1 && nc[b - 1].length <= 2) b--;
    const ini = nc.slice(b); // "Cissè A." -> ["a"], "De Winter" -> []
    if (!ini.length) return true;
    const first = norm(full).filter(x => !norm(c).includes(x));
    return !first.length || ini.some(i => first.some(f => f.startsWith(i)));
  };
  return n => {
    if (map[n]) return map[n];
    let c = matchName(n, cands, team);
    if (c && (!ok(n, c) || used.has(c))) c = null;
    if (c) used.add(c);
    return (map[n] = c || n);
  };
}

(async () => {
  const data = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : null;
  if (!data || !data.giornata || !data.teams) { log("data.json mancante: niente storico"); return; }
  const H = load();
  H.giornate = H.giornate || []; H.players = H.players || {};
  H.matches = H.matches || {}; // giornata -> { idPartita: "Casa-Trasferta" }
  H.outs = H.outs || {};       // giornata -> squadra -> indisponibili pre-gara

  // indisponibili della giornata in corso: li conservo, servono per I/S anche dopo che Fantacalcio passa alla giornata dopo
  const gCur = String(data.giornata);
  H.outs[gCur] = H.outs[gCur] || {};
  for (const [t, T] of Object.entries(data.teams)) if (T.out?.length) H.outs[gCur][t] = T.out;

  const forced = parseList(process.env.HIST_GIORNATE);
  let todo = forced.length ? forced
    : Array.from({ length: +data.giornata }, (_, i) => i + 1).filter(g => Object.keys(H.matches[g] || {}).length < 10);
  todo = todo.slice(-MAX_GIORNATE);
  if (!todo.length) { log("Storico già completo fino alla " + data.giornata + "ª giornata"); save(H); fs.writeFileSync(LOGF, LOG.join("\n") + "\n"); return; }
  log("Giornate da controllare: " + todo.join(", "));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "it-IT", timezoneId: "Europe/Rome", viewport: { width: 1280, height: 2000 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
  await ctx.route("**/*", r => ["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue());
  const page = await ctx.newPage();
  let added = 0;

  for (const g of todo) {
    const done = H.matches[g] = forced.includes(g) ? {} : (H.matches[g] || {});
    let urls = [];
    try {
      await open(page, CAL(g));
      const hrefs = await page.$$eval("a[href]", as => as.map(a => a.href));
      const html = await page.content();
      const all = [...hrefs, ...[...html.matchAll(/https?:\/\/www\.gazzetta\.it\/calcio\/serie-a\/partita\/[a-z0-9-]+\/\d+\/?/g)].map(m => m[0])];
      const byId = {};
      for (const u of all) { const m = u.match(MATCH_RE); if (m && !byId[m[1]]) byId[m[1]] = u.replace(/[?#].*$/, "").replace(/\/?$/, "/").replace(/\/(tabellino|cronaca|statistiche)\/$/, "/"); }
      urls = Object.entries(byId).filter(([id]) => !done[id]).slice(0, 10);
    } catch (e) { log(`${g}ª giornata: calendario non letto (${String(e.message).slice(0, 80)})`); continue; }
    if (!urls.length) { log(`${g}ª giornata: nessuna partita nuova`); continue; }

    const readOne = async ([id, u]) => {
      const p = await ctx.newPage();
      try {
        return await Promise.race([
          (async () => { await open(p, u + "tabellino/"); await p.waitForSelector('[class*="TabellinoCardCellName"]', { timeout: 12000 }).catch(() => {}); return { id, u, r: await p.evaluate(X.gazzettaTabellino) }; })(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("troppo lento")), MATCH_TIMEOUT)),
        ]);
      } catch (e) { return { id, u, err: String(e.message || e).slice(0, 80) }; }
      finally { await p.close().catch(() => {}); }
    };
    const res = [];
    for (let i = 0; i < urls.length; i += CONCURRENCY) res.push(...await Promise.all(urls.slice(i, i + CONCURRENCY).map(readOne)));

    let n = 0;
    for (const { id, u, r, err } of res) {
      const slug = (u.match(/partita\/([a-z0-9-]+)\//) || [])[1] || id;
      if (err || !r) { log(`  ${slug}: ${err || "non letta"}`); continue; }
      if (!r.finished) { log(`  ${slug}: non ancora finita`); continue; }
      if (r.giornata && r.giornata !== g) { log(`  ${slug}: è della ${r.giornata}ª giornata, saltata`); continue; }
      const sides = [r.home, r.away].map(tn => ({ tn, t: teamKeyFor(data.teams, tn), L: r.teams[tn] }));
      if (sides.some(s => !s.t || !s.L || s.L.xi.length !== 11)) { log(`  ${slug}: tabellino incompleto (${sides.map(s => `${s.tn}:${s.L?.xi?.length ?? 0}`).join(", ")})`); continue; }
      const unmatched = [];
      for (const { t, L } of sides) {
        const T = data.teams[t];
        const outs = H.outs[g]?.[t] || [];
        const cands = [...new Set([...(T.roster || []), ...outs.map(o => o.n), ...(T.out || []).map(o => o.n)])];
        const mapN = nameMapper(cands, t);
        const P = {
          xi: L.xi.map(mapN), bench: L.bench.map(mapN),
          subs: L.subs.map(s => ({ n: mapN(s.n), min: s.min })), exits: L.exits.map(s => ({ n: mapN(s.n), min: s.min })),
        };
        [...L.xi].forEach(n => { if (mapN(n) === n && !cands.includes(n)) unmatched.push(n); });
        mergeMatch(H, g, t, P, outs);
      }
      done[id] = sides.map(s => s.t).join("-");
      n++; added++;
      log(`  + ${done[id]}${unmatched.length ? ` (titolari non in rosa: ${unmatched.join(", ")})` : ""}`);
    }
    log(`${g}ª giornata: ${n} partite archiviate (${Object.keys(done).length}/10 in totale)`);
  }
  await browser.close();
  save(H);
  log(`Storico: ${added} partite nuove, ${Object.keys(H.players).length} giocatori, giornate ${H.giornate.join(",") || "nessuna"}`);
  fs.writeFileSync(LOGF, LOG.join("\n") + "\n");
})().catch(e => { log("Storico non aggiornato: " + e.message); try { fs.writeFileSync(LOGF, LOG.join("\n") + "\n"); } catch (_) {} process.exit(1); });
