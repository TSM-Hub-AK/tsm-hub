#!/usr/bin/env node
/**
 * import-mcs-csv.js
 * 
 * Converts USGS Mineral Commodity Summaries Data Release CSV
 * into country-data.json for TSM Hub.
 * 
 * Input:  MCS2026_Commodities_Data.csv (or any MCS year)
 * Output: data/country-data.json
 * 
 * Usage: node src/import-mcs-csv.js <csv-file>
 * 
 * This script replaces manual PDF extraction — no footnote parsing issues.
 */

const fs = require('fs');
const path = require('path');
// No external CSV dependency — we use our own parser below

// ── CSV parsing (built-in, no dependencies) ──

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'latin1');
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Configuration: Metal definitions ──

const MCS_YEAR = '2026';
const SOURCE = `USGS Mineral Commodity Summaries ${MCS_YEAR}`;
const SOURCE_BASE_URL = `https://pubs.usgs.gov/periodicals/mcs${MCS_YEAR}/mcs${MCS_YEAR}`;

/**
 * Metal configuration map.
 * Keys = our internal metal names
 * Values = how to find and structure data from CSV
 */
const METAL_CONFIG = {
  // ── Simple metals (single table, mine production + reserves) ──
  copper: {
    commodity: 'Copper',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'copper',
  },
  nickel: {
    commodity: 'Nickel',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'nickel',
  },
  zinc: {
    commodity: 'Zinc',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'zinc',
  },
  lead: {
    commodity: 'Lead',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'lead',
  },
  tin: {
    commodity: 'Tin',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'tin',
  },
  gold: {
    commodity: 'Gold',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'gold',
  },
  silver: {
    commodity: 'Silver',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'silver',
  },
  lithium: {
    commodity: 'Lithium',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'lithium',
  },
  cobalt: {
    commodity: 'Cobalt',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'cobalt',
  },
  rare_earths: {
    commodity: 'Rare Earths',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'rare-earths',
  },
  tungsten: {
    commodity: 'Tungsten',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'tungsten',
  },
  vanadium: {
    commodity: 'Vanadium',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'vanadium',
  },
  manganese: {
    commodity: 'Manganese',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'manganese',
  },
  molybdenum: {
    commodity: 'Molybdenum',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves (thousand metric tons)',
    slug: 'molybdenum',
  },
  chromium: {
    commodity: 'Chromium',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves: Ore',  // Chromium has Ore and Cr2O3 content
    slug: 'chromium',
  },
  antimony: {
    commodity: 'Antimony',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'antimony',
  },
  gallium: {
    commodity: 'Gallium',
    production_stat: 'Primary production',
    reserves_stat: null, // No reserves
    slug: 'gallium',
  },
  graphite: {
    commodity: 'Graphite (Natural)',
    production_stat: 'Mine production',
    reserves_stat: 'Reserves',
    slug: 'graphite',
  },
  
  // ── Multi-table metals ──
  // Handled specially below
};

// ── Main logic ──

