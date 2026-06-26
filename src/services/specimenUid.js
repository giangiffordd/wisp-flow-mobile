// ===== AI GENERATED: specimenUid =====
// Purpose: parse Finished Goods UIDs (YY-PREFIX-NNNN) out of scanned QR text
//          and map their prefix to a species, fully offline.
// Inputs: parseUid(scanned) takes the raw string decoded from a QR code
//         (a full URL like https://wispflow.app/u/26-PUL-0001, or a bare UID).
// Returns: parseUid -> { uid, prefix, year, seq } | null
//          speciesForUid -> species display string | null
// Flow:
// 1. PREFIX_SPECIES maps each 3-letter prefix to genus/species/display.
// 2. parseUid regex-extracts (YY)-(PREFIX)-(NNNN+) tolerant of any URL/base
//    around it, uppercases the prefix, and recomposes the UID from the
//    original captured digits (no padding stripped).
// 3. speciesForUid looks up the parsed prefix in PREFIX_SPECIES.

export const PREFIX_SPECIES = {
  PUL: { genus: 'Papilio',  species: 'ulysses',           display: 'Papilio ulysses' },
  PTH: { genus: 'Papilio',  species: 'thoas',             display: 'Papilio thoas' },
  TAG: { genus: 'Thysania', species: 'agripina',          display: 'Thysania agripina' },
  PPU: { genus: 'Phyllium', species: 'pulchrifolium',     display: 'Phyllium pulchrifolium' },
  XGI: { genus: 'Xylotrupes', species: 'gideon',          display: 'Xylotrupes gideon' },
  PBL: { genus: 'Papilio',  species: 'blumei',            display: 'Papilio blumei' },
  PKA: { genus: 'Papilio',  species: 'karna',             display: 'Papilio karna' },
  PPA: { genus: 'Papilio',  species: 'palinurus',         display: 'Papilio palinurus' },
  PRU: { genus: 'Papilio',  species: 'rumanzovia',        display: 'Papilio rumanzovia' },
  PDE: { genus: 'Polyura',  species: 'delphis concha',    display: 'Polyura delphis concha' },
  PIM: { genus: 'Pomponia', species: 'imperatoria',       display: 'Pomponia imperatoria' },
  ILY: { genus: 'Idea',     species: 'lynceus',           display: 'Idea lynceus' },
  ALO: { genus: 'Acrocinus', species: 'longimanus',       display: 'Acrocinus longimanus' },
  CAT: { genus: 'Chalcosoma', species: 'atlas',           display: 'Chalcosoma atlas' },
  DAL: { genus: 'Dorcus',   species: 'alcides',           display: 'Dorcus alcides' },
  HBU: { genus: 'Heliocopris', species: 'bucephalus',     display: 'Heliocopris bucephalus' },
  HDI: { genus: 'Heteropteryx', species: 'dilatata',      display: 'Heteropteryx dilatata' },
  HMA: { genus: 'Hexarthrius', species: 'mandibularis',   display: 'Hexarthrius mandibularis' },
  OSI: { genus: 'Odonyolabis', species: 'siva',           display: 'Odonyolabis siva' },
  PGR: { genus: 'Phryna',   species: 'grosseitaitai',     display: 'Phryna grosseitaitai' },
  LAD: { genus: 'Lamprima', species: 'adolphine',         display: 'Lamprima adolphine' },
  PSA: { genus: 'Prosopocoilus', species: 'savagei',      display: 'Prosopocoilus savagei' },
};

const UID_PATTERN = /(\d{2})-([A-Za-z]{3})-(\d{4,})/;

/**
 * @function parseUid
 * @description Extract a Finished Goods UID from any scanned QR text
 *   (a full URL or a bare UID). Tolerant of any surrounding URL/base.
 * @param {string} scanned
 * @returns {{ uid: string, prefix: string, year: string, seq: string }|null}
 */
export function parseUid(scanned) {
  if (!scanned || typeof scanned !== 'string') return null;
  const match = UID_PATTERN.exec(scanned);
  if (!match) return null;

  const [, yy, rawPrefix, nnnn] = match;
  const prefix = rawPrefix.toUpperCase();
  const uid = `${yy}-${prefix}-${nnnn}`;

  return { uid, prefix, year: yy, seq: nnnn };
}

/**
 * @function speciesForUid
 * @description Look up the species display string for a parsed UID.
 * @param {string} uid - full UID string, e.g. "26-PUL-0001"
 * @returns {string|null} display string, or null if the prefix is unknown
 */
export function speciesForUid(uid) {
  const parsed = parseUid(uid);
  if (!parsed) return null;
  const entry = PREFIX_SPECIES[parsed.prefix];
  return entry ? entry.display : null;
}
