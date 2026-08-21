#!/usr/bin/env python3
# Verris — generator kreacji reklamowych (brand kit: branding/)
# Fonty: JetBrains Mono (brand, 1:1), Work Sans (zamiennik roboczy Schibsted/Hanken — DRAFT)
import cairo, math, os

# --- Paleta (03_colors) ---
PINE  = (0x0C/255, 0x1A/255, 0x14/255)
PAGE  = (0x09/255, 0x14/255, 0x10/255)
CARD  = (0x0E/255, 0x1F/255, 0x17/255)
GREEN = (0x0F/255, 0x7A/255, 0x52/255)
MID   = (0x1F/255, 0xA8/255, 0x71/255)
MINT  = (0x34/255, 0xE5/255, 0xA0/255)
PAPER = (0xF4/255, 0xF4/255, 0xEE/255)
STONE = (0x9A/255, 0xA3/255, 0x9C/255)
BODY  = (0xAF/255, 0xBD/255, 0xB6/255)

DISPLAY = "Work Sans"      # zamiennik Schibsted Grotesk 800 (DRAFT)
MONO    = "JetBrains Mono" # brand 1:1

OUT = "/sessions/great-zen-curie/mnt/ekohost/marketing/kreacje"

# --- Znak V (01_logo, path 100px) ---
def draw_mark(ctx, x, y, s, fill=GREEN, notch_stroke=MINT, alpha=1.0):
    """Znak Verris. s = wysokość znaku (path 26..74 x, 30..78 y w układzie 100)."""
    k = s / 48.0
    ctx.save()
    ctx.translate(x - 26*k, y - 30*k)
    ctx.scale(k, k)
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.move_to(26,30); ctx.line_to(40,30); ctx.line_to(50,52); ctx.line_to(60,30)
    ctx.line_to(74,30); ctx.line_to(50,78); ctx.close_path()
    ctx.move_to(44,55); ctx.line_to(56,55); ctx.line_to(50,69); ctx.close_path()
    ctx.set_source_rgba(*fill, alpha); ctx.fill()
    if notch_stroke:
        ctx.move_to(44,55); ctx.line_to(56,55); ctx.line_to(50,69); ctx.close_path()
        ctx.set_source_rgba(*notch_stroke, alpha); ctx.set_line_width(1.6); ctx.stroke()
    ctx.restore()

def draw_glyph_flat(ctx, cx, cy, s, rot, color, alpha):
    """Pojedynczy glif patternu (bez obrysu), wyśrodkowany w (cx,cy), rot=0/180."""
    k = s / 48.0
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(math.radians(rot))
    ctx.scale(k, k)
    ctx.translate(-50, -54)
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.move_to(26,30); ctx.line_to(40,30); ctx.line_to(50,52); ctx.line_to(60,30)
    ctx.line_to(74,30); ctx.line_to(50,78); ctx.close_path()
    ctx.move_to(44,55); ctx.line_to(56,55); ctx.line_to(50,69); ctx.close_path()
    ctx.set_source_rgba(*color, alpha); ctx.fill()
    ctx.restore()

def draw_pattern(ctx, W, H, glyph=44.0, base_alpha=0.055, color=PAPER,
                 direction="right", start=0.42):
    """Siatka ∧/∨ (05_patterns): kol. co glyph*0.744, rzędy co glyph*1.063,
    szachownica rotacji; krycie narasta gradientem w `direction` od `start`."""
    colw = glyph * 0.744
    rowh = glyph * 1.063
    ncols = int(W / colw) + 3
    nrows = int(H / rowh) + 3
    for i in range(ncols):
        for j in range(nrows):
            cx = i * colw
            cy = j * rowh
            if direction == "right":
                t = (cx / W - start) / (1 - start)
            elif direction == "bottom":
                t = (cy / H - start) / (1 - start)
            else:  # top
                t = ((H - cy) / H - start) / (1 - start)
            t = max(0.0, min(1.0, t))
            if t <= 0:
                continue
            rot = 180 if (i + j) % 2 == 0 else 0
            draw_glyph_flat(ctx, cx, cy, glyph, rot, color, base_alpha * t)

# --- Tekst ---
def set_font(ctx, family, size, bold=True):
    ctx.select_font_face(family, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size)

