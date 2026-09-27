"""Draws the app icons into assets/ (a barbell: volt plates on a white bar).

Run: python3 scripts/icons.py   (needs Pillow)
The maskable icon keeps the mark inside the central safe zone, since Android
crops it to a circle or squircle; iOS rounds the corners of apple-touch-icon.
"""
from PIL import Image, ImageDraw

VOLT = (212, 255, 63)
BG = (10, 11, 13)
BAR = (242, 244, 246)


def icon(size, pad_frac):
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
    return im.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    icon(512, 0.06).save('assets/icon-512.png')
    icon(192, 0.06).save('assets/icon-192.png')
    icon(180, 0.08).save('assets/apple-touch-icon.png')
    icon(512, 0.14).save('assets/icon-maskable-512.png')
    icon(64, 0.04).save('assets/favicon-64.png')
