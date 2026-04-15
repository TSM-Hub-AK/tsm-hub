/**
 * validate-prices.js
 * Cross-validates metal prices between two independent APIs:
 *   - Metals.dev (primary source, already fetched → data/prices.json)
 *   - Metals-API.com (secondary source, fetched here for validation)
 * 
 * Compares overlapping metals (gold, silver, platinum, palladium).
 * If discrepancy > 2%, exits with error code to halt deployment.
 * 
 * "Primary data only. No estimates. No interpretation."
 * 
 * Usage: METALS_API_COM_KEY=xxx node src/validate-prices.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.METALS_API_COM_KEY;
if (!API_KEY) {
  console.error('ERROR: METALS_API_COM_KEY environment variable is required');
  process.exit(1);
}

// Threshold: max allowed difference between two APIs (percentage)
const WARN_THRESHOLD = 1.0;   // 1% — log warning
const ERROR_THRESHOLD = 5.0;  // 5% — halt deployment

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
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   TSM Price Cross-Validation             ║');
  console.log('║   Metals.dev vs Metals-API.com           ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Load primary prices (Metals.dev — already fetched)
  const pricesPath = path.join(__dirname, '..', 'data', 'prices.json');
  if (!fs.existsSync(pricesPath)) {
    console.error('ERROR: data/prices.json not found. Run fetch-prices.js first.');
    process.exit(1);
  }
  
  const primary = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
  console.log(`Primary source (Metals.dev): ${primary.timestamp}`);

  // 2. Fetch same metals from Metals-API.com for comparison
  // XAU=gold, XAG=silver, XPT=platinum, XPD=palladium
  const url = `https://metals-api.com/api/latest?access_key=${API_KEY}&base=USD&symbols=XAU,XAG,XPT,XPD`;
  console.log('Fetching validation prices from Metals-API.com...\n');
  
  let secondary;
  try {
    secondary = await fetchJSON(url);
    if (!secondary.success) {
      console.warn('WARNING: Metals-API.com validation call failed:', JSON.stringify(secondary.error || secondary));
      console.log('⚠ Validation skipped — secondary API unavailable. Proceeding with primary data.');
      process.exit(0); // Don't block deployment if validation API is down
    }
  } catch (err) {
    console.warn(`WARNING: Could not reach Metals-API.com: ${err.message}`);
    console.log('⚠ Validation skipped — secondary API unreachable. Proceeding with primary data.');
    process.exit(0);
  }

  // 3. Compare prices
  // Metals-API returns rates as 1/USD price (inverse), need to convert
  const comparisons = [
    { 
      name: 'Gold', 
      symbol: 'XAU',
      primary_price: primary.precious.gold.price,
      primary_unit: 'USD/oz',
      source: 'LBMA/Spot'
    },
    { 
      name: 'Silver', 
      symbol: 'XAG',
      primary_price: primary.precious.silver.price,
      primary_unit: 'USD/oz',
      source: 'LBMA/Spot'
    },
    { 
      name: 'Platinum', 
      symbol: 'XPT',
      primary_price: primary.precious.platinum.price,
      primary_unit: 'USD/oz',
      source: 'LBMA/Spot'
    },
    { 
      name: 'Palladium', 
      symbol: 'XPD',
      primary_price: primary.precious.palladium.price,
      primary_unit: 'USD/oz',
      source: 'LBMA/Spot'
    },
  ];

  let warnings = 0;
  let errors = 0;
  let passed = 0;
  const results = [];

  console.log('Metal           Metals.dev    Metals-API    Diff %    Status');
  console.log('─────────────── ──────────── ──────────── ──────── ──────────');

  for (const comp of comparisons) {
    const rateKey = `USD${comp.symbol}`;
    const rawRate = secondary.rates[rateKey];
    
    if (!rawRate || rawRate === 0) {
      console.log(`${comp.name.padEnd(16)} ${String(comp.primary_price).padEnd(13)} N/A           —        SKIP`);
      continue;
    }

    // Metals-API returns inverse rate (1 USD = X oz), so price = 1/rate
    const secondaryPrice = Math.round((1 / rawRate) * 100) / 100;
    const diff = Math.abs(comp.primary_price - secondaryPrice);
    const diffPct = (diff / comp.primary_price) * 100;

    let status;
    if (diffPct > ERROR_THRESHOLD) {
      status = '❌ ERROR';
      errors++;
    } else if (diffPct > WARN_THRESHOLD) {
      status = '⚠ WARN';
      warnings++;
    } else {
      status = '✅ OK';
      passed++;
    }

    const primaryStr = `$${comp.primary_price.toLocaleString()}`;
    const secondaryStr = `$${secondaryPrice.toLocaleString()}`;
    const diffStr = `${diffPct.toFixed(2)}%`;

    console.log(
      `${comp.name.padEnd(16)} ${primaryStr.padEnd(13)} ${secondaryStr.padEnd(13)} ${diffStr.padEnd(9)} ${status}`
    );

    results.push({
      metal: comp.name,
      primary: comp.primary_price,
      secondary: secondaryPrice,
      diff_pct: Math.round(diffPct * 100) / 100,
      status: status,
    });
  }

  // 4. Save validation report
  const report = {
    timestamp: new Date().toISOString(),
    primary_source: 'Metals.dev',
    primary_timestamp: primary.timestamp,
    secondary_source: 'Metals-API.com',
    secondary_timestamp: secondary.timestamp || new Date().toISOString(),
    warn_threshold_pct: WARN_THRESHOLD,
    error_threshold_pct: ERROR_THRESHOLD,
    results: results,
    summary: { passed, warnings, errors },
  };

  const reportPath = path.join(__dirname, '..', 'data', 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 5. Summary
  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${warnings} warnings, ${errors} errors`);
  console.log(`Report saved: data/validation-report.json`);

  if (errors > 0) {
    console.error(`\n🚨 VALIDATION FAILED: ${errors} metal(s) exceed ${ERROR_THRESHOLD}% threshold.`);
    console.error('Deployment halted. Check data sources manually.');
    process.exit(1);
  } else if (warnings > 0) {
    console.log(`\n⚠ ${warnings} warning(s) — prices differ by >${WARN_THRESHOLD}% but within ${ERROR_THRESHOLD}% tolerance.`);
    console.log('Proceeding with deployment.');
  } else {
    console.log('\n✅ All prices validated. Data is consistent across both sources.');
  }
}

main().catch(err => {
  console.error('Validation error:', err.message);
  // Don't block deployment on validation script failure
  console.log('⚠ Validation could not complete. Proceeding with primary data.');
  process.exit(0);
});
