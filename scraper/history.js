// Storico giocatori (pluto): da formazioni Lega post-gara → docs/history-players.json
const fs = require("fs");
const path = require("path");
const { matchName, sameTeam } = require("./names");

const OUT = path.join(__dirname, "..", "docs", "history-players.json");

function load() {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); }
  catch (e) { return { season: "2026-27", updated: null, giornate: [], players: {} }; }
}

/**
 * Merge risultati Lega (xi, bench, subs) nello storico per una giornata.
 * status: T | P | E | I | S
 * Per E salva anche min (minuto ingresso).
 * outMap opzionale: { "Team": [{ n, k: "inf"|"squal" }] } dagli indisponibili pre-gara.
 */
function mergeHistory(giornata, teamsPayload, outMap, log = () => {}) {
  if (!giornata || !teamsPayload) return load();
  const H = load();
  const g = String(giornata);
  if (!H.giornate.includes(g)) H.giornate.push(g);
  H.giornate.sort((a, b) => +a - +b);

  for (const [team, L] of Object.entries(teamsPayload)) {
    if (!L?.xi?.length) continue;
    const xi = new Set(L.xi);
    const subMin = Object.fromEntries((L.subs || []).map(s => [s.n, s.min]));
    // uscite da eventi Lega: titolare sostituito → ↓
    const exitMin = Object.fromEntries((L.exits || []).map(s => [s.n, s.min]));
    const bench = new Set(L.bench || []);
    const all = new Set([...xi, ...bench, ...Object.keys(subMin), ...Object.keys(exitMin)]);
    for (const n of all) {
      if (!H.players[n]) H.players[n] = { team, g: {} };
      H.players[n].team = team;
      let st = "P";
      if (xi.has(n)) st = "T";
      else if (subMin[n] != null) st = "E";
      else if (bench.has(n)) st = "P";
      const cell = { s: st };
      if (subMin[n] != null) { cell.s = "E"; cell.min = subMin[n]; }
      if (exitMin[n] != null) { cell.s = "T"; cell.out = exitMin[n]; } // titolare uscito: ↓
      // se era in panchina e ha subMin, resta E (↑) anche se per caso in exitMin
      if (subMin[n] != null && !xi.has(n)) { cell.s = "E"; cell.min = subMin[n]; delete cell.out; }
      H.players[n].g[g] = cell;
    }
    const outs = outMap?.[team] || [];
    for (const o of outs) {
      const n = o.n;
      if (all.has(n)) continue;
      if (!H.players[n]) H.players[n] = { team, g: {} };
      H.players[n].team = team;
      if (o.k === "squal") H.players[n].g[g] = { s: "S" };
      else if (o.k === "inf") H.players[n].g[g] = { s: "I" };
    }
  }
  H.updated = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(H));
  log(`History giocatori: giornata ${g}, ${Object.keys(H.players).length} giocatori in archivio`);
  return H;
}

/** Estrae payload storico da data.json (teams con official o _legaPost) */
function fromBuiltData(data, log) {
  const payload = {};
  const outMap = {};
  for (const [t, T] of Object.entries(data.teams || {})) {
    const L = T._legaPost || (T.official?.src === "Lega Serie A" ? T.official : null);
    if (!L?.xi) continue;
    payload[t] = {
      xi: L.xi,
      bench: L.bench || [],
      subs: L.subs || [],
    };
    if (T.out?.length) outMap[t] = T.out;
  }
  if (!Object.keys(payload).length) {
    log("History giocatori: nessun dato Lega post-gara da archiviare");
    return load();
  }
  return mergeHistory(data.giornata, payload, outMap, log);
}

module.exports = { load, mergeHistory, fromBuiltData, OUT };
