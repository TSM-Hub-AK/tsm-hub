/**
 * fetch-shfe.js
 * Fetches SHFE (Shanghai Futures Exchange) daily settlement prices
 * for ALL metals traded on SHFE. Saves to data/shfe.json
 * 
 * No API key needed — public endpoints.
 * Prices in RMB/tonne (native SHFE units).
 * 
 * Metals covered:
 *   cu (Copper), al (Aluminium), zn (Zinc), pb (Lead), ni (Nickel), sn (Tin)
 *   ao (Aluminium Oxide), ad (Cast Aluminium Alloy)
 *   au (Gold — RMB/g), ag (Silver — RMB/kg)
 *   rb (Steel Rebar), hc (Hot Rolled Coils), ss (Stainless Steel), wr (Wire Rod)
 * 
 * Endpoints used:
 *   /data/config/currentTradingday.dat — current & last trading day
 *   /data/tradedata/future/dailydata/kx{DATE}.dat — daily express (product summary)
 *   /data/tradedata/future/dailydata/js{DATE}.dat — settlement prices (per contract)
 * 
 * Usage: node src/fetch-shfe.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.shfe.com.cn/data/tradedata/future/dailydata';
const CONFIG_URL = 'https://www.shfe.com.cn/data/config/currentTradingday.dat';

// All SHFE metals we track — product_id prefix → display config
const SHFE_METALS = {
  cu:  { name: 'Copper',               unit: 'RMB/t',  category: 'base' },
  al:  { name: 'Aluminium',            unit: 'RMB/t',  category: 'base' },
  zn:  { name: 'Zinc',                 unit: 'RMB/t',  category: 'base' },
  pb:  { name: 'Lead',                 unit: 'RMB/t',  category: 'base' },
  ni:  { name: 'Nickel',               unit: 'RMB/t',  category: 'base' },
  sn:  { name: 'Tin',                  unit: 'RMB/t',  category: 'base' },
  ao:  { name: 'Aluminium Oxide',      unit: 'RMB/t',  category: 'base' },
  ad:  { name: 'Cast Aluminium Alloy', unit: 'RMB/t',  category: 'base' },
  au:  { name: 'Gold',                 unit: 'RMB/g',  category: 'precious' },
  ag:  { name: 'Silver',               unit: 'RMB/kg', category: 'precious' },
  rb:  { name: 'Steel Rebar',          unit: 'RMB/t',  category: 'steel' },
  hc:  { name: 'Hot Rolled Coils',     unit: 'RMB/t',  category: 'steel' },
  ss:  { name: 'Stainless Steel',      unit: 'RMB/t',  category: 'steel' },
  wr:  { name: 'Wire Rod',             unit: 'RMB/t',  category: 'steel' },
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; TSMHub/1.0)',
        'Referer': 'https://www.shfe.com.cn/eng/reports/StatisticalData/DailyData/'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout fetching ' + url));
    });
  });
}

async function main() {
  console.log('Fetching SHFE data (all metals)...');
  
  // 1. Get current trading day
  console.log('  Getting current trading day...');
  const config = await fetchJSON(CONFIG_URL);
  const tradingDay = config.currentTradingday;
  const lastTradingDay = config.lastTradingday;
  console.log(`  Current: ${tradingDay}, Last: ${lastTradingDay}`);
  
  // 2. Fetch settlement prices (try current day, fall back to last)
  let dateToUse = tradingDay;
  let settlement;
  
  try {
    console.log(`  Fetching settlement for ${dateToUse}...`);
    settlement = await fetchJSON(`${BASE}/js${dateToUse}.dat`);
    // Verify we have data — check for any metal
    const hasData = (settlement.o_cursor || []).some(r => 
      r.PRODUCTID && r.SETTLEMENTPRICE && r.SETTLEMENTPRICE > 0
    );
    if (!hasData) throw new Error('No settlement data for today yet');
  } catch (err) {
    console.log(`  Fallback to ${lastTradingDay}: ${err.message}`);
    dateToUse = lastTradingDay;
    settlement = await fetchJSON(`${BASE}/js${dateToUse}.dat`);
  }
  
  // 3. Fetch daily express (product-level summary)
  let express = null;
  try {
    console.log(`  Fetching daily express for ${dateToUse}...`);
    express = await fetchJSON(`${BASE}/kx${dateToUse}.dat`);
  } catch (err) {
    console.log(`  Daily express unavailable: ${err.message}`);
  }
  
  // 4. Extract data for ALL metals
  const allContracts = settlement.o_cursor || [];
  const allProducts = express ? (express.o_curproduct || []) : [];
  
  const metals = {};
  
  for (const [prefix, config] of Object.entries(SHFE_METALS)) {
    // Get all settlement contracts for this metal
    // SHFE uses prefix_f format (e.g. 'ni_f', 'cu_f') in both settlement and express data
    const productId = `${prefix}_f`;
    const contracts = allContracts
      .filter(r => r.PRODUCTID && r.PRODUCTID.trim() === productId)
      .map(r => ({
        contract: r.INSTRUMENTID ? r.INSTRUMENTID.trim() : '',
        settlement_price: r.SETTLEMENTPRICE || 0,
        open: r.OPENPRICE || 0,
        high: r.HIGHESTPRICE || 0,
        low: r.LOWESTPRICE || 0,
        close: r.CLOSEPRICE || 0,
        volume: r.VOLUME || 0,
        open_interest: r.OPENINTEREST || 0,
      }))
      .filter(r => r.settlement_price > 0);
    
    // Front-month = first contract with settlement > 0 and volume > 0
    const frontMonth = contracts.find(c => c.volume > 0) || contracts[0] || null;
    
    // Product summary from daily express
    const prodExpress = allProducts.find(p => 
      p.PRODUCTID && p.PRODUCTID.trim() === `${prefix}_f`
    );
    
    let summary = null;
    if (prodExpress) {
      summary = {
        total_volume: prodExpress.VOLUME || 0,
        day_high: prodExpress.HIGHESTPRICE || 0,
        day_low: prodExpress.LOWESTPRICE || 0,
        avg_price: prodExpress.AVGPRICE ? Math.round(prodExpress.AVGPRICE * 100) / 100 : 0,
      };
    }
    
    metals[prefix] = {
      name: config.name,
      unit: config.unit,
      category: config.category,
      front_month: frontMonth,
      summary: summary,
      contract_count: contracts.length,
    };
  }
  
  // 5. Build output
  const shfeData = {
    date: dateToUse,
    date_formatted: `${dateToUse.slice(0,4)}-${dateToUse.slice(4,6)}-${dateToUse.slice(6,8)}`,
    fetched_at: new Date().toISOString(),
    source: 'Shanghai Futures Exchange (SHFE)',
    source_url: 'https://www.shfe.com.cn/eng/reports/StatisticalData/DailyData/',
    metals: metals,
  };
  
  // 6. Save
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outPath = path.join(dataDir, 'shfe.json');
  fs.writeFileSync(outPath, JSON.stringify(shfeData, null, 2));
  
  // 7. Report
  console.log(`\nSHFE data saved to ${outPath}`);
  console.log(`Date: ${shfeData.date_formatted}`);
  console.log(`\nMetals summary:`);
  
  for (const [key, metal] of Object.entries(metals)) {
    const fm = metal.front_month;
    if (fm) {
      const priceStr = metal.unit === 'RMB/g' 
        ? `¥${fm.settlement_price.toFixed(2)}` 
        : `¥${fm.settlement_price.toLocaleString()}`;
      console.log(`  ${metal.name} (${key}): ${priceStr} ${metal.unit} [${fm.contract}] (${metal.contract_count} contracts)`);
    } else {
      console.log(`  ${metal.name} (${key}): No data`);
    }
  }
}

main().catch(err => {
  console.error('WARNING: SHFE fetch failed:', err.message);
  console.log('Continuing without SHFE data — Hub will show last available or N/A.');
  // Do NOT exit with code 1 — let workflow continue
  process.exit(0);
});
