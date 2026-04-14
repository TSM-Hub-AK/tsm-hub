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
  };
  
  const categoryCards = glossary.categories.map(cat => {
    const icon = categoryIcons[cat.id] || '';
    const terms = cat.terms.map(t => {
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
    nickel: 'Nickel', copper: 'Copper', aluminum: 'Aluminum',
    zinc: 'Zinc', lead: 'Lead', tin: 'Tin',
    gold: 'Gold', silver: 'Silver', platinum: 'Platinum', palladium: 'Palladium',
    general: 'General'
  };
  const topicNames = {
    'rwa': 'RWA / Tokenization',
    'hk-regulatory': 'HK Regulatory',
    'esg': 'ESG',
    'china-policy': 'China Policy',
    'global-policy': 'Global Policy',
  };

  // Order: base metals first, then precious, then general
  const metalOrder = ['nickel','copper','aluminum','zinc','lead','tin','gold','silver','platinum','palladium','general'];
  const availableMetals = metalOrder.filter(m => allMetalTags.has(m));
  // Topic order
  const topicOrder = ['rwa', 'hk-regulatory', 'esg', 'china-policy', 'global-policy'];
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
console.log(`News section: ${news ? news.article_count + ' articles' : 'empty'}`);

// ─── Write Output ───

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const outPath = path.join(distDir, 'index.html');
fs.writeFileSync(outPath, html);

// Generate sitemap.xml
const today = new Date().toISOString().split('T')[0];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hub.truesourcemetals.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml);
console.log('Sitemap generated: dist/sitemap.xml');

// Generate robots.txt
const robotsTxt = `User-agent: *\nAllow: /\nSitemap: https://hub.truesourcemetals.com/sitemap.xml\n`;
fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt);
console.log('Robots.txt generated: dist/robots.txt');

console.log(`Hub page generated: ${outPath}`);
console.log(`Data date: ${dataDate}`);
console.log(`Data timestamp: ${dataTime}`);
if (shfe) {
  console.log(`SHFE date: ${shfe.date_formatted}`);
}
