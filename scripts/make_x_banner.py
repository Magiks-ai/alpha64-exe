#!/usr/bin/env python3
from pathlib import Path
import random, math, struct, zlib, subprocess, os

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'assets' / 'social'
OUT_DIR.mkdir(parents=True, exist_ok=True)
BG = OUT_DIR / 'alpha64-x-banner-bg.ppm'
OUT = OUT_DIR / 'alpha64-x-banner.png'
W, H = 1500, 500
random.seed(64)

pix = bytearray(W * H * 3)

def put(x, y, c, a=1.0):
    if x < 0 or x >= W or y < 0 or y >= H: return
    i = (y * W + x) * 3
    for k in range(3):
        pix[i+k] = max(0, min(255, int(pix[i+k] * (1-a) + c[k] * a)))

def add(x, y, c, a=1.0):
    if x < 0 or x >= W or y < 0 or y >= H: return
    i = (y * W + x) * 3
    for k in range(3):
        pix[i+k] = max(0, min(255, int(pix[i+k] + c[k] * a)))

def rect(x0,y0,x1,y1,c,a=1.0):
    x0=max(0,int(x0)); y0=max(0,int(y0)); x1=min(W,int(x1)); y1=min(H,int(y1))
    for y in range(y0,y1):
        off=(y*W+x0)*3
        for x in range(x0,x1):
            for k in range(3): pix[off+k]=max(0,min(255,int(pix[off+k]*(1-a)+c[k]*a)))
            off+=3

