"""Build a Windows .ico with multiple sizes (PNG-compressed entries)."""
import io
import struct
from pathlib import Path
from PIL import Image

src = Path(r'c:\Users\User\cluemind\cluemind-desktop\resources\icon.png')
out = Path(r'c:\Users\User\cluemind\cluemind-desktop\resources\icon.ico')

img = Image.open(src).convert('RGBA')
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
img = img.crop((left, top, left + side, top + side))

sizes = [16, 24, 32, 48, 64, 128, 256]
entries = []
for s in sizes:
    resized = img.resize((s, s), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format='PNG')
    data = buf.getvalue()
    entries.append((s, data))

with out.open('wb') as f:
    # ICONDIR: reserved, type=1 (icon), count
    f.write(struct.pack('<HHH', 0, 1, len(entries)))
    data_offset = 6 + 16 * len(entries)
    offsets = []
    for s, data in entries:
        offsets.append(data_offset)
        data_offset += len(data)
    for (s, data), offset in zip(entries, offsets):
        # width/height: 0 means 256
        wb = 0 if s >= 256 else s
        hb = 0 if s >= 256 else s
        # ICONDIRENTRY
        f.write(struct.pack('<BBBBHHII', wb, hb, 0, 0, 1, 32, len(data), offset))
    for _, data in entries:
        f.write(data)

print('wrote', out, 'bytes', out.stat().st_size)
raw = out.read_bytes()
count = int.from_bytes(raw[2:4], 'little')
print('images', count)
for i in range(count):
    o = 6 + i * 16
    ww = raw[o] or 256
    hh = raw[o + 1] or 256
    print(f'  {ww}x{hh}')
