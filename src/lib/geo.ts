// Small geography tables shared by entity resolution and relevance scoring:
// country names, demonyms, major startup cities, and regions. Deliberately
// limited to places this app sees; unknown places simply match by name.

export const DEMONYMS: Record<string, string[]> = {
  india: ["indian"], "united kingdom": ["british", "uk", "english", "scottish"], "united states": ["american", "us", "u.s."],
  germany: ["german"], france: ["french"], italy: ["italian"], spain: ["spanish"], netherlands: ["dutch"],
  sweden: ["swedish"], denmark: ["danish"], norway: ["norwegian"], finland: ["finnish"], ireland: ["irish"],
  israel: ["israeli"], switzerland: ["swiss"], austria: ["austrian"], belgium: ["belgian"], poland: ["polish"],
  estonia: ["estonian"], portugal: ["portuguese"], nigeria: ["nigerian"], kenya: ["kenyan"], "south africa": ["south african"],
  egypt: ["egyptian"], brazil: ["brazilian"], mexico: ["mexican"], canada: ["canadian"], australia: ["australian"],
  singapore: ["singaporean"], japan: ["japanese"], china: ["chinese"], "south korea": ["korean", "south korean"],
  indonesia: ["indonesian"], "united arab emirates": ["emirati", "uae"], "saudi arabia": ["saudi"], hungary: ["hungarian"],
  "czech republic": ["czech"], czechia: ["czech"], slovakia: ["slovak"], romania: ["romanian"], ukraine: ["ukrainian"],
  turkey: ["turkish"], argentina: ["argentine", "argentinian"], colombia: ["colombian"], chile: ["chilean"],
  "new zealand": ["new zealander", "kiwi"], lithuania: ["lithuanian"], latvia: ["latvian"], greece: ["greek"],
  bulgaria: ["bulgarian"], croatia: ["croatian"], serbia: ["serbian"], luxembourg: ["luxembourgish"],
};

export const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states", us: "united states", "united states of america": "united states", america: "united states",
  uk: "united kingdom", "great britain": "united kingdom", britain: "united kingdom", england: "united kingdom",
  uae: "united arab emirates", korea: "south korea", holland: "netherlands",
};

export function normCountry(country: string): string {
  const k = country.toLowerCase().replace(/^the /, "").replace(/\./g, "").trim();
  return COUNTRY_ALIASES[k] ?? k;
}

// Major startup hubs, so "Munich-based" counts as Germany.
export const CITIES: Record<string, string[]> = {
  germany: ["berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "darmstadt", "heidelberg", "karlsruhe", "dresden", "leipzig"],
  india: ["bengaluru", "bangalore", "mumbai", "delhi", "new delhi", "gurugram", "gurgaon", "hyderabad", "pune", "chennai", "noida", "kolkata", "ahmedabad"],
  japan: ["tokyo", "osaka", "kyoto", "yokohama", "nagoya", "fukuoka"],
  "united kingdom": ["london", "manchester", "edinburgh", "cambridge", "oxford", "bristol", "leeds"],
  france: ["paris", "lyon", "marseille", "toulouse", "nantes"],
  "united states": ["san francisco", "silicon valley", "new york", "boston", "seattle", "austin", "los angeles"],
  netherlands: ["amsterdam", "rotterdam", "eindhoven", "utrecht"],
  spain: ["madrid", "barcelona", "valencia"], italy: ["milan", "rome", "turin"], sweden: ["stockholm", "gothenburg"],
  switzerland: ["zurich", "zürich", "geneva", "lausanne"], israel: ["tel aviv", "jerusalem", "haifa"],
  nigeria: ["lagos", "abuja"], kenya: ["nairobi"], egypt: ["cairo", "alexandria"], brazil: ["são paulo", "sao paulo", "rio de janeiro"],
  singapore: [], canada: ["toronto", "montreal", "vancouver"], australia: ["sydney", "melbourne", "brisbane"],
  "south korea": ["seoul"], china: ["beijing", "shanghai", "shenzhen"], "united arab emirates": ["dubai", "abu dhabi"],
  estonia: ["tallinn"], denmark: ["copenhagen"], finland: ["helsinki"], ireland: ["dublin"], portugal: ["lisbon", "porto"],
  poland: ["warsaw", "krakow", "kraków"], austria: ["vienna"], belgium: ["brussels", "antwerp"], "south africa": ["cape town", "johannesburg"],
};

// Regions expand to their countries.
export const REGIONS: Record<string, { words: string[]; countries: string[] }> = {
  europe: {
    words: ["europe", "european", "eu", "emea"],
    countries: [
      "germany", "france", "italy", "spain", "netherlands", "sweden", "denmark", "norway", "finland", "ireland", "switzerland",
      "austria", "belgium", "poland", "estonia", "portugal", "united kingdom", "czechia", "slovakia", "romania", "ukraine",
      "hungary", "lithuania", "latvia", "greece", "bulgaria", "croatia", "serbia", "luxembourg",
    ],
  },
  africa: { words: ["africa", "african"], countries: ["nigeria", "kenya", "egypt", "south africa"] },
  "latin america": { words: ["latin america", "latam", "latin american"], countries: ["brazil", "mexico", "argentina", "colombia", "chile"] },
  asia: { words: ["asia", "asian", "apac"], countries: ["india", "japan", "china", "singapore", "south korea", "indonesia"] },
  "middle east": { words: ["middle east", "mena", "gulf"], countries: ["united arab emirates", "saudi arabia", "israel", "egypt", "turkey"] },
};

// Every phrase that indicates `place` (a country or region): its name,
// demonyms, aliases and major cities; for a region, all of its countries'.
export function placePhrases(place: string): string[] {
  const p = normCountry(place);
  const countryPhrases = (c: string) => [
    c,
    ...(DEMONYMS[c] ?? []),
    ...(CITIES[c] ?? []),
    ...Object.entries(COUNTRY_ALIASES)
      .filter(([, v]) => v === c)
      .map(([k]) => k),
  ];
  const region = REGIONS[p];
  if (region) return [...new Set([...region.words, ...region.countries.flatMap(countryPhrases)])];
  return [...new Set(countryPhrases(p))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whether `phrase` occurs in `text` as a whole word. Short phrases ("us",
// "uk", "eu", "uae") must be written in capitals, or "contact us" would
// count as coverage of the United States.
export function mentionsPhrase(text: string, phrase: string): boolean {
  if (phrase.replace(/\./g, "").length <= 3) {
    return new RegExp(`(^|[^A-Za-z])${escape(phrase.toUpperCase())}($|[^A-Za-z])`).test(text);
  }
  return new RegExp(`(^|[^\\p{L}])${escape(phrase)}($|[^\\p{L}])`, "iu").test(text);
}

// Recognized places mentioned in a text (countries, aliases, regions).
export function findPlaces(text: string): string[] {
  const names = [...Object.keys(DEMONYMS), ...Object.keys(COUNTRY_ALIASES), ...Object.keys(REGIONS)];
  return [...new Set(names.filter((n) => mentionsPhrase(text, n)).map((n) => (REGIONS[n] ? n : normCountry(n))))];
}