function main() {
  const csvFile = process.argv[2];
  if (!csvFile) {
    console.error('Usage: node src/import-mcs-csv.js <MCS_Commodities_Data.csv>');
    process.exit(1);
  }

  console.log(`Reading ${csvFile}...`);
  const rows = parseCSV(csvFile);
  console.log(`Parsed ${rows.length} rows`);

  // Filter to World sections only
  const worldRows = rows.filter(r => r.Section && r.Section.includes('World'));
  console.log(`World data rows: ${worldRows.length}`);

  const output = {
    _metadata: {
      source: SOURCE,
      doi: 'https://doi.org/10.5066/P1WKQ63T',
      generated: new Date().toISOString().split('T')[0],
      script: 'import-mcs-csv.js',
      note: 'Machine-generated from USGS MCS Data Release CSV. Uranium and Germanium preserved from previous edition.',
    },
  };

  // ── Process simple metals ──
  for (const [metalKey, config] of Object.entries(METAL_CONFIG)) {
    const result = processSimpleMetal(worldRows, metalKey, config);
    if (result) {
      output[metalKey] = result;
    }
  }

  // ── Process multi-table metals ──
  output.iron_ore = processIronOre(worldRows);
  output.aluminium = processAluminium(worldRows);
  output.pgm = processPGM(worldRows);
  output.titanium = processTitanium(worldRows);
  output.magnesium = processMagnesium(worldRows);

  // ── Preserve uranium from existing data (not in USGS MCS) ──
  const existingPath = path.join(__dirname, '..', 'data', 'country-data.json');
  if (fs.existsSync(existingPath)) {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    if (existing.uranium) {
      output.uranium = existing.uranium;
      console.log(`Preserved uranium from existing data (OECD NEA/IAEA source)`);
    }
    if (existing.germanium) {
      output.germanium = existing.germanium;
      console.log(`Preserved germanium from existing data (no tabular data in MCS)`);
    }
  }

  // ── Write output ──
  const outPath = path.join(__dirname, '..', 'data', 'country-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

  const metalCount = Object.keys(output).length;
  let countryEntries = 0;
  for (const [k, v] of Object.entries(output)) {
    if (v.countries) countryEntries += v.countries.length;
    if (v.sub_tables) {
      const st = v.sub_tables;
      for (const sk of Object.keys(st)) {
        if (st[sk].countries) countryEntries += st[sk].countries.length;
      }
    }
  }
  console.log(`\nOutput: ${outPath}`);
  console.log(`Metals: ${metalCount}, Country entries: ${countryEntries}`);
}

// ── Process a simple single-table metal ──

function processSimpleMetal(worldRows, metalKey, config) {
  const metalRows = worldRows.filter(r => r.Commodity === config.commodity);
  if (metalRows.length === 0) {
    console.log(`  WARNING: ${metalKey} (${config.commodity}) — no data found`);
    return null;
  }

  // Get years
  const years = [...new Set(metalRows.map(r => r.Year))].sort();
  const year1 = years[0]; // e.g., "2024"
  const year2 = years[1]; // e.g., "2025"

  // Get production rows (exclude "rounded" totals)
  const prodRows = metalRows.filter(r => 
    r.Statistics_detail === config.production_stat && r.Year
  );
  
  // Get reserves rows
  const resRows = config.reserves_stat ? metalRows.filter(r =>
    r.Statistics_detail === config.reserves_stat
  ) : [];

  // Get unit from first production row
  const prodUnit = prodRows.length > 0 ? prodRows[0].Unit : '';
  const resUnit = resRows.length > 0 ? resRows[0].Unit : '';

  // Build country list
  const countries = buildCountryList(prodRows, resRows, year1, year2);

  // Get "rounded" row for world total (format varies: ": rounded" or ", rounded")
  const worldProd1 = metalRows.find(r => 
    r.Statistics_detail && r.Statistics_detail.startsWith(config.production_stat) && r.Statistics_detail.includes('rounded') && r.Year === year1
  );
  const worldProd2 = metalRows.find(r => 
    r.Statistics_detail && r.Statistics_detail.startsWith(config.production_stat) && r.Statistics_detail.includes('rounded') && r.Year === year2
  );
  const worldRes = metalRows.find(r => 
    r.Statistics_detail && r.Statistics_detail.startsWith(config.reserves_stat || '___') 
    && r.Statistics_detail.includes('rounded')
  );

  if (worldProd1 || worldProd2 || worldRes) {
    countries.push({
      country: 'World total (rounded)',
      production_y1: worldProd1 ? worldProd1.Value : '—',
      production_y2: worldProd2 ? worldProd2.Value : '—',
      ...(config.reserves_stat ? { reserves: worldRes ? worldRes.Value : 'NA' } : {}),
    });
  }

  const hasReserves = resRows.length > 0;

  const result = {
    source: SOURCE,
    source_url: `${SOURCE_BASE_URL}-${config.slug}.pdf`,
    production_unit: cleanUnit(prodUnit),
    reserves_unit: hasReserves ? cleanUnit(resUnit) : null,
    year1: year1,
    year2: year2 + 'e',
    has_two_years: true,
    has_reserves: hasReserves,
    countries: countries,
  };

  const noteRow = metalRows.find(r => r['Other notes']);
  if (noteRow && noteRow['Other notes']) {
    const note = noteRow['Other notes'].replace(/^\(/, '').replace(/\)$/, '');
    // Extract unit info if present
  }

  console.log(`  ${metalKey}: ${countries.length} countries, ${years.join('/')}, reserves=${hasReserves}`);
  return result;
}

function buildCountryList(prodRows, resRows, year1, year2) {
  // Get unique countries from production
  const countryMap = new Map();
  
  for (const r of prodRows) {
    const country = cleanText(r.Country);
    if (country === 'World' || r.Statistics_detail.includes('rounded')) continue;
    if (!countryMap.has(country)) {
      countryMap.set(country, { production_y1: '—', production_y2: '—', reserves: 'NA' });
    }
    const entry = countryMap.get(country);
    const val = formatValue(r.Value, r.Notes);
    if (r.Year === year1) entry.production_y1 = val;
    if (r.Year === year2) entry.production_y2 = val;
  }

  // Add reserves
  for (const r of resRows) {
    const country = cleanText(r.Country);
    if (country === 'World' || r.Statistics_detail.includes('rounded')) continue;
    if (!countryMap.has(country)) {
      countryMap.set(country, { production_y1: '—', production_y2: '—', reserves: 'NA' });
    }
    countryMap.get(country).reserves = formatValue(r.Value, r.Notes);
  }

  // Convert to array
  const countries = [];
  for (const [name, data] of countryMap) {
    countries.push({
      country: name,
      production_y1: data.production_y1,
      production_y2: data.production_y2,
      ...(resRows.length > 0 ? { reserves: data.reserves } : {}),
    });
  }

  return countries;
}

function formatValue(value, notes) {
  if (!value || value.trim() === '') return '—';
  let v = value.trim();
  // Add estimated prefix if noted
  if (notes && notes.toLowerCase().includes('estimated') && !v.startsWith('e') && !v.startsWith('>')) {
    v = 'e' + v;
  }
  // Handle "W" (withheld)
  if (v === 'W' || v === 'w') return 'W';
  return v;
}

function cleanUnit(unit) {
  if (!unit) return '';
  return cleanText(unit.trim());
}

/** Fix Windows-1252 characters read as latin-1 */
function cleanText(str) {
  return str
    .replace(/\x92/g, "'")
    .replace(/\x93/g, '"')
    .replace(/\x94/g, '"')
    .replace(/\x96/g, '–')
    .replace(/\x97/g, '—');
}

// ── Multi-table metal processors ──

function processIronOre(worldRows) {
  const ioRows = worldRows.filter(r => r.Commodity === 'Iron Ore');
  const years = [...new Set(ioRows.map(r => r.Year))].sort();
  const y1 = years[0], y2 = years[1];

  function buildSubTable(statPrefix, resPrefix, label, prodUnit, resUnit) {
    const prodRows = ioRows.filter(r => r.Statistics_detail === statPrefix);
    const resRows = resPrefix ? ioRows.filter(r => r.Statistics_detail === resPrefix) : [];
    const countries = buildCountryList(prodRows, resRows, y1, y2);

    const worldP1 = ioRows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(statPrefix) && r.Statistics_detail.includes('rounded') && r.Year === y1);
    const worldP2 = ioRows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(statPrefix) && r.Statistics_detail.includes('rounded') && r.Year === y2);
    const worldR = resPrefix ? ioRows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(resPrefix) && r.Statistics_detail.includes('rounded')) : null;

    if (worldP1 || worldP2) {
      countries.push({
        country: 'World total (rounded)',
        production_y1: worldP1 ? worldP1.Value : '—',
        production_y2: worldP2 ? worldP2.Value : '—',
        ...(resRows.length > 0 ? { reserves: worldR ? worldR.Value : 'NA' } : {}),
      });
    }

    return {
      label,
      source: SOURCE,
      source_url: `${SOURCE_BASE_URL}-iron-ore.pdf`,
      production_unit: prodUnit,
      reserves_unit: resUnit,
      year1: y1, year2: y2 + 'e',
      has_two_years: true,
      has_reserves: resRows.length > 0,
      countries,
    };
  }

  const result = {
    type: 'multi_table',
    source: SOURCE,
    source_url: `${SOURCE_BASE_URL}-iron-ore.pdf`,
    production_unit: 'thousand metric tons / million metric tons',
    reserves_unit: 'million metric tons',
    sub_tables: {
      usable_ore: buildSubTable(
        'Mine production: Usable ore',
        'Reserves (million metric tons): Crude ore',
        'Usable Ore Production',
        'thousand metric tons, usable ore',
        'million metric tons, crude ore'
      ),
      iron_content: buildSubTable(
        'Mine production: Iron content',
        'Reserves (million metric tons): Iron content',
        'Iron Content Production',
        'thousand metric tons, iron content',
        'million metric tons, iron content'
      ),
    },
  };

  const totalCountries = (result.sub_tables.usable_ore.countries.length || 0) +
    (result.sub_tables.iron_content.countries.length || 0);
  console.log(`  iron_ore: ${totalCountries} country entries (2 sub-tables)`);
  return result;
}

