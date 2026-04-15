/**
 * fetch-metals-api.js
 * Fetches metal prices from Metals-API.com for metals NOT covered by Metals.dev
 * Saves to data/metals-api.json
 * 
 * Coverage: 39 metals across 7 groups
 *   - LME Cash-Settled (Cobalt, Lithium, Molybdenum, Aluminium Alloy)
 *   - PGMs (Rhodium, Iridium, Ruthenium, Osmium)
 *   - Energy & Strategic (Uranium, Vanadium, Ferro Chrome, Ferro Silicon)
 *   - Rare Earths (Neodymium, Praseodymium, Dysprosium, Lanthanum, Terbium)
 *   - Minor/Specialty Metals (Tungsten, Titanium, Antimony, Gallium, Germanium,
 *     Hafnium, Indium, Magnesium, Rhenium, Tellurium, Manganese)
 *   - Battery/EV Chain (Cobalt Sulphate, Lithium Hydroxide, Lithium Carbonate,
 *     Spodumene, Manganese Sulphate, Nickel Pig Iron)
 *   - Iron Ore (62% Fe, 58% Fe, 65% Fe)
 * 
 * Price policy: For exchange-traded metals with standard industry units we convert.
 * For OTC/rare metals we display raw USD price with API-stated unit.
 * "Primary data only. No estimates. No interpretation."
 * 
 * Usage: METALS_API_COM_KEY=xxx node src/fetch-metals-api.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.METALS_API_COM_KEY;
if (!API_KEY) {
  console.error('ERROR: METALS_API_COM_KEY environment variable is required');
  process.exit(1);
}

// API has ~5-6 symbol limit per request, split into groups
const GROUPS = [
  { name: 'lme_cash',      symbols: 'LCO,LITHIUM,MO,URANIUM,VAN' },
  { name: 'lme_alloy',     symbols: 'LME-ALUA' },
  { name: 'pgm',           symbols: 'XRH,IRD,RUTH,OSMIUM' },
  { name: 'rare_earths',   symbols: 'ND,PRA,DYS,LTH,TER' },
  { name: 'minor_1',       symbols: 'TUNGSTEN,MN,FE-CR,FE-SI,TITANIUM' },
  { name: 'minor_2',       symbols: 'ANTIMONY,GALLIUM,GER,HAF,INDIUM' },
  { name: 'minor_3',       symbols: 'MG,RHENIUM,TE' },
  { name: 'battery_1',     symbols: 'CO-SO4,LI-OH,LITH-CAR,SPOD' },
  { name: 'battery_2',     symbols: 'MN-SO4,NPI' },
  { name: 'iron_ore',      symbols: 'IRON62,IRON58,IRON65' },
];

// Conversion constants
const TROY_OZ_PER_TONNE = 32150.747;
const TROY_OZ_PER_LB = 14.5833;
const OZ_PER_TONNE = 35274.0;

// Metal configuration: symbol → display config
// convert: function(rawUsdPrice) → converted price, or null → show raw
const METAL_CONFIG = {
  // ─── LME Cash-Settled ───
  'LCO': {
    key: 'cobalt', name: 'Cobalt', group: 'lme_cash', exchange: 'LME',
    unit: 'USD/t', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_TONNE),
    note: 'LME cash-settled cobalt'
  },
  'LITHIUM': {
    key: 'lithium', name: 'Lithium', group: 'lme_cash', exchange: 'LME',
    unit: 'USD/t', sourceUnit: 'oz',
    convert: (p) => Math.round(p * OZ_PER_TONNE),
    note: 'LME cash-settled lithium hydroxide'
  },
  'MO': {
    key: 'molybdenum', name: 'Molybdenum', group: 'lme_cash', exchange: 'LME',
    unit: 'USD/lb', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_LB * 100) / 100,
    note: 'LME cash-settled molybdenum (Platts)'
  },
  'LME-ALUA': {
    key: 'aluminium_alloy', name: 'Aluminium Alloy', group: 'lme_cash', exchange: 'LME',
    unit: 'USD/t', sourceUnit: 'tonne',
    convert: (p) => Math.round(p),
    note: 'LME NASAAC'
  },

  // ─── PGMs (Platinum Group Metals) ───
  'XRH': {
    key: 'rhodium', name: 'Rhodium', group: 'pgm', exchange: 'LPPM/JM',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Johnson Matthey base price'
  },
  'IRD': {
    key: 'iridium', name: 'Iridium', group: 'pgm', exchange: 'LPPM/JM',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Johnson Matthey base price'
  },
  'RUTH': {
    key: 'ruthenium', name: 'Ruthenium', group: 'pgm', exchange: 'LPPM/JM',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Johnson Matthey base price'
  },
  'OSMIUM': {
    key: 'osmium', name: 'Osmium', group: 'pgm', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'Dealer price'
  },

  // ─── Energy & Strategic ───
  'URANIUM': {
    key: 'uranium', name: 'Uranium (U₃O₈)', group: 'strategic', exchange: 'UxC/TradeTech',
    unit: 'USD/lb', sourceUnit: 'lb',
    convert: (p) => Math.round(p * 100) / 100,
    note: 'Spot U₃O₈'
  },
  'VAN': {
    key: 'vanadium', name: 'Vanadium Pentoxide', group: 'strategic', exchange: 'OTC',
    unit: 'USD/lb', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_LB * 100) / 100,
    note: 'V₂O₅ (Fastmarkets)'
  },
  'FE-CR': {
    key: 'ferrochrome', name: 'Ferro Chrome', group: 'strategic', exchange: 'OTC',
    unit: 'USD/lb', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_LB * 100) / 100,
    note: 'High-carbon FeCr (Cr basis)'
  },
  'FE-SI': {
    key: 'ferrosilicon', name: 'Ferro Silicon', group: 'strategic', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'FeSi benchmark'
  },

  // ─── Rare Earths ───
  'ND': {
    key: 'neodymium', name: 'Neodymium', group: 'rare_earths', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Nd metal (Metals-API). Benchmark: Fastmarkets, Asian Metal, SMM in USD/kg oxide'
  },
  'PRA': {
    key: 'praseodymium', name: 'Praseodymium', group: 'rare_earths', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Pr metal (Metals-API). Benchmark: Fastmarkets, Asian Metal, SMM in USD/kg oxide'
  },
  'DYS': {
    key: 'dysprosium', name: 'Dysprosium', group: 'rare_earths', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Dy metal (Metals-API). Benchmark: Fastmarkets, Asian Metal, SMM in USD/kg oxide'
  },
  'LTH': {
    key: 'lanthanum', name: 'Lanthanum', group: 'rare_earths', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'La metal (Metals-API)'
  },
  'TER': {
    key: 'terbium', name: 'Terbium', group: 'rare_earths', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Tb metal (Metals-API)'
  },

  // ─── Minor / Specialty Metals ───
  'TUNGSTEN': {
    key: 'tungsten', name: 'Tungsten APT', group: 'minor', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'APT (Metals-API). Benchmark: USD/mtu (Fastmarkets)'
  },
  'MN': {
    key: 'manganese', name: 'Manganese', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Mn (Metals-API). Benchmark: Mn ore USD/dmtu, EMM USD/t'
  },
  'TITANIUM': {
    key: 'titanium', name: 'Titanium Sponge', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Ti sponge (Metals-API). Benchmark: USD/kg'
  },
  'ANTIMONY': {
    key: 'antimony', name: 'Antimony', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Sb ingot (Metals-API)'
  },
  'GALLIUM': {
    key: 'gallium', name: 'Gallium', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Ga 99.99% (Metals-API)'
  },
  'GER': {
    key: 'germanium', name: 'Germanium', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Ge 99.999% (Metals-API)'
  },
  'HAF': {
    key: 'hafnium', name: 'Hafnium', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Hf crystal bar (Metals-API)'
  },
  'INDIUM': {
    key: 'indium', name: 'Indium', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'In 99.99% (Metals-API)'
  },
  'MG': {
    key: 'magnesium', name: 'Magnesium', group: 'minor', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'Mg 99.9% (Metals-API)'
  },
  'RHENIUM': {
    key: 'rhenium', name: 'Rhenium', group: 'minor', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'Re pellets (Metals-API)'
  },
  'TE': {
    key: 'tellurium', name: 'Tellurium', group: 'minor', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Te 99.99% (Metals-API)'
  },

  // ─── Battery / EV Chain ───
  'CO-SO4': {
    key: 'cobalt_sulphate', name: 'Cobalt Sulphate', group: 'battery', exchange: 'OTC',
    unit: 'USD/t', sourceUnit: 'metric ton',
    convert: (p) => Math.round(p),
    note: 'CoSO₄ (Fastmarkets/Asian Metal)'
  },
  'LI-OH': {
    key: 'lithium_hydroxide', name: 'Lithium Hydroxide', group: 'battery', exchange: 'OTC',
    unit: 'USD/t', sourceUnit: 'metric ton',
    convert: (p) => Math.round(p),
    note: 'LiOH·H₂O battery grade (Fastmarkets)'
  },
  'LITH-CAR': {
    key: 'lithium_carbonate', name: 'Lithium Carbonate', group: 'battery', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'Li₂CO₃ battery grade (Metals-API)'
  },
  'SPOD': {
    key: 'spodumene', name: 'Spodumene Concentrate', group: 'battery', exchange: 'OTC',
    unit: 'USD/t', sourceUnit: 'metric ton',
    convert: (p) => Math.round(p),
    note: 'SC6 spodumene CIF China (Fastmarkets)'
  },
  'MN-SO4': {
    key: 'manganese_sulphate', name: 'Manganese Sulphate', group: 'battery', exchange: 'OTC',
    unit: 'USD/t', sourceUnit: 'metric ton',
    convert: (p) => Math.round(p),
    note: 'MnSO₄ battery grade'
  },
  'NPI': {
    key: 'nickel_pig_iron', name: 'Nickel Pig Iron', group: 'battery', exchange: 'OTC',
    unit: 'USD/t', sourceUnit: 'metric ton',
    convert: (p) => Math.round(p),
    note: 'NPI (Indonesia/China)'
  },

  // ─── Iron Ore ───
  'IRON62': {
    key: 'iron_ore_62', name: 'Iron Ore 62% Fe', group: 'iron_ore', exchange: 'SGX/Platts',
    unit: 'USD/dmt', sourceUnit: 'dmt',
    convert: (p) => Math.round(p * 100) / 100,
    note: 'CFR China (Platts IODEX)'
  },
  'IRON58': {
    key: 'iron_ore_58', name: 'Iron Ore 58% Fe', group: 'iron_ore', exchange: 'OTC',
    unit: 'USD/dmt', sourceUnit: 'dmt',
    convert: (p) => Math.round(p * 100) / 100,
    note: 'CFR China'
  },
  'IRON65': {
    key: 'iron_ore_65', name: 'Iron Ore 65% Fe', group: 'iron_ore', exchange: 'OTC',
    unit: 'USD/dmt', sourceUnit: 'dmt',
    convert: (p) => Math.round(p * 100) / 100,
    note: 'CFR China (65% Fe premium)'
  },
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse API response: ' + data.substring(0, 200)));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching metal prices from Metals-API.com...');
  
  const allRates = {};
  
  for (const group of GROUPS) {
    const url = `https://metals-api.com/api/latest?access_key=${API_KEY}&base=USD&symbols=${group.symbols}`;
    console.log(`  Fetching ${group.name}...`);
    
    try {
      const data = await fetchJSON(url);
      
      if (!data.success) {
        console.warn(`  WARNING: API error for ${group.name}:`, JSON.stringify(data.error || data));
        continue;
      }
      
      if (data.info && data.info.includes('holiday')) {
        console.warn(`  NOTE: ${group.name} — ${data.info}`);
      }
      
      Object.assign(allRates, data.rates);
    } catch (err) {
      console.warn(`  WARNING: Failed to fetch ${group.name}: ${err.message}`);
    }
  }
  
  // Build structured output
  const metals = {};
  let fetched = 0;
  let missing = 0;
  
  for (const [symbol, config] of Object.entries(METAL_CONFIG)) {
    const usdKey = `USD${symbol}`;
    const rawPrice = allRates[usdKey];
    
    if (rawPrice === undefined || rawPrice === null) {
      missing++;
      metals[config.key] = {
        name: config.name,
        price: null,
        unit: config.unit,
        group: config.group,
        exchange: config.exchange,
        raw_usd: null,
        raw_unit: config.sourceUnit,
        note: config.note + ' — Price not available',
      };
      continue;
    }
    
    const displayPrice = config.convert ? config.convert(rawPrice) : (Math.round(rawPrice * 100) / 100);
    fetched++;
    
    metals[config.key] = {
      name: config.name,
      price: displayPrice,
      unit: config.unit,
      group: config.group,
      exchange: config.exchange,
      raw_usd: Math.round(rawPrice * 10000) / 10000,
      raw_unit: config.sourceUnit,
      note: config.note,
    };
    
    console.log(`  ${config.name}: $${displayPrice !== null ? displayPrice.toLocaleString() : 'N/A'} ${config.unit}`);
  }
  
  const output = {
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    source: 'Metals-API.com',
    source_url: 'https://metals-api.com',
    note: 'Exchange-traded metals converted to standard industry units. OTC/rare earth/minor metal prices shown as provided by API — industry benchmark pricing (Fastmarkets, Asian Metal, SMM) may use different units.',
    metals: metals,
  };
  
  // Save
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outPath = path.join(dataDir, 'metals-api.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  
  console.log(`\nPrices saved to ${outPath}`);
  console.log(`Fetched: ${fetched}/${fetched + missing} metals`);
  if (missing > 0) console.log(`Missing: ${missing} metals (holiday or unavailable)`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
