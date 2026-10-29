// Abbinamento dei nomi tra siti diversi ("Nuno Tavares" = "Tavares N.", "Pio Esposito" = "Esposito F.P.", ...)
const norm = s => String(s || "").replace(/[øØ]/g, "o").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[’']/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
const base = c => { let t = norm(c); while (t.length > 1 && t[t.length - 1].length <= 2) t = t.slice(0, -1); return t; };
const inits = c => norm(c).slice(base(c).length);

const ALIAS = {
  // terzini / esterni
  "nuno tavares": "Tavares N.", "diogo leite": "Leite", "yan couto": "Couto", "c augusto": "Carlos Augusto",
  "carlos augusto": "Carlos Augusto", "luis henrique": "Luis Henrique", "danilo veiga": "Veiga D.",
  "floriani": "Floriani Mussolini", "floriani mussolini": "Floriani Mussolini",
  // portieri / difesa
  "lucas perri": "Perri", "josep martinez": "Martinez Jo.", "j martinez": "Martinez Jo.",
  "rafa marin": "Marin R.", "marin rafa": "Marin R.", "dodo": "Dodò", "valde": "Valdepenas",
  "valdepenas": "Valdepenas", "fali cande": "Candè", "cande": "Candè",
  // centrocampo
  "anguissa": "Zambo Anguissa", "zambo anguissa": "Zambo Anguissa", "nico paz": "Paz N.",
  "paz nico": "Paz N.", "kike perez": "Perez K.", "petar sucic": "Sucic P.", "sucic": "Sucic P.",
  "daniel braganca": "Braganca", "braganca": "Braganca", "hutchison": "Hutchinson",
  "ismael kone": "Konè I.", "manu kone": "Konè M.", "kone": "Konè M.",
  "douglas luiz": "Douglas Luiz", "foe ondoa": "Ondoa", "ondoa": "Ondoa",
  // attacco
  "rodrigo mora": "Mora", "goncalo ramos": "Ramos G.", "g ramos": "Ramos G.", "ramos": "Ramos G.",
  "cisse": "Cissè A.", "alphadjo cisse": "Cissè A.", "cisse a": "Cissè A.",
  "pote": "Goncalves P.", "goncalves": "Goncalves P.", "pedro goncalves": "Goncalves P.",
  "junior messias": "Messias", "messias": "Messias",
  "sebastiano esposito": "Esposito Se.", "pio esposito": "Esposito F.P.", "esposito pio": "Esposito F.P.",
  "lautaro": "Martinez L.", "lautaro martinez": "Martinez L.", "l martinez": "Martinez L.",
  "mbala nzola": "Nzola", "gustavo varela": "Varela G.", "varela": "Varela G.",
  "ricardo mangas": "Mangas", "dany mota": "Mota", "mota carvalho": "Mota",
  "akor adams": "Adams A.", "che adams": "Adams C.", "adams c": "Adams C.", "adams a": "Adams A.",
  "schmidt": "Schmid", "ghejdemis": "Ghedjemis", "ghedjemis": "Ghedjemis",
  "akinsamiro": "Akinsanmiro", "akinsanmiro": "Akinsanmiro",
  "estupinian": "Estupinan", "pervis estupinan": "Estupinan",
  "hojlund": "Højlund", "rasmus hojlund": "Højlund",
  "woltemade": "Woltemade", "kolo muani": "Kolo Muani", "muani": "Kolo Muani",
  "de ketelaere": "De Ketelaere", "cdk": "De Ketelaere",
  "soulè": "Soulé", "soule": "Soulé", "dybala": "Dybala",
  "mc tommay": "McTominay", "mctominay": "McTominay", "scott mctominay": "McTominay",
  "calhanoglu": "Çalhanoğlu", "hakan calhanoglu": "Çalhanoğlu",
  "ndicka": "N'Dicka", "evan ndicka": "N'Dicka",
  "rrahmani": "Rrahmani", "amir rrahmani": "Rrahmani",
  "skorupski": "Skorupski", "lukasz skorupski": "Skorupski",
  "maignan": "Maignan", "mike maignan": "Maignan",
  "tomori": "Tomori", "fikayo tomori": "Tomori",
  "pulisic": "Pulisic", "christian pulisic": "Pulisic",
  "modric": "Modrić", "luka modric": "Modrić",
  "barella": "Barella", "nicolo barella": "Barella",
  "dimarco": "Dimarco", "federico dimarco": "Dimarco",
  "thuram": "Thuram", "marcus thuram": "Thuram",
  "bonny": "Bonny", "angelo bonny": "Bonny",
  "berardi": "Berardi", "domenico berardi": "Berardi",
  "or solini": "Orsolini", "orsolini": "Orsolini",
  "zaccagni": "Zaccagni", "mattia zaccagni": "Zaccagni",
  "politano": "Politano", "matteo politano": "Politano",
  "lookman": "Lookman", "adeyemi": "Adeyemi",
  "krstovic": "Krstović", "krstovic n": "Krstović",
  "douvikas": "Douvikas", "baturina": "Baturina",
  "caqueret": "Caqueret", "maxence caqueret": "Caqueret",
  "simeone": "Simeone", "giovanni simeone": "Simeone",
  "vlasic": "Vlašić", "nikola vlasic": "Vlašić",
  "obert": "Obert", "ze pedro": "Zé Pedro", "zé pedro": "Zé Pedro",
};

const TEAM_ALIAS = {
  "cagliari|carlos": "Kevin Carlos", "inter|martinez": "Martinez Jo.", "inter|esposito": "Esposito F.P.",
  "inter|stankovic": "Stankovic A.", "venezia|stankovic": "Stankovic F.", "venezia|adams": "Adams A.",
  "torino|adams": "Adams C.", "atalanta|orbic": "Obric", "sassuolo|esposito": "Esposito Se.",
  "milan|ramos": "Ramos G.", "milan|cisse": "Cissè A.", "napoli|marin": "Marin R.",
  "roma|mora": "Mora", "lazio|tavares": "Tavares N.", "como|paz": "Paz N.",
};

function matchName(name, cands, team) {
  const n = norm(name), key = n.join(" ");
  if (!n.length) return null;
  const ta = TEAM_ALIAS[norm(team || "").join(" ") + "|" + key];
  if (ta && cands.includes(ta)) return ta;
  if (ALIAS[key] && cands.includes(ALIAS[key])) return ALIAS[key];
  // alias senza verificare cands: se il valore è in rosa
  if (ALIAS[key]) {
    const hitA = cands.find(c => norm(c).join(" ") === norm(ALIAS[key]).join(" ") || c === ALIAS[key]);
    if (hitA) return hitA;
  }
  let hit = cands.find(c => norm(c).join(" ") === key); if (hit) return hit;
  hit = cands.filter(c => base(c).join(" ") === key); if (hit.length === 1) return hit[0];
  const n2 = n.filter(x => x.length > 2); const k2 = (n2.length ? n2 : n).join(" ");
  hit = cands.filter(c => base(c).join(" ") === k2);
  if (hit.length > 1) {
    const short = n.filter(x => !base(hit[0]).includes(x));
    const h2 = hit.filter(c => inits(c).some(i => short.some(s => s.startsWith(i))));
    if (h2.length === 1) return h2[0];
  }
  if (hit.length === 1) return hit[0];
  hit = cands.filter(c => { const b = base(c); return b.every(x => n.includes(x)); });
  if (hit.length === 1) return hit[0];
  // cognome solo se univoco in rosa
  const last = (n2.length ? n2 : n).slice(-1)[0];
  if (last && last.length >= 3) {
    hit = cands.filter(c => { const b = base(c); return b[b.length - 1] === last; });
    if (hit.length === 1) return hit[0];
  }
  hit = cands.filter(c => { const b = base(c); return b[b.length - 1] === last || b[0] === last; });
  return hit.length === 1 ? hit[0] : null;
}
const sameTeam = (a, b) => norm(a).join(" ") === norm(b).join(" ");

module.exports = { norm, matchName, sameTeam, ALIAS };
