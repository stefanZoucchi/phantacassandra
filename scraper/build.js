// Unisce i dati letti dai siti nel file docs/data.json (stesso formato usato dalla pagina).
const { norm, matchName, sameTeam } = require("./names");

const SOURCES = [
  { key: "fantacalcio", name: "Fantacalcio.it" },
  { key: "sky", name: "Sky Sport" },
  { key: "gazzetta", name: "Gazzetta" },
  { key: "corriere", name: "Corriere dello Sport", note: "Stessi dati di Tuttosport: contati una volta sola" },
  { key: "tmw", name: "TuttoMercatoWeb", note: "Stesse formazioni di Sportitalia (stesso gruppo): contate una volta sola" },
  { key: "sosfanta", name: "SOS Fanta" },
  { key: "eurosport", name: "Eurosport" },
  { key: "goal", name: "Goal.com" },
  { key: "calciomercato", name: "Calciomercato.com", note: "Stesso gruppo editoriale di Goal.com" },
];

function accuracy(D) {
  const st = {};
  for (const T of Object.values(D.teams || {})) {
    if (!T.official) continue;
    const off = new Set(T.official.xi);
    for (const [k, L] of Object.entries(T.lineups || {})) {
      const h = (L.xi || []).filter(n => off.has(n)).length;
      st[k] = st[k] || { hits: 0, total: 0, teams: 0 };
      st[k].hits += h; st[k].total += off.size; st[k].teams++;
    }
  }
  return st;
}

const MESI = { gen: "01", feb: "02", mar: "03", apr: "04", mag: "05", giu: "06", lug: "07", ago: "08", set: "09", ott: "10", nov: "11", dic: "12" };
function shortDate(s) {
  s = String(s || "");
  let m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\D+(\d{1,2}:\d{2})/); if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")} ${m[3]}`;
  m = s.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\s+\d{4}\D+(\d{1,2}:\d{2})/i); if (m && MESI[m[2].toLowerCase()]) return `${m[1].padStart(2, "0")}/${MESI[m[2].toLowerCase()]} ${m[3]}`;
  return s;
}
function nowRome() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { full: `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`, day: `${p.day}/${p.month}` };
}

// Ballottaggi: "Zielinski-Barella" oppure "Estupinan - Diawara S." -> nomi della rosa di quella squadra.
// Con i cognomi col trattino ("Loftus-Cheek-Fofana") prova tutti i punti di taglio.
function ballOf(R, tn, team, cands) {
  const pairs = R.ball?.[tn] || []; const res = new Set();
  for (const p of pairs) {
    let opts = / - /.test(p) ? [p.split(/\s+-\s+/)] : [];
    const parts = p.split("-");
    for (let i = 1; i < parts.length; i++) opts.push([parts.slice(0, i).join("-"), parts.slice(i).join("-")]);
    for (const [a, b] of opts) {
      const ma = matchName(a.trim(), cands, team), mb = matchName(b.trim(), cands, team);
      if (ma && mb && ma !== mb) { res.add(ma); res.add(mb); break; }
    }
  }
  return [...res];
}

