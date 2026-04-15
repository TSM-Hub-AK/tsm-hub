/**
 * archive-data.js
 * Archives daily prices and news into date-stamped JSON files.
 * Runs after all fetch scripts, before generate-hub.
 * 
 * Storage structure (in data/archive/):
 *   prices/2026-04-15.json   — all price data for that date
 *   news/2026-04-15.json     — all news articles for that date
 *   validation/2026-04-15.json — cross-validation report
 * 
 * Each workflow run appends to the day's file (AM + PM runs).
 * Files are committed to the repo = permanent storage.
 * 
 * "копим и храним в нашем сейфе данных"
 * 
 * Usage: node src/archive-data.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');

// Today's date in YYYY-MM-DD
const today = new Date().toISOString().split('T')[0];
const runTime = new Date().toISOString();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.warn(`  Warning: Could not parse ${filePath}: ${e.message}`);
  }
  return null;
}

function archivePrices() {
  const pricesDir = path.join(ARCHIVE_DIR, 'prices');
  ensureDir(pricesDir);
  
  const archivePath = path.join(pricesDir, `${today}.json`);
  const existing = loadJSON(archivePath) || { date: today, runs: [] };
  
  // Collect all price sources
  const run = { timestamp: runTime, sources: {} };
  
  // Metals.dev prices
  const prices = loadJSON(path.join(DATA_DIR, 'prices.json'));
  if (prices) {
    run.sources['metals_dev'] = prices;
    console.log('  ✓ Metals.dev prices archived');
  }
  
  // Metals-API.com prices
  const metalsApi = loadJSON(path.join(DATA_DIR, 'metals-api.json'));
  if (metalsApi) {
    run.sources['metals_api_com'] = metalsApi;
    console.log('  ✓ Metals-API.com prices archived');
  }
  
  // SHFE prices
  const shfe = loadJSON(path.join(DATA_DIR, 'shfe-prices.json'));
  if (shfe) {
    run.sources['shfe'] = shfe;
    console.log('  ✓ SHFE prices archived');
  }
  
  // Validation report
  const validation = loadJSON(path.join(DATA_DIR, 'validation-report.json'));
  if (validation) {
    run.sources['validation'] = validation;
    console.log('  ✓ Validation report archived');
  }
  
  if (Object.keys(run.sources).length === 0) {
    console.log('  ⚠ No price data found to archive');
    return;
  }
  
  existing.runs.push(run);
  fs.writeFileSync(archivePath, JSON.stringify(existing, null, 2));
  console.log(`  → Saved to archive/prices/${today}.json (run #${existing.runs.length})`);
}

function archiveNews() {
  const newsDir = path.join(ARCHIVE_DIR, 'news');
  ensureDir(newsDir);
  
  const archivePath = path.join(newsDir, `${today}.json`);
  const existing = loadJSON(archivePath) || { date: today, runs: [] };
  
  const news = loadJSON(path.join(DATA_DIR, 'news.json'));
  if (!news) {
    console.log('  ⚠ No news data found to archive');
    return;
  }
  
  const articleCount = Array.isArray(news) ? news.length : 
    (news.articles ? news.articles.length : 0);
  
  existing.runs.push({
    timestamp: runTime,
    article_count: articleCount,
    articles: news,
  });
  
  // Deduplicate articles across runs (by title)
  const allArticles = [];
  const seenTitles = new Set();
  
  for (const run of existing.runs) {
    const arts = Array.isArray(run.articles) ? run.articles : 
      (run.articles?.articles || []);
    for (const art of arts) {
      const title = art.title || art.headline || '';
      if (title && !seenTitles.has(title)) {
        seenTitles.add(title);
        allArticles.push(art);
      }
    }
  }
  
  existing.unique_articles_total = allArticles.length;
  
  fs.writeFileSync(archivePath, JSON.stringify(existing, null, 2));
  console.log(`  ✓ ${articleCount} articles archived`);
  console.log(`  → Saved to archive/news/${today}.json (${allArticles.length} unique total)`);
}

function printStats() {
  const pricesDir = path.join(ARCHIVE_DIR, 'prices');
  const newsDir = path.join(ARCHIVE_DIR, 'news');
  
  let priceDays = 0, newsDays = 0;
  
  if (fs.existsSync(pricesDir)) {
    priceDays = fs.readdirSync(pricesDir).filter(f => f.endsWith('.json')).length;
  }
  if (fs.existsSync(newsDir)) {
    newsDays = fs.readdirSync(newsDir).filter(f => f.endsWith('.json')).length;
  }
  
  console.log(`\n  📊 Archive stats: ${priceDays} days of prices, ${newsDays} days of news`);
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   TSM Data Archive                       ║');
  console.log(`║   ${today}                            ║`);
  console.log('╚══════════════════════════════════════════╝\n');
  
  console.log('Archiving prices...');
  archivePrices();
  
  console.log('\nArchiving news...');
  archiveNews();
  
  printStats();
}

main().catch(err => {
  console.error('Archive error:', err.message);
  // Don't block deployment if archiving fails
  process.exit(0);
});
