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

// Read news (optional — won't fail if missing)
const newsPath = path.join(__dirname, '..', 'data', 'news.json');
let news = null;
if (fs.existsSync(newsPath)) {
  news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  console.log(`News data loaded: ${news.article_count} articles`);
} else {
  console.log('WARNING: data/news.json not found — news section will be empty');
}

// Read Metals-API.com prices (optional — Cobalt, Lithium, Mo, AA, Rare Earths, Minor Metals)
const metalsApiPath = path.join(__dirname, '..', 'data', 'metals-api.json');
let metalsApi = null;
if (fs.existsSync(metalsApiPath)) {
  metalsApi = JSON.parse(fs.readFileSync(metalsApiPath, 'utf8'));
  const available = Object.values(metalsApi.metals).filter(m => m.price !== null).length;
  console.log(`Metals-API data loaded: ${available}/${Object.keys(metalsApi.metals).length} metals with prices`);
} else {
  console.log('WARNING: data/metals-api.json not found — Metals-API section will be empty');
}

// Read SHFE prices (optional — won't fail if missing)
const shfePath = path.join(__dirname, '..', 'data', 'shfe.json');
let shfe = null;
if (fs.existsSync(shfePath)) {
  shfe = JSON.parse(fs.readFileSync(shfePath, 'utf8'));
  if (shfe.metals) {
    const totalContracts = Object.values(shfe.metals).reduce((sum, m) => sum + (m.contract_count || 0), 0);
    console.log(`SHFE data loaded: ${shfe.date_formatted}, ${Object.keys(shfe.metals).length} metals, ${totalContracts} contracts`);
  } else if (shfe.settlement) {
    console.log(`SHFE data loaded: ${shfe.date_formatted}, ${shfe.settlement.length} contracts (legacy format)`);
  }
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
    { name: 'Aluminium', price: prices.lme.aluminum.price, unit: 'USD/t' },
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

// SHFE prices for banner — show front-month for all metals
if (shfe && shfe.metals) {
  const shfeRows = [];
  // Order: base metals, precious, steel
  const shfeOrder = ['cu','al','zn','pb','ni','sn','ao','ad','au','ag','rb','hc','ss','wr'];
  for (const key of shfeOrder) {
    const m = shfe.metals[key];
    if (m && m.front_month && m.front_month.settlement_price > 0) {
      const currency = '¥';
      const decimals = m.unit === 'RMB/g' ? 2 : 0;
      shfeRows.push({
        name: m.name,
        price: m.front_month.settlement_price,
        unit: m.unit,
        currency: currency,
        decimals: decimals
      });
    }
  }
  if (shfeRows.length > 0) {
    bannerData.shfe = shfeRows;
  }
} else if (shfe && shfe.settlement && shfe.settlement.length > 0) {
  // Legacy format fallback
  const frontContracts = shfe.settlement
    .filter(s => s.settlement_price && s.settlement_price > 0)
    .slice(0, 3);
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

// Metals-API groups
if (metalsApi) {
  const ma = metalsApi.metals;
  
  // Helper: build group from array, filter nulls and zero prices
  function buildGroup(title, metalKeys) {
    const items = metalKeys
      .map(k => ma[k])
      .filter(m => m && m.price !== null && m.price > 0);
    if (items.length === 0) return;
    const rows = items.map(m => {
      let decimals = 2;
      if (m.unit.includes('/t') && m.price >= 100) decimals = 0;
      if (m.unit.includes('/dmt')) decimals = 2;
      if (m.price >= 1000) decimals = 0;
      return { name: m.name, price: m.price, unit: m.unit, decimals: decimals };
    });
    pricesHTML += `
          <div class="banner-prices-group">
            <div class="banner-prices-group-title">${title}</div>
            ${generatePriceRows(rows)}
          </div>`;
  }
  
  // LME Cash-Settled
  buildGroup('LME Cash-Settled', ['cobalt', 'lithium', 'molybdenum', 'aluminium_alloy']);
  
  // PGMs (Platinum Group)
  buildGroup('Platinum Group (PGM)', ['rhodium', 'iridium', 'ruthenium', 'osmium']);
  
  // Energy & Strategic
  buildGroup('Energy &amp; Strategic', ['uranium', 'vanadium', 'ferrochrome', 'ferrosilicon']);
  
  // Rare Earths
  buildGroup('Rare Earths', ['neodymium', 'praseodymium', 'dysprosium', 'lanthanum', 'terbium']);
  
  // Minor / Specialty Metals
  buildGroup('Minor &amp; Specialty Metals', [
    'antimony', 'gallium', 'germanium', 'hafnium', 'indium',
    'magnesium', 'rhenium', 'tellurium', 'tungsten', 'titanium', 'manganese'
  ]);
  
  // Battery / EV Chain
  buildGroup('Battery &amp; EV Materials', [
    'cobalt_sulphate', 'lithium_hydroxide', 'lithium_carbonate',
    'spodumene', 'manganese_sulphate', 'nickel_pig_iron'
  ]);
  
  // Iron Ore
  buildGroup('Iron Ore', ['iron_ore_62', 'iron_ore_65', 'iron_ore_58']);
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
if (shfe && shfe.metals && shfe.metals.ni) {
  const ni = shfe.metals.ni;
  const fm = ni.front_month;
  html = html.replace(/\{\{SHFE_NI_SETTLEMENT\}\}/g, fm ? '¥' + formatPrice(fm.settlement_price, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_CONTRACT\}\}/g, fm ? fm.contract : 'N/A');
  html = html.replace(/\{\{SHFE_DATE\}\}/g, formatShfeDate(shfe.date));
  
  // Product summary
  const ps = ni.summary;
  html = html.replace(/\{\{SHFE_NI_HIGH\}\}/g, ps ? '¥' + formatPrice(ps.day_high, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_LOW\}\}/g, ps ? '¥' + formatPrice(ps.day_low, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_VOLUME\}\}/g, ps ? formatPrice(ps.total_volume, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_AVG\}\}/g, ps ? '¥' + formatPrice(ps.avg_price, 0) : 'N/A');
  
  // Nickel contract settlement table — no longer a flat array, skip if not available
  html = html.replace('{{SHFE_TABLE_ROWS}}', '<tr><td colspan="2">See SHFE settlement prices above</td></tr>');
} else if (shfe && shfe.front_month) {
  // Legacy format
  const fm = shfe.front_month;
  html = html.replace(/\{\{SHFE_NI_SETTLEMENT\}\}/g, fm ? '¥' + formatPrice(fm.settlement_price, 0) : 'N/A');
  html = html.replace(/\{\{SHFE_NI_CONTRACT\}\}/g, fm ? fm.contract : 'N/A');
  html = html.replace(/\{\{SHFE_DATE\}\}/g, formatShfeDate(shfe.date));
  html = html.replace(/\{\{SHFE_NI_HIGH\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_LOW\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_VOLUME\}\}/g, 'N/A');
  html = html.replace(/\{\{SHFE_NI_AVG\}\}/g, 'N/A');
  html = html.replace('{{SHFE_TABLE_ROWS}}', '<tr><td colspan="2">Data not available</td></tr>');
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

// ─── Reserves & Production by Country Section ───

const countryDataPath = path.join(__dirname, '..', 'data', 'country-data.json');
let countryData = null;
if (fs.existsSync(countryDataPath)) {
  countryData = JSON.parse(fs.readFileSync(countryDataPath, 'utf8'));
  const metals = Object.keys(countryData).filter(k => !k.startsWith('_'));
  console.log(`Country data loaded: ${metals.length} metals`);

  // Run data validator — fail build on critical errors
  const { execSync } = require('child_process');
  try {
    execSync('node ' + path.join(__dirname, 'validate-data.js'), { stdio: 'inherit' });
  } catch (e) {
    console.error('\n✖ BUILD HALTED: Data validation failed. Fix errors in country-data.json before deploying.');
    process.exit(1);
  }
} else {
  console.log('WARNING: data/country-data.json not found — reserves section will be empty');
}

function generateReservesHTML(data) {
  if (!data) return '';

  const metalOrder = [
    // Base metals
    { key: 'copper', label: 'Copper' },
    { key: 'aluminium', label: 'Aluminium' },
    { key: 'nickel', label: 'Nickel' },
    { key: 'zinc', label: 'Zinc' },
    { key: 'lead', label: 'Lead' },
    { key: 'tin', label: 'Tin' },
    // Precious
    { key: 'gold', label: 'Gold' },
    { key: 'silver', label: 'Silver' },
    { key: 'pgm', label: 'PGM' },
    // Battery & EV
    { key: 'lithium', label: 'Lithium' },
    { key: 'cobalt', label: 'Cobalt' },
    // Strategic
    { key: 'rare_earths', label: 'Rare Earths' },
    { key: 'tungsten', label: 'Tungsten' },
    { key: 'vanadium', label: 'Vanadium' },
    { key: 'manganese', label: 'Manganese' },
    { key: 'chromium', label: 'Chromium' },
    { key: 'molybdenum', label: 'Molybdenum' },
    { key: 'antimony', label: 'Antimony' },
    // Minor / Specialty
    { key: 'gallium', label: 'Gallium' },
    { key: 'germanium', label: 'Germanium' },
    { key: 'graphite', label: 'Graphite' },
    // Bulk / Industrial
    { key: 'iron_ore', label: 'Iron Ore' },
    { key: 'titanium', label: 'Titanium' },
    { key: 'magnesium', label: 'Magnesium' },
    { key: 'uranium', label: 'Uranium' },
  ];

  const available = metalOrder.filter(m => data[m.key]);

  // Build tabs
  const tabsHtml = available.map(m => {
    const active = m.key === 'copper' ? ' reserves-tab--active' : '';
    return `<button class="reserves-tab${active}" data-reserves-metal="${m.key}">${escapeHtml(m.label)}</button>`;
  }).join('\n        ');

  // Build table for a single data set (countries array)
  function buildTable(tableData) {
    const hasRes = tableData.has_reserves;
    const resOnly = tableData.reserves_only;
    const twoYears = tableData.has_two_years !== false && tableData.year2;
    let thead = '';
    if (resOnly) {
      thead = `<tr><th>Country</th><th>Reserves</th></tr>`;
    } else if (twoYears && hasRes) {
      thead = `<tr><th>Country</th><th>${tableData.year1 || 'Production'}</th><th>${tableData.year2}</th><th>Reserves</th></tr>`;
    } else if (twoYears) {
      thead = `<tr><th>Country</th><th>${tableData.year1 || 'Production'}</th><th>${tableData.year2}</th></tr>`;
    } else if (hasRes) {
      thead = `<tr><th>Country</th><th>${tableData.year1 || 'Production'}</th><th>Reserves</th></tr>`;
    } else {
      thead = `<tr><th>Country</th><th>${tableData.year1 || 'Production'}</th></tr>`;
    }

    const rows = tableData.countries.map(c => {
      const safe = (v) => escapeHtml(String(v || '—'));
      if (resOnly) {
        return `<tr><td>${safe(c.country)}</td><td>${safe(c.reserves)}</td></tr>`;
      } else if (twoYears && hasRes) {
        return `<tr><td>${safe(c.country)}</td><td>${safe(c.production_y1)}</td><td>${safe(c.production_y2)}</td><td>${safe(c.reserves)}</td></tr>`;
      } else if (twoYears) {
        return `<tr><td>${safe(c.country)}</td><td>${safe(c.production_y1)}</td><td>${safe(c.production_y2)}</td></tr>`;
      } else if (hasRes) {
        return `<tr><td>${safe(c.country)}</td><td>${safe(c.production_y1)}</td><td>${safe(c.reserves)}</td></tr>`;
      } else {
        return `<tr><td>${safe(c.country)}</td><td>${safe(c.production_y1)}</td></tr>`;
      }
    }).join('\n              ');

    const pu = tableData.production_unit || '';
    const ru = tableData.reserves_unit || '';
    const unitLine = (pu ? `Production: ${escapeHtml(pu)}` : '') +
      (ru ? (pu ? ' · ' : '') + `Reserves: ${escapeHtml(ru)}` : '');

    return `${unitLine ? `<div class="reserves-meta">${unitLine}</div>` : ''}
            <table class="reserves-table">
              <thead>${thead}</thead>
              <tbody>
              ${rows}
              </tbody>
            </table>`;
  }

  // Build panels for each metal
  const panelsHtml = available.map(m => {
    const md = data[m.key];
    const active = m.key === 'copper' ? ' reserves-metal-panel--active' : '';
    let content = '';

    if (md.type === 'multi_table') {
      // Sub-tables with sub-tabs
      const subKeys = Object.keys(md.sub_tables);
      const subTabsHtml = subKeys.map((sk, i) => {
        const st = md.sub_tables[sk];
        const act = i === 0 ? ' reserves-tab--active' : '';
        return `<button class="reserves-tab reserves-tab--sub${act}" data-reserves-sub="${m.key}-${sk}">${escapeHtml(st.label)}</button>`;
      }).join('\n            ');

      const subPanelsHtml = subKeys.map((sk, i) => {
        const st = md.sub_tables[sk];
        const act = i === 0 ? ' reserves-metal-panel--active' : '';
        return `<div class="reserves-metal-panel reserves-sub-panel${act}" data-reserves-subpanel="${m.key}-${sk}">
            ${buildTable(st)}
          </div>`;
      }).join('\n          ');

      content = `<div class="reserves-sub-tabs">
            ${subTabsHtml}
          </div>
          ${subPanelsHtml}`;
    } else {
      // Simple table
      content = buildTable(md);
    }

    const sourceUrl = md.source_url || '';
    const sourceText = md.source || (md.sub_tables && Object.values(md.sub_tables)[0].source) || 'USGS Mineral Commodity Summaries 2026';
    const sourceHtml = sourceUrl
      ? `<div class="reserves-meta" style="margin-top: var(--space-3);">Source: <a href="${sourceUrl}" target="_blank" rel="noopener" style="color: var(--color-primary);">${escapeHtml(sourceText)}</a></div>`
      : `<div class="reserves-meta" style="margin-top: var(--space-3);">Source: ${escapeHtml(sourceText)}</div>`;

    return `<div class="reserves-metal-panel${active}" data-reserves-panel="${m.key}">
          ${content}
          ${sourceHtml}
        </div>`;
  }).join('\n        ');

  const totalCountries = Object.keys(data).filter(k => !k.startsWith('_')).reduce((sum, k) => {
    const m = data[k];
    if (m.type === 'multi_table') {
      return sum + Object.values(m.sub_tables).reduce((s, st) => s + st.countries.length, 0);
    }
    return sum + m.countries.length;
  }, 0);

  return `<div class="digest-section reserves-section" id="reserves-section">
      <h2 class="digest-section__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        Reserves &amp; Production by Country
      </h2>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-bottom: var(--space-5);">Global reserves and mine production by country — primary data from USGS Mineral Commodity Summaries 2026. ${available.length} metals, ${totalCountries} country entries. All figures reported as published by original source — TrueSource does not modify, estimate, or interpret primary data. e = Estimated. W = Withheld. NA = Not available. \u2014 = Zero.</p>
      <div class="reserves-tabs">
        ${tabsHtml}
      </div>
      <div class="reserves-panels">
        ${panelsHtml}
      </div>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-top: var(--space-4); font-style: italic;">Data: U.S. Geological Survey, 2026, Mineral commodity summaries 2026. <a href="https://doi.org/10.5066/P1WKQ63T" target="_blank" rel="noopener" style="color: var(--color-primary);">https://doi.org/10.5066/P1WKQ63T</a>. Uranium data from World Nuclear Association. Production years 2024 (actual/estimated) and 2025e (estimated). Reserves as of publication date.</p>
    </div>`;
}

const reservesSectionHTML = generateReservesHTML(countryData);
html = html.replace('{{RESERVES_SECTION_HTML}}', reservesSectionHTML);
console.log(`Reserves section: ${countryData ? Object.keys(countryData).filter(k => !k.startsWith('_')).length + ' metals' : 'empty'}`);

// ─── Producers Section ───

const producersPath = path.join(__dirname, '..', 'data', 'producers.json');
let producers = null;
if (fs.existsSync(producersPath)) {
  producers = JSON.parse(fs.readFileSync(producersPath, 'utf8'));
  const totalProducers = Object.values(producers).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Producers data loaded: ${totalProducers} entries across ${Object.keys(producers).length} metals`);
} else {
  console.log('WARNING: data/producers.json not found — producers section will be empty');
}

function generateProducersHTML(producersData) {
  if (!producersData) return '';

  const metalTabs = [
    // Exchange-traded base metals (LME/SHFE)
    { key: 'copper', label: 'Copper' },
    { key: 'aluminium', label: 'Aluminium' },
    { key: 'nickel', label: 'Nickel' },
    { key: 'zinc', label: 'Zinc' },
    { key: 'tin', label: 'Tin' },
    { key: 'lead', label: 'Lead' },
    // Precious metals (LBMA/COMEX/SHFE)
    { key: 'gold', label: 'Gold' },
    { key: 'silver', label: 'Silver' },
    { key: 'platinum', label: 'Platinum' },
    { key: 'palladium', label: 'Palladium' },
    // PGMs
    { key: 'rhodium', label: 'Rhodium' },
    { key: 'iridium', label: 'Iridium' },
    { key: 'ruthenium', label: 'Ruthenium' },
    { key: 'osmium', label: 'Osmium' },
    // Steel & ferrous (SHFE/LME)
    { key: 'steel', label: 'Steel' },
    { key: 'iron_ore', label: 'Iron Ore' },
    // Ferro-alloys
    { key: 'ferrochrome', label: 'Ferrochrome' },
    { key: 'ferrosilicon', label: 'Ferrosilicon' },
    // EV & battery metals (LME cash-settled)
    { key: 'lithium', label: 'Lithium' },
    { key: 'cobalt', label: 'Cobalt' },
    { key: 'molybdenum', label: 'Molybdenum' },
    // Rare earths (group + individual elements)
    { key: 'rare_earths', label: 'Rare Earths' },
    { key: 'neodymium', label: 'Neodymium' },
    { key: 'praseodymium', label: 'Praseodymium' },
    { key: 'dysprosium', label: 'Dysprosium' },
    { key: 'lanthanum', label: 'Lanthanum' },
    { key: 'terbium', label: 'Terbium' },
    // Minor & specialty metals
    { key: 'tungsten', label: 'Tungsten' },
    { key: 'vanadium', label: 'Vanadium' },
    { key: 'manganese', label: 'Manganese' },
    { key: 'chromium', label: 'Chromium' },
    { key: 'titanium', label: 'Titanium' },
    { key: 'antimony', label: 'Antimony' },
    { key: 'gallium', label: 'Gallium' },
    { key: 'germanium', label: 'Germanium' },
    { key: 'indium', label: 'Indium' },
    { key: 'tellurium', label: 'Tellurium' },
    { key: 'hafnium', label: 'Hafnium' },
    { key: 'rhenium', label: 'Rhenium' },
    { key: 'magnesium', label: 'Magnesium' },
    // Energy & strategic
    { key: 'uranium', label: 'Uranium' },
  ];

  // Only include tabs for metals present in the data
  const availableTabs = metalTabs.filter(t => producersData[t.key] && producersData[t.key].length > 0);

  const tabsHtml = availableTabs.map((t, i) => {
    const active = t.key === 'copper' ? ' producers-tab--active' : '';
    return `<button class="producers-tab${active}" data-metal="${t.key}">${escapeHtml(t.label)}</button>`;
  }).join('\n        ');

  const totalEntries = Object.values(producersData).reduce((sum, arr) => sum + arr.length, 0);

  return `<div class="digest-section producers-section" id="producers-section">
      <h2 class="digest-section__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        Producers Directory
      </h2>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-bottom: var(--space-5);">Global metals producers — verified data from official sources. ${totalEntries} entries across ${availableTabs.length} metals. Company websites link to official domains only. Production figures are published as reported by original sources (company annual reports, regulatory filings, industry publications) — formats vary by source. TrueSource does not modify, estimate, or interpret primary data.</p>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-bottom: var(--space-5); font-style: italic;">Producer data compiled from public sources including USGS Mineral Commodity Summaries, World Steel Association, and company annual reports. Links verified as of April 2026. Some regional websites may have restricted access depending on your location. For corrections or updates, contact <a href="mailto:info@truesourcemetals.com" style="color: var(--color-primary);">info@truesourcemetals.com</a></p>
      <div class="producers-tabs">
        ${tabsHtml}
      </div>
      <div class="producers-grid" id="producersGrid">
        <!-- Populated by JavaScript from TSM_PRODUCERS data -->
      </div>
      <script>window.TSM_PRODUCERS = ${JSON.stringify(producersData)};<\/script>
    </div>`;
}

const producersSectionHTML = generateProducersHTML(producers);

// ─── Glossary Section ───

const glossaryPath = path.join(__dirname, '..', 'data', 'glossary.json');
let glossaryHTML = '';
if (fs.existsSync(glossaryPath)) {
  const glossary = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
  
  const categoryIcons = {
    'metals-exchanges': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>',
    'rwa-tokenization': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    'regulatory-compliance': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'trade-policy': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    'esg-sustainability': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75"/></svg>',
    'battery-critical-minerals': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="12" height="18" rx="2"/><path d="M10 2v2M14 2v2M8 10h8M8 14h5"/></svg>',
    'mining-exploration': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 13l8-8"/><path d="M2 22l8-8"/><path d="M14 2h8v8"/><path d="M10 14l4 4"/><path d="M14 14l-4-4"/></svg>',
    'processing-metallurgy': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    'warehousing-logistics': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect x="6" y="10" width="12" height="12"/></svg>',
    'trading-pricing': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
  };
  
  const categoryCards = glossary.categories.map(cat => {
    const icon = categoryIcons[cat.id] || '';
    const sortedTerms = [...cat.terms].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
    const terms = sortedTerms.map(t => {
      const fullNameDisplay = t.full_name && t.full_name !== t.term
        ? `<span class="glossary-fullname">${escapeHtml(t.full_name)}</span>`
        : '';
      return `<div class="glossary-term">
              <div class="glossary-term__header">
                <span class="glossary-term__name">${escapeHtml(t.term)}</span>
                ${fullNameDisplay}
              </div>
              <div class="glossary-term__def">${escapeHtml(t.definition)}</div>
              <div class="glossary-term__attr">${escapeHtml(t.attribution)}</div>
            </div>`;
    }).join('\n');
    
    return `<div class="glossary-category" data-glossary-cat="${cat.id}">
          <h3 class="glossary-category__title">${icon} ${escapeHtml(cat.name)}</h3>
          ${terms}
        </div>`;
  }).join('\n');
  
  // Category tab buttons
  const categoryTabs = glossary.categories.map((cat, i) => {
    const active = i === 0 ? ' glossary-tab--active' : '';
    return `<button class="glossary-tab${active}" data-glossary-tab="${cat.id}">${escapeHtml(cat.name)}</button>`;
  }).join('\n            ');
  
  glossaryHTML = `<div class="digest-section" id="glossary-section">
      <h2 class="digest-section__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        Glossary
      </h2>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-bottom: var(--space-4);">Key terms across metals markets, tokenization, regulation, trade policy, and sustainability. Definitions based on official documentation from primary sources.</p>
      <div class="glossary-tabs">
        <button class="glossary-tab glossary-tab--all glossary-tab--active" data-glossary-tab="all">All</button>
            ${categoryTabs.replace(' glossary-tab--active', '')}
      </div>
      <div class="glossary-search">
        <input type="text" class="glossary-search__input" placeholder="Search terms..." id="glossarySearch">
      </div>
      <div class="glossary-content">
${categoryCards}
      </div>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-top: var(--space-4);">All definitions are based on official documentation from the cited organisations. No external links are included — source information may change over time. ${glossary.categories.reduce((sum, c) => sum + c.terms.length, 0)} terms across ${glossary.categories.length} categories.</p>
    </div>`;
  
  console.log(`Glossary loaded: ${glossary.categories.reduce((sum, c) => sum + c.terms.length, 0)} terms across ${glossary.categories.length} categories`);
} else {
  console.log('WARNING: data/glossary.json not found — glossary section will be empty');
}

// ─── News Section ───

function generateNewsHTML(newsData) {
  if (!newsData || !newsData.articles || newsData.articles.length === 0) {
    return ''; // No news section if no data
  }
  
  const newsItems = newsData.articles.map(article => {
    const date = article.pubDate ? formatNewsDate(article.pubDate) : '';
    const sourceDisplay = article.source || 'News';
    // Strip " - SourceName" suffix from Google News titles (source shown separately)
    let title = article.title;
    if (article.source && title.endsWith(' - ' + article.source)) {
      title = title.slice(0, -((' - ' + article.source).length));
    }
    
    const metalTags = (article.metals || ['general']).join(' ');
    const topicTags = (article.topics || []).join(' ');
    return `      <div class="news-item" data-metals="${metalTags}" data-topics="${topicTags}">
        <div class="news-item__headline"><a href="${article.link}" target="_blank" rel="noopener">${escapeHtml(title)}</a></div>
        <div class="news-item__source">${escapeHtml(sourceDisplay)}${date ? ' · ' + date : ''}</div>
      </div>`;
  }).join('\n');
  
  // Build metal filter options from available articles
  const allMetalTags = new Set();
  newsData.articles.forEach(a => (a.metals || []).forEach(m => allMetalTags.add(m)));
  const allTopicTags = new Set();
  newsData.articles.forEach(a => (a.topics || []).forEach(t => allTopicTags.add(t)));

  const metalNames = {
    // LME base metals
    nickel: 'Nickel', copper: 'Copper', aluminum: 'Aluminium',
    zinc: 'Zinc', lead: 'Lead', tin: 'Tin',
    // Precious
    gold: 'Gold', silver: 'Silver', platinum: 'Platinum', palladium: 'Palladium',
    rhodium: 'Rhodium', iridium: 'Iridium', ruthenium: 'Ruthenium',
    // Battery & EV
    cobalt: 'Cobalt', lithium: 'Lithium', battery: 'Battery/EV',
    // Rare earths
    'rare-earths': 'Rare Earths',
    // Minor & specialty
    antimony: 'Antimony', gallium: 'Gallium', germanium: 'Germanium',
    tungsten: 'Tungsten', vanadium: 'Vanadium', titanium: 'Titanium',
    manganese: 'Manganese', molybdenum: 'Molybdenum',
    indium: 'Indium', tellurium: 'Tellurium', magnesium: 'Magnesium',
    // Energy & strategic
    uranium: 'Uranium', 'ferro-alloys': 'Ferro-alloys',
    // Iron ore
    'iron-ore': 'Iron Ore',
    // General
    general: 'General'
  };
  const topicNames = {
    'battery-ev': 'Battery & EV',
    'rwa': 'RWA / Tokenization',
    'hk-regulatory': 'HK Regulatory',
    'esg': 'ESG',
    'china-policy': 'China Policy',
    'global-policy': 'Global Policy',
  };

  // Order: base metals, precious, battery/EV, rare earths, specialty, energy, iron ore, general
  const metalOrder = [
    'nickel','copper','aluminum','zinc','lead','tin',
    'gold','silver','platinum','palladium','rhodium','iridium','ruthenium',
    'cobalt','lithium','battery',
    'rare-earths',
    'antimony','gallium','germanium','tungsten','vanadium','titanium',
    'manganese','molybdenum','indium','tellurium','magnesium',
    'uranium','ferro-alloys',
    'iron-ore',
    'general'
  ];
  const availableMetals = metalOrder.filter(m => allMetalTags.has(m));
  // Topic order
  const topicOrder = ['battery-ev', 'rwa', 'hk-regulatory', 'esg', 'china-policy', 'global-policy'];
  const availableTopics = topicOrder.filter(t => allTopicTags.has(t));
  
  const metalFilterOptions = availableMetals
    .map(m => `<button class="news-filter-btn" data-filter="${m}">${metalNames[m] || m}</button>`)
    .join('\n            ');
  const topicFilterOptions = availableTopics
    .map(t => `<button class="news-filter-btn news-filter-btn--topic" data-filter="${t}" data-filter-type="topic">${topicNames[t] || t}</button>`)
    .join('\n            ');
  const topicSeparator = availableTopics.length > 0 && availableMetals.length > 0
    ? '\n            <span class="news-filter-divider"></span>\n            '
    : '';
  const filterOptions = metalFilterOptions + topicSeparator + topicFilterOptions;

  return `<div class="digest-section" id="news-section">
      <h2 class="digest-section__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 12h10"/></svg>
        Latest Market News
      </h2>
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-bottom: var(--space-4);">Filter by metal or topic. Updated with each Hub refresh.</p>
      <div class="news-filter-bar">
        <button class="news-filter-btn news-filter-btn--active" data-filter="all">All</button>
            ${filterOptions}
      </div>
      <div class="news-empty" style="display:none; padding: var(--space-6) 0; text-align: center; color: var(--color-text-faint); font-size: var(--text-sm);">No news available for this metal right now.</div>
${newsItems}
      <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-top: var(--space-3);">Source: Google News RSS \u00b7 Fetched: ${formatTime(newsData.fetched_at)}</p>
    </div>`;
}

function formatNewsDate(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const newsSectionHTML = generateNewsHTML(news);
html = html.replace('{{NEWS_SECTION_HTML}}', newsSectionHTML);
html = html.replace('{{GLOSSARY_SECTION_HTML}}', glossaryHTML);
html = html.replace('{{PRODUCERS_SECTION_HTML}}', producersSectionHTML);

// ─── Data Sources Section ───
const dataSourcesHTML = `<div class="digest-section" id="sources-section">
    <h2 class="digest-section__title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Our Data Sources
    </h2>
    <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-bottom: var(--space-5);">TrueSource Metals uses only primary, authoritative sources. We do not modify, estimate, or interpret data. All figures are reported exactly as published by the original source.</p>
    <style>.sources-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); } @media (max-width: 700px) { .sources-grid { grid-template-columns: 1fr; } }</style>
    <div class="sources-grid">
      <div style="background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4);">
        <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--color-text); margin: 0 0 var(--space-2) 0;">Production &amp; Reserves</h3>
        <div style="font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.6;">
          <p style="margin: 0 0 var(--space-2) 0;"><a href="https://doi.org/10.5066/P1WKQ63T" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">USGS Mineral Commodity Summaries 2026</a><br>U.S. Geological Survey — the global standard for mineral production and reserves data. Covers 25 metals with country-level detail. Published annually.</p>
          <p style="margin: 0;"><a href="https://world-nuclear.org/" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">World Nuclear Association</a><br>Uranium production and reserves data (OECD NEA/IAEA source). Complementary to USGS, which does not cover uranium.</p>
        </div>
      </div>
      <div style="background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4);">
        <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--color-text); margin: 0 0 var(--space-2) 0;">Official Prices</h3>
        <div style="font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.6;">
          <p style="margin: 0 0 var(--space-2) 0;"><a href="https://www.lme.com" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">London Metal Exchange (LME)</a><br>Official settlement prices for base metals (copper, aluminium, zinc, nickel, tin, lead, cobalt, molybdenum). Reported in USD/t.</p>
          <p style="margin: 0 0 var(--space-2) 0;"><a href="https://www.lbma.org.uk" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">London Bullion Market Association (LBMA)</a><br>Official fix prices for precious metals (gold, silver, platinum, palladium). Reported in USD/oz.</p>
          <p style="margin: 0;"><a href="https://www.shfe.com.cn" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">Shanghai Futures Exchange (SHFE)</a><br>Official settlement prices for Chinese futures contracts. Reported in RMB/t.</p>
        </div>
      </div>
      <div style="background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4);">
        <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--color-text); margin: 0 0 var(--space-2) 0;">Price Data Providers</h3>
        <div style="font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.6;">
          <p style="margin: 0 0 var(--space-2) 0;"><a href="https://metals.dev" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">Metals.dev</a><br>API provider for LME and LBMA official price data. Delivers exchange-sourced settlement and fix prices.</p>
          <p style="margin: 0;"><a href="https://metals-api.com" target="_blank" rel="noopener" style="color: var(--color-primary); font-weight: 500;">Metals-API.com</a><br>Supplementary API for 37+ metals spot prices including minor and specialty metals not covered by LME/LBMA.</p>
        </div>
      </div>
    </div>
    <p style="font-size: var(--text-xs); color: var(--color-text-faint); margin-top: var(--space-4); font-style: italic;">Prices are official settlement/fix values updated twice daily on business days — not real-time quotes. News articles are sourced from public feeds with full attribution to original publishers. For questions about our data methodology, contact <a href="mailto:info@truesourcemetals.com" style="color: var(--color-primary);">info@truesourcemetals.com</a></p>
  </div>`;
html = html.replace('{{DATA_SOURCES_SECTION_HTML}}', dataSourcesHTML);

console.log(`News section: ${news ? news.article_count + ' articles' : 'empty'}`);
console.log(`Producers section: ${producers ? Object.values(producers).reduce((sum, arr) => sum + arr.length, 0) + ' entries' : 'empty'}`);

// ─── Hub Stats (dynamic from data) ───

// Count prices
const lmePriceCount = Object.keys(prices.lme).length;
const preciousPriceCount = Object.keys(prices.precious).length;
const shfePriceCount = shfe && shfe.metals ? Object.values(shfe.metals).filter(m => m.front_month && m.front_month.settlement_price > 0).length : 0;
const maPriceCount = metalsApi ? Object.values(metalsApi.metals).filter(m => m.price !== null && m.price > 0).length : 0;
const totalPrices = lmePriceCount + preciousPriceCount + shfePriceCount + maPriceCount;

// Count producers
const totalProducers = producers ? Object.values(producers).reduce((sum, arr) => sum + arr.length, 0) : 0;
const totalMetalsP = producers ? Object.keys(producers).length : 0;

// Count glossary
const glossaryPath2 = path.join(__dirname, '..', 'data', 'glossary.json');
let totalTerms = 0;
if (fs.existsSync(glossaryPath2)) {
  const g = JSON.parse(fs.readFileSync(glossaryPath2, 'utf8'));
  totalTerms = g.categories.reduce((sum, c) => sum + c.terms.length, 0);
}

console.log(`Stats: ${totalPrices} prices, ${totalProducers} producers across ${totalMetalsP} metals, ${totalTerms} glossary terms`);

// Nav badge counts
const reservesMetalCount = countryData ? Object.keys(countryData).filter(k => k !== '_metadata').length : 0;
const newsCount = news ? news.article_count : 0;
html = html.replaceAll('{{NAV_COUNT_PRICES}}', totalPrices);
html = html.replaceAll('{{NAV_COUNT_NEWS}}', newsCount);
html = html.replaceAll('{{NAV_COUNT_RESERVES}}', reservesMetalCount);
html = html.replaceAll('{{NAV_COUNT_GLOSSARY}}', totalTerms);
html = html.replaceAll('{{NAV_COUNT_PRODUCERS}}', totalProducers);
html = html.replaceAll('{{NAV_COUNT_SOURCES}}', '7');

// Stats counter bar HTML
const statsHTML = `<div class="hub-stats">
      <div class="hub-stat">
        <div class="hub-stat__number">${totalPrices}</div>
        <div class="hub-stat__label">Official Prices</div>
      </div>
      <div class="hub-stat">
        <div class="hub-stat__number">${totalProducers}</div>
        <div class="hub-stat__label">Producers</div>
      </div>
      <div class="hub-stat">
        <div class="hub-stat__number">${totalMetalsP}</div>
        <div class="hub-stat__label">Metals Covered</div>
      </div>
      <div class="hub-stat">
        <div class="hub-stat__number">${totalTerms}</div>
        <div class="hub-stat__label">Glossary Terms</div>
      </div>
    </div>`;

html = html.replace('{{STATS_HTML}}', statsHTML);

// Replace stats placeholders in meta tags
html = html.replace(/\{\{TOTAL_PRICES\}\}/g, String(totalPrices));
html = html.replace(/\{\{TOTAL_PRODUCERS\}\}/g, String(totalProducers));
html = html.replace(/\{\{TOTAL_METALS_P\}\}/g, String(totalMetalsP));
html = html.replace(/\{\{TOTAL_TERMS\}\}/g, String(totalTerms));

// ─── JSON-LD Structured Data ───

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "TSM Hub — Metals Market Data",
  "description": `${totalPrices} official prices across ${totalMetalsP} metals, ${totalProducers} global producers directory, reserves & production data for 25 metals by country, ${totalTerms} glossary terms. Covers LME, LBMA, SHFE, rare earths, battery metals, PGMs, specialty metals. Updated twice daily.`,
  "url": "https://hub.truesourcemetals.com",
  "license": "https://creativecommons.org/licenses/by-nc/4.0/",
  "creator": {
    "@type": "Organization",
    "name": "TrueSource Metals",
    "url": "https://truesourcemetals.com"
  },
  "temporalCoverage": new Date().toISOString().split('T')[0] + "/..",
  "spatialCoverage": "Global",
  "variableMeasured": [
    "Metal commodity prices (USD/t, USD/oz, RMB/t, USD/kg, USD/lb)",
    "Global reserves and mine production by country (USGS MCS 2026)",
    "Global metals producers and production data",
    "Industry glossary and terminology"
  ],
  "distribution": {
    "@type": "DataDownload",
    "encodingFormat": "text/html",
    "contentUrl": "https://hub.truesourcemetals.com"
  },
  "keywords": [
    "metals prices", "LME", "LBMA", "SHFE", "commodity data",
    "rare earth prices", "battery metals", "PGM prices",
    "metals producers", "critical minerals", "mining data",
    "metal reserves by country", "mine production", "USGS mineral commodity summaries"
  ]
};

// Insert JSON-LD before closing </head>
const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>`;
html = html.replace('</head>', jsonLdScript + '\n</head>');