function processAluminium(worldRows) {
  const bauxRows = worldRows.filter(r => r.Commodity === 'Bauxite');
  const alumRows = worldRows.filter(r => r.Commodity === 'Alumina');
  const smelterRows = worldRows.filter(r => r.Commodity === 'Aluminum');

  const years = [...new Set(bauxRows.map(r => r.Year))].sort();
  const y1 = years[0], y2 = years[1];

  function buildSub(rows, prodStat, resStat, label, prodUnit, resUnit) {
    const prodRows = rows.filter(r => r.Statistics_detail === prodStat);
    const resRows = resStat ? rows.filter(r => r.Statistics_detail === resStat) : [];
    const countries = buildCountryList(prodRows, resRows, y1, y2);

    // Look for rounded totals (format varies: ": rounded" or ", rounded")
    const worldP1 = rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(prodStat) && r.Statistics_detail.includes('rounded') && r.Year === y1);
    const worldP2 = rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(prodStat) && r.Statistics_detail.includes('rounded') && r.Year === y2);
    const worldR = resStat ? rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(resStat) && r.Statistics_detail.includes('rounded')) : null;

    if (worldP1 || worldP2) {
      countries.push({
        country: 'World total (rounded)',
        production_y1: worldP1 ? worldP1.Value : '—',
        production_y2: worldP2 ? worldP2.Value : '—',
        ...(resRows.length > 0 ? { reserves: worldR ? worldR.Value : 'NA' } : {}),
      });
    }

    return {
      label, source: SOURCE,
      source_url: `${SOURCE_BASE_URL}-bauxite-alumina.pdf`,
      production_unit: prodUnit, reserves_unit: resUnit || null,
      year1: y1, year2: y2 + 'e',
      has_two_years: true, has_reserves: resRows.length > 0,
      countries,
    };
  }

  const result = {
    type: 'multi_table',
    source: SOURCE,
    source_url: `${SOURCE_BASE_URL}-bauxite-alumina.pdf`,
    sub_tables: {
      bauxite: buildSub(bauxRows, 'Bauxite, mine production', 'Bauxite reserves', 
        'Bauxite Mine Production', 'thousand metric tons, dry weight', 'thousand metric tons'),
      alumina: buildSub(alumRows, 'Alumina, refinery production', null,
        'Alumina Refinery Production', 'thousand metric tons, calcined equivalent weight', null),
      smelter: buildSub(smelterRows, 'Smelter production', null,
        'Primary Smelter Production', 'thousand metric tons', null),
    },
  };

  const tc = Object.values(result.sub_tables).reduce((s, t) => s + (t.countries?.length || 0), 0);
  console.log(`  aluminium: ${tc} country entries (3 sub-tables)`);
  return result;
}

