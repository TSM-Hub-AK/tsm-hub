/**
 * generate-metal-pages.js
 * Generates individual metal pages from metal-template.html
 * 
 * Usage: node src/generate-metal-pages.js
 * Output: dist/metals/<slug>.html for each metal
 */

const fs = require('fs');
const path = require('path');

// ─── Load Data ───

const dataDir = path.join(__dirname, '..', 'data');

const countryData = JSON.parse(fs.readFileSync(path.join(dataDir, 'country-data.json'), 'utf8'));
const producers = JSON.parse(fs.readFileSync(path.join(dataDir, 'producers.json'), 'utf8'));

let productForms = null;
if (fs.existsSync(path.join(dataDir, 'product-forms.json'))) {
  productForms = JSON.parse(fs.readFileSync(path.join(dataDir, 'product-forms.json'), 'utf8'));
}

let prices = null;
if (fs.existsSync(path.join(dataDir, 'prices.json'))) {
  prices = JSON.parse(fs.readFileSync(path.join(dataDir, 'prices.json'), 'utf8'));
}

let metalsApi = null;
if (fs.existsSync(path.join(dataDir, 'metals-api.json'))) {
  metalsApi = JSON.parse(fs.readFileSync(path.join(dataDir, 'metals-api.json'), 'utf8'));
}

let shfe = null;
if (fs.existsSync(path.join(dataDir, 'shfe.json'))) {
  shfe = JSON.parse(fs.readFileSync(path.join(dataDir, 'shfe.json'), 'utf8'));
}

let news = null;
if (fs.existsSync(path.join(dataDir, 'news.json'))) {
  news = JSON.parse(fs.readFileSync(path.join(dataDir, 'news.json'), 'utf8'));
}

const template = fs.readFileSync(path.join(__dirname, 'metal-template.html'), 'utf8');

// ─── Metal Configuration ───

const METAL_CONFIG = {
  copper:       { name: 'Copper', symbol: 'Cu', critical: true, exchanges: ['LME', 'SHFE'], lme_key: 'copper', shfe_key: 'cu', category: 'Base Metal' },
  aluminium:    { name: 'Aluminium', symbol: 'Al', critical: true, exchanges: ['LME', 'SHFE'], lme_key: 'aluminum', shfe_key: 'al', category: 'Base Metal' },
  nickel:       { name: 'Nickel', symbol: 'Ni', critical: true, exchanges: ['LME', 'SHFE'], lme_key: 'nickel', shfe_key: 'ni', category: 'Base Metal' },
  zinc:         { name: 'Zinc', symbol: 'Zn', critical: true, exchanges: ['LME', 'SHFE'], lme_key: 'zinc', shfe_key: 'zn', category: 'Base Metal' },
  lead:         { name: 'Lead', symbol: 'Pb', critical: false, exchanges: ['LME', 'SHFE'], lme_key: 'lead', shfe_key: 'pb', category: 'Base Metal' },
  tin:          { name: 'Tin', symbol: 'Sn', critical: true, exchanges: ['LME', 'SHFE'], lme_key: 'tin', shfe_key: 'sn', category: 'Base Metal' },
  gold:         { name: 'Gold', symbol: 'Au', critical: false, exchanges: ['LBMA', 'SHFE'], lbma_key: 'lbma_gold_pm', shfe_key: 'au', category: 'Precious Metal' },
  silver:       { name: 'Silver', symbol: 'Ag', critical: false, exchanges: ['LBMA', 'SHFE'], lbma_key: 'lbma_silver', shfe_key: 'ag', category: 'Precious Metal' },
  pgm:          { name: 'Platinum Group Metals', symbol: 'PGM', critical: true, exchanges: ['LBMA'], category: 'Precious Metal' },
  lithium:      { name: 'Lithium', symbol: 'Li', critical: true, exchanges: ['Metals-API'], metals_api_key: 'lithium', category: 'Battery Metal' },
  cobalt:       { name: 'Cobalt', symbol: 'Co', critical: true, exchanges: ['Metals-API'], metals_api_key: 'cobalt', category: 'Battery Metal' },
  rare_earths:  { name: 'Rare Earth Elements', symbol: 'REE', critical: true, exchanges: ['Metals-API'], category: 'Strategic Metal' },
  tungsten:     { name: 'Tungsten', symbol: 'W', critical: true, exchanges: ['Metals-API'], metals_api_key: 'tungsten', category: 'Strategic Metal' },
  vanadium:     { name: 'Vanadium', symbol: 'V', critical: true, exchanges: ['Metals-API'], metals_api_key: 'vanadium', category: 'Strategic Metal' },
  manganese:    { name: 'Manganese', symbol: 'Mn', critical: true, exchanges: ['Metals-API'], metals_api_key: 'manganese', category: 'Strategic Metal' },
  molybdenum:   { name: 'Molybdenum', symbol: 'Mo', critical: true, exchanges: ['Metals-API'], metals_api_key: 'molybdenum', category: 'Strategic Metal' },
  chromium:     { name: 'Chromium', symbol: 'Cr', critical: true, exchanges: ['Metals-API'], metals_api_key: 'chromium', category: 'Strategic Metal' },
  antimony:     { name: 'Antimony', symbol: 'Sb', critical: true, exchanges: ['Metals-API'], metals_api_key: 'antimony', category: 'Strategic Metal' },
  gallium:      { name: 'Gallium', symbol: 'Ga', critical: true, exchanges: ['Metals-API'], metals_api_key: 'gallium', category: 'Technology Metal' },
  germanium:    { name: 'Germanium', symbol: 'Ge', critical: true, exchanges: ['Metals-API'], metals_api_key: 'germanium', category: 'Technology Metal' },
  graphite:     { name: 'Graphite', symbol: 'C', critical: true, exchanges: [], category: 'Industrial Mineral' },
  iron_ore:     { name: 'Iron Ore', symbol: 'Fe', critical: false, exchanges: ['Metals-API'], metals_api_key: 'iron-ore', category: 'Bulk Metal' },
  titanium:     { name: 'Titanium', symbol: 'Ti', critical: true, exchanges: ['Metals-API'], metals_api_key: 'titanium', category: 'Strategic Metal' },
  magnesium:    { name: 'Magnesium', symbol: 'Mg', critical: true, exchanges: ['Metals-API'], metals_api_key: 'magnesium', category: 'Light Metal' },
  uranium:      { name: 'Uranium', symbol: 'U', critical: true, exchanges: ['Metals-API'], metals_api_key: 'uranium', category: 'Energy Metal' },
};

