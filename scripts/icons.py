"""Draws the app icons into assets/: a dumbbell stood upright, amber plates on
a light handle, so the mark is a weight and the "I" of Ironlog at once (r25,
V's request; it replaced a volt barbell). The preview build's icons go into
assets/preview/: the same mark with an amber and black striped band under it,
so the two apps are told apart on a home screen at a glance.

index.html draws the same mark as an inline SVG (ICON_SVG) from the same
numbers, for the first-run pages and the loading screen.

Run: python3 scripts/icons.py   (needs Pillow)
The maskable icon keeps the mark inside the central safe zone, since Android
crops it to a circle or squircle; iOS rounds the corners of apple-touch-icon.
"""
from PIL import Image, ImageDraw

AMBER = (255, 176, 32)
BG = (10, 11, 13)
BAR = (242, 244, 246)
STRIPE_AMBER = (245, 165, 36)
STRIPE_DARK = (21, 22, 26)


def icon(size, pad_frac, preview=False):
    s = 1024
    im = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(im)
    # The preview's mark sits smaller and higher, leaving room for its band.
    if preview:
        pad_frac += 0.07
    k = 1 - pad_frac * 2
    cx = s / 2
    cy = s / 2 - (s * 0.05 if preview else 0)

    def rect(x0, y0, x1, y1, r, fill):
        d.rounded_rectangle([cx + x0 * k, cy + y0 * k, cx + x1 * k, cy + y1 * k], radius=r * k, fill=fill)

    rect(-30, -300, 30, 300, 14, BAR)                                    # handle
    rect(-80, -192, 80, -160, 12, BAR); rect(-80, 160, 80, 192, 12, BAR)   # collars
    rect(-240, -376, 240, -284, 30, AMBER); rect(-240, 284, 240, 376, 30, AMBER)  # outer plates
    rect(-190, -270, 190, -204, 26, AMBER); rect(-190, 204, 190, 270, 26, AMBER)      # inner plates
    if preview:
        y0 = (cy + 376 * k) / s + 0.045
        band(im, y0, y0 + 0.085)
    return im.resize((size, size), Image.LANCZOS)


def band(im, y0f, y1f):
    """Diagonal amber and black stripes across the icon, from y0f to y1f of its height."""
    s = im.size[0]
    st = Image.new('RGB', (s, s), STRIPE_DARK)
    d = ImageDraw.Draw(st)
    w = s // 20
    for x in range(-s, 2 * s, 2 * w):
        d.polygon([(x, s), (x + w, s), (x + w + s, 0), (x + s, 0)], fill=STRIPE_AMBER)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rectangle([0, int(s * y0f), s, int(s * y1f)], fill=255)
    im.paste(st, (0, 0), mask)


if __name__ == '__main__':
    import os
    os.makedirs('assets/preview', exist_ok=True)
    for pre, pv in (('assets/', False), ('assets/preview/', True)):
        icon(512, 0.06, pv).save(pre + 'icon-512.png')
        icon(192, 0.06, pv).save(pre + 'icon-192.png')
        icon(180, 0.08, pv).save(pre + 'apple-touch-icon.png')
        icon(512, 0.14, pv).save(pre + 'icon-maskable-512.png')
        icon(64, 0.04, pv).save(pre + 'favicon-64.png')