function processPGM(worldRows) {
  const ptRows = worldRows.filter(r => r.Commodity === 'Platinum');
  const pdRows = worldRows.filter(r => r.Commodity === 'Palladium');
  const pgmRows = worldRows.filter(r => r.Commodity === 'Platinum-Group Metals');

  const years = [...new Set(ptRows.map(r => r.Year))].sort();
  const y1 = years[0], y2 = years[1];

  function buildProdSub(rows, label, statName) {
    // statName: e.g. 'Mine production: Platinum' or 'Mine production: Palladium'
    const prodRows = rows.filter(r => r.Statistics_detail === statName);
    const countries = [];
    const countryMap = new Map();
    
    for (const r of prodRows) {
      const country = cleanText(r.Country);
      if (!countryMap.has(country)) countryMap.set(country, {});
      const val = formatValue(r.Value, r.Notes);
      if (r.Year === y1) countryMap.get(country).y1 = val;
      if (r.Year === y2) countryMap.get(country).y2 = val;
    }

    for (const [name, data] of countryMap) {
      countries.push({ country: name, production_y1: data.y1 || '—', production_y2: data.y2 || '—' });
    }

    const worldP1 = rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(statName) && r.Statistics_detail.includes('rounded') && r.Year === y1);
    const worldP2 = rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(statName) && r.Statistics_detail.includes('rounded') && r.Year === y2);
    if (worldP1 || worldP2) {
      countries.push({
        country: 'World total (rounded)',
        production_y1: worldP1 ? worldP1.Value : '—',
        production_y2: worldP2 ? worldP2.Value : '—',
      });
    }

    return {
      label, production_unit: 'kilograms',
      year1: y1, year2: y2 + 'e',
      has_reserves: false, countries,
    };
  }

  // PGM reserves
  const resRows = pgmRows.filter(r => r.Statistics_detail === 'PGM reserves');
  const resCountries = [];
  for (const r of resRows) {
    if (r.Statistics_detail.includes('rounded')) continue;
    resCountries.push({ country: cleanText(r.Country), reserves: formatValue(r.Value, r.Notes) });
  }
  const worldR = pgmRows.find(r => r.Statistics_detail === 'PGM reserves: rounded');
  if (worldR) resCountries.push({ country: 'World total (rounded)', reserves: worldR.Value });

  const result = {
    type: 'multi_table',
    source: SOURCE,
    source_url: `${SOURCE_BASE_URL}-platinum-group.pdf`,
    production_unit: 'kilograms, PGM content',
    reserves_unit: 'kilograms, PGM content',
    sub_tables: {
      platinum: buildProdSub(ptRows, 'Platinum Production', 'Mine production: Platinum'),
      palladium: buildProdSub(pdRows, 'Palladium Production', 'Mine production: Palladium'),
      reserves: {
        label: 'PGM Reserves (Combined)',
        reserves_unit: 'kilograms, PGM content',
        year1: null, year2: null,
        has_reserves: true, reserves_only: true,
        countries: resCountries,
      },
    },
  };

  const tc = Object.values(result.sub_tables).reduce((s, t) => s + (t.countries?.length || 0), 0);
  console.log(`  pgm: ${tc} country entries (3 sub-tables)`);
  return result;
}