// ─── Helpers ───

function formatPrice(value, decimals = 0) {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatShfeDate(dateStr) {
  if (!dateStr) return 'N/A';
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(4, 6), 10) - 1;
  const d = parseInt(dateStr.slice(6, 8), 10);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[m]} ${d}, ${y}`;
}

function slugify(key) {
  return key.replace(/_/g, '-');
}

function getMetalPrices(slug, config) {
  const result = [];

  // LME
  if (config.lme_key && prices && prices.lme && prices.lme[config.lme_key]) {
    const p = prices.lme[config.lme_key];
    result.push({
      exchange: 'LME',
      price: p.price,
      unit: 'USD/t',
      decimals: 0,
      currency: '$',
      date: prices.timestamp ? formatDate(prices.timestamp) : ''
    });
  }

  // LBMA
  if (config.lbma_key && prices && prices.precious && prices.precious[config.lbma_key]) {
    const p = prices.precious[config.lbma_key];
    const decimals = config.lbma_key.includes('silver') ? 3 : 2;
    result.push({
      exchange: 'LBMA',
      price: p.price,
      unit: 'USD/oz',
      decimals: decimals,
      currency: '$',
      date: prices.timestamp ? formatDate(prices.timestamp) : ''
    });
  }

  // LBMA for PGM
  if (slug === 'pgm' && prices && prices.precious) {
    ['lbma_platinum_pm', 'lbma_palladium_pm'].forEach(key => {
      if (prices.precious[key]) {
        const name = key.includes('platinum') ? 'Platinum' : 'Palladium';
        result.push({
          exchange: `LBMA (${name})`,
          price: prices.precious[key].price,
          unit: 'USD/oz',
          decimals: 0,
          currency: '$',
          date: prices.timestamp ? formatDate(prices.timestamp) : ''
        });
      }
    });
  }

  // SHFE
  if (config.shfe_key && shfe && shfe.metals && shfe.metals[config.shfe_key]) {
    const m = shfe.metals[config.shfe_key];
    if (m.front_month && m.front_month.settlement_price > 0) {
      result.push({
        exchange: 'SHFE',
        price: m.front_month.settlement_price,
        unit: m.unit || 'RMB/t',
        decimals: m.unit === 'RMB/g' ? 2 : 0,
        currency: '¥',
        date: shfe.date_formatted ? formatShfeDate(shfe.date) : ''
      });
    }
  }

  // Metals-API
  if (config.metals_api_key && metalsApi && metalsApi.metals) {
    const m = metalsApi.metals[config.metals_api_key];
    if (m && m.price !== null) {
      result.push({
        exchange: 'Metals-API',
        price: m.price,
        unit: m.unit || 'USD',
        decimals: m.price < 10 ? 4 : m.price < 1000 ? 2 : 0,
        currency: m.unit && m.unit.startsWith('CNY') ? '¥' : '$',
        date: metalsApi.timestamp ? formatDate(metalsApi.timestamp) : ''
      });
    }
  }

  return result;
}

function getMetalNews(metalName) {
  if (!news || !news.articles) return [];
  const keywords = metalName.toLowerCase().split(' ');
  return news.articles
    .filter(a => {
      const text = (a.title + ' ' + (a.description || '')).toLowerCase();
      return keywords.some(kw => text.includes(kw));
    })
    .slice(0, 8);
}

// ─── HTML Generators ───

function generateHeroPrices(priceList) {
  if (priceList.length === 0) {
    return '<div class="price-card"><div class="price-card__exchange">Price</div><div class="price-card__value" style="font-size:var(--text-base);color:var(--color-text-muted)">See Hub for details</div></div>';
  }
  return priceList.slice(0, 3).map(p => `
    <div class="price-card">
      <div class="price-card__exchange">${p.exchange}</div>
      <div class="price-card__value">${p.currency}${formatPrice(p.price, p.decimals)}</div>
      <div class="price-card__unit">${p.unit}</div>
      ${p.date ? `<div class="price-card__date">${p.date}</div>` : ''}
    </div>
  `).join('');
}

function generatePricesTable(priceList) {
  if (priceList.length === 0) {
    return '<p style="color:var(--color-text-muted)">Price data not available for this metal. Visit the <a href="../">Hub</a> for all available prices.</p>';
  }
  let rows = priceList.map(p => `
    <tr>
      <td>${p.exchange}</td>
      <td class="num">${p.currency}${formatPrice(p.price, p.decimals)}</td>
      <td>${p.unit}</td>
      <td class="note">${p.date}</td>
    </tr>
  `).join('');

  return `<div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Exchange / Source</th><th class="num">Price</th><th>Unit</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function generateProductionTable(metalData) {
  if (!metalData || !metalData.countries) return '<p style="color:var(--color-text-muted)">Production data not available in standard format. See <a href="' + (metalData?.source_url || '#') + '">USGS source</a>.</p>';

  const hasY2 = metalData.has_two_years;
  const unit = metalData.production_unit || '';

  let headerRow = `<th>Country</th><th class="num">${metalData.year1 || 'Year 1'}</th>`;
  if (hasY2) headerRow += `<th class="num">${metalData.year2 || 'Year 2'}</th>`;
  headerRow += '<th class="num">Reserves</th>';

  let rows = metalData.countries.map(c => {
    const isTotal = c.country.toLowerCase().includes('total') || c.country.toLowerCase().includes('world');
    const cls = isTotal ? ' class="row-total"' : '';
    let row = `<tr${cls}>`;
    row += `<td>${c.country}</td>`;
    row += `<td class="num">${c.production_y1 || '—'}</td>`;
    if (hasY2) row += `<td class="num">${c.production_y2 || '—'}</td>`;
    row += `<td class="num">${c.reserves || '—'}</td>`;
    row += '</tr>';
    return row;
  }).join('');

  return `<div class="data-table-wrap"><table class="data-table">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p style="margin-top:var(--space-3);font-size:var(--text-xs);color:var(--color-text-faint)">Unit: ${unit}. "e" = estimated. Source: USGS Mineral Commodity Summaries 2026 (DOI: <a href="https://doi.org/10.5066/P1WKQ63T" style="color:var(--color-text-faint)">10.5066/P1WKQ63T</a>)</p>`;
}

