/**
 * fetch-news.js
 * Fetches metals & commodities news from Google News RSS feeds
 * Saves structured JSON to data/news.json
 * 
 * Sources: Google News RSS (free, no API key needed)
 * Strategy: Multiple targeted queries, score by recency + source trust + relevance,
 *           deduplicate, take top N
 * 
 * Usage: node src/fetch-news.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───

const NEWS_QUERIES = [
  { query: 'LME copper aluminum nickel zinc price today', category: 'base_metals' },
  { query: 'gold silver platinum price today', category: 'precious_metals' },
  { query: 'SHFE Shanghai metals nickel copper', category: 'shfe' },
  { query: 'metals commodities trade tariffs', category: 'trade' },
  { query: 'mining metals production supply chain', category: 'mining' },
];

const MAX_TOTAL_ARTICLES = 15;  // Final curated list for Hub
const MAX_AGE_DAYS = 7;         // Max article age (7 days)

// Trusted sources for metals/commodities (bonus in scoring)
const TIER1_SOURCES = [
  'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com',
];
const TIER2_SOURCES = [
  'mining.com', 'kitco.com', 'investing.com', 'marketwatch.com',
  'spglobal.com', 'fastmarkets.com', 'barrons.com', 'bbc.com',
  'scmp.com', 'nikkei.com', 'cmegroup.com', 'lme.com',
  'investingnews.com', 'recyclingtoday.com', 'agmetalminer.com',
  'argusmedia.com', 'fortune.com', 'livemint.com', 'economictimes.com',
  'aljazeera.com', 'steelnews.biz',
];

// Keywords that boost relevance
const STRONG_KEYWORDS = [
  'copper', 'aluminum', 'aluminium', 'nickel', 'zinc', 'lead', 'tin',
  'gold', 'silver', 'platinum', 'palladium',
  'lme', 'lbma', 'shfe', 'comex',
];
const WEAK_KEYWORDS = [
  'metal', 'metals', 'mining', 'smelter', 'refinery',
  'commodity', 'commodities', 'base metal', 'precious metal',
  'tariff', 'trade war', 'supply chain', 'shortage',
  'iron ore', 'steel', 'stainless', 'ore',
];

// Negative keywords — discard entirely
const NEGATIVE_KEYWORDS = [
  'bitcoin', 'crypto', 'nft', 'blockchain', 'ethereum', 'dogecoin',
  'horoscope', 'astrology', 'zodiac',
  'death metal', 'heavy metal band', 'metal music',
  'jewellery offer', 'jewelry offer', 'akshaya tritiya',
  'price today in', 'rate today in', 'gold rate in',
  '18k, 22k', '22k & 24k', 'carat gold',
  'agriculture', 'sustainable agriculture',
];

// ─── Fetch Functions ───

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TSMHub/1.0; +https://hub.truesourcemetals.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      }
    };
    
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 3) return reject(new Error('Too many redirects'));
      
      const proto = requestUrl.startsWith('https') ? https : require('http');
      proto.get(requestUrl, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    };
    
    makeRequest(url);
  });
}

function buildGoogleNewsUrl(query) {
  const encoded = encodeURIComponent(query);
  // "when:3d" limits to last 3 days for fresher results
  return `https://news.google.com/rss/search?q=${encoded}+when:3d&hl=en-US&gl=US&ceid=US:en`;
}

// ─── Parse RSS ───

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const title = extractTag(itemXml, 'title');
    const link = extractLink(itemXml);
    const pubDate = extractTag(itemXml, 'pubDate');
    const sourceUrl = extractAttr(itemXml, 'source', 'url');
    const sourceName = extractTag(itemXml, 'source');
    
    if (title && link) {
      items.push({
        title: cleanText(title),
        link: link.trim(),
        pubDate: pubDate ? new Date(pubDate).toISOString() : null,
        source: sourceName ? cleanText(sourceName) : extractDomain(sourceUrl || link),
        sourceUrl: sourceUrl || '',
      });
    }
  }
  
  return items;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : '';
}

function extractLink(xml) {
  // Google News RSS puts link as text after <link/> self-closing tag
  const match1 = xml.match(/<link\/>\s*(https?:\/\/[^\s<]+)/);
  if (match1) return match1[1];
  // Fallback: normal <link>...</link>
  const match2 = xml.match(/<link>([\s\S]*?)<\/link>/);
  return match2 ? match2[1] : '';
}

function extractAttr(xml, tag, attr) {
  const match = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)">`));
  return match ? match[1] : '';
}

function cleanText(text) {
  return text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractDomain(url) {
  try {
    const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
    return match ? match[1] : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ─── Scoring & Filtering ───

function scoreArticle(article) {
  const titleLower = article.title.toLowerCase();
  const sourceDomain = (article.sourceUrl || '').toLowerCase();
  
  // Hard discard: negative keywords
  if (NEGATIVE_KEYWORDS.some(kw => titleLower.includes(kw))) return -1;
  
  // Hard discard: too old
  if (article.pubDate) {
    const ageHours = (Date.now() - new Date(article.pubDate).getTime()) / (1000 * 60 * 60);
    if (ageHours > MAX_AGE_DAYS * 24) return -1;
  }
  
  let score = 0;
  
  // ── Recency (max 50 pts) ──
  if (article.pubDate) {
    const ageHours = (Date.now() - new Date(article.pubDate).getTime()) / (1000 * 60 * 60);
    if (ageHours <= 6) score += 50;
    else if (ageHours <= 12) score += 45;
    else if (ageHours <= 24) score += 40;
    else if (ageHours <= 48) score += 30;
    else if (ageHours <= 72) score += 20;
    else score += 5;
  } else {
    score += 10; // Unknown date — assume somewhat fresh
  }
  
  // ── Source trust (max 30 pts) ──
  if (TIER1_SOURCES.some(s => sourceDomain.includes(s))) score += 30;
  else if (TIER2_SOURCES.some(s => sourceDomain.includes(s))) score += 20;
  else score += 5; // Unknown source — still show
  
  // ── Keyword relevance (max 30 pts) ──
  const strongHits = STRONG_KEYWORDS.filter(kw => titleLower.includes(kw)).length;
  const weakHits = WEAK_KEYWORDS.filter(kw => titleLower.includes(kw)).length;
  score += Math.min(strongHits * 6 + weakHits * 3, 30);
  
  // ── Penalties ──
  // Generic price listing pages (not real analysis)
  if (titleLower.match(/futures overview$/) || titleLower.match(/^current price of/)) score -= 15;
  if (titleLower.match(/price chart|spot price chart|price today$/)) score -= 10;
  // Local gold/silver price listings (Indian cities, etc.)
  if (titleLower.match(/gold price today|silver price today|gold rate today/)) score -= 10;
  if (titleLower.match(/\bgold falls?\b.*₹|\bsilver (drops?|falls?)\b.*₹/)) score -= 8;
  // Prefer English-language global news over local price updates
  if (titleLower.includes('₹') || titleLower.includes('rs ') || titleLower.includes('inr')) score -= 5;
  
  return score;
}

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(article => {
    // Normalize title for dedup: lowercase, strip punctuation, take first 50 chars
    const key = article.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 50);
    
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main ───

async function main() {
  console.log('Fetching metals news from Google News RSS...');
  console.log(`Queries: ${NEWS_QUERIES.length}`);
  console.log(`Max age: ${MAX_AGE_DAYS} days`);
  
  let allArticles = [];
  
  for (const { query, category } of NEWS_QUERIES) {
    const url = buildGoogleNewsUrl(query);
    console.log(`\n  Fetching: "${query}" [${category}]`);
    
    try {
      const xml = await fetchUrl(url);
      const items = parseRSSItems(xml);
      console.log(`    Found ${items.length} items`);
      
      // Tag each with category
      items.forEach(item => item.category = category);
      allArticles.push(...items);
    } catch (err) {
      console.warn(`    WARNING: Failed — ${err.message}`);
    }
  }
  
  console.log(`\nTotal raw articles: ${allArticles.length}`);
  
  // Score
  allArticles = allArticles
    .map(article => ({ ...article, score: scoreArticle(article) }))
    .filter(article => article.score > 0);
  
  console.log(`After scoring (score > 0): ${allArticles.length}`);
  
  // Deduplicate
  allArticles = deduplicateArticles(allArticles);
  console.log(`After dedup: ${allArticles.length}`);
  
  // Sort by score descending
  allArticles.sort((a, b) => b.score - a.score);
  
  // Take top N
  const finalArticles = allArticles.slice(0, MAX_TOTAL_ARTICLES);
  
  // Build output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'Google News RSS',
    query_count: NEWS_QUERIES.length,
    total_scored: allArticles.length,
    article_count: finalArticles.length,
    articles: finalArticles.map(a => ({
      title: a.title,
      link: a.link,
      source: a.source,
      sourceUrl: a.sourceUrl,
      pubDate: a.pubDate,
      category: a.category,
    })),
  };
  
  // Save to data directory
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outPath = path.join(dataDir, 'news.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  
  console.log(`\nSaved to ${outPath}`);
  console.log(`\nTop ${finalArticles.length} articles:`);
  finalArticles.forEach((a, i) => {
    const age = a.pubDate ? Math.round((Date.now() - new Date(a.pubDate).getTime()) / (1000*60*60)) + 'h ago' : '?';
    console.log(`  ${i + 1}. [score:${a.score}] ${a.title}`);
    console.log(`     ${a.source} · ${age}`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
