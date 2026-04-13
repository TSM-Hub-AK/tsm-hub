/**
 * generate-hub.js
 * Reads data/prices.json + data/shfe.json and generates dist/index.html
 * with live metal prices in the banner dropdown
 * 
 * Usage: node src/generate-hub.js
 */

const fs = require('fs');
const path = require('path');

// Read Metals.dev prices (LME/LBMA/Spot)
const pricesPath = path.join(__dirname, '..', 'data', 'prices.json');
if (!fs.existsSync(pricesPath)) {
  console.error('ERROR: data/prices.json not found. Run fetch-prices.js first.');
  process.exit(1);
}
const prices = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));

// Read SHFE prices (optional — won't fail if missing)
const shfePath = path.join(__dirname, '..', 'data', 'shfe.json');
let shfe = null;
if (fs.existsSync(shfePath)) {
  shfe = JSON.parse(fs.readFileSync(shfePath, 'utf8'));
  console.log(`SHFE data loaded: ${shfe.date_formatted}, ${shfe.settlement.length} contracts`);
} else {
  console.log('WARNING: data/shfe.json not found — SHFE section will show N/A');
}

// Read template
const templatePath = path.join(__dirname, 'template.html');
if (!fs.existsSync(templatePath)) {
  console.error('ERROR: src/template.html not found.');
  process.exit(1);
}
let html = fs.readFileSync(templatePath, 'utf8');