function generateReservesSection(metalData) {
  if (!metalData || !metalData.has_reserves || !metalData.countries) return '';

  // Reserves are already in the production table, so we show a summary
  const withReserves = metalData.countries.filter(c => c.reserves && c.reserves !== '—' && !c.country.toLowerCase().includes('total') && !c.country.toLowerCase().includes('world'));
  if (withReserves.length === 0) return '';

  // Sort by reserves (numeric)
  const sorted = [...withReserves].sort((a, b) => {
    const parseNum = s => Number(String(s).replace(/[^0-9.-]/g, '')) || 0;
    return parseNum(b.reserves) - parseNum(a.reserves);
  }).slice(0, 10);

  const worldEntry = metalData.countries.find(c => c.country.toLowerCase().includes('total') || c.country.toLowerCase().includes('world'));
  const worldReserves = worldEntry ? worldEntry.reserves : null;

  let rows = sorted.map(c => `
    <tr>
      <td>${c.country}</td>
      <td class="num">${c.reserves}</td>
    </tr>
  `).join('');

  if (worldReserves) {
    rows += `<tr class="row-total"><td>World Total</td><td class="num">${worldReserves}</td></tr>`;
  }

  return `
    <section id="reserves" class="section">
      <div class="section__header">
        <h2 class="section__title">Reserves by Country (Top 10)</h2>
        <span class="section__source">Source: <a href="${metalData.source_url || '#'}">USGS MCS 2026</a></span>
      </div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Country</th><th class="num">Reserves (${metalData.reserves_unit || metalData.production_unit || ''})</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>
  `;
}

