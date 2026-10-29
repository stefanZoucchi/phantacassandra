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
  { key: "spm", name: "SportMediaset" },
];

// La classifica delle fonti conta solo da questa giornata in poi: la 9ª ha dati incompleti
// (SportMediaset mancante su 16 squadre) e falserebbe il confronto.
const STATS_FROM = 10;
const statsFrom = D => +(D?.statsFrom ?? STATS_FROM);

function accuracy(D) {
  const st = {};
  if (+D.giornata < statsFrom(D)) return st;
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
    if (T.official) teams[t].official = { xi: T.xi, src: "Fantacalcio.it", bench: T.bench || [] };
    else { const bn = ballOf(P, t, t, teams[t].roster); if (bn.length) teams[t].lineups.fantacalcio.b = bn; }
  }
  const teamKey = n => Object.keys(teams).find(k => sameTeam(k, n));
  // Formazioni ufficiali della Lega Serie A: valgono solo da 60 minuti prima del calcio d'inizio
  // (prima la pagina della partita potrebbe mostrare altro)
  const minsTo = when => { const m = String(when || "").match(/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2})/); if (!m) return null;
    const n = now.full.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
    let y = +n[3]; if (+m[2] < +n[2] - 6) y++;
    return (Date.UTC(y, +m[2] - 1, +m[1], +m[3], +m[4]) - Date.UTC(+n[3], +n[2] - 1, +n[1], +n[4], +n[5])) / 60000; };
  const LG = raw.lega;
  if (LG && !LG.error) {
    let n = 0;
    for (const [tn, L] of Object.entries(LG.teams || {})) {
      const t = teamKey(tn); if (!t) continue;
      const cands = [...teams[t].roster, ...(L.bench || []), ...(L.xi || [])];
      const xi = [...new Set((L.xi || []).map(p => matchName(p, teams[t].roster, t) || p))];
      const bench = [...new Set((L.bench || []).map(p => matchName(p, cands, t) || p))];
      const subs = (L.subs || []).map(s => ({ n: matchName(s.n, cands, t) || s.n, min: s.min })).filter(s => s.n);
      // ufficiale "live" solo vicino al calcio d'inizio; bench/subs servono anche post-gara per lo storico
      const mt = minsTo(teams[t].when);
      if (xi.length === 11 && xi.filter(p => teams[t].roster.includes(p)).length >= 9 && mt != null && mt <= 60) {
        teams[t].official = { xi, src: "Lega Serie A", bench: bench.length ? bench : (teams[t].official?.bench || []), subs };
        n++;
      } else if (xi.length === 11 && (bench.length || subs.length)) {
        // post-gara: conserva per history anche se fuori finestra ufficiale
        teams[t]._legaPost = { xi, bench, subs };
      }
    }
    log(`+ Lega Serie A: ${n} formazioni ufficiali`);
  } else if (LG) log(`- Lega Serie A: ${LG.error}`);
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
    let n = 0, unmatched = [];
    for (const [tn, L] of Object.entries(R.teams || {})) {
      const t = teamKey(tn); if (!t) continue;
      const cands = [...teams[t].roster];
      let xi = [];
      for (const p of L.xi) {
        const parts = p.split(/\s+/); // "Politano Hojlund" (virgola mancante sul sito)
        const split = L.xi.length === 10 && parts.length === 2 ? parts.map(x => matchName(x, cands, t)) : [];
        if (split.length === 2 && split.every(Boolean) && split[0] !== split[1]) { xi.push(...split); continue; }
        const c = matchName(p, cands, t);
        if (!c) unmatched.push(`${t}:${p}`);
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
    if (unmatched.length) {
      const sample = [...new Set(unmatched)].slice(0, 12);
      log(`  ${s.name}: nomi non abbinati (${sample.length}${unmatched.length > sample.length ? "+" : ""}): ${sample.join(", ")}`);
    }
    if (n) { results[s.key] = { url: R.url, updated: shortDate(R.updated) || now.day, teams: n }; log(`+ ${s.name}: ${n} squadre`); }
    else log(`- ${s.name}: nessuna squadra utilizzabile`);
  }

  // Indisponibili: unione delle liste di Gazzetta, Sky e degli altri siti che le pubblicano.
  // Squalificato se lo dice almeno uno; infortunato se almeno uno lo dà fuori senza dubbi; altrimenti in dubbio.
  const RANK = { dubbio: 1, inf: 2, squal: 3 };
  const outKeys = ["fantacalcio", "gazzetta", "sky", "tmw", "goal", "eurosport", "spm"];
  // nomi conosciuti per squadra: rosa di Fantacalcio.it + indisponibili segnalati dalle altre fonti
  const known = t => { const c = new Set(teams[t].roster);
    for (const k of outKeys.slice(1)) { const R = raw[k]; if (!R?.out) continue; const tn = Object.keys(R.out).find(x => sameTeam(x, t)); (tn ? R.out[tn] : []).forEach(o => c.add(o.n)); }
    return [...c]; };
  // liste con le due squadre mescolate (Fantacalcio.it: prima la colonna di casa, poi quella in trasferta, sezione per sezione):
  // chi è riconosciuto decide la colonna, gli altri seguono il precedente della stessa sezione
  const sideOf = (L, t) => {
    const o = teams[t].opp, ct = known(t), co = known(o), res = [];
    let cur = "home", sec = null;
    const homeT = teams[t].home ? t : o, awayT = teams[t].home ? o : t;
    for (const x of L) {
      if (x.k !== sec) { sec = x.k; cur = homeT; }
      if (x.n === "-") { if (cur === homeT) cur = awayT; continue; } // colonna di casa vuota: da qui in poi è la trasferta
      const inT = !!matchName(x.n, ct, t), inO = !!matchName(x.n, co, o);
      if (inT !== inO) cur = inT ? t : o;
      if (cur === t) res.push(x);
    }
    return res;
  };
  for (const [t, T] of Object.entries(teams)) {
    const lists = outKeys.map(k => {
      const R = raw[k]; if (!R || (!results[k] && k !== "fantacalcio") || !R.out) return null;
      const tn = Object.keys(R.out).find(x => sameTeam(x, t)); if (!tn) return null;
      // liste con le due squadre mescolate: tengo solo i giocatori della rosa di questa squadra
      const L = R.mixed ? sideOf(R.out[tn], t) : R.out[tn];
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

  let history = Array.isArray(prev?.history) ? prev.history : [];
  const same = prev && prev.giornata == P.giornata;
  // nuova stagione: la giornata torna indietro (es. dalla 38ª alla 1ª) → classifica delle fonti da zero, dalla 1ª
  const newSeason = prev && prev.giornata != null && +P.giornata < +prev.giornata;
  if (newSeason) log(`Nuova stagione: classifica delle fonti azzerata (si riparte dalla ${P.giornata}ª giornata)`);
  if (same) {
    for (const [t, T] of Object.entries(teams)) {
      const PT = prev.teams?.[t]; if (!PT) continue;
      if (PT.official) {
        // Una volta uscita l'ufficiale, la previsione visualizzata va CONGELATA.
        // Non bisogna sostituirla con una nuova lettura dei siti (che spesso
        // continua a cambiare anche dopo il via). Se l'ufficiale era già uscita
        // nel giro precedente, ripristiniamo integralmente lo snapshot precedente.
        T.official = { ...PT.official, bench: PT.official.bench?.length ? PT.official.bench : (T.official?.bench || []) };
        T.lineups = PT.lineups || {};
        T.pct = PT.pct;
        if (PT.out) T.out = PT.out;
      }
      else if (T.official) { // ufficiale appena uscita: congela l'ultima previsione disponibile
        T.lineups = PT.lineups || {};
        if (PT.pct && Object.keys(PT.pct).length) T.pct = PT.pct;
      }
      // squadra per squadra: se una fonte questa volta non ha più la formazione di questa squadra
      // (es. SportMediaset toglie le partite di oggi e mostra quelle di domani) tengo l'ultima letta
      else for (const [k, L] of Object.entries(PT.lineups || {})) if (!T.lineups[k]) T.lineups[k] = L;
    }
  } else if (newSeason) {
    history = [];
  } else if (prev && prev.giornata != null) {
    // chiude la giornata precedente: salva sempre le stats (anche se poche ufficiali)
    try {
      const st = accuracy(prev);
      history = history.filter(h => h.giornata != prev.giornata);
      if (Object.keys(st).length) {
        history = history.concat([{ giornata: prev.giornata, stats: st }]);
        log(`History: salvate stats giornata ${prev.giornata}ª (${Object.keys(st).length} fonti)`);
      } else log(`History: giornata ${prev.giornata}ª esclusa dalla classifica delle fonti`);
    } catch (e) { log(`History: impossibile salvare stats giornata ${prev.giornata}: ${e.message}`); }
  }
  // gli indisponibili di una partita con l'ufficiale restano quelli di prima del via: servono per vedere chi ha sbagliato
  const prevSrc = Object.fromEntries((same ? prev.sources : []).map(x => [x.key, x]));
  const nFC = Object.keys(P.teams || {}).length;
  const srcFC = { url: raw.fantacalcio.url, updated: shortDate(P.updated) || now.day, teams: nFC };
  const sources = SOURCES.map(s => {
    const r = s.key === "fantacalcio" ? srcFC : results[s.key], ps = prevSrc[s.key];
    const teamsN = r?.teams ?? ps?.teams;
    return {
      key: s.key, name: s.name,
      url: r?.url || ps?.url || "",
      updated: r?.updated || ps?.updated || "",
      ok: !!r || !!ps?.ok,
      ...(teamsN != null ? { teams: teamsN } : {}),
      ...(s.note ? { note: s.note } : {}),
    };
  });
  const from = newSeason ? +P.giornata : statsFrom(prev);
  history = history.filter(h => +h.giornata >= from);
  return { giornata: P.giornata, generated: now.full, mode, statsFrom: from, history, sources, teams };
}

module.exports = { build, accuracy, SOURCES, nowRome };
