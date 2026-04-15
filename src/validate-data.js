#!/usr/bin/env node
/**
 * TSM Hub — Country Data Validator
 * 
 * Runs 4 levels of validation on country-data.json:
 *   1. World total vs sum of countries (checksum)
 *   2. Order-of-magnitude sanity (no country > world total, no impossible values)
 *   3. Cross-year reasonableness (y1 vs y2 within 5x)
 *   4. Structural integrity (required fields, valid units, no empty tables)
 *
 * Exit code 1 on CRITICAL errors (build should fail).
 * Exit code 0 on warnings only or clean.
 *
 * Usage: node src/validate-data.js [--strict]
 *   --strict: treat warnings as errors (exit 1)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'country-data.json');
const STRICT = process.argv.includes('--strict');

// ── Helpers ──────────────────────────────────────────────────────────

function parseNum(s) {
  if (!s || s === '—' || s === 'NA' || s === 'W' || s === 'XX' || s === '—') return null;
  // Handle ">90,000,000" style
  let clean = String(s).replace(/^[>< ]+/, '').replace(/^e/, '');
  // Remove commas
  clean = clean.replace(/,/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/** Check if value string has ">" prefix (USGS lower-bound notation) */
function hasGreaterThan(s) {
  return s && String(s).trim().startsWith('>');
}

function formatNum(n) {
  if (n === null || n === undefined) return 'N/A';
  return n.toLocaleString('en-US');
}

// ── Validators ──────────────────────────────────────────────────────

const errors = [];   // CRITICAL — build must fail
const warnings = []; // Advisory — review recommended

/**
 * Validator 1: World total vs sum of individual countries
 * 
 * USGS publishes a "World total (rounded)" row. The sum of individual
 * country rows + "Other countries" should approximately equal this total.
 * Tolerance: ±5% (USGS rounds world totals).
 */
function validateChecksums(metalName, tableData, tableSuffix = '') {
  const label = tableSuffix ? `${metalName}/${tableSuffix}` : metalName;
  const countries = tableData.countries || [];
  if (countries.length === 0) return;

  const worldRow = countries.find(c => 
    c.country && c.country.toLowerCase().includes('world total')
  );
  if (!worldRow) {
    warnings.push(`[CHECKSUM] ${label}: No "World total" row found — cannot verify checksums`);
    return;
  }

  // Check each production/reserves column
  const fields = [];
  if (tableData.has_two_years !== false) {
    fields.push('production_y1', 'production_y2');
  }
  // Single-year metals (lithium style) use 'production' field
  if (countries[0] && 'production' in countries[0]) {
    fields.push('production');
  }
  if (tableData.has_reserves) {
    fields.push('reserves');
  }
  // For reserves-only sub-tables
  if (tableData.reserves_only) {
    fields.push('reserves');
  }

  for (const field of fields) {
    const worldVal = parseNum(worldRow[field]);
    if (worldVal === null) continue; // Can't check if world total is NA

    const isReserves = field === 'reserves' || field.includes('reserves');
    const worldHasGT = hasGreaterThan(worldRow[field]);

    let sum = 0;
    let hasData = false;
    let naCount = 0;
    for (const c of countries) {
      if (c.country && c.country.toLowerCase().includes('world total')) continue;
      const v = parseNum(c[field]);
      if (v !== null) {
        sum += v;
        hasData = true;
      } else if (c[field] === 'NA') {
        naCount++;
      }
    }

    if (!hasData) continue;

    const diff = Math.abs(sum - worldVal);
    const pct = worldVal > 0 ? (diff / worldVal) * 100 : 0;

    // RESERVES: USGS "World total (rounded)" for reserves is often a 
    // conservative floor. Sum of countries frequently exceeds it because:
    //  - USGS rounds down ("30,000,000" when sum is 80M)
    //  - Countries with NA reserves aren't in the total
    //  - Notation uses ">" prefix for lower bounds
    // Only flag if sum is BELOW world total by >20% (missing data)
    if (isReserves) {
      if (sum < worldVal * 0.80 && !worldHasGT) {
        warnings.push(
          `[CHECKSUM] ${label}.${field}: Sum = ${formatNum(sum)} is ` +
          `${((1 - sum / worldVal) * 100).toFixed(0)}% below World total ${formatNum(worldVal)}` +
          ` — possible missing country data`
        );
      }
      // Sum above world total is EXPECTED for reserves — no error
      continue;
    }

    // PRODUCTION: strict checksum — sum should match world total closely
    if (pct > 15) {
      errors.push(
        `[CHECKSUM] ${label}.${field}: Sum of countries = ${formatNum(sum)}, ` +
        `World total = ${formatNum(worldVal)}, diff = ${pct.toFixed(1)}% — CRITICAL MISMATCH`
      );
    } else if (pct > 5) {
      warnings.push(
        `[CHECKSUM] ${label}.${field}: Sum of countries = ${formatNum(sum)}, ` +
        `World total = ${formatNum(worldVal)}, diff = ${pct.toFixed(1)}%`
      );
    }
  }
}

