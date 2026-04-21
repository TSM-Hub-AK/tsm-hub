#!/usr/bin/env python3
"""
generate-og-image.py
Reads live metrics from data/*.json and renders dist/og-image.png (1200x630).

Metrics sourced dynamically:
  - totalPrices    -> from data/prices.json, data/shfe.json, data/metals-api.json
  - totalProducers -> from data/producers.json
  - totalMetalsP   -> count of keys in producers.json
  - newsCount      -> data/news.json article_count

Run from repo root:  python3 src/generate-og-image.py
"""
import json, os, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)
OUT = DIST / "og-image.png"

# ---------- load metrics ----------
def load_json(p):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return None

prices     = load_json(DATA / "prices.json")      or {}
shfe       = load_json(DATA / "shfe.json")        or {}
metals_api = load_json(DATA / "metals-api.json")  or {}
producers  = load_json(DATA / "producers.json")   or {}
news       = load_json(DATA / "news.json")        or {}

# Price counts — mirror logic in generate-hub.js
def count_prices():
    lme = 0; prec = 0; shf = 0; ma = 0
    if prices:
        lme  = len((prices.get("lme")  or {}).get("metals", {}) if isinstance(prices.get("lme"), dict)  else prices.get("lme", []))
        prec = len((prices.get("lbma") or {}).get("metals", {}) if isinstance(prices.get("lbma"), dict) else prices.get("lbma", []))
        # fallback — use any top-level metals dicts
        if lme == 0 and "metals" in prices:
            lme = len(prices["metals"])
    if shfe:
        shf = len(shfe.get("metals", shfe if isinstance(shfe, list) else []))
    if metals_api:
        ma = len(metals_api.get("metals", metals_api if isinstance(metals_api, dict) else {}))
    return lme + prec + shf + ma

# Simpler & robust: if env PRICES_COUNT provided by workflow, use it
total_prices = int(os.environ.get("TOTAL_PRICES") or count_prices() or 0)
if total_prices == 0:
    # fallback — parse generated index.html if exists
    idx = DIST / "index.html"
    if idx.exists():
        import re
        m = re.search(r'og:title" content="TSM Hub — (\d+) Prices', idx.read_text())
        if m: total_prices = int(m.group(1))

total_producers = sum(len(v) for v in producers.values()) if isinstance(producers, dict) else 0
total_metals    = len(producers) if isinstance(producers, dict) else 0
news_count      = int(news.get("article_count", 0)) if isinstance(news, dict) else 0

# Allow env overrides (workflow can pass authoritative numbers)
total_prices    = int(os.environ.get("OG_TOTAL_PRICES",    total_prices))
total_producers = int(os.environ.get("OG_TOTAL_PRODUCERS", total_producers))
total_metals    = int(os.environ.get("OG_TOTAL_METALS",    total_metals))
news_count      = int(os.environ.get("OG_NEWS_COUNT",      news_count))

print(f"[og-image] prices={total_prices}, producers={total_producers}, "
      f"metals={total_metals}, news={news_count}")

# ---------- render ----------
W, H = 1200, 630
BG    = (11, 18, 21)
TEAL  = (20, 184, 166)
GOLD  = (212, 168, 67)
CREAM = (240, 235, 224)
WHITE = (255, 255, 255)
DIM   = (160, 168, 172)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if not os.path.exists(FONT_BOLD):
    # Fallback to any bundled DejaVu
    FONT_BOLD = next(iter([p for p in [
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/Library/Fonts/DejaVuSans-Bold.ttf",
    ] if os.path.exists(p)]), None)

img = Image.new("RGB", (W, H), BG)
d   = ImageDraw.Draw(img)

# Soft teal glow top-left (subtle)
for i in range(0, 300, 4):
    overlay = Image.new("RGB", (W, H), BG)
    od = ImageDraw.Draw(overlay)
    od.ellipse((-200 + i, -200 + i, 600 - i, 600 - i), fill=(20, 60, 55))
    img = Image.blend(img, overlay, 0.03)
    d = ImageDraw.Draw(img)

