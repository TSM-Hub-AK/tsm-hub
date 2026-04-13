/**
 * fetch-shfe.js
 * Fetches SHFE (Shanghai Futures Exchange) daily settlement prices
 * and trading data for Nickel via direct SHFE JSON API.
 * Saves to data/shfe.json
 * 
 * No API key needed — public endpoints.
 * Prices in RMB/tonne (native SHFE units).
 * 
 * Endpoints used:
 *   /data/config/currentTradingday.dat — current & last trading day
 *   /data/tradedata/future/dailydata/js{DATE}.dat — settlement prices (per contract)
 *   /data/tradedata/future/dailydata/kx{DATE}.dat — daily express (product summary)
 * 
 * Usage: node src/fetch-shfe.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.shfe.com.cn/data/tradedata/future/dailydata';
const CONFIG_URL = 'https://www.shfe.com.cn/data/config/currentTradingday.dat';

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
  console.log('Fetching SHFE data...');
  
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
    const niCheck = (settlement.o_cursor || []).filter(r => 
      r.PRODUCTID && r.PRODUCTID.startsWith('ni')
    );
    if (niCheck.length === 0) throw new Error('No nickel data');
  } catch (err) {
    console.log(`  Fallback to ${lastTradingDay}: ${err.message}`);
    dateToUse = lastTradingDay;
    settlement = await fetchJSON(`${BASE}/js${dateToUse}.dat`);
  }
  
  // 3. Fetch daily express (product-level summary: volume, high, low, avg)
  let express = null;
  try {
    console.log(`  Fetching daily express for ${dateToUse}...`);
    express = await fetchJSON(`${BASE}/kx${dateToUse}.dat`);
  } catch (err) {
    console.log(`  Daily express unavailable: ${err.message}`);
  }
  
  // 4. Extract nickel settlement data
  const niSettlement = (settlement.o_cursor || [])
    .filter(r => r.PRODUCTID && r.PRODUCTID.startsWith('ni'))
    .map(r => ({
      contract: r.INSTRUMENTID,
      settlement_price: r.SETTLEMENTPRICE,
      unit: 'RMB/t',
      margin_long: r.SPECLONGMARGINRATIO,
      margin_short: r.SPECSHORTMARGINRATIO
    }));
  
  // 5. Extract product summary from daily express
  let productSummary = null;
  if (express) {
    const products = express.o_curproduct || [];
    const niProd = products.find(p => p.PRODUCTID && p.PRODUCTID.trim() === 'ni_f');
    if (niProd) {
      productSummary = {
        total_volume: niProd.VOLUME,
        turnover_billion_rmb: niProd.TURNOVER,
        day_high: niProd.HIGHESTPRICE,
        day_low: niProd.LOWESTPRICE,
        avg_price: Math.round(niProd.AVGPRICE),
        unit: 'RMB/t'
      };
    }
  }
  
  // 6. Determine front-month contract (first with settlement > 0)
  const frontMonth = niSettlement.find(s => s.settlement_price && s.settlement_price > 0);
  
  // 7. Build output
  const shfeData = {
    date: dateToUse,
    date_formatted: `${dateToUse.slice(0,4)}-${dateToUse.slice(4,6)}-${dateToUse.slice(6,8)}`,
    fetched_at: new Date().toISOString(),
    source: 'Shanghai Futures Exchange (SHFE)',
    source_url: 'https://www.shfe.com.cn/eng/reports/StatisticalData/DailyData/',
    
    // Front-month contract (main display price)
    front_month: frontMonth || null,
    
    // All nickel settlement prices
    settlement: niSettlement,
    
    // Product summary (combined nickel futures stats)
    product_summary: productSummary
  };
  
  // 8. Save
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outPath = path.join(dataDir, 'shfe.json');
  fs.writeFileSync(outPath, JSON.stringify(shfeData, null, 2));
  
  // 9. Report
  console.log(`\nSHFE data saved to ${outPath}`);
  console.log(`Date: ${shfeData.date_formatted}`);
  console.log(`Contracts: ${shfeData.settlement.length}`);
  
  if (shfeData.front_month) {
    console.log(`\nFront month: ${shfeData.front_month.contract}`);
    console.log(`  Settlement: ¥${shfeData.front_month.settlement_price.toLocaleString()} RMB/t`);
  }
  
  if (productSummary) {
    console.log(`\nDay range: ¥${productSummary.day_low.toLocaleString()} — ¥${productSummary.day_high.toLocaleString()}`);
    console.log(`Volume: ${productSummary.total_volume.toLocaleString()} lots`);
  }
  
  console.log('\nAll settlements:');
  for (const s of shfeData.settlement) {
    console.log(`  ${s.contract}: ¥${(s.settlement_price || 0).toLocaleString()} ${s.unit}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