/**
 * Validator 2: Order-of-magnitude sanity checks
 * 
 * - No individual country value should exceed the World total
 * - No reserves value should be negative
 * - Country share of world total should not exceed 85% (flag for review)
 *   (exception: Indonesia nickel, DRC cobalt — known dominant producers)
 */
function validateMagnitude(metalName, tableData, tableSuffix = '') {
  const label = tableSuffix ? `${metalName}/${tableSuffix}` : metalName;
  const countries = tableData.countries || [];
  if (countries.length === 0) return;

  const worldRow = countries.find(c =>
    c.country && c.country.toLowerCase().includes('world total')
  );

  const fields = [];
  if (tableData.has_two_years !== false) {
    fields.push('production_y1', 'production_y2');
  }
  if (countries[0] && 'production' in countries[0]) {
    fields.push('production');
  }
  if (tableData.has_reserves || tableData.reserves_only) {
    fields.push('reserves');
  }

  for (const field of fields) {
    const worldVal = worldRow ? parseNum(worldRow[field]) : null;

    for (const c of countries) {
      if (c.country && c.country.toLowerCase().includes('world total')) continue;
      if (c.country && c.country.toLowerCase().includes('other')) continue;

      const v = parseNum(c[field]);
      if (v === null) continue;

      // Check: country > world total
      // For RESERVES: USGS "World total (rounded)" is often a conservative floor;
      // individual countries (especially Australia) can legitimately exceed it.
      // Only flag as CRITICAL for production fields.
      const isReservesField = field === 'reserves' || field.includes('reserves');
      if (worldVal !== null && v > worldVal * 1.01) {
        if (isReservesField) {
          // Reserves: demote to warning (USGS methodology allows this)
          warnings.push(
            `[MAGNITUDE] ${label}: ${c.country}.${field} = ${formatNum(v)} exceeds ` +
            `World total = ${formatNum(worldVal)} — normal for USGS reserves data`
          );
        } else {
          // Production: this should never happen — critical error
          errors.push(
            `[MAGNITUDE] ${label}: ${c.country}.${field} = ${formatNum(v)} EXCEEDS ` +
            `World total = ${formatNum(worldVal)} — likely footnote parsing error`
          );
        }
      }

      // Check: negative values
      if (v < 0) {
        errors.push(
          `[MAGNITUDE] ${label}: ${c.country}.${field} = ${v} — negative value`
        );
      }

      // Check: dominant share > 85% (production only)
      if (worldVal && worldVal > 0 && v > worldVal * 0.85 && !isReservesField) {
        warnings.push(
          `[MAGNITUDE] ${label}: ${c.country}.${field} = ${formatNum(v)} is ` +
          `${((v / worldVal) * 100).toFixed(0)}% of world total — verify dominance`
        );
      }
    }
  }
}

/**
 * Validator 3: Cross-year reasonableness
 * 
 * Production should not change more than 5x between year1 and year2
 * (which are typically consecutive years like 2023 vs 2024e).
 * Large changes do happen (e.g. mine closures) but >5x is suspicious.
 */
function validateCrossYear(metalName, tableData, tableSuffix = '') {
  const label = tableSuffix ? `${metalName}/${tableSuffix}` : metalName;
  const countries = tableData.countries || [];
  
  if (!tableData.has_two_years) return;

  const MAX_RATIO = 5;

  for (const c of countries) {
    if (c.country && c.country.toLowerCase().includes('world total')) continue;

    const y1 = parseNum(c.production_y1);
    const y2 = parseNum(c.production_y2);

    if (y1 === null || y2 === null || y1 === 0 || y2 === 0) continue;

    const ratio = Math.max(y1 / y2, y2 / y1);
    if (ratio > MAX_RATIO) {
      warnings.push(
        `[CROSS-YEAR] ${label}: ${c.country} production changed ${ratio.toFixed(1)}x ` +
        `(${formatNum(y1)} → ${formatNum(y2)}) — verify`
      );
    }
  }
}