# --- Cubes logo 2x2 ---
cube_x, cube_y = 80, 90
tile = 64; gap = 7; radius = 11
def rsq(x, y, size, fill):
    d.rounded_rectangle((x, y, x+size, y+size), radius=radius, fill=fill)
rsq(cube_x,          cube_y,          tile, TEAL)
rsq(cube_x+tile+gap, cube_y,          tile, GOLD)
rsq(cube_x,          cube_y+tile+gap, tile, GOLD)
rsq(cube_x+tile+gap, cube_y+tile+gap, tile, TEAL)

# --- Title "TSM Hub" ---
text_x = cube_x + 2*tile + gap + 45
f_title = ImageFont.truetype(FONT_BOLD, 66)
d.text((text_x, cube_y - 10), "TSM", font=f_title, fill=WHITE)
tsm_bbox = d.textbbox((0, 0), "TSM", font=f_title)
tsm_w = tsm_bbox[2] - tsm_bbox[0]
d.text((text_x + tsm_w + 18, cube_y - 10), "Hub", font=f_title, fill=TEAL)

# --- Subtitle with 4 topics separated by slashes ---
f_sub = ImageFont.truetype(FONT_BOLD, 22)
subtitle = "METALS  /  MARKETS  /  NEWS  /  ENCYCLOPEDIA"
d.text((text_x, cube_y + 80), subtitle, font=f_sub, fill=CREAM)

# --- 4 metric columns ---
f_num = ImageFont.truetype(FONT_BOLD, 92)
f_lab = ImageFont.truetype(FONT_BOLD, 22)

metrics = [
    (str(total_prices),    "OFFICIAL PRICES", TEAL),
    (str(total_producers), "PRODUCERS",       GOLD),
    (str(total_metals),    "METALS",          TEAL),
    (str(news_count),      "MARKET NEWS",     GOLD),
]

metric_y = 290
widths = []
for num, lab, _ in metrics:
    nb = d.textbbox((0,0), num, font=f_num); lb = d.textbbox((0,0), lab, font=f_lab)
    widths.append(max(nb[2]-nb[0], lb[2]-lb[0]))

spacing = 80
total_w = sum(widths) + spacing * (len(metrics)-1)
cur_x = (W - total_w) // 2

for (num, lab, color), cw in zip(metrics, widths):
    nb = d.textbbox((0,0), num, font=f_num); nw = nb[2]-nb[0]
    lb = d.textbbox((0,0), lab, font=f_lab); lw = lb[2]-lb[0]
    d.text((cur_x + (cw-nw)//2, metric_y),       num, font=f_num, fill=color)
    d.text((cur_x + (cw-lw)//2, metric_y + 108), lab, font=f_lab, fill=CREAM)
    cur_x += cw + spacing

# --- Categories tagline ---
f_tag = ImageFont.truetype(FONT_BOLD, 22)
tagline = "LME · LBMA · SHFE  ·  Rare Earths  ·  Battery Metals  ·  PGMs  ·  Daily News"
tb = d.textbbox((0,0), tagline, font=f_tag)
d.text(((W - (tb[2]-tb[0]))//2, 510), tagline, font=f_tag, fill=DIM)

# --- URL ---
f_url = ImageFont.truetype(FONT_BOLD, 30)
url = "hub.truesourcemetals.com"
ub = d.textbbox((0,0), url, font=f_url)
d.text(((W - (ub[2]-ub[0]))//2, 560), url, font=f_url, fill=GOLD)

# Accent line under URL
d.rectangle((W//2 - 110, 600, W//2 + 110, 602), fill=TEAL)

img.save(OUT, "PNG", optimize=True)
print(f"[og-image] saved: {OUT} ({os.path.getsize(OUT)} bytes)")