function processTitanium(worldRows) {
  const tiRows = worldRows.filter(r => r.Commodity === 'Titanium Mineral Concentrates');
  const years = [...new Set(tiRows.map(r => r.Year))].sort();
  const y1 = years[0], y2 = years[1];

  function buildSub(statName, resStat, label) {
    const prodRows = tiRows.filter(r => r.Statistics_detail === statName);
    const resRows = resStat ? tiRows.filter(r => r.Statistics_detail === resStat) : [];
    const countries = buildCountryList(prodRows, resRows, y1, y2);

    // Titanium rounded names use lowercase mineral ("ilmenite" not "Ilmenite") — match case-insensitively
    const worldP1 = tiRows.find(r => r.Statistics_detail && r.Statistics_detail.toLowerCase().includes(statName.split(': ')[1].toLowerCase()) && r.Statistics_detail.includes('rounded') && !r.Statistics_detail.toLowerCase().includes(' and ') && r.Year === y1);
    const worldP2 = tiRows.find(r => r.Statistics_detail && r.Statistics_detail.toLowerCase().includes(statName.split(': ')[1].toLowerCase()) && r.Statistics_detail.includes('rounded') && !r.Statistics_detail.toLowerCase().includes(' and ') && r.Year === y2);
    const worldR = resStat ? tiRows.find(r => r.Statistics_detail && r.Statistics_detail.toLowerCase().includes(resStat.split(': ')[1].toLowerCase()) && r.Statistics_detail.includes('rounded') && !r.Statistics_detail.toLowerCase().includes(' and ')) : null;

    if (worldP1 || worldP2) {
      countries.push({
        country: 'World total (rounded)',
        production_y1: worldP1 ? worldP1.Value : '—',
        production_y2: worldP2 ? worldP2.Value : '—',
        ...(resRows.length > 0 ? { reserves: worldR ? worldR.Value : 'NA' } : {}),
      });
    }

    return {
      label, source: SOURCE,
      source_url: `${SOURCE_BASE_URL}-titanium.pdf`,
      production_unit: 'thousand metric tons, titanium dioxide (TiO2) content',
      reserves_unit: 'thousand metric tons, titanium dioxide (TiO2) content',
      year1: y1, year2: y2 + 'e',
      has_two_years: true, has_reserves: resRows.length > 0,
      countries,
    };
  }

  // Find the right stat names
  const stats = [...new Set(tiRows.map(r => r.Statistics_detail))];

  const result = {
    type: 'multi_table',
    source: SOURCE,
    source_url: `${SOURCE_BASE_URL}-titanium.pdf`,
    production_unit: 'thousand metric tons, TiO2 content',
    reserves_unit: 'thousand metric tons, TiO2 content',
    sub_tables: {
      ilmenite: buildSub('Mine production: Ilmenite', 'Reserves: Ilmenite', 'Ilmenite'),
      rutile: buildSub('Mine production: Rutile', 'Reserves: Rutile', 'Rutile'),
    },
  };

  const tc = Object.values(result.sub_tables).reduce((s, t) => s + (t.countries?.length || 0), 0);
  console.log(`  titanium: ${tc} country entries (2 sub-tables)`);
  return result;
}

