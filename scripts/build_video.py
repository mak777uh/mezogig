"""Builds docs/demo.mp4: 8 deck slides + burned-in captions, ~100 s, no voice, no face."""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "slides_render")
OUT = os.path.join(ROOT, "docs", "video_frames")
os.makedirs(OUT, exist_ok=True)

W, H = 1920, 1080
BAND = 170

SCENES = [
    (1, 9, "MezoGig — milestone escrow for freelance work, settled in MUSD on Mezo Testnet."),
    (2, 13, "Freelancers deliver first and hope to be paid; clients who pay first carry the opposite risk."),
    (3, 13, "The client locks the whole budget in MUSD; each milestone is released on delivery — or refunded."),
    (4, 13, "MUSD is the settlement asset: deposit, payout, refund and dispute split settle exactly once."),
    (5, 15, "A judge can run the whole loop from the live demo: create, submit, approve, claim, dispute, refund."),
    (6, 13, "69 tests, 100 % statement coverage, six reentrancy attacks, Slither reviewed, Sourcify exact match."),
    (7, 13, "Freelancers in the Bitcoin economy get a stable payment rail; Mezo gets real MUSD volume."),
    (8, 12, "Next: hosted UX, mainnet deployment, staked arbiters. Code and deployment are public."),
]


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


F_CAP = font(r"C:\Windows\Fonts\segoeui.ttf", 40)
F_CAP_B = font(r"C:\Windows\Fonts\seguisb.ttf", 40)
F_SMALL = font(r"C:\Windows\Fonts\segoeui.ttf", 24)


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        probe = (cur + " " + w).strip()
        if draw.textlength(probe, font=fnt) <= max_w:
            cur = probe
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def make_frame(page, caption, idx):
    p = os.path.join(SRC, f"page-{page:04d}.png")
    img = Image.open(p).convert("RGB").resize((W, H), Image.LANCZOS)
    band = Image.new("RGB", (W, BAND), (4, 19, 12))
    img.paste(band, (0, H - BAND))
    d = ImageDraw.Draw(img)
    d.rectangle([0, H - BAND, W, H - BAND + 4], fill=(0, 214, 143))
    lines = wrap(d, caption, F_CAP, W - 160)
    y = H - BAND + 34
    for line in lines[:3]:
        d.text((80, y), line, font=F_CAP_B, fill=(232, 245, 238))
        y += 52
    d.text((80, H - 46), "MezoGig · live demo: mak777uh.github.io/mezogig", font=F_SMALL, fill=(143, 181, 161))
    d.text((W - 210, H - 46), f"{idx}/8", font=F_SMALL, fill=(143, 181, 161))
    out = os.path.join(OUT, f"frame-{idx:02d}.png")
    img.save(out, "PNG")
    return out


frames = []
for i, (page, dur, cap) in enumerate(SCENES, start=1):
    frames.append((make_frame(page, cap, i), dur))

lst = os.path.join(OUT, "list.txt")
with open(lst, "w", encoding="utf-8") as fh:
    for path, dur in frames:
        fh.write(f"file '{path.replace(os.sep, '/')}'\n")
        fh.write(f"duration {dur}\n")
    fh.write(f"file '{frames[-1][0].replace(os.sep, '/')}'\n")

mp4 = os.path.join(ROOT, "docs", "demo.mp4")
cmd = [
    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", lst,
    "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    mp4,
]
print("running:", " ".join(cmd))
subprocess.run(cmd, check=True)
print("saved", mp4, os.path.getsize(mp4), "bytes")
print("total duration:", sum(d for _, d in frames), "s")
