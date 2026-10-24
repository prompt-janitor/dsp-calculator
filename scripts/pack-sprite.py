"""Pack the icons the app uses into a small sprite sheet.

FactorioLab's sheet holds every DSP icon. The app uses about a third of them,
so this keeps only the tiles listed in recipes.json, writes them in a new grid,
and updates the x and y of each icon. prep-data.py runs it after each refresh.

Usage: python3 scripts/pack-sprite.py   (needs Pillow: pip install pillow)
"""
import json, math, os
from PIL import Image

TILE = 64
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_path = os.path.join(root, 'src', 'data', 'recipes.json')
sprite_path = os.path.join(root, 'src', 'assets', 'sprite.webp')

data = json.load(open(data_path))
sheet = Image.open(sprite_path).convert('RGBA')
keys = sorted(data['icons'])
cols = math.ceil(math.sqrt(len(keys)))
rows = math.ceil(len(keys) / cols)
packed = Image.new('RGBA', (cols * TILE, rows * TILE), (0, 0, 0, 0))
for i, key in enumerate(keys):
    x, y, color = data['icons'][key]
    nx, ny = (i % cols) * TILE, (i // cols) * TILE
    packed.paste(sheet.crop((x, y, x + TILE, y + TILE)), (nx, ny))
    data['icons'][key] = [nx, ny, color]
data['sprite'] = [packed.width, packed.height]

# Quality 85 with alpha at 80 looks the same as the source at 3x zoom and is
# less than half the size.
packed.save(sprite_path, 'WEBP', quality=85, alpha_quality=80, method=6)
json.dump(data, open(data_path, 'w'), separators=(',', ':'))
print(f'{len(keys)} icons in a {packed.width}x{packed.height} sheet, {os.path.getsize(sprite_path) // 1024} KB')
