#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/site/assets"
RAW_DIR="$ROOT/demo/raw"
FRAME_DIR="$RAW_DIR/frames"
AUDIO_AIFF="$RAW_DIR/voiceover.aiff"
AUDIO_WAV="$RAW_DIR/voiceover.wav"
DEMO_LOG="$RAW_DIR/demo-run.log"
MP4="$OUT_DIR/helix-demo.mp4"
NARRATION="$RAW_DIR/narration.txt"

mkdir -p "$OUT_DIR" "$FRAME_DIR"

echo "==> Running live Helix demo"
cd "$ROOT"
rm -rf "$ROOT/examples/travel-agent/.helix"
npm run demo > "$DEMO_LOG" 2>&1

cat > "$NARRATION" <<'EOF'
Welcome to Helix, the filesystem-first framework for durable AI agents from LetsLego.

With Helix, your agent is a directory. Instructions live in Markdown. Tools are typed TypeScript modules. Skills and policies sit beside them as plain files.

Let’s run the travel example. A user asks Helix to plan a weekend trip to Paris. The runtime loads the agent, chooses a model, and calls tools for flights and weather.

Every step is checkpointed on disk under the Helix folder. You can inspect token usage, estimated cost, memory writes, and the full event timeline.

If a tool can spend money or change state, Helix can park the session and wait for human approval. Operators stay in control.

To start your own agent, run helix init, edit the files, and open the Helix console. Build agents you can inspect, resume, and trust.
EOF

echo "==> Synthesizing voiceover"
say -v Samantha -r 175 -f "$NARRATION" -o "$AUDIO_AIFF"
afconvert -f WAVE -d LEI16 "$AUDIO_AIFF" "$AUDIO_WAV"
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$AUDIO_WAV")
# ceil duration
DURATION=$(python3 -c "import math; print(int(math.ceil(float('$DURATION'))))")
echo "Voiceover duration: ${DURATION}s"

echo "==> Rendering PNG slides"
export FRAME_DIR DEMO_LOG DURATION
python3 <<'PY'
import math
import os
import textwrap
from pathlib import Path

frame_dir = Path(os.environ["FRAME_DIR"])
demo_log = Path(os.environ["DEMO_LOG"])
duration = int(os.environ["DURATION"])
frame_dir.mkdir(parents=True, exist_ok=True)

# Pure-Python PNG writer (no deps) for solid branded slides + text via simple bitmap font approximation:
# We'll emit PPM then shell out? Better: write SVG and use macOS `qlmanage` or sips.
# Instead create PPM frames with a tiny bitmap renderer for ASCII titles.

WIDTH, HEIGHT = 1600, 900

def save_ppm(path: Path, pixels: list[list[tuple[int,int,int]]]):
    with path.open("wb") as f:
        f.write(f"P6\n{WIDTH} {HEIGHT}\n255\n".encode())
        for row in pixels:
            f.write(bytes(c for px in row for c in px))

def fill(bg):
    return [[bg for _ in range(WIDTH)] for _ in range(HEIGHT)]

def rect(px, x, y, w, h, color):
    for yy in range(max(0,y), min(HEIGHT, y+h)):
        row = px[yy]
        for xx in range(max(0,x), min(WIDTH, x+w)):
            row[xx] = color

# 5x7 font for labels
FONT = {
    " ": [],
    "A": ["01110","10001","10001","11111","10001","10001","10001"],
    "B": ["11110","10001","10001","11110","10001","10001","11110"],
    "C": ["01110","10001","10000","10000","10000","10001","01110"],
    "D": ["11110","10001","10001","10001","10001","10001","11110"],
    "E": ["11111","10000","10000","11110","10000","10000","11111"],
    "F": ["11111","10000","10000","11110","10000","10000","10000"],
    "G": ["01110","10001","10000","10111","10001","10001","01110"],
    "H": ["10001","10001","10001","11111","10001","10001","10001"],
    "I": ["11111","00100","00100","00100","00100","00100","11111"],
    "J": ["00111","00010","00010","00010","00010","10010","01100"],
    "K": ["10001","10010","10100","11000","10100","10010","10001"],
    "L": ["10000","10000","10000","10000","10000","10000","11111"],
    "M": ["10001","11011","10101","10101","10001","10001","10001"],
    "N": ["10001","11001","10101","10011","10001","10001","10001"],
    "O": ["01110","10001","10001","10001","10001","10001","01110"],
    "P": ["11110","10001","10001","11110","10000","10000","10000"],
    "Q": ["01110","10001","10001","10001","10101","10010","01101"],
    "R": ["11110","10001","10001","11110","10100","10010","10001"],
    "S": ["01111","10000","10000","01110","00001","00001","11110"],
    "T": ["11111","00100","00100","00100","00100","00100","00100"],
    "U": ["10001","10001","10001","10001","10001","10001","01110"],
    "V": ["10001","10001","10001","10001","10001","01010","00100"],
    "W": ["10001","10001","10001","10101","10101","11011","10001"],
    "X": ["10001","10001","01010","00100","01010","10001","10001"],
    "Y": ["10001","10001","01010","00100","00100","00100","00100"],
    "Z": ["11111","00001","00010","00100","01000","10000","11111"],
    "0": ["01110","10001","10011","10101","11001","10001","01110"],
    "1": ["00100","01100","00100","00100","00100","00100","01110"],
    "2": ["01110","10001","00001","00010","00100","01000","11111"],
    "3": ["11110","00001","00001","01110","00001","00001","11110"],
    "4": ["00010","00110","01010","10010","11111","00010","00010"],
    "5": ["11111","10000","11110","00001","00001","10001","01110"],
    "6": ["01110","10000","11110","10001","10001","10001","01110"],
    "7": ["11111","00001","00010","00100","01000","01000","01000"],
    "8": ["01110","10001","10001","01110","10001","10001","01110"],
    "9": ["01110","10001","10001","01111","00001","00001","01110"],
    "-": ["00000","00000","00000","11111","00000","00000","00000"],
    ".": ["00000","00000","00000","00000","00000","01100","01100"],
    "/": ["00001","00010","00100","01000","10000","00000","00000"],
    ":": ["00000","01100","01100","00000","01100","01100","00000"],
    ",": ["00000","00000","00000","00000","01100","00100","01000"],
    "'": ["00100","00100","01000","00000","00000","00000","00000"],
    "+": ["00000","00100","00100","11111","00100","00100","00000"],
    "=": ["00000","00000","11111","00000","11111","00000","00000"],
    "_": ["00000","00000","00000","00000","00000","00000","11111"],
    "(": ["00100","01000","10000","10000","10000","01000","00100"],
    ")": ["00100","00010","00001","00001","00001","00010","00100"],
}

