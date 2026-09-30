"""Draws the app icons into assets/ (a barbell: volt plates on a white bar),
and the preview build's icons into assets/preview/: the same mark with an
amber and black striped band under it, so the two apps are told apart on a
home screen at a glance.

Run: python3 scripts/icons.py   (needs Pillow)
The maskable icon keeps the mark inside the central safe zone, since Android
crops it to a circle or squircle; iOS rounds the corners of apple-touch-icon.
"""
from PIL import Image, ImageDraw

VOLT = (212, 255, 63)
BG = (10, 11, 13)
BAR = (242, 244, 246)
STRIPE_AMBER = (245, 165, 36)
STRIPE_DARK = (21, 22, 26)


def icon(size, pad_frac, preview=False):
    s = 1024
    im = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(im)
    k = 1 - pad_frac * 2
    cx = cy = s / 2

    def rect(x0, y0, x1, y1, r, fill):
        d.rounded_rectangle([cx + x0 * k, cy + y0 * k, cx + x1 * k, cy + y1 * k], radius=r * k, fill=fill)

    rect(-410, -22, 410, 22, 14, BAR)                                  # bar
    rect(-156, -64, -128, 64, 10, BAR); rect(128, -64, 156, 64, 10, BAR)   # collars
    rect(-360, -250, -268, 250, 26, VOLT); rect(268, -250, 360, 250, 26, VOLT)  # outer plates
    rect(-250, -200, -170, 200, 24, VOLT); rect(170, -200, 250, 200, 24, VOLT)  # inner plates
    if preview:
        band(im, 0.765, 0.855)
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
