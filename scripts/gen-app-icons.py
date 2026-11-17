#!/usr/bin/env python3
"""Generates every app icon and splash image from the owner's icon, design/app-icon-dark.webp.

The owner's picture is a glass tile with transparent corners and a thin transparent border. It is
never redrawn: it is only scaled, and placed on the tile's own dark navy where a full square is
needed (phones cut every icon to their own shape).

  iPhone, stores, website   the tile is enlarged until it reaches the edge of the square
                            (the owner chose this on 17 Nov 2026).
  Android adaptive icon     the whole picture at 87% of the 108dp layer, so the launcher's mask
                            (the central 66%) shows the mark with the glass behind it.
  Splash screens            the picture, as supplied, centred on each splash's existing colour.

Run from the repository root:  python3 scripts/gen-app-icons.py     (needs Pillow)
This replaces `npx capacitor-assets generate`, which made adaptive layers at a third of the
resolution Android asks for and put the insets back into the launcher XML.
"""
import glob
from PIL import Image, ImageDraw

SRC = Image.open('design/app-icon-dark.webp').convert('RGBA')
NAVY = (2, 14, 70, 255)           # the tile's own dark background
TILE = SRC.crop((65, 65, 1188, 1188))   # the glass tile without the transparent border
RES = 'android/app/src/main/res'
LANCZOS = Image.LANCZOS


def filled(size, alpha=False):
    """The tile reaching the edge of a square; opaque on navy unless alpha is kept."""
    tile = TILE.resize((size, size), LANCZOS)
    if alpha:
        return tile
    bg = Image.new('RGBA', (size, size), NAVY)
    bg.alpha_composite(tile)
    return bg.convert('RGB')


def adaptive_layer(size):
    bg = Image.new('RGBA', (size, size), NAVY)
    k = round(size * 0.87)
    bg.alpha_composite(SRC.resize((k, k), LANCZOS), ((size - k) // 2, (size - k) // 2))
    return bg.convert('RGB')


def round_icon(size):
    layer = adaptive_layer(size * 3)
    k = size * 2                      # the central 66% of the layer
    view = layer.crop((size // 2, size // 2, size // 2 + k, size // 2 + k)).resize((size, size), LANCZOS)
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    out = view.convert('RGBA')
    out.putalpha(mask.resize((size, size), LANCZOS))
    return out


def splash(size, colour, mark):
    bg = Image.new('RGBA', size, colour)
    bg.alpha_composite(SRC.resize((mark, mark), LANCZOS), ((size[0] - mark) // 2, (size[1] - mark) // 2))
    return bg


# Source files kept for reference and for the web build.
filled(1024).save('assets/icon.png')
adaptive_layer(1024).save('assets/icon-background.png')
splash((2732, 2732), (10, 14, 22, 255), 420).save('assets/splash.png')

# Android launcher icons.
for name, scale in [('ldpi', 0.75), ('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]:
    d = f'{RES}/mipmap-{name}'
    legacy, layer = round(48 * scale), round(108 * scale)
    filled(legacy, alpha=True).save(f'{d}/ic_launcher.png')
    round_icon(legacy).save(f'{d}/ic_launcher_round.png')
    adaptive_layer(layer).save(f'{d}/ic_launcher_background.png')
    Image.new('RGBA', (layer, layer), (0, 0, 0, 0)).save(f'{d}/ic_launcher_foreground.png')

# Android splash screens: same sizes and colours as before, new mark.
for f in glob.glob(f'{RES}/drawable*/splash.png'):
    old = Image.open(f).convert('RGBA')
    splash(old.size, old.getpixel((2, 2)), round(min(old.size) * 0.3)).save(f)

# iPhone.
filled(1024).save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
for f in glob.glob('ios/App/App/Assets.xcassets/Splash.imageset/*.png'):
    old = Image.open(f).convert('RGBA')
    splash(old.size, old.getpixel((2, 2)), 420).save(f)

# Play listing icon (a new file; the older one is left alone), website and browser icons.
filled(512).save('docs/store-assets/hi-res-icon-512-2026-11.png')
filled(192).save('docs/site/icon-192.png')
filled(256).save('docs/site/icon-256.webp', quality=92)
filled(64, alpha=True).save('docs/site/favicon.png')
filled(180, alpha=True).save('public/favicon.png')
print('done')
