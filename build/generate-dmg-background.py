#!/usr/bin/env python3
"""Generate the macOS DMG window background (build/dmg-background.png + @2x).

Derived from the startup splash poster (src/main/splash-image.ts) so the
installer matches the splash: the poster blurred and darkened behind the KCC
logo lifted from its monitor, with a mint arrow between the two icon slots.
Icon slot positions must match build/dmg-settings.py.

Requires Pillow (pip install pillow). Run from anywhere:
    python3 build/generate-dmg-background.py
"""
import base64
import io
import os
import re

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

BUILD = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BUILD)

with open(os.path.join(ROOT, "src", "main", "splash-image.ts")) as f:
    b64 = re.search(r"base64,([A-Za-z0-9+/=]+)", f.read()).group(1)
W, H = 1320, 800  # 2x of a 660x400 window
src = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")  # 1520x802

# Background: poster cropped to window aspect, heavily blurred + darkened.
cw = round(src.height * W / H)
x0 = (src.width - cw) // 2
bg = src.crop((x0, 0, x0 + cw, src.height)).resize((W, H), Image.LANCZOS)
bg = bg.filter(ImageFilter.GaussianBlur(22))
bg = ImageEnhance.Brightness(bg).enhance(0.42)
bg = ImageEnhance.Color(bg).enhance(0.85)

# Vignette.
vig = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(vig)
d.ellipse((-W*0.25, -H*0.35, W*1.25, H*1.35), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(160))
bg = Image.composite(bg, Image.new("RGB", (W, H), (6, 8, 12)), vig)

# KCC logo lifted from the poster with a feathered oval mask.
lx0, ly0, lx1, ly1 = 610, 255, 905, 450
logo = src.crop((lx0, ly0, lx1, ly1))
logo = ImageEnhance.Contrast(logo).enhance(1.15)
lw, lh = logo.size
scale = 1.3
logo = logo.resize((int(lw*scale), int(lh*scale)), Image.LANCZOS)
lw, lh = logo.size
m = Image.new("L", (lw, lh), 0)
ImageDraw.Draw(m).ellipse((lw*0.10, lh*0.10, lw*0.90, lh*0.90), fill=255)
m = m.filter(ImageFilter.GaussianBlur(28))
# Key the logo off the TV static: keep bright (white chrome) or strongly mint pixels.
r, g, b = logo.split()
lum = logo.convert("L").point(lambda v: 0 if v < 120 else (255 if v > 190 else int((v-120)*255/70)))
mintk = ImageChops.subtract(g, r).point(lambda v: 0 if v < 60 else (255 if v > 120 else int((v-60)*255/60)))
key = ImageChops.lighter(lum, mintk).filter(ImageFilter.GaussianBlur(1.2))
m = ImageChops.multiply(m, key)
# Soft mint glow behind the logo.
glow = Image.new("RGB", (W, H), (0, 0, 0))
gm = Image.new("L", (W, H), 0)
cx, cy = W//2, 150
ImageDraw.Draw(gm).ellipse((cx-300, cy-120, cx+300, cy+120), fill=90)
gm = gm.filter(ImageFilter.GaussianBlur(70))
bg = Image.composite(Image.new("RGB", (W, H), (46, 229, 157)), bg, gm)
bg.paste(logo, (cx - lw//2, cy - lh//2), m)

# Arrow between the two icon slots (icons at 1x x=170/490, y=235).
ay = 235*2
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(ov)
ax0, ax1 = 548, 772
def mint(t):  # gradient #0fa96c -> #2ee59d
    a, b = (15, 169, 108), (46, 229, 157)
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))
for x in range(ax0, ax1 - 40):
    t = (x - ax0) / (ax1 - ax0)
    od.line((x, ay-7, x, ay+7), fill=mint(t) + (int(255*min(1, t*2.2)),))
od.polygon([(ax1-60, ay-34), (ax1, ay), (ax1-60, ay+34)], fill=mint(1)+(255,))
glowA = ov.filter(ImageFilter.GaussianBlur(14))
out = bg.convert("RGBA")

# Light cards behind each icon + label. With a background picture Finder always
# draws icon labels in black (it treats the window as light mode regardless of
# the system appearance), so the labels need a light surface to stay readable.
cards = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(cards)
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
for ix in (170 * 2, 490 * 2):
    box = (ix - 172, ay - 156, ix + 172, ay + 196)
    sd.rounded_rectangle((box[0], box[1] + 10, box[2], box[3] + 10), 44, fill=(0, 0, 0, 150))
    cd.rounded_rectangle(box, 44, fill=(238, 246, 242, 236), outline=(46, 229, 157, 200), width=3)
out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(22)))
out = Image.alpha_composite(out, cards)
out = Image.alpha_composite(out, glowA)
out = Image.alpha_composite(out, ov)

# Caption.
try:
    f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 30)
except Exception:
    f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
cap = "Drag to Applications to install"
td = ImageDraw.Draw(out)
tw = td.textlength(cap, font=f)
td.text(((W - tw)/2, H - 74), cap, font=f, fill=(255, 255, 255, 150))

out = out.convert("RGB")
out.save(os.path.join(BUILD, "dmg-background@2x.png"))
out.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(BUILD, "dmg-background.png"))

