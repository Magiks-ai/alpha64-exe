#!/usr/bin/env python3
"""Render the ALPHA64 doll-pet mascot as crisp PNG logo assets.
Stdlib-only so the deploy machine does not need Pillow.
"""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)
OUT_TRANSPARENT = ASSETS / "alpha64-doll-pet-logo.png"
OUT_AVATAR = ASSETS / "alpha64-doll-pet-x-avatar.png"

SPRITE = [
    "..mmffmm",
    ".mffffm.",
    "mmfyyfmm",
    "mfeffefm",
    "mffddffm",
    ".mfggfm.",
    "..mffm..",
    "..m..m..",
]
COLORS = {
    ".": (0, 0, 0, 0),
    "f": (43, 22, 88, 255),
    "e": (125, 220, 255, 255),
    "m": (255, 95, 189, 255),
    "y": (255, 242, 199, 255),
    "d": (5, 1, 11, 255),
    "g": (156, 255, 210, 255),
}
SCALE = 88
PAD = 160
W = H = 1024


def blend(dst, src):
    sr, sg, sb, sa = src
    if sa == 255:
        return src
    dr, dg, db, da = dst
    a = sa / 255.0
    out_a = sa + da * (1 - a)
    if out_a <= 0:
        return (0, 0, 0, 0)
    return (
        int((sr * sa + dr * da * (1 - a)) / out_a),
        int((sg * sa + dg * da * (1 - a)) / out_a),
        int((sb * sa + db * da * (1 - a)) / out_a),
        int(out_a),
    )


def make_canvas(bg=(0, 0, 0, 0)):
    return bytearray(bg * (W * H))


def rect(pixels, x0, y0, x1, y1, color):
    x0 = max(0, min(W, int(x0)))
    x1 = max(0, min(W, int(x1)))
    y0 = max(0, min(H, int(y0)))
    y1 = max(0, min(H, int(y1)))
    for y in range(y0, y1):
        row = y * W * 4
        for x in range(x0, x1):
            i = row + x * 4
            pixels[i:i+4] = bytes(blend(tuple(pixels[i:i+4]), color))


def circle(pixels, cx, cy, r, color):
    r2 = r * r
    for y in range(max(0, cy-r), min(H, cy+r+1)):
        dy = y - cy
        row = y * W * 4
        for x in range(max(0, cx-r), min(W, cx+r+1)):
            if (x-cx) * (x-cx) + dy * dy <= r2:
                i = row + x * 4
                pixels[i:i+4] = bytes(blend(tuple(pixels[i:i+4]), color))


def sprite_rect(x, y, inset=0):
    return (
        PAD + x * SCALE + inset,
        PAD + y * SCALE + inset,
        PAD + (x + 1) * SCALE - inset,
        PAD + (y + 1) * SCALE - inset,
    )


def draw_sprite(pixels):
    filled = {(x, y) for y, row in enumerate(SPRITE) for x, ch in enumerate(row) if ch != "."}
    # Crisp dark outline in neighboring cells.
    outline = set()
    for x, y in filled:
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)]:
            p = (x + dx, y + dy)
            if p not in filled:
                outline.add(p)
    for x, y in outline:
        rect(pixels, *sprite_rect(x, y, SCALE // 5), (13, 6, 31, 245))

    # Small pastel backlight, still pixel-shaped and transparent.
    for x, y in filled:
        rect(pixels, *sprite_rect(x, y, -SCALE // 10), (255, 183, 230, 34))

    # Main sprite blocks.
    for y, row in enumerate(SPRITE):
        for x, ch in enumerate(row):
            color = COLORS[ch]
            if color[3] == 0:
                continue
            rect(pixels, *sprite_rect(x, y), color)

    # Pixel highlights.
    for x, y in [(3, 2), (4, 2), (2, 3), (5, 3)]:
        inset = SCALE // 5
        rect(
            pixels,
            PAD + x * SCALE + inset,
            PAD + y * SCALE + inset,
            PAD + x * SCALE + inset + SCALE // 4,
            PAD + y * SCALE + inset + SCALE // 4,
            (255, 255, 255, 170),
        )


def save_png(path, pixels):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    raw = bytearray()
    for y in range(H):
        raw.append(0)
        raw.extend(pixels[y*W*4:(y+1)*W*4])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


# Transparent logo.
pix = make_canvas()
draw_sprite(pix)
save_png(OUT_TRANSPARENT, pix)

# X avatar version with the bright neon-pink backing the mascot originally had.
# Keep this as a full square field: X will apply the circular crop itself.
pix = make_canvas((255, 22, 184, 255))
# Loud hot-pink field, plus a soft cyan/mint aura so the crop still pops.
for r, color in [
    (560, (255, 82, 211, 82)),
    (420, (125, 220, 255, 48)),
    (335, (156, 255, 210, 28)),
]:
    circle(pix, 512, 512, r, color)
# Subtle chunky pixel glints in the background, kept behind the pet.
for x0, y0, s, color in [
    (94, 116, 62, (255, 190, 239, 54)),
    (820, 128, 46, (255, 238, 199, 42)),
    (94, 810, 52, (125, 220, 255, 36)),
    (842, 790, 72, (255, 190, 239, 46)),
]:
    rect(pix, x0, y0, x0 + s, y0 + s, color)
draw_sprite(pix)
save_png(OUT_AVATAR, pix)

print(OUT_TRANSPARENT)
print(OUT_AVATAR)