def line(x0,y0,x1,y1,c,a=1.0,th=1):
    dx=abs(x1-x0); dy=-abs(y1-y0); sx=1 if x0<x1 else -1; sy=1 if y0<y1 else -1; err=dx+dy
    x,y=int(x0),int(y0)
    while True:
        for yy in range(y-th//2,y+th//2+1):
            for xx in range(x-th//2,x+th//2+1): add(xx,yy,c,a)
        if x==int(x1) and y==int(y1): break
        e2=2*err
        if e2>=dy: err+=dy; x+=sx
        if e2<=dx: err+=dx; y+=sy

# Base dark ALPHA64 gradient with CRT vignette/noise
for y in range(H):
    for x in range(W):
        nx=x/W; ny=y/H
        cx=(nx-.52); cy=(ny-.5)
        v=max(0, 1.0 - (cx*cx*1.8 + cy*cy*4.2))
        scan = 0.78 if y % 4 == 0 else 1.0
        noise = random.randint(-5, 7)
        r = 5 + int(34*v + 32*ny + 18*math.sin(nx*3.1)) + noise
        g = 3 + int(13*v + 8*nx) + noise//2
        b = 13 + int(43*v + 28*(1-ny) + 22*math.sin((nx+ny)*2.4)) + noise
        i=(y*W+x)*3
        pix[i]=max(0,min(255,int(r*scan))); pix[i+1]=max(0,min(255,int(g*scan))); pix[i+2]=max(0,min(255,int(b*scan)))

# Neon perspective grid / terminal deck
for y in range(305, H, 22):
    a = 0.16 + (y-305)/(H-305)*0.14
    line(0,y,W,y,(80,255,250),a,1)
for x in range(-800, W+900, 90):
    line(W//2, 290, x, H, (255,70,220), .16, 1)
for x in range(0,W,50):
    line(x,0,x,H,(77,255,240),.035,1)
for y in range(0,H,50):
    line(0,y,W,y,(255,79,216),.035,1)

# Cyber window panels and rails
rect(46,42,1454,458,(8,10,22),.34)
for t in range(5):
    line(46-t,42-t,1454+t,42-t,(255,79,216),.18/(t+1),1)
    line(46-t,458+t,1454+t,458+t,(112,247,255),.18/(t+1),1)
    line(46-t,42,46-t,458,(112,247,255),.11/(t+1),1)
    line(1454+t,42,1454+t,458,(255,79,216),.11/(t+1),1)

# Side machinery/posters, abstract like website edges
for side in [0,1]:
    base = 72 if side==0 else 1284
    for n in range(7):
        x = base + random.randint(-24,70)
        y = random.randint(58,392)
        w = random.randint(24,82)
        h = random.randint(14,48)
        col = (255,79,216) if n%2 else (112,247,255)
        rect(x,y,x+w,y+h,(4,9,18),.72)
        line(x,y,x+w,y,col,.32,1); line(x,y+h,x+w,y+h,col,.2,1)
        if n%3==0: rect(x+6,y+6,x+w-6,y+10,col,.32)

# Glitch shards / rain
for _ in range(190):
    x=random.randrange(W); y=random.randrange(H); l=random.randint(6,70)
    col=random.choice([(112,247,255),(255,79,216),(168,255,106),(255,230,166)])
    if random.random()<.55: line(x,y,x+l,y,col,random.uniform(.06,.23),1)
    else: line(x,y,x+random.randint(-12,12),y+random.randint(8,55),col,random.uniform(.04,.14),1)

# Central glow behind wordmark
for r in range(250,0,-2):
    a=(r/250)**2 * .012
    for ang in range(0,360,5):
        x=int(W/2+math.cos(math.radians(ang))*r*2.4)
        y=int(H/2+math.sin(math.radians(ang))*r*.62)
        line(W//2,H//2,x,y,(255,79,216),a,1)
        line(W//2,H//2,x,y,(112,247,255),a*.65,1)

# Pixel sparks around safe area
for _ in range(420):
    x=random.randint(120,1380); y=random.randint(70,430)
    if 360<x<1140 and 155<y<340 and random.random()<.82: continue
    col=random.choice([(255,79,216),(112,247,255),(168,255,106),(255,238,190)])
    rect(x,y,x+random.choice([2,3,4,6]),y+random.choice([2,3,4]),col,random.uniform(.16,.56))

# Write PPM for ffmpeg drawtext
BG.write_bytes(f'P6\n{W} {H}\n255\n'.encode()+bytes(pix))
font='/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
# Text layers: block shadow, cyan/magenta chromatic offsets, bright fill.
# x expression uses text_w for accurate centering; y tuned for X banner safe area.
filters = [
    f"drawtext=fontfile={font}:text='ALPHA64':fontsize=188:x=(w-text_w)/2+10:y=151:fontcolor=black@0.55:borderw=12:bordercolor=black@0.32",
    f"drawtext=fontfile={font}:text='ALPHA64':fontsize=188:x=(w-text_w)/2-8:y=143:fontcolor=#ff4fd8@0.76:borderw=7:bordercolor=#ff4fd8@0.24",
    f"drawtext=fontfile={font}:text='ALPHA64':fontsize=188:x=(w-text_w)/2+8:y=157:fontcolor=#70f7ff@0.76:borderw=7:bordercolor=#70f7ff@0.22",
    f"drawtext=fontfile={font}:text='ALPHA64':fontsize=188:x=(w-text_w)/2:y=150:fontcolor=#fff2fb:borderw=3:bordercolor=#17031f@0.92",
    f"drawtext=fontfile={font}:text='ALPHA64':fontsize=188:x=(w-text_w)/2+3:y=150:fontcolor=#ffd1f4@0.18",
    f"drawtext=fontfile={font}:text='PUBLIC SIGNAL TERMINAL // MEMECOIN PRESSURE FEED':fontsize=24:x=(w-text_w)/2:y=360:fontcolor=#a8ff6a@0.86:box=1:boxcolor=#06030a@0.36:boxborderw=8",
    f"drawtext=fontfile={font}:text='NO PRIVATE ALPHA // PRESSURE ONLY':fontsize=18:x=84:y=74:fontcolor=#70f7ff@0.72",
    f"drawtext=fontfile={font}:text='令嬢端末 // A64':fontsize=20:x=w-text_w-88:y=404:fontcolor=#ff4fd8@0.72",
]
cmd=['ffmpeg','-y','-f','image2','-i',str(BG),'-vf',','.join(filters),'-frames:v','1',str(OUT)]
subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
print(OUT)