def text(ctx, s, x, y, family, size, color, bold=True, tracking=0.0, alpha=1.0):
    """Rysuje tekst od baseline (x,y). tracking w px między znakami. Zwraca szerokość."""
    set_font(ctx, family, size, bold)
    ctx.set_source_rgba(*color, alpha)
    if tracking == 0.0:
        ctx.move_to(x, y); ctx.show_text(s)
        return ctx.text_extents(s).x_advance
    cx = x
    for ch in s:
        ctx.move_to(cx, y); ctx.show_text(ch)
        cx += ctx.text_extents(ch).x_advance + tracking
    return cx - x - tracking

def text_w(ctx, s, family, size, bold=True, tracking=0.0):
    set_font(ctx, family, size, bold)
    if tracking == 0.0:
        return ctx.text_extents(s).x_advance
    return sum(ctx.text_extents(ch).x_advance + tracking for ch in s) - (tracking if s else 0)

def wordmark(ctx, x, y, mark_h, color_text=PAPER):
    """Lockup: znak + 'verris' (Work Sans Bold, tracking ujemny). y = środek znaku."""
    draw_mark(ctx, x, y - mark_h/2, mark_h)
    fs = mark_h * 1.02
    gap = mark_h * 0.38
    set_font(ctx, DISPLAY, fs, True)
    ext = ctx.text_extents("verris")
    ty = y + ext.height/2 - 1
    w = text(ctx, "verris", x + mark_h + gap, ty, DISPLAY, fs, color_text,
             True, tracking=-fs*0.045)
    return x + mark_h + gap + w

def rounded(ctx, x, y, w, h, r):
    ctx.new_sub_path()
    ctx.arc(x+w-r, y+r, r, -math.pi/2, 0)
    ctx.arc(x+w-r, y+h-r, r, 0, math.pi/2)
    ctx.arc(x+r, y+h-r, r, math.pi/2, math.pi)
    ctx.arc(x+r, y+r, r, math.pi, 3*math.pi/2)
    ctx.close_path()

def chip(ctx, x, y, label, fs=15):
    """Eyebrow chip (mono caps, mięta, obwódka). y = baseline. Zwraca szer."""
    set_font(ctx, MONO, fs, False)
    tw = text_w(ctx, label, MONO, fs, False, tracking=fs*0.12)
    padx, h = fs*1.0, fs*2.2
    top = y - fs*1.45
    rounded(ctx, x, top, tw + padx*2 + fs*0.9, h, h/2)
    ctx.set_source_rgba(*MINT, 0.30); ctx.set_line_width(1.2); ctx.stroke()
    ctx.arc(x + padx + fs*0.25, top + h/2, fs*0.20, 0, 2*math.pi)
    ctx.set_source_rgb(*MINT); ctx.fill()
    text(ctx, label, x + padx + fs*0.9, y, MONO, fs, MINT, False, tracking=fs*0.12)
    return tw + padx*2 + fs*0.9

def cta(ctx, x, y, label, fs=20):
    """Pastylka CTA (mięta, tekst Pine). y = środek. Zwraca (w,h)."""
    set_font(ctx, DISPLAY, fs, True)
    tw = text_w(ctx, label, DISPLAY, fs, True)
    padx, h = fs*1.3, fs*2.5
    rounded(ctx, x, y - h/2, tw + padx*2, h, fs*0.55)
    ctx.set_source_rgb(*MINT); ctx.fill()
    ext = ctx.text_extents(label)
    text(ctx, label, x + padx, y + ext.height/2 - 1, DISPLAY, fs, PINE, True)
    return tw + padx*2, h

def headline(ctx, lines, x, y, fs, lh=1.14):
    """Nagłówek wielolinijkowy; lines = [(tekst, kolor), ...]. y = baseline 1. linii."""
    for i, parts in enumerate(lines):
        cx = x
        for (frag, col) in parts:
            cx += text(ctx, frag, cx, y + i*fs*lh, DISPLAY, fs, col, True, tracking=-fs*0.02)
    return y + (len(lines)-1)*fs*lh

def canvas(W, H, bg=PINE):
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surf)
    ctx.set_source_rgb(*bg); ctx.paint()
    ctx.set_antialias(cairo.ANTIALIAS_BEST)
    return surf, ctx

