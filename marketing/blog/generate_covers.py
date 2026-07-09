#!/usr/bin/env python3
"""
Generator obrazków wyróżniających do wpisów bloga Verris.

Czyta frontmatter (title, cluster, slug) z każdego pliku *.md w tym katalogu
i zapisuje PNG 1200x630 do ./images/<slug>.png.

Styl (spójny z kreacjami reklamowymi):
  - tło Pine + brandowy pattern (mały glif V, niskie krycie, zanikanie)
  - logo (glif + wordmark) w lewym górnym rogu
  - kategoria (klaster) w ramce z mintowym obrysem
  - tytuł pod kategorią, łamany do maks. 3 linii
  - stopka: verris.pl

Uruchomienie:  python3 generate_covers.py
Wymaga: pillow  (pip install pillow)
"""
import os
import re
import glob
from PIL import Image, ImageDraw, ImageFont, ImageChops

W, H = 1200, 630
PINE = (12, 26, 20)
PAPER = (244, 244, 238)
MINT = (52, 229, 160)
STONE = (147, 162, 154)
GREEN = (15, 122, 82)

FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "images")

# Ścieżka glifu V z logo (układ współrzędnych ~26..74 x 30..78)
GLYPH = [(26, 30), (40, 30), (50, 52), (60, 30), (74, 30), (50, 78)]
NOTCH = [(44, 55), (56, 55), (50, 69)]


def draw_glyph(d, dx, dy, scale, color, alpha, bg=PINE, flip=False, stroke=None, stroke_width=2):
    """Glif V z logo: zielone wypełnienie + wcięcie (evenodd) z opcjonalnym mintowym obrysem."""
    def pt(x, y):
        gx = dx + (x - 26) * scale
        gy = dy + ((78 - y) if flip else (y - 30)) * scale
        return (gx, gy)

    d.polygon([pt(x, y) for x, y in GLYPH], fill=color + (alpha,))
    notch = [pt(x, y) for x, y in NOTCH]
    d.polygon(notch, fill=bg + (alpha,))
    if stroke:
        # obrys wewnętrznego trójkąta (w SVG: stroke #34E5A0, stroke-width 1.6)
        d.line(notch + [notch[0]], fill=stroke + (alpha,), width=stroke_width, joint="curve")


# Kanoniczny pattern marki — TEN SAM plik, który serwuje strona i landing.
PATTERN_SVG = os.path.join(HERE, "..", "..", "apps", "www", "public", "pattern.svg")
TILE_W, TILE_H = 1176, 480          # viewBox kafla (bezszwowy)
SVG_SCALE = 0.25                    # 1176*0.25 = 294 px → glif ~28 px (reguła marki)
PATTERN_OPACITY = 0.11              # zieleń: wyżej niż 5–6% dla bieli, ale tekst musi oddychać
STROKE = (52, 229, 160)             # mintowy obrys wcięcia


def _load_pattern_transforms():
    """Czyta z pattern.svg pozycje i rotacje wszystkich glifów kafla."""
    svg = open(PATTERN_SVG, encoding="utf-8").read()
    return [
        (float(tx), float(ty), int(rot), float(sc))
        for tx, ty, rot, sc in re.findall(
            r'transform="translate\(([-\d.]+) ([-\d.]+)\) rotate\((\d+)\) scale\(([\d.]+)\)', svg
        )
    ]


def _glyph_points(pts, tx, ty, rot, sc):
    """Odwzorowanie transformacji z SVG: translate ∘ rotate ∘ scale ∘ translate(-50,-54)."""
    out = []
    for x, y in pts:
        qx, qy = (x - 50) * sc, (y - 54) * sc
        if rot == 180:
            qx, qy = -qx, -qy
        out.append(((qx + tx) * SVG_SCALE, (qy + ty) * SVG_SCALE))
    return out