function generateProducersHTML(metalKey, config) {
  // Try exact key first, then variations
  const keys = [metalKey];
  if (metalKey === 'pgm') keys.push('platinum', 'palladium');

  let metalProducers = [];
  for (const k of keys) {
    if (producers[k]) {
      metalProducers = metalProducers.concat(producers[k]);
    }
  }

  // Deduplicate by name
  const seen = new Set();
  metalProducers = metalProducers.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  if (metalProducers.length === 0) {
    return '<p style="color:var(--color-text-muted)">No producer data available for this metal.</p>';
  }

  return metalProducers.slice(0, 20).map(p => `
    <div class="producer-card">
      <div class="producer-card__name">${p.name}</div>
      <div class="producer-card__country">${p.country || ''}</div>
      ${p.type ? `<div class="producer-card__type">${p.type}</div>` : ''}
    </div>
  `).join('');
}

function generateNewsHTML(metalName) {
  const articles = getMetalNews(metalName);
  if (articles.length === 0) {
    return '<p style="color:var(--color-text-muted)">No recent news for this metal. Visit the <a href="../#news">Hub news section</a> for all metals news.</p>';
  }
  return articles.map(a => `
    <a href="${a.url || '#'}" target="_blank" rel="noopener" class="news-item">
      <div class="news-item__content">
        <div class="news-item__title">${a.title}</div>
        <div class="news-item__meta">${a.source || ''} · ${a.date || ''}</div>
        ${a.description ? `<div class="news-item__excerpt">${a.description}</div>` : ''}
      </div>
    </a>
  `).join('');
}

function generateBadges(config) {
  let badges = '';
  if (config.critical) {
    badges += '<span class="badge badge--critical">★ US Critical Mineral 2025</span>';
  }
  badges += `<span class="badge badge--exchange">${config.category}</span>`;
  config.exchanges.forEach(ex => {
    badges += `<span class="badge badge--exchange">${ex}</span>`;
  });
  return badges;
}

function generateAllMetalsNav(currentSlug) {
  return Object.entries(METAL_CONFIG).map(([key, cfg]) => {
    const slug = slugify(key);
    const isActive = key === currentSlug ? ' metals-nav__link--active' : '';
    return `<a href="${slug}" class="metals-nav__link${isActive}">${cfg.name}</a>`;
  }).join('\n        ');
}