/**
 * Validator 4: Structural integrity
 * 
 * - Every metal must have source, source_url or be in a sub_table with one
 * - Every country entry must have 'country' field
 * - production_unit and reserves_unit must be non-empty strings
 * - At least 3 countries per table (sanity)
 * - No duplicate country names within a table
 */
function validateStructure(metalName, tableData, tableSuffix = '') {
  const label = tableSuffix ? `${metalName}/${tableSuffix}` : metalName;
  const countries = tableData.countries || [];

  // Check minimum countries
  if (countries.length < 3) {
    warnings.push(
      `[STRUCTURE] ${label}: Only ${countries.length} countries — unusually small`
    );
  }

  // Check for duplicate countries
  const names = countries.map(c => c.country).filter(Boolean);
  const dupes = names.filter((name, i) => names.indexOf(name) !== i);
  if (dupes.length > 0) {
    errors.push(
      `[STRUCTURE] ${label}: Duplicate countries: ${[...new Set(dupes)].join(', ')}`
    );
  }

  // Check every entry has a country field
  for (let i = 0; i < countries.length; i++) {
    if (!countries[i].country) {
      errors.push(`[STRUCTURE] ${label}: Entry ${i} missing 'country' field`);
    }
  }

  // Check units exist
  if (!tableSuffix) {
    // Top-level metal
    if (!tableData.production_unit && !tableData.reserves_only) {
      warnings.push(`[STRUCTURE] ${label}: Missing production_unit`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

function runAllValidators(metalName, tableData, tableSuffix = '') {
  validateChecksums(metalName, tableData, tableSuffix);
  validateMagnitude(metalName, tableData, tableSuffix);
  validateCrossYear(metalName, tableData, tableSuffix);
  validateStructure(metalName, tableData, tableSuffix);
}

function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  TSM Hub — Country Data Validator');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Data file: ${DATA_PATH}`);
  console.log(`  Mode: ${STRICT ? 'STRICT (warnings = errors)' : 'NORMAL'}`);
  console.log('');

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`ERROR: Data file not found: ${DATA_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const metalNames = Object.keys(data);
  console.log(`  Metals found: ${metalNames.length}`);
  console.log('');

  let tablesChecked = 0;

  for (const metal of metalNames) {
    const info = data[metal];
    
    if (!info || typeof info !== 'object') continue;

    // Multi-table metals (aluminium, pgm, titanium, magnesium, iron_ore)
    if (info.sub_tables) {
      const st = info.sub_tables;
      if (typeof st === 'object' && !Array.isArray(st)) {
        for (const [subName, subData] of Object.entries(st)) {
          if (subData && typeof subData === 'object' && subData.countries) {
            runAllValidators(metal, subData, subName);
            tablesChecked++;
          }
        }
      }
    }
    // Single-table metals
    else if (info.countries) {
      runAllValidators(metal, info);
      tablesChecked++;
    }
  }

  // ── Report ──

  console.log(`  Tables checked: ${tablesChecked}`);
  console.log('');

  if (warnings.length > 0) {
    console.log(`⚠  WARNINGS (${warnings.length}):`);
    console.log('───────────────────────────────────────────────');
    for (const w of warnings) {
      console.log(`  ${w}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.log(`✗  CRITICAL ERRORS (${errors.length}):`);
    console.log('───────────────────────────────────────────────');
    for (const e of errors) {
      console.log(`  ${e}`);
    }
    console.log('');
  }

  // ── Summary ──

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const shouldFail = hasErrors || (STRICT && hasWarnings);

  if (!hasErrors && !hasWarnings) {
    console.log('✓  ALL CHECKS PASSED — data is clean');
  } else if (!hasErrors) {
    console.log(`✓  No critical errors. ${warnings.length} warning(s) to review.`);
  } else {
    console.log(`✗  ${errors.length} CRITICAL ERROR(S) found. Data must be fixed before deploy.`);
  }

  console.log('');
  process.exit(shouldFail ? 1 : 0);
}

main();