def save(surf, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    surf.write_to_png(path)
    print(rel)

PRICE = "45 zł/mies lub 399 zł/rok brutto"
CLAIM1 = [[("Zmień hosting ", PAPER)], [("bez stresu", MINT), (".", PAPER)]]
SUB = "Przeniesiemy Twoją stronę za darmo — albo zrobisz to sam migratorem w panelu."

def sub_text(ctx, x, y, fs, maxw, color=BODY):
    """Prosty word-wrap dla substringu."""
    words = SUB.split(" ")
    line, yy = "", y
    set_font(ctx, DISPLAY, fs, False)
    for w in words:
        t = (line + " " + w).strip()
        if text_w(ctx, t, DISPLAY, fs, False) > maxw and line:
            text(ctx, line, x, yy, DISPLAY, fs, color, False)
            yy += fs*1.45; line = w
        else:
            line = t
    if line:
        text(ctx, line, x, yy, DISPLAY, fs, color, False)
    return yy

# =====================================================================
# 1) GOOGLE ADS — rozszerzenia graficzne
# =====================================================================
def gads_1200x628():
    W,H = 1200,628
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=52, base_alpha=0.06, direction="right", start=0.46)
    wordmark(ctx, 72, 92, 44)
    chip(ctx, 72, 208, "DARMOWA MIGRACJA", 17)
    headline(ctx, CLAIM1, 68, 330, 88)
    sub_text(ctx, 72, 480, 24, 620)
    text(ctx, PRICE, 72, 560, MONO, 22, MINT, False)
    save(surf, "gads/verris-gads-1200x628.png")

def gads_1200x1200():
    W,H = 1200,1200
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=56, base_alpha=0.06, direction="bottom", start=0.52)
    wordmark(ctx, 84, 110, 48)
    chip(ctx, 84, 320, "DARMOWA MIGRACJA", 20)
    headline(ctx, CLAIM1, 80, 480, 108)
    sub_text(ctx, 84, 680, 30, 900)
    text(ctx, PRICE, 84, 830, MONO, 28, MINT, False)
    save(surf, "gads/verris-gads-1200x1200.png")

def gads_logo_1200():
    W,H = 1200,1200
    surf,ctx = canvas(W,H,GREEN)
    draw_mark(ctx, W/2 - 260, H/2 - 300, 600, fill=PAPER, notch_stroke=MINT)
    save(surf, "gads/verris-logo-1200x1200.png")

def gads_logo_4x1():
    W,H = 1200,300
    surf,ctx = canvas(W,H)
    end = wordmark(ctx, 0, 0, 10)  # pomiar niewidoczny poza płótnem
    surf,ctx = canvas(W,H)
    mark_h = 130
    # wyśrodkowanie lockupu
    fs = mark_h*1.02
    set_font(ctx, DISPLAY, fs, True)
    tw = text_w(ctx, "verris", DISPLAY, fs, True, tracking=-fs*0.045)
    total = mark_h + mark_h*0.38 + tw
    wordmark(ctx, (W-total)/2, H/2, mark_h)
    save(surf, "gads/verris-logo-1200x300.png")

# =====================================================================
# 2) META — 1080×1080, 1080×1350, 1080×1920
# =====================================================================
def meta_sq():
    W,H = 1080,1080
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=50, base_alpha=0.06, direction="top", start=0.55)
    wordmark(ctx, 76, 104, 44)
    chip(ctx, 76, 300, "DARMOWA MIGRACJA", 19)
    headline(ctx, CLAIM1, 72, 452, 100)
    sub_text(ctx, 76, 640, 28, 820)
    text(ctx, PRICE, 76, 800, MONO, 26, MINT, False)
    cta(ctx, 76, 930, "Zacznij migrację", 30)
    save(surf, "meta/verris-meta-1080x1080.png")

def meta_45():
    W,H = 1080,1350
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=50, base_alpha=0.06, direction="top", start=0.55)
    wordmark(ctx, 76, 116, 46)
    chip(ctx, 76, 380, "DARMOWA MIGRACJA", 19)
    headline(ctx, CLAIM1, 72, 545, 104)
    sub_text(ctx, 76, 745, 29, 830)
    text(ctx, PRICE, 76, 920, MONO, 27, MINT, False)
    cta(ctx, 76, 1120, "Zacznij migrację", 31)
    save(surf, "meta/verris-meta-1080x1350.png")

def meta_story():
    W,H = 1080,1920
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=54, base_alpha=0.06, direction="top", start=0.55)
    wordmark(ctx, 84, 170, 52)
    chip(ctx, 84, 720, "DARMOWA MIGRACJA", 21)
    headline(ctx, CLAIM1, 80, 905, 116)
    sub_text(ctx, 84, 1120, 32, 860)
    text(ctx, PRICE, 84, 1330, MONO, 30, MINT, False)
    cta(ctx, 84, 1560, "Zacznij migrację", 36)
    save(surf, "meta/verris-meta-1080x1920.png")