function generateProductFormsSection(metalKey) {
  if (!productForms || !productForms[metalKey]) return '';
  const forms = productForms[metalKey];
  if (!forms || forms.length === 0) return '';

  const rows = forms.map(f => {
    const lmeBadge = f.lme_deliverable
      ? '<span class="badge badge--critical" style="font-size:var(--text-xs);padding:2px 6px;">LME</span>'
      : '<span style="color:var(--color-text-faint);font-size:var(--text-xs);">—</span>';
    const note = f.note ? `<div class="note" style="margin-top:4px;color:var(--color-text-faint);font-size:var(--text-xs);">${f.note}</div>` : '';
    return `
      <tr>
        <td><strong>${f.name}</strong>${note}</td>
        <td><code style="background:transparent;color:var(--color-text-muted);">${f.chemical_form}</code></td>
        <td>${f.typical_grade}</td>
        <td>${f.primary_end_use}</td>
        <td style="text-align:center;">${lmeBadge}</td>
      </tr>`;
  }).join('');

  return `
    <section id="product-forms" class="section">
      <div class="section__header">
        <h2 class="section__title">Commercial Product Forms</h2>
        <span class="section__source">Sources: <a href="https://www.lme.com">LME contract specs</a>, <a href="https://doi.org/10.5066/P1WKQ63T">USGS MCS 2026</a></span>
      </div>
      <p style="color:var(--color-text-muted);margin-bottom:var(--space-4);">Major commercial forms in which this metal is refined, traded and delivered. "LME" indicates the form is deliverable against an LME physical contract.</p>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Form</th><th>Chemical form</th><th>Typical grade / spec</th><th>Primary end use</th><th style="text-align:center;">LME</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>
  `;
}

function generateDataSources(config) {
  const sources = ['Production and reserves data: <a href="https://doi.org/10.5066/P1WKQ63T">USGS Mineral Commodity Summaries 2026</a>'];
  
  if (config.exchanges.includes('LME')) {
    sources.push('LME prices: via <a href="https://metals.dev">Metals.dev</a> API (official settlement prices)');
  }
  if (config.exchanges.includes('LBMA')) {
    sources.push('LBMA prices: via <a href="https://metals.dev">Metals.dev</a> API (official fix prices)');
  }
  if (config.exchanges.includes('SHFE')) {
    sources.push('SHFE prices: via <a href="https://www.shfe.com.cn">Shanghai Futures Exchange</a> (settlement prices)');
  }
  if (config.exchanges.includes('Metals-API')) {
    sources.push('Additional prices: via <a href="https://metals-api.com">Metals-API.com</a>');
  }

  return sources.map(s => `<p style="margin-bottom:var(--space-2)">${s}</p>`).join('');
}

// ─── Generate Pages ───

const distDir = path.join(__dirname, '..', 'dist', 'metals');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

let generated = 0;