// Also add WebSite schema for sitelinks search box
const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "TSM Hub",
  "alternateName": "TrueSource Metals Hub",
  "url": "https://hub.truesourcemetals.com"
};
const webSiteScript = `<script type="application/ld+json">${JSON.stringify(webSiteSchema)}<\/script>`;
html = html.replace('</head>', webSiteScript + '\n</head>');

// ─── Metals Grid for Hub ───

const metalsForGrid = [
  { slug: 'copper', name: 'Copper', symbol: 'Cu', category: 'Base', critical: true },
  { slug: 'aluminium', name: 'Aluminium', symbol: 'Al', category: 'Base', critical: true },
  { slug: 'nickel', name: 'Nickel', symbol: 'Ni', category: 'Base', critical: true },
  { slug: 'zinc', name: 'Zinc', symbol: 'Zn', category: 'Base', critical: true },
  { slug: 'lead', name: 'Lead', symbol: 'Pb', category: 'Base', critical: false },
  { slug: 'tin', name: 'Tin', symbol: 'Sn', category: 'Base', critical: true },
  { slug: 'gold', name: 'Gold', symbol: 'Au', category: 'Precious', critical: false },
  { slug: 'silver', name: 'Silver', symbol: 'Ag', category: 'Precious', critical: false },
  { slug: 'pgm', name: 'PGM', symbol: 'Pt/Pd', category: 'Precious', critical: true },
  { slug: 'lithium', name: 'Lithium', symbol: 'Li', category: 'Battery', critical: true },
  { slug: 'cobalt', name: 'Cobalt', symbol: 'Co', category: 'Battery', critical: true },
  { slug: 'rare-earths', name: 'Rare Earths', symbol: 'REE', category: 'Strategic', critical: true },
  { slug: 'tungsten', name: 'Tungsten', symbol: 'W', category: 'Strategic', critical: true },
  { slug: 'vanadium', name: 'Vanadium', symbol: 'V', category: 'Strategic', critical: true },
  { slug: 'manganese', name: 'Manganese', symbol: 'Mn', category: 'Strategic', critical: true },
  { slug: 'molybdenum', name: 'Molybdenum', symbol: 'Mo', category: 'Strategic', critical: true },
  { slug: 'chromium', name: 'Chromium', symbol: 'Cr', category: 'Strategic', critical: true },
  { slug: 'antimony', name: 'Antimony', symbol: 'Sb', category: 'Strategic', critical: true },
  { slug: 'gallium', name: 'Gallium', symbol: 'Ga', category: 'Technology', critical: true },
  { slug: 'germanium', name: 'Germanium', symbol: 'Ge', category: 'Technology', critical: true },
  { slug: 'graphite', name: 'Graphite', symbol: 'C', category: 'Industrial', critical: true },
  { slug: 'iron-ore', name: 'Iron Ore', symbol: 'Fe', category: 'Bulk', critical: false },
  { slug: 'titanium', name: 'Titanium', symbol: 'Ti', category: 'Strategic', critical: true },
  { slug: 'magnesium', name: 'Magnesium', symbol: 'Mg', category: 'Light', critical: true },
  { slug: 'uranium', name: 'Uranium', symbol: 'U', category: 'Energy', critical: true },
];

const metalsGridHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:var(--space-3)">
${metalsForGrid.map(m => {
  const criticalDot = m.critical ? '<span style="color:var(--color-gold)" title="US Critical Mineral 2025">★</span> ' : '';
  return `  <a href="metals/${m.slug}.html" style="display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-4);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);text-decoration:none;color:var(--color-text);transition:all var(--transition-interactive)" onmouseover="this.style.borderColor='var(--color-primary)'" onmouseout="this.style.borderColor='var(--color-border)'">
    <span style="font-family:var(--font-display);font-weight:700;font-size:var(--text-sm)">${criticalDot}${m.name}</span>
    <span style="font-size:var(--text-xs);color:var(--color-text-faint)">${m.symbol} · ${m.category}</span>
  </a>`;
}).join('\n')}
</div>`;

html = html.replace('{{METALS_GRID_HTML}}', metalsGridHTML);

// ─── Write Output ───

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, 'index.html');
fs.writeFileSync(outPath, html);

// Generate metal pages
try {
  require('./generate-metal-pages.js');
  console.log('Metal pages generated successfully');
} catch (e) {
  console.error('WARNING: Metal pages generation failed:', e.message);
}

// Generate sitemap.xml with metal pages
const today = new Date().toISOString().split('T')[0];
const metalSlugs = ['copper','aluminium','nickel','zinc','lead','tin','gold','silver','pgm',
  'lithium','cobalt','rare-earths','tungsten','vanadium','manganese','molybdenum',
  'chromium','antimony','gallium','germanium','graphite','iron-ore','titanium','magnesium','uranium'];
const metalUrls = metalSlugs.map(s => `  <url>
    <loc>https://hub.truesourcemetals.com/metals/${s}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hub.truesourcemetals.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${metalUrls}
</urlset>`;
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml);
console.log('Sitemap generated: dist/sitemap.xml');

// Generate robots.txt
const robotsTxt = `User-agent: *\nAllow: /\nSitemap: https://hub.truesourcemetals.com/sitemap.xml\n`;
fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt);
console.log('Robots.txt generated: dist/robots.txt');

// Copy static assets (favicons)
const staticDir = path.join(__dirname, 'static');
if (fs.existsSync(staticDir)) {
  fs.readdirSync(staticDir).forEach(file => {
    fs.copyFileSync(path.join(staticDir, file), path.join(distDir, file));
  });
  console.log('Static assets copied to dist/');
}

console.log(`Hub page generated: ${outPath}`);
console.log(`Data date: ${dataDate}`);
console.log(`Data timestamp: ${dataTime}`);
if (shfe) {
  console.log(`SHFE date: ${shfe.date_formatted}`);
}
