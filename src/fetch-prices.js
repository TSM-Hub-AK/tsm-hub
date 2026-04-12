/**
 * fetch-prices.js
 * Fetches latest metal prices from Metals.dev API
 * Saves raw JSON to data/prices.json
 * 
 * Usage: METALS_API_KEY=xxx node src/fetch-prices.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.METALS_API_KEY;
if (!API_KEY) {
  console.error('ERROR: METALS_API_KEY environment variable is required');
  process.exit(1);
}

// We need two calls:
// 1. LME/Industrial metals in kg (convert to per tonne) — standard LME unit
// 2. Precious metals in troy ounces — standard LBMA/COMEX unit

const endpoints = [
  {
    name: 'industrial',
    url: `https://api.metals.dev/v1/latest?api_key=${API_KEY}&currency=USD&unit=kg`
  },
  {
    name: 'precious',
    url: `https://api.metals.dev/v1/latest?api_key=${API_KEY}&currency=USD&unit=toz`
  }
];

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
  console.log('Fetching metal prices from Metals.dev...');
  
  const results = {};
  
  for (const ep of endpoints) {
    console.log(`  Fetching ${ep.name} metals...`);
    const data = await fetchJSON(ep.url);
    
    if (data.status !== 'success') {
      console.error(`API error for ${ep.name}:`, JSON.stringify(data));
      process.exit(1);
    }
    
    results[ep.name] = data;
  }
  
  // Build unified price object
  const ind = results.industrial.metals;
  const prec = results.precious.metals;
  
  const prices = {
    timestamp: results.precious.timestamps.metal,
    currency_timestamp: results.precious.timestamps.currency,
    fetched_at: new Date().toISOString(),
    
    // Precious metals — USD per troy ounce (as quoted on LBMA/COMEX)
    precious: {
      gold: { price: prec.gold, unit: 'USD/oz', source: 'Spot' },
      silver: { price: prec.silver, unit: 'USD/oz', source: 'Spot' },
      platinum: { price: prec.platinum, unit: 'USD/oz', source: 'Spot' },
      palladium: { price: prec.palladium, unit: 'USD/oz', source: 'Spot' },
      // LBMA fixes
      lbma_gold_am: { price: prec.lbma_gold_am, unit: 'USD/oz', source: 'LBMA AM Fix' },
      lbma_gold_pm: { price: prec.lbma_gold_pm, unit: 'USD/oz', source: 'LBMA PM Fix' },
      lbma_silver: { price: prec.lbma_silver, unit: 'USD/oz', source: 'LBMA Fix' },
      lbma_platinum_am: { price: prec.lbma_platinum_am, unit: 'USD/oz', source: 'LBMA AM Fix' },
      lbma_platinum_pm: { price: prec.lbma_platinum_pm, unit: 'USD/oz', source: 'LBMA PM Fix' },
      lbma_palladium_am: { price: prec.lbma_palladium_am, unit: 'USD/oz', source: 'LBMA AM Fix' },
      lbma_palladium_pm: { price: prec.lbma_palladium_pm, unit: 'USD/oz', source: 'LBMA PM Fix' },
    },
    
    // LME Industrial metals — USD per tonne (as quoted on LME)
    lme: {
      copper: { price: Math.round(ind.lme_copper * 1000), unit: 'USD/t', source: 'LME' },
      aluminum: { price: Math.round(ind.lme_aluminum * 1000), unit: 'USD/t', source: 'LME' },
      nickel: { price: Math.round(ind.lme_nickel * 1000), unit: 'USD/t', source: 'LME' },
      zinc: { price: Math.round(ind.lme_zinc * 1000), unit: 'USD/t', source: 'LME' },
      lead: { price: Math.round(ind.lme_lead * 1000), unit: 'USD/t', source: 'LME' },
    },
    
    // Spot industrial (non-LME branded)
    industrial_spot: {
      copper: { price: Math.round(ind.copper * 1000), unit: 'USD/t', source: 'Spot' },
      aluminum: { price: Math.round(ind.aluminum * 1000), unit: 'USD/t', source: 'Spot' },
      nickel: { price: Math.round(ind.nickel * 1000), unit: 'USD/t', source: 'Spot' },
      zinc: { price: Math.round(ind.zinc * 1000), unit: 'USD/t', source: 'Spot' },
      lead: { price: Math.round(ind.lead * 1000), unit: 'USD/t', source: 'Spot' },
    }
  };
  
  // Save to data directory
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outPath = path.join(dataDir, 'prices.json');
  fs.writeFileSync(outPath, JSON.stringify(prices, null, 2));
  
  console.log(`\nPrices saved to ${outPath}`);
  console.log('\nLME Metals (USD/tonne):');
  for (const [metal, info] of Object.entries(prices.lme)) {
    console.log(`  ${metal}: $${info.price.toLocaleString()}`);
  }
  console.log('\nPrecious Metals (USD/oz):');
  for (const [metal, info] of Object.entries(prices.precious)) {
    if (!metal.startsWith('lbma_')) {
      console.log(`  ${metal}: $${info.price.toLocaleString()}`);
    }
  }
  console.log(`\nData timestamp: ${prices.timestamp}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
