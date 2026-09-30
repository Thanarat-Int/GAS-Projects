"""Remove only edge-connected neutral background; preserve the emblem pixels."""
from collections import deque
from pathlib import Path
import sys
from PIL import Image

source, target = map(Path, sys.argv[1:3])
image = Image.open(source).convert('RGBA')
width, height = image.size
pixels = image.load()
queue = deque()
seen = set()

def enqueue(x, y):
    if not (0 <= x < width and 0 <= y < height) or (x, y) in seen:
        return
    seen.add((x, y))
    r, g, b, _ = pixels[x, y]
    if min(r, g, b) >= 130 and max(r, g, b) - min(r, g, b) <= 18:
        queue.append((x, y))

for x in range(width):
    enqueue(x, 0)
    enqueue(x, height - 1)
for y in range(height):
    enqueue(0, y)
    enqueue(width - 1, y)

removed = 0
while queue:
    x, y = queue.popleft()
    r, g, b, _ = pixels[x, y]
    pixels[x, y] = (r, g, b, 0)
    removed += 1
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        enqueue(x + dx, y + dy)

target.parent.mkdir(parents=True, exist_ok=True)
image.save(target)
assert removed > 1000
assert pixels[width // 2, height // 2][3] == 255
print(f'Saved {target}: {width}x{height}, {removed} exterior pixels transparent')
