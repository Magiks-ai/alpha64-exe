#!/usr/bin/env python3
"""Render ALPHA64 1500x500 X banner, stdlib-only."""
from __future__ import annotations

from pathlib import Path
import math
import random
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "alpha64-x-banner.png"
W, H = 1500, 500

FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
    "4": ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
}
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


def blend(dst, src):
    sr, sg, sb, sa = src
    if sa >= 255:
        return (sr, sg, sb, 255)
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


def put(pix, x, y, color):
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 4
        pix[i:i+4] = bytes(blend(tuple(pix[i:i+4]), color))


def rect(pix, x0, y0, x1, y1, color):
    x0 = max(0, min(W, int(x0))); x1 = max(0, min(W, int(x1)))
    y0 = max(0, min(H, int(y0))); y1 = max(0, min(H, int(y1)))
    if x1 <= x0 or y1 <= y0:
        return
    for y in range(y0, y1):
        row = y * W * 4
        for x in range(x0, x1):
            i = row + x * 4
            pix[i:i+4] = bytes(blend(tuple(pix[i:i+4]), color))


def line(pix, x0, y0, x1, y1, color, width=1):
    dx = abs(x1-x0); dy = -abs(y1-y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    x, y = x0, y0
    while True:
        rect(pix, x-width//2, y-width//2, x+width//2+1, y+width//2+1, color)
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x += sx
        if e2 <= dx:
            err += dx; y += sy


def circle(pix, cx, cy, r, color):
    r2 = r*r
    for y in range(max(0, cy-r), min(H, cy+r+1)):
        dy = y-cy
        row = y * W * 4
        for x in range(max(0, cx-r), min(W, cx+r+1)):
            if (x-cx)*(x-cx)+dy*dy <= r2:
                i = row + x*4
                pix[i:i+4] = bytes(blend(tuple(pix[i:i+4]), color))


def save_png(path, pix):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind+data) & 0xffffffff)
    raw = bytearray()
    for y in range(H):
        raw.append(0)
        raw.extend(pix[y*W*4:(y+1)*W*4])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def base_canvas():
    pix = bytearray(W * H * 4)
    rng = random.Random(64)
    for y in range(H):
        for x in range(W):
            # deep CRT-purple field with hot magenta sweep and cyan terminal glow
            nx = x / W
            ny = y / H
            d1 = math.hypot(nx - 0.58, ny - 0.50)
            d2 = math.hypot(nx - 0.08, ny - 0.16)
            r = int(14 + 90*(1-d1) + 88*max(0, 1-d2*1.4))
            g = int(5 + 20*(1-d1) + 66*max(0, 1-math.hypot(nx-0.72, ny-0.40)*1.6))
            b = int(31 + 120*(1-d1) + 70*max(0, 1-d2*1.6))
            if 0.18 < ny < 0.86:
                r += 14
                b += 10
            n = rng.randrange(0, 9)
            if y % 4 == 0:
                r = int(r * 0.78); g = int(g * 0.78); b = int(b * 0.82)
            i = (y*W+x)*4
            pix[i:i+4] = bytes((min(255,r+n), min(255,g+n//2), min(255,b+n), 255))
    return pix


def draw_background(pix):
    # Neon geometric OS panels
    rect(pix, 0, 0, W, 52, (9, 2, 24, 170))
    rect(pix, 0, 448, W, 500, (9, 2, 24, 160))
    rect(pix, 58, 88, 1398, 414, (9, 3, 28, 112))
    rect(pix, 72, 102, 1384, 400, (255, 27, 184, 26))
    rect(pix, 92, 122, 1364, 380, (0, 245, 255, 17))
    # radiating neon disks
    circle(pix, 1120, 250, 470, (255, 20, 184, 48))
    circle(pix, 1130, 250, 330, (0, 240, 255, 34))
    circle(pix, 1160, 252, 210, (156, 255, 210, 24))
    circle(pix, 270, 255, 300, (255, 84, 201, 40))
    # grid lines
    for x in range(-100, W+160, 92):
        line(pix, x, 448, x+210, 120, (0, 244, 255, 30), 2)
    for y in range(110, 452, 42):
        line(pix, 0, y, W, y, (255, 85, 210, 22), 1)
    # window chrome and corner blocks
    for x, y, w, h, c in [
        (90, 70, 118, 16, (255,95,189,118)), (222, 70, 50, 16, (125,220,255,110)),
        (1260, 70, 58, 16, (255,242,199,94)), (1330, 70, 58, 16, (255,95,189,118)),
        (70, 395, 88, 24, (125,220,255,84)), (1258, 392, 164, 26, (255,95,189,72)),
    ]:
        rect(pix, x, y, x+w, y+h, c)
    # pixel glints
    for x, y, s, c in [
        (112, 134, 32, (255,255,255,56)), (236, 338, 24, (156,255,210,70)),
        (1290, 136, 34, (255,242,199,56)), (1198, 336, 28, (125,220,255,72)),
        (1028, 92, 18, (255,255,255,60)), (448, 414, 20, (255,95,189,66)),
    ]:
        rect(pix, x, y, x+s, y+s, c)
    # tiny terminal copy
    small = ["PUBLIC SIGNAL FEED", "CSP ACTIVE", "DATA HASH VERIFIED", "LINK FIREWALL"]
    yy = 30
    for i, _ in enumerate(small):
        rect(pix, 102 + i*205, yy, 112 + i*205, yy+10, (156,255,210,105))
        rect(pix, 118 + i*205, yy+3, 258 + i*205, yy+6, (156,255,210,55))


def draw_word(pix, text, x0, y0, scale):
    cell = scale
    gap = int(scale * 0.55)
    width = sum(5*cell for _ in text) + (len(text)-1)*gap
    # glow/shadow passes
    for dx, dy, col in [(18, 18, (0, 0, 0, 128)), (-12, 8, (0, 244, 255, 92)), (10, -10, (255, 40, 190, 108))]:
        x = x0 + dx
        for ch in text:
            glyph = FONT[ch]
            for gy, row in enumerate(glyph):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        rect(pix, x + gx*cell, y0 + dy + gy*cell, x + (gx+1)*cell - 3, y0 + dy + (gy+1)*cell - 3, col)
            x += 5*cell + gap
    # main fill with inner highlights
    x = x0
    for ch in text:
        glyph = FONT[ch]
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "1":
                    px0 = x + gx*cell; py0 = y0 + gy*cell
                    rect(pix, px0, py0, px0 + cell - 4, py0 + cell - 4, (255, 226, 245, 255))
                    rect(pix, px0+5, py0+5, px0 + cell - 10, py0 + cell//2, (255, 84, 201, 245))
                    rect(pix, px0+6, py0 + cell//2, px0 + cell - 10, py0 + cell - 10, (125, 220, 255, 230))
                    rect(pix, px0, py0, px0 + cell - 4, py0 + 5, (255,255,255,180))
        x += 5*cell + gap
    return width


def draw_sprite(pix, x0, y0, scale):
    filled = [(x,y,ch) for y,row in enumerate(SPRITE) for x,ch in enumerate(row) if ch != "."]
    for x,y,ch in filled:
        rect(pix, x0+x*scale+10, y0+y*scale+12, x0+(x+1)*scale+10, y0+(y+1)*scale+12, (4,1,15,116))
    for x,y,ch in filled:
        rect(pix, x0+x*scale-scale//10, y0+y*scale-scale//10, x0+(x+1)*scale+scale//10, y0+(y+1)*scale+scale//10, (255, 95, 189, 36))
    for y,row in enumerate(SPRITE):
        for x,ch in enumerate(row):
            c = COLORS[ch]
            if c[3]:
                rect(pix, x0+x*scale, y0+y*scale, x0+(x+1)*scale-2, y0+(y+1)*scale-2, c)
    for x,y in [(3,2),(4,2),(2,3),(5,3)]:
        rect(pix, x0+x*scale+scale//5, y0+y*scale+scale//5, x0+x*scale+scale//5+scale//4, y0+y*scale+scale//5+scale//4, (255,255,255,172))


def main():
    pix = base_canvas()
    draw_background(pix)
    draw_sprite(pix, 104, 158, 27)
    draw_word(pix, "ALPHA64", 426, 158, 25)
    # Foreground security/terminal strips
    rect(pix, 426, 362, 1126, 370, (255, 95, 189, 160))
    rect(pix, 426, 380, 984, 386, (125, 220, 255, 150))
    rect(pix, 1010, 378, 1126, 386, (156, 255, 210, 150))
    # simple faux text bars under title
    for i, w in enumerate([138, 70, 196, 110, 250, 90]):
        x = 426 + i*124
        rect(pix, x, 412, x+w, 418, (156,255,210,82) if i%2 else (255,95,189,82))
    save_png(OUT, pix)
    print(OUT)


if __name__ == "__main__":
    main()