def draw_pattern(img):
    """Renderuje kanoniczny pattern (kafel 1176x480) i kafelkuje go na całym płótnie."""
    transforms = _load_pattern_transforms()
    tw, th = TILE_W * SVG_SCALE, TILE_H * SVG_SCALE   # 294 x 120

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)  # tryb nadpisywania — pozwala „wyciąć" wcięcie

    oy = -th
    while oy < H + th:
        ox = -tw
        while ox < W + tw:
            for tx, ty, rot, sc in transforms:
                outer = [(px + ox, py + oy) for px, py in _glyph_points(GLYPH, tx, ty, rot, sc)]
                notch = [(px + ox, py + oy) for px, py in _glyph_points(NOTCH, tx, ty, rot, sc)]
                # szybki odsiew glifów poza płótnem
                if max(p[0] for p in outer) < -8 or min(p[0] for p in outer) > W + 8:
                    continue
                if max(p[1] for p in outer) < -8 or min(p[1] for p in outer) > H + 8:
                    continue
                d.polygon(outer, fill=GREEN + (255,))
                d.polygon(notch, fill=(0, 0, 0, 0))            # wcięcie = dziura (evenodd)
                d.line(notch + [notch[0]], fill=STROKE + (255,), width=1)
            ox += tw
        oy += th

    # Krycie + płynne zanikanie (gradient per-piksel, jak w web)
    small = Image.new("L", (60, 32))
    sd = ImageDraw.Draw(small)
    for yy in range(32):
        for xx in range(60):
            fade = 1.0 - min(1.0, (xx / 59) * 0.40 + (yy / 31) * 0.62)
            sd.point((xx, yy), fill=int(255 * PATTERN_OPACITY * fade))
    mask = small.resize((W, H), Image.BILINEAR)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))

    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def wrap(draw, text, font, max_w, max_lines=3):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and words:
        # dopnij wielokropek, jeśli tekst się nie zmieścił
        joined = " ".join(lines)
        if len(joined) < len(text) - 2:
            while draw.textlength(lines[-1] + "…", font=font) > max_w and len(lines[-1]) > 4:
                lines[-1] = lines[-1][:-1]
            lines[-1] += "…"
    return lines


def frontmatter(path):
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---", txt, re.S)
    if not m:
        return None
    data = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def make_cover(title, cluster, slug):
    img = Image.new("RGB", (W, H), PINE)
    img = draw_pattern(img)
    d = ImageDraw.Draw(img, "RGBA")

    PAD = 80
    # logo: glif (z mintowym obrysem wcięcia) + wordmark
    draw_glyph(d, PAD, PAD - 6, 0.95, GREEN, 255, stroke=STROKE, stroke_width=2)
    f_wm = ImageFont.truetype(FB, 30)
    d.text((PAD + 62, PAD + 2), "verris", font=f_wm, fill=PAPER)

    # kategoria w ramce
    f_cat = ImageFont.truetype(FB, 21)
    cat = (cluster or "Blog").upper()
    cw = d.textlength(cat, font=f_cat)
    bx0, by0 = PAD, 232
    bx1, by1 = PAD + cw + 40, by0 + 46
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=10, outline=MINT, width=2,
                        fill=(52, 229, 160, 18))
    d.text((bx0 + 20, by0 + 11), cat, font=f_cat, fill=MINT)

    # tytuł pod kategorią
    f_title = ImageFont.truetype(FB, 60)
    lines = wrap(d, title, f_title, W - 2 * PAD - 60, max_lines=3)
    y = by1 + 36
    for ln in lines:
        d.text((PAD, y), ln, font=f_title, fill=PAPER)
        y += 74

    # stopka
    f_foot = ImageFont.truetype(FB, 26)
    d.text((PAD, H - 76), "verris.pl", font=f_foot, fill=PAPER)
    f_small = ImageFont.truetype(FR, 22)
    d.text((PAD + 132, H - 74), "·  hosting bez gwiazdek", font=f_small, fill=STONE)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{slug}.png")
    img.save(path, "PNG")
    return path


def main():
    made = 0
    for md in sorted(glob.glob(os.path.join(HERE, "*.md"))):
        if os.path.basename(md).lower() == "readme.md":
            continue
        fm = frontmatter(md)
        if not fm or "slug" not in fm or "title" not in fm:
            print("pomijam (brak frontmatter):", os.path.basename(md))
            continue
        p = make_cover(fm["title"], fm.get("cluster", "Blog"), fm["slug"])
        made += 1
        print("✓", os.path.relpath(p, HERE))
    print(f"\nWygenerowano {made} obrazków w {OUT}")


if __name__ == "__main__":
    main()