// raw: {fantacalcio:{giornata,matches,teams,updated}, sky:{...,url}, ...}; prev: data.json precedente (o null)
function build(raw, prev, mode = "automatico", log = console.log) {
  const P = raw.fantacalcio;
  if (!P || !P.matches || P.matches.length < 5) throw new Error("Fantacalcio.it non letto: serve per partite e rose");
  const now = nowRome();
  const teams = {};
  for (const m of P.matches) for (const [side, opp] of [["home", "away"], ["away", "home"]]) {
    const t = m[side], T = P.teams[t];
    teams[t] = { match: m.home + "-" + m.away, home: side === "home", opp: m[opp], when: m.when, roster: [...T.xi, ...(T.bench || [])], pct: T.pct || {},
      lineups: T.official ? {} : { fantacalcio: { mod: T.mod, xi: T.xi } }, out: [] };
    if (T.official) teams[t].official = { xi: T.xi, src: "Fantacalcio.it" };
    else { const bn = ballOf(P, t, t, teams[t].roster); if (bn.length) teams[t].lineups.fantacalcio.b = bn; }
  }
  const teamKey = n => Object.keys(teams).find(k => sameTeam(k, n));
  const pairsOk = R => { // the source must describe the same fixtures
    let ok = 0, tot = 0;
    for (const n of Object.keys(R.teams || {})) { const t = teamKey(n); if (!t) continue; tot++; if (Object.keys(R.teams).some(o => sameTeam(o, teams[t].opp))) ok++; }
    return tot >= 2 && ok / tot >= 0.8;
  };
  const results = {};
  for (const s of SOURCES.slice(1)) {
    const R = raw[s.key];
    if (!R || R.error) { log(`- ${s.name}: ${R?.error || "non letto"}`); continue; }
    if (R.giornata != null && R.giornata != P.giornata) { log(`- ${s.name}: è ancora alla ${R.giornata}ª giornata`); continue; }
    if (R.giornata == null && !pairsOk(R)) { log(`- ${s.name}: le partite non corrispondono alla ${P.giornata}ª giornata`); continue; }
    let n = 0;
    for (const [tn, L] of Object.entries(R.teams || {})) {
      const t = teamKey(tn); if (!t) continue;
      const cands = [...teams[t].roster];
      let xi = [];
      for (const p of L.xi) {
        const parts = p.split(/\s+/); // "Politano Hojlund" (virgola mancante sul sito)
        const split = L.xi.length === 10 && parts.length === 2 ? parts.map(x => matchName(x, cands, t)) : [];
        if (split.length === 2 && split.every(Boolean) && split[0] !== split[1]) { xi.push(...split); continue; }
        const c = matchName(p, cands, t);
        xi.push(c || p);
      }
      xi = [...new Set(xi)];
      if (xi.length !== 11) { log(`  ${s.name} ${t}: ${xi.length} titolari, scartata`); continue; }
      if (L.official) { if (!teams[t].official) teams[t].official = { xi, src: s.name }; }
      else {
        teams[t].lineups[s.key] = { mod: L.mod, xi };
        const bn = ballOf(R, tn, t, [...new Set([...cands, ...xi])]);
        if (bn.length) teams[t].lineups[s.key].b = bn;
      }
      n++;
    }
    if (n) { results[s.key] = { url: R.url, updated: shortDate(R.updated) || now.day }; log(`+ ${s.name}: ${n} squadre`); }
    else log(`- ${s.name}: nessuna squadra utilizzabile`);
  }

  // Indisponibili: unione delle liste di Gazzetta, Sky e degli altri siti che le pubblicano.
  // Squalificato se lo dice almeno uno; infortunato se almeno uno lo dà fuori senza dubbi; altrimenti in dubbio.
  const RANK = { dubbio: 1, inf: 2, squal: 3 };
  const outKeys = ["fantacalcio", "gazzetta", "sky", "tmw", "goal", "calciomercato", "eurosport"];
  for (const [t, T] of Object.entries(teams)) {
    const lists = outKeys.map(k => {
      const R = raw[k]; if (!R || (!results[k] && k !== "fantacalcio") || !R.out) return null;
      const tn = Object.keys(R.out).find(x => sameTeam(x, t)); if (!tn) return null;
      // liste con le due squadre mescolate: tengo solo i giocatori della rosa di questa squadra
      const L = R.mixed ? R.out[tn].filter(o => matchName(o.n, T.roster, t)) : R.out[tn];
      return L.length ? { k, L } : null;
    }).filter(Boolean);
    if (!lists.length) { const PT = prev && prev.giornata == P.giornata && prev.teams?.[t]; if (PT?.out?.length) T.out = PT.out; continue; } // nessuna lista nuova: tengo quella di prima
    const canon = n => matchName(n, T.roster, t) || n;
    const all = [];
    for (const { k: src, L } of lists) {
      const st = {};
      for (const o of L) {
        const c = canon(o.n); const ex = all.find(a => a.n === c || matchName(o.n, [a.n], t));
        const k = o.k; // se una fonte lo dà fuori e un'altra in dubbio, vince "fuori"
        if (ex) { if (RANK[k] > RANK[ex.k]) ex.k = k; } else all.push({ n: c, k });
        st[ex ? ex.n : c] = k;
      }
      // stato secondo questa fonte: serve per il colore del suo pallino
      if (T.lineups[src]) T.lineups[src].st = st;
    }
    T.out = all;
  }

  let history = prev?.history || [];
  const same = prev && prev.giornata == P.giornata;
  if (same) {
    for (const [t, T] of Object.entries(teams)) {
      const PT = prev.teams?.[t]; if (!PT) continue;
      if (PT.official) { T.official = PT.official; T.lineups = PT.lineups; T.pct = PT.pct; }
      else if (T.official) { // ufficiale appena uscita: i pronostici restano quelli letti prima
        T.lineups = { ...T.lineups, ...PT.lineups };
        if (PT.pct && Object.keys(PT.pct).length) T.pct = PT.pct;
      }
      else for (const [k, L] of Object.entries(PT.lineups || {})) if (!T.lineups[k] && !results[k]) T.lineups[k] = L;
    }
  } else if (prev) {
    history = history.filter(h => h.giornata != prev.giornata).concat([{ giornata: prev.giornata, stats: accuracy(prev) }]);
  }
  const prevSrc = Object.fromEntries((same ? prev.sources : []).map(x => [x.key, x]));
  const srcFC = { url: raw.fantacalcio.url, updated: shortDate(P.updated) || now.day };
  const sources = SOURCES.map(s => {
    const r = s.key === "fantacalcio" ? srcFC : results[s.key], ps = prevSrc[s.key];
    return { key: s.key, name: s.name, url: r?.url || ps?.url || "", updated: r?.updated || ps?.updated || "", ok: !!r || !!ps?.ok, ...(s.note ? { note: s.note } : {}) };
  });
  return { giornata: P.giornata, generated: now.full, mode, history, sources, teams };
}

module.exports = { build, accuracy, SOURCES, nowRome };