// Format price with proper grouping
function formatPrice(value, decimals) {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Format date nicely
function formatDate(isoString) {
  const d = new Date(isoString);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');
}

// Format SHFE date (YYYYMMDD → "April 13, 2026")
function formatShfeDate(dateStr) {
  if (!dateStr) return 'N/A';
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(4, 6), 10) - 1;
  const d = parseInt(dateStr.slice(6, 8), 10);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[m]} ${d}, ${y}`;
}

// ─── Banner Price Rows ───

function generatePriceRows(items) {
  return items.map(item => {
    const decimals = item.decimals !== undefined ? item.decimals : 0;
    const prefix = item.currency || '$';
    const priceFormatted = prefix + formatPrice(item.price, decimals);
    return `<div class="banner-price-row">
      <span class="banner-price-name">${item.name}</span>
      <span class="banner-price-value">${priceFormatted}</span>
      <span class="banner-price-unit">${item.unit}</span>
    </div>`;
  }).join('\n            ');
}

const bannerData = {
  lme: [
    { name: 'Copper', price: prices.lme.copper.price, unit: 'USD/t' },
    { name: 'Aluminum', price: prices.lme.aluminum.price, unit: 'USD/t' },
    { name: 'Nickel', price: prices.lme.nickel.price, unit: 'USD/t' },
    { name: 'Zinc', price: prices.lme.zinc.price, unit: 'USD/t' },
    { name: 'Lead', price: prices.lme.lead.price, unit: 'USD/t' },
  ],
  lbma: [
    { name: 'Gold', price: prices.precious.lbma_gold_pm.price, unit: 'USD/oz', decimals: 2 },
    { name: 'Silver', price: prices.precious.lbma_silver.price, unit: 'USD/oz', decimals: 3 },
    { name: 'Platinum', price: prices.precious.lbma_platinum_pm.price, unit: 'USD/oz', decimals: 0 },
    { name: 'Palladium', price: prices.precious.lbma_palladium_pm.price, unit: 'USD/oz', decimals: 0 },
  ],
  spot: [
    { name: 'Gold (Spot)', price: prices.precious.gold.price, unit: 'USD/oz', decimals: 2 },
    { name: 'Silver (Spot)', price: prices.precious.silver.price, unit: 'USD/oz', decimals: 3 },
    { name: 'Platinum (Spot)', price: prices.precious.platinum.price, unit: 'USD/oz', decimals: 2 },
    { name: 'Palladium (Spot)', price: prices.precious.palladium.price, unit: 'USD/oz', decimals: 2 },
  ]
};

// SHFE prices for banner
if (shfe && shfe.settlement && shfe.settlement.length > 0) {
  // Show front-month + next month settlement in banner
  const frontContracts = shfe.settlement
    .filter(s => s.settlement_price && s.settlement_price > 0)
    .slice(0, 3); // first 3 contracts
  
  bannerData.shfe = frontContracts.map(s => ({
    name: `Nickel ${s.contract.replace('ni', '')}`,
    price: s.settlement_price,
    unit: 'RMB/t',
    currency: '¥',
    decimals: 0
  }));
}

// Build complete prices HTML
let pricesHTML = `
          <div class="banner-prices-group">
            <div class="banner-prices-group-title">LME Official</div>
            ${generatePriceRows(bannerData.lme)}
          </div>
          <div class="banner-prices-group">
            <div class="banner-prices-group-title">LBMA Fix</div>
            ${generatePriceRows(bannerData.lbma)}
          </div>
          <div class="banner-prices-group">
            <div class="banner-prices-group-title">Spot</div>
            ${generatePriceRows(bannerData.spot)}
          </div>`;

if (bannerData.shfe) {
  pricesHTML += `
          <div class="banner-prices-group">
            <div class="banner-prices-group-title">SHFE Settlement</div>
            ${generatePriceRows(bannerData.shfe)}
          </div>`;
}

// ─── Replace Placeholders ───

const dataDate = formatDate(prices.timestamp);
const dataTime = formatTime(prices.timestamp);

html = html.replace('{{PRICES_HTML}}', pricesHTML);
html = html.replace(/\{\{DATA_DATE\}\}/g, dataDate);
html = html.replace(/\{\{DATA_TIME\}\}/g, dataTime);
html = html.replace(/\{\{FETCHED_AT\}\}/g, formatTime(prices.fetched_at));

// Individual LME/LBMA prices (used in digest body)
html = html.replace(/\{\{LME_COPPER\}\}/g, '$' + formatPrice(prices.lme.copper.price, 0));
html = html.replace(/\{\{LME_ALUMINUM\}\}/g, '$' + formatPrice(prices.lme.aluminum.price, 0));
html = html.replace(/\{\{LME_NICKEL\}\}/g, '$' + formatPrice(prices.lme.nickel.price, 0));
html = html.replace(/\{\{LME_ZINC\}\}/g, '$' + formatPrice(prices.lme.zinc.price, 0));
html = html.replace(/\{\{LME_LEAD\}\}/g, '$' + formatPrice(prices.lme.lead.price, 0));
html = html.replace(/\{\{GOLD_OZ\}\}/g, '$' + formatPrice(prices.precious.gold.price, 2));
html = html.replace(/\{\{SILVER_OZ\}\}/g, '$' + formatPrice(prices.precious.silver.price, 3));
html = html.replace(/\{\{PLATINUM_OZ\}\}/g, '$' + formatPrice(prices.precious.platinum.price, 2));
html = html.replace(/\{\{PALLADIUM_OZ\}\}/g, '$' + formatPrice(prices.precious.palladium.price, 2));

// SHFE placeholders
if (shfe) {
  const fm = shfe.front_month;
  html = html.replace(/\{\{SHFE_NI_SETTLEMENT\}\}/g, fm ? '¥' + formatPrice(fm.settlement_price, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_CONTRACT\}\}/g, fm ? fm.contract : 'N/A');
  html = html.replace(/\{\{SHFE_DATE\}\}/g, formatShfeDate(shfe.date));
  
  // Product summary
  const ps = shfe.product_summary;
  html = html.replace(/\{\{SHFE_NI_HIGH\}\}/g, ps ? '¥' + formatPrice(ps.day_high, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_LOW\}\}/g, ps ? '¥' + formatPrice(ps.day_low, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_VOLUME\}\}/g, ps ? formatPrice(ps.total_volume, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_AVG\}\}/g, ps ? '¥' + formatPrice(ps.avg_price, 0) : 'N/A');
  
  // All settlement rows for table
  if (shfe.settlement && shfe.settlement.length > 0) {
    const shfeTableRows = shfe.settlement
      .filter(s => s.settlement_price && s.settlement_price > 0)
      .map(s => {
        const contractLabel = s.contract.replace('ni', 'NI ');
        return `<tr>
          <td>${contractLabel}</td>
          <td>¥${formatPrice(s.settlement_price, 0)}</td>
        </tr>`;
      }).join('\n              ');
    html = html.replace('{{SHFE_TABLE_ROWS}}', shfeTableRows);
  }
} else {
  // No SHFE data — replace with N/A
  html = html.replace(/\{\{SHFE_NI_SETTLEMENT\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_CONTRACT\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_DATE\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_HIGH\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_LOW\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_VOLUME\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_AVG\}\}/g, 'N/A');
  html = html.replace('{{SHFE_TABLE_ROWS}}', '<tr><td colspan="2">Data not available</td></tr>');
}

// Digest content is static in template.html
console.log('News digest content is embedded in template');

// ─── Write Output ───

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, 'index.html');
fs.writeFileSync(outPath, html);

console.log(`Hub page generated: ${outPath}`);
console.log(`Data date: ${dataDate}`);
console.log(`Data timestamp: ${dataTime}`);
if (shfe) {
  console.log(`SHFE date: ${shfe.date_formatted}`);
}
