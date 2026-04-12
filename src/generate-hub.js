/**
 * generate-hub.js
 * Reads data/prices.json and generates dist/index.html
 * with live metal prices in the banner dropdown
 * 
 * Usage: node src/generate-hub.js
 */

const fs = require('fs');
const path = require('path');

// Read prices
const pricesPath = path.join(__dirname, '..', 'data', 'prices.json');
if (!fs.existsSync(pricesPath)) {
  console.error('ERROR: data/prices.json not found. Run fetch-prices.js first.');
  process.exit(1);
}

const prices = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));

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

// Build price data for banner dropdown
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

// Generate the price rows HTML for the banner
function generatePriceRows(items) {
  return items.map(item => {
    const decimals = item.decimals !== undefined ? item.decimals : 0;
    const priceFormatted = '$' + formatPrice(item.price, decimals);
    return `<div class="banner-price-row">
      <span class="banner-price-name">${item.name}</span>
      <span class="banner-price-value">${priceFormatted}</span>
      <span class="banner-price-unit">${item.unit}</span>
    </div>`;
  }).join('\n            ');
}

// Build the complete prices HTML block
const pricesHTML = `
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

// Replace placeholders in template
const dataDate = formatDate(prices.timestamp);
const dataTime = formatTime(prices.timestamp);

html = html.replace('{{PRICES_HTML}}', pricesHTML);
html = html.replace(/\{\{DATA_DATE\}\}/g, dataDate);
html = html.replace(/\{\{DATA_TIME\}\}/g, dataTime);
html = html.replace(/\{\{FETCHED_AT\}\}/g, formatTime(prices.fetched_at));

// Also replace individual prices if used in the digest body
html = html.replace(/\{\{LME_COPPER\}\}/g, '$' + formatPrice(prices.lme.copper.price, 0));
html = html.replace(/\{\{LME_ALUMINUM\}\}/g, '$' + formatPrice(prices.lme.aluminum.price, 0));
html = html.replace(/\{\{LME_NICKEL\}\}/g, '$' + formatPrice(prices.lme.nickel.price, 0));
html = html.replace(/\{\{LME_ZINC\}\}/g, '$' + formatPrice(prices.lme.zinc.price, 0));
html = html.replace(/\{\{LME_LEAD\}\}/g, '$' + formatPrice(prices.lme.lead.price, 0));
html = html.replace(/\{\{GOLD_OZ\}\}/g, '$' + formatPrice(prices.precious.gold.price, 2));
html = html.replace(/\{\{SILVER_OZ\}\}/g, '$' + formatPrice(prices.precious.silver.price, 3));
html = html.replace(/\{\{PLATINUM_OZ\}\}/g, '$' + formatPrice(prices.precious.platinum.price, 2));
html = html.replace(/\{\{PALLADIUM_OZ\}\}/g, '$' + formatPrice(prices.precious.palladium.price, 2));

// Replace digest content placeholder
// If a digest file exists, use it; otherwise show placeholder
const digestPath = path.join(__dirname, '..', 'data', 'digest.html');
if (fs.existsSync(digestPath)) {
  const digestHTML = fs.readFileSync(digestPath, 'utf8');
  html = html.replace('{{DIGEST_CONTENT}}', digestHTML);
  console.log('Digest content loaded from data/digest.html');
} else {
  html = html.replace('{{DIGEST_CONTENT}}', `
    <div class="digest-section">
      <h2 class="digest-section__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        Market News & Analysis
      </h2>
      <p style="color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-4) 0;">
        News digest is being compiled. Check back soon for the latest market analysis across all metals.
      </p>
    </div>
  `);
  console.log('No digest file found — using placeholder');
}

// Write output
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, 'index.html');
fs.writeFileSync(outPath, html);

console.log(`Hub page generated: ${outPath}`);
console.log(`Data date: ${dataDate}`);
console.log(`Data timestamp: ${dataTime}`);