for (const [metalKey, config] of Object.entries(METAL_CONFIG)) {
  const slug = slugify(metalKey);
  const metalData = countryData[metalKey];
  const metalPrices = getMetalPrices(metalKey, config);
  const producerCount = (() => {
    const keys = [metalKey];
    if (metalKey === 'pgm') keys.push('platinum', 'palladium');
    const seen = new Set();
    let count = 0;
    for (const k of keys) {
      if (producers[k]) {
        producers[k].forEach(p => {
          if (!seen.has(p.name)) { seen.add(p.name); count++; }
        });
      }
    }
    return Math.min(count, 20);
  })();

  const productionCountries = metalData && metalData.countries ? metalData.countries.length : 0;
  const hasReserves = metalData && metalData.has_reserves;

  // Summary line
  const summaryParts = [];
  summaryParts.push(`${config.symbol} · ${config.category}`);
  if (productionCountries > 0) summaryParts.push(`${productionCountries} producing countries`);
  if (producerCount > 0) summaryParts.push(`${producerCount} major producers`);
  if (metalPrices.length > 0) summaryParts.push(`Prices from ${metalPrices.map(p => p.exchange).join(', ')}`);

  const priceSources = metalPrices.length > 0 ? ` from ${metalPrices.map(p => p.exchange).join(', ')}` : '';

  let html = template;
  html = html.replace(/\{\{METAL_NAME\}\}/g, config.name);
  html = html.replace(/\{\{METAL_SLUG\}\}/g, slug);
  html = html.replace('{{META_PRICE_SOURCES}}', priceSources);
  html = html.replace('{{PRODUCTION_COUNTRIES}}', String(productionCountries));
  html = html.replace('{{PRODUCER_COUNT\}\}/g'.replace('/g', ''), String(producerCount));
  html = html.replace(/\{\{PRODUCER_COUNT\}\}/g, String(producerCount));
  html = html.replace('{{BADGES_HTML}}', generateBadges(config));
  html = html.replace('{{METAL_SUMMARY}}', summaryParts.join(' · '));
  html = html.replace('{{HERO_PRICES_HTML}}', generateHeroPrices(metalPrices));
  html = html.replace('{{PRICES_DATE}}', metalPrices.length > 0 ? `Updated: ${metalPrices[0].date}` : '');
  html = html.replace('{{PRICES_TABLE_HTML}}', generatePricesTable(metalPrices));
  html = html.replace('{{MCS_SOURCE_URL}}', metalData?.source_url || 'https://pubs.usgs.gov/periodicals/mcs2026/');
  html = html.replace('{{PRODUCTION_TABLE_HTML}}', generateProductionTable(metalData));
  html = html.replace('{{RESERVES_SECTION_HTML}}', hasReserves ? generateReservesSection(metalData) : '');
  html = html.replace('{{NAV_RESERVES_LINK}}', hasReserves ? '<a href="#reserves" class="section-nav__link">Reserves</a>' : '');
  const hasProductForms = productForms && productForms[metalKey] && productForms[metalKey].length > 0;
  html = html.replace('{{PRODUCT_FORMS_SECTION_HTML}}', hasProductForms ? generateProductFormsSection(metalKey) : '');
  html = html.replace('{{NAV_PRODUCT_FORMS_LINK}}', hasProductForms ? '<a href="#product-forms" class="section-nav__link">Product Forms</a>' : '');
  html = html.replace('{{PRODUCERS_HTML}}', generateProducersHTML(metalKey, config));
  html = html.replace('{{NEWS_HTML}}', generateNewsHTML(config.name));
  html = html.replace('{{DATA_SOURCES_HTML}}', generateDataSources(config));
  html = html.replace('{{ALL_METALS_NAV}}', generateAllMetalsNav(metalKey));

  // ─── JSON-LD Structured Data for Metal Page ───
  const metalJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": `${config.name} — Official Prices, Production & Reserves`,
    "description": `${config.name} (${config.symbol}): official exchange prices${priceSources}, mine production data for ${productionCountries} countries, reserves by country, ${producerCount} major global producers. Source: USGS Mineral Commodity Summaries 2026, LME, LBMA, SHFE. Updated twice daily.`,
    "url": `https://hub.truesourcemetals.com/metals/${slug}`,
    "keywords": [
      `${config.name.toLowerCase()} price`, `${config.name.toLowerCase()} price today`,
      `${config.symbol} price`, `${config.name.toLowerCase()} LME`,
      `${config.name.toLowerCase()} producers`, `${config.name.toLowerCase()} production by country`,
      `${config.name.toLowerCase()} reserves`, `${config.name.toLowerCase()} market data`,
      `${config.category.toLowerCase()}`, "metals prices", "commodity data"
    ],
    "creator": {
      "@type": "Organization",
      "name": "TrueSource Metals",
      "url": "https://truesourcemetals.com"
    },
    "temporalCoverage": new Date().toISOString().split('T')[0] + "/..",
    "spatialCoverage": "Global",
    "isPartOf": {
      "@type": "DataCatalog",
      "name": "TSM Hub",
      "url": "https://hub.truesourcemetals.com"
    },
    "variableMeasured": [
      `${config.name} official settlement/fix prices`,
      `${config.name} mine production by country (USGS MCS 2026)`,
      `${config.name} reserves by country (USGS MCS 2026)`
    ]
  };

  // Add price observations if available
  if (metalPrices.length > 0) {
    metalJsonLd.distribution = metalPrices.map(p => ({
      "@type": "DataDownload",
      "name": `${config.name} ${p.exchange} Price`,
      "description": `${p.price} ${p.unit} (${p.date})`,
      "encodingFormat": "text/html",
      "contentUrl": `https://hub.truesourcemetals.com/metals/${slug}`
    }));
  }

  const metalJsonLdScript = `<script type="application/ld+json">${JSON.stringify(metalJsonLd)}</script>`;
  html = html.replace('</head>', metalJsonLdScript + '\n</head>');

  // Add BreadcrumbList for navigation
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "TSM Hub",
        "item": "https://hub.truesourcemetals.com"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": config.name,
        "item": `https://hub.truesourcemetals.com/metals/${slug}`
      }
    ]
  };
  const breadcrumbScript = `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;
  html = html.replace('</head>', breadcrumbScript + '\n</head>');

  const outPath = path.join(distDir, `${slug}.html`);
  fs.writeFileSync(outPath, html, 'utf8');
  generated++;
  console.log(`✓ ${config.name} → metals/${slug}.html (${metalPrices.length} prices, ${productionCountries} countries, ${producerCount} producers)`);
}

console.log(`\nDone: ${generated} metal pages generated in dist/metals/`);