def draw_text(px, text, x, y, scale, color):
    cx = x
    for ch in text.upper():
        glyph = FONT.get(ch) or FONT.get(" ")
        if not glyph:
            cx += 4 * scale
            continue
        for row, bits in enumerate(glyph):
            for col, bit in enumerate(bits):
                if bit == "1":
                    rect(px, cx + col*scale, y + row*scale, scale, scale, color)
        cx += 6 * scale

def slide(path: Path, title: str, subtitle: str):
    px = fill((13, 18, 16))
    # accent orbs
    rect(px, 1100, 80, 260, 260, (30, 48, 38))
    rect(px, 1220, 180, 180, 180, (28, 42, 56))
    draw_text(px, "LETSLEGO", 110, 120, 4, (214, 255, 75))
    draw_text(px, title, 110, 300, 10, (238, 245, 239))
    # wrap subtitle
    y = 470
    for line in textwrap.wrap(subtitle, 42):
        draw_text(px, line, 110, y, 4, (159, 179, 163))
        y += 40
    rect(px, 110, 760, 280, 10, (214, 255, 75))
    save_ppm(path, px)

scenes = [
    ("scene-01.ppm", "HELIX", "Filesystem-first durable agents"),
    ("scene-02.ppm", "AUTHOR AS FILES", "instructions tools skills policies"),
    ("scene-03.ppm", "LIVE DEMO", "Plan a weekend trip to Paris"),
    ("scene-04.ppm", "TOOLS + CHECKPOINTS", "flights weather events on disk"),
    ("scene-05.ppm", "OPERATE", "Approvals cost tracking replay"),
    ("scene-06.ppm", "GET STARTED", "npx helix init my-agent"),
]

for name, title, subtitle in scenes:
    slide(frame_dir / name, title, subtitle)

# Terminal capture slide from demo log
px = fill((13, 18, 16))
rect(px, 80, 120, 1440, 660, (18, 26, 20))
rect(px, 80, 120, 1440, 56, (24, 34, 28))
draw_text(px, "HELIX DEMO TRAVEL AGENT", 110, 138, 3, (159, 179, 163))
lines = [l for l in demo_log.read_text(errors="replace").splitlines() if l.strip()][-12:]
y = 220
for line in lines:
    for wrapped in textwrap.wrap(line, 70) or [""]:
        draw_text(px, wrapped[:70], 110, y, 3, (215, 234, 217))
        y += 34
        if y > 740:
            break
    if y > 740:
        break
save_ppm(frame_dir / "scene-03b.ppm", px)

files = [
    frame_dir / "scene-01.ppm",
    frame_dir / "scene-02.ppm",
    frame_dir / "scene-03.ppm",
    frame_dir / "scene-03b.ppm",
    frame_dir / "scene-04.ppm",
    frame_dir / "scene-05.ppm",
    frame_dir / "scene-06.ppm",
]
per = duration / len(files)
lst = frame_dir.parent / "concat.txt"
with lst.open("w") as f:
    for p in files:
        f.write(f"file '{p}'\n")
        f.write(f"duration {per:.3f}\n")
    f.write(f"file '{files[-1]}'\n")
print("wrote", lst, "per-scene", per)
PY

echo "==> Encoding MP4"
ffmpeg -y -f concat -safe 0 -i "$RAW_DIR/concat.txt" -i "$AUDIO_WAV" \
  -vf "fps=30,format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest \
  "$MP4"

ls -lh "$MP4"
echo "Demo video ready: $MP4"
