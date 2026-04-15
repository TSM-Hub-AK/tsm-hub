/**
 * fetch-metals-api.js
 * Fetches metal prices from Metals-API.com for metals NOT covered by Metals.dev
 * Saves to data/metals-api.json
 * 
 * Covers: Cobalt, Lithium, Molybdenum, LME Aluminium Alloy,
 *         Neodymium, Praseodymium, Dysprosium,
 *         Tungsten, Vanadium, Manganese, Ferro Chrome, Titanium, Uranium
 * 
 * Price policy: For exchange-traded metals with standard industry units (LME USD/t,
 * uranium USD/lb etc.) we convert. For OTC/rare metals where the API unit mapping
 * is unclear, we display the raw USD price with the API-stated unit and add a note.
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

// Split into two requests due to API symbol limit per request
const GROUPS = [
  {
    name: 'exchange_traded',
    symbols: 'LCO,LITHIUM,MO,URANIUM,VAN'
  },
  {
    name: 'lme_alloy',
    symbols: 'LME-ALUA'
  },
  {
    name: 'rare_earths',
    symbols: 'ND,PRA,DYS,TUNGSTEN'
  },
  {
    name: 'minor_metals',
    symbols: 'MN,FE-CR,TITANIUM'
  }
];

// Conversion constants
const TROY_OZ_PER_TONNE = 32150.747;
const TROY_OZ_PER_LB = 14.5833;
const OZ_PER_TONNE = 35274.0;

// Metal configuration
// convert: function(rawUsdPrice) → converted price, or null to use raw
const METAL_CONFIG = {
  // ─── Exchange-traded: reliable conversions ───
  'LCO': {
    key: 'cobalt', name: 'Cobalt', exchange: 'LME',
    unit: 'USD/t', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_TONNE),
    note: 'LME cash-settled cobalt contract'
  },
  'LITHIUM': {
    key: 'lithium', name: 'Lithium', exchange: 'LME',
    unit: 'USD/t', sourceUnit: 'oz',
    convert: (p) => Math.round(p * OZ_PER_TONNE),
    note: 'LME cash-settled lithium hydroxide'
  },
  'MO': {
    key: 'molybdenum', name: 'Molybdenum', exchange: 'LME',
    unit: 'USD/lb', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_LB * 100) / 100,
    note: 'LME cash-settled molybdenum (Platts)'
  },
  'LME-ALUA': {
    key: 'aluminium_alloy', name: 'Aluminium Alloy', exchange: 'LME',
    unit: 'USD/t', sourceUnit: 'tonne',
    convert: (p) => Math.round(p),
    note: 'LME NASAAC (North American Special Aluminium Alloy Contract)'
  },
  'URANIUM': {
    key: 'uranium', name: 'Uranium (U₃O₈)', exchange: 'UxC/TradeTech',
    unit: 'USD/lb', sourceUnit: 'lb',
    convert: (p) => Math.round(p * 100) / 100,
    note: 'Spot U₃O₈ (yellowcake)'
  },
  'VAN': {
    key: 'vanadium', name: 'Vanadium Pentoxide', exchange: 'OTC',
    unit: 'USD/lb', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_LB * 100) / 100,
    note: 'V₂O₅ benchmark (Fastmarkets)'
  },
  'FE-CR': {
    key: 'ferrochrome', name: 'Ferro Chrome', exchange: 'OTC',
    unit: 'USD/lb', sourceUnit: 'troy oz',
    convert: (p) => Math.round(p * TROY_OZ_PER_LB * 100) / 100,
    note: 'High-carbon ferrochrome (Cr content basis)'
  },
  // ─── Rare earths & minor metals: show raw API price ───
  // These metals have no standardised exchange unit; API units may not match
  // industry conventions. We show prices as provided by source.
  'ND': {
    key: 'neodymium', name: 'Neodymium', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,  // raw price
    note: 'Nd metal price per oz (Metals-API). Industry benchmarks: Fastmarkets, Asian Metal, SMM (typically quoted in USD/kg for oxide)'
  },
  'PRA': {
    key: 'praseodymium', name: 'Praseodymium', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Pr metal price per oz (Metals-API). Industry benchmarks: Fastmarkets, Asian Metal, SMM (typically quoted in USD/kg for oxide)'
  },
  'DYS': {
    key: 'dysprosium', name: 'Dysprosium', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Dy metal price per oz (Metals-API). Industry benchmarks: Fastmarkets, Asian Metal, SMM (typically quoted in USD/kg for oxide)'
  },
  'TUNGSTEN': {
    key: 'tungsten', name: 'Tungsten APT', exchange: 'OTC',
    unit: 'USD/troy oz', sourceUnit: 'troy oz',
    convert: null,
    note: 'APT (Ammonium Paratungstate) per troy oz (Metals-API). Industry benchmark: USD/mtu (Fastmarkets, Asian Metal)'
  },
  'MN': {
    key: 'manganese', name: 'Manganese', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Mn price per oz (Metals-API). Industry benchmarks: Mn ore in USD/dmtu, electrolytic Mn in USD/t (Asian Metal, Fastmarkets)'
  },
  'TITANIUM': {
    key: 'titanium', name: 'Titanium Sponge', exchange: 'OTC',
    unit: 'USD/oz', sourceUnit: 'oz',
    convert: null,
    note: 'Ti sponge price per oz (Metals-API). Industry benchmarks: USD/kg (Asian Metal, Fastmarkets)'
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
        continue; // Skip this group, don't abort
      }
      
      // Check for holiday/no-data responses
      if (data.info && data.info.includes('holiday')) {
        console.warn(`  NOTE: ${group.name} — ${data.info}`);
      }
      
      Object.assign(allRates, data.rates);
    } catch (err) {
      console.warn(`  WARNING: Failed to fetch ${group.name}: ${err.message}`);
      // Continue with other groups
    }
  }
  
  // Build structured output
  const metals = {};
  
  for (const [symbol, config] of Object.entries(METAL_CONFIG)) {
    const usdKey = `USD${symbol}`;
    const rawPrice = allRates[usdKey];
    
    if (rawPrice === undefined || rawPrice === null) {
      console.warn(`  WARNING: No price for ${symbol} (${config.name})`);
      metals[config.key] = {
        name: config.name,
        price: null,
        unit: config.unit,
        exchange: config.exchange,
        raw_usd: null,
        raw_unit: config.sourceUnit,
        note: 'Price not available',
      };
      continue;
    }
    
    const displayPrice = config.convert ? config.convert(rawPrice) : (Math.round(rawPrice * 100) / 100);
    
    metals[config.key] = {
      name: config.name,
      price: displayPrice,
      unit: config.unit,
      exchange: config.exchange,
      raw_usd: Math.round(rawPrice * 10000) / 10000,
      raw_unit: config.sourceUnit,
      note: config.note,
    };
    
    console.log(`  ${config.name}: $${displayPrice !== null ? displayPrice.toLocaleString() : 'N/A'} ${config.unit} (raw: $${rawPrice.toFixed(4)} per ${config.sourceUnit})`);
  }
  
  const output = {
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    source: 'Metals-API.com',
    source_url: 'https://metals-api.com',
    note: 'Exchange-traded metals converted to standard industry units. OTC/rare earth prices shown as provided by API — industry benchmark pricing (Fastmarkets, Asian Metal, SMM) may use different units.',
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
  console.log(`Metals fetched: ${Object.keys(metals).length}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