# =====================================================================
# 3) DISPLAY — 300×250, 336×280, 728×90, 160×600, 320×100
# =====================================================================
def disp_rect(W, H, name):
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=30, base_alpha=0.05, direction="top", start=0.6)
    wordmark(ctx, 22, 34, 20)
    headline(ctx, CLAIM1, 20, 106, 33)
    text(ctx, "Darmowa migracja", 22, 168, DISPLAY, 16.5, BODY, False)
    text(ctx, "45 zł/mies · 399 zł/rok brutto", 22, 194, MONO, 12.5, MINT, False)
    cta(ctx, 22, H-32, "Zacznij migrację", 14)
    save(surf, f"display/verris-display-{name}.png")

def disp_728x90():
    W,H = 728,90
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=26, base_alpha=0.05, direction="right", start=0.75)
    wordmark(ctx, 24, H/2, 26)
    x = 158
    headline(ctx, [[("Zmień hosting ", PAPER), ("bez stresu", MINT), (".", PAPER)]], x, 40, 21)
    text(ctx, "Darmowa migracja · 45 zł/mies lub 399 zł/rok brutto", x, 68, MONO, 12, BODY, False)
    set_font(ctx, DISPLAY, 14, True)
    tw = text_w(ctx, "Zacznij migrację", DISPLAY, 14, True)
    cta(ctx, W - tw - 14*2.6 - 20, H/2, "Zacznij migrację", 14)
    save(surf, "display/verris-display-728x90.png")

def disp_320x100():
    W,H = 320,100
    surf,ctx = canvas(W,H)
    draw_mark(ctx, 16, 20, 26)
    headline(ctx, [[("Zmień hosting", PAPER)], [("bez stresu", MINT), (".", PAPER)]], 56, 38, 21, lh=1.16)
    text(ctx, "Darmowa migracja · od 33 zł/mies brutto", 56, 86, MONO, 9.5, BODY, False)
    set_font(ctx, DISPLAY, 11, True)
    tw = text_w(ctx, "Sprawdź", DISPLAY, 11, True)
    cta(ctx, W - tw - 11*2.6 - 10, 30, "Sprawdź", 11)
    save(surf, "display/verris-display-320x100.png")

def disp_160x600():
    W,H = 160,600
    surf,ctx = canvas(W,H)
    draw_pattern(ctx, W, H, glyph=24, base_alpha=0.05, direction="bottom", start=0.62)
    mark_h = 40
    draw_mark(ctx, W/2 - mark_h*0.5, 36, mark_h)
    set_font(ctx, DISPLAY, 24, True)
    for i,(t,c) in enumerate([("Zmień",PAPER),("hosting",PAPER),("bez",MINT),("stresu.",MINT)]):
        tw = text_w(ctx, t, DISPLAY, 24, True)
        text(ctx, t, (W-tw)/2, 150 + i*31, DISPLAY, 24, c, True)
    set_font(ctx, DISPLAY, 14, False)
    for i,t in enumerate(["Darmowa","migracja"]):
        tw = text_w(ctx, t, DISPLAY, 14, False)
        text(ctx, t, (W-tw)/2, 310 + i*21, DISPLAY, 14, BODY, False)
    set_font(ctx, MONO, 12, False)
    for i,t in enumerate(["45 zł/mies","399 zł/rok","brutto"]):
        tw = text_w(ctx, t, MONO, 12, False)
        text(ctx, t, (W-tw)/2, 380 + i*19, MONO, 12, MINT, False)
    set_font(ctx, DISPLAY, 13, True)
    tw = text_w(ctx, "Sprawdź", DISPLAY, 13, True)
    cta(ctx, (W - tw - 13*2.6)/2, 520, "Sprawdź", 13)
    save(surf, "display/verris-display-160x600.png")

if __name__ == "__main__":
    gads_1200x628(); gads_1200x1200(); gads_logo_1200(); gads_logo_4x1()
    meta_sq(); meta_45(); meta_story()
    disp_rect(300,250,"300x250"); disp_rect(336,280,"336x280")
    disp_728x90(); disp_320x100(); disp_160x600()
    print("DONE")