function processMagnesium(worldRows) {
  const compRows = worldRows.filter(r => r.Commodity === 'Magnesium Compounds');
  const metalRows = worldRows.filter(r => r.Commodity === 'Magnesium Metal');

  const years = [...new Set(compRows.map(r => r.Year))].sort();
  const y1 = years[0], y2 = years[1];

  function buildSub(rows, prodStat, resStat, label, prodUnit, resUnit, sourceSlug) {
    const prodRows = rows.filter(r => r.Statistics_detail === prodStat);
    const resRows = resStat ? rows.filter(r => r.Statistics_detail === resStat) : [];
    const countries = buildCountryList(prodRows, resRows, y1, y2);

    const worldP1 = rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(prodStat) && r.Statistics_detail.includes('rounded') && r.Year === y1);
    const worldP2 = rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(prodStat) && r.Statistics_detail.includes('rounded') && r.Year === y2);
    const worldR = resStat ? rows.find(r => r.Statistics_detail && r.Statistics_detail.startsWith(resStat) && r.Statistics_detail.includes('rounded')) : null;

    if (worldP1 || worldP2) {
      countries.push({
        country: 'World total (rounded)',
        production_y1: worldP1 ? worldP1.Value : '—',
        production_y2: worldP2 ? worldP2.Value : '—',
        ...(resRows.length > 0 ? { reserves: worldR ? worldR.Value : 'NA' } : {}),
      });
    }

    return {
      label, source_url: null,
      production_unit: prodUnit, reserves_unit: resUnit,
      year1: y1, year2: y2 + 'e',
      has_two_years: true, has_reserves: resRows.length > 0,
      countries,
    };
  }

  const result = {
    type: 'multi_table',
    source_url: null,
    sub_tables: {
      compounds: buildSub(compRows, 'Mine production', 'Reserves',
        'Magnesium Compounds',
        'thousand metric tons, gross weight of magnesite (magnesium carbonate)',
        'thousand metric tons, gross weight of magnesite'),
      metal: buildSub(metalRows, 'Smelter production', null,
        'Magnesium Metal',
        'thousand metric tons of magnesium metal',
        'No separate reserves table; resources large to virtually unlimited'),
    },
  };

  const tc = Object.values(result.sub_tables).reduce((s, t) => s + (t.countries?.length || 0), 0);
  console.log(`  magnesium: ${tc} country entries (2 sub-tables)`);
  return result;
}

main();
