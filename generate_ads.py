#!/usr/bin/env python3
"""
generate_ads.py — Generador de anuncios estáticos Meta Ads
Vista los Naranjos — Piezas P03, P04, P05

Uso:
    python generate_ads.py

Dependencias:
    pip install google-generativeai pillow python-dotenv requests
"""

import os
import json
import sys
import requests
from pathlib import Path
from io import BytesIO
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── PATHS ──────────────────────────────────────────────────────────────────
CLIENT_DIR = Path(__file__).parent
load_dotenv(CLIENT_DIR / "config" / ".env")

DOWNLOADS   = Path.home() / "Downloads"
OUTPUT_DIR  = CLIENT_DIR / "created" / "projects" / "Vista los Naranjos" / "meta-ads"
FONTS_DIR   = OUTPUT_DIR / "_fonts"

PHOTOS = {
    "p03": DOWNLOADS / "DJI_0750-HDR.jpg",   # Vista panorámica — captación
    "p04": DOWNLOADS / "DJI_0755-HDR.jpg",   # Aérea lotes — retargeting urgencia
    "p05": DOWNLOADS / "DJI_0680-HDR.jpg",   # Muro perimetral — retargeting confianza
}

PIECE_NAMES = {
    "p03": "captacion_10-propietarios",
    "p04": "retargeting_9-disponibles",
    "p05": "retargeting_sin-sorpresas",
}

SIZES = {
    "4_5": (1080, 1350),
    "1_1": (1080, 1080),
}

# ─── BRAND COLORS ───────────────────────────────────────────────────────────
def _rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

C = {
    "primary":      _rgb("637c63"),    # verde medio — franjas captación
    "heading":      _rgb("0b2a0b"),    # verde muy oscuro — franjas retargeting
    "urgency":      _rgb("EBB344"),    # amarillo — badge escasez, número P04
    "urgency_text": _rgb("5a3a00"),    # texto sobre fondo amarillo
    "white":        (255, 255, 255),
    "white_dim":    (200, 210, 200),   # blanco con tono verde para subtextos
}

# ─── FONTS ──────────────────────────────────────────────────────────────────
def download_fonts() -> dict:
    """Download Oswald TTF fonts via Google Fonts CSS2 API."""
    import re
    FONTS_DIR.mkdir(parents=True, exist_ok=True)

    weight_map = {400: "oswald_regular", 600: "oswald_semibold", 700: "oswald_bold"}
    paths = {}
    # Chrome UA needed to get TTF format from Google Fonts CSS2
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}

    for weight, name in weight_map.items():
        dest = FONTS_DIR / f"{name}.ttf"
        if not dest.exists():
            print(f"  Descargando {name} (w{weight})...")
            css = requests.get(
                f"https://fonts.googleapis.com/css2?family=Oswald:wght@{weight}",
                headers=headers, timeout=20
            ).text
            match = re.search(r"url\(([^)]+\.ttf)\)", css)
            if not match:
                raise RuntimeError(f"No se encontró TTF en Google Fonts CSS2 para weight {weight}")
            r = requests.get(match.group(1), headers=headers, timeout=30)
            r.raise_for_status()
            dest.write_bytes(r.content)
        paths[name] = str(dest)

    return paths

def font(paths: dict, style: str = "bold", size: int = 40) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(paths[f"oswald_{style}"], size)
    except Exception:
        return ImageFont.load_default()

# ─── TEXT HELPERS ────────────────────────────────────────────────────────────
def txt_size(draw: ImageDraw.Draw, text: str, f: ImageFont.FreeTypeFont) -> tuple:
    bb = draw.textbbox((0, 0), text, font=f)
    return bb[2] - bb[0], bb[3] - bb[1]

def draw_centered(draw: ImageDraw.Draw, text: str, f: ImageFont.FreeTypeFont,
                  color: tuple, cx: int, cy: int):
    tw, th = txt_size(draw, text, f)
    draw.text((cx - tw // 2, cy - th // 2), text, font=f, fill=color)

def draw_rounded_badge(draw: ImageDraw.Draw, text: str, f: ImageFont.FreeTypeFont,
                       bg: tuple, fg: tuple, x: int, y: int, pad_x=18, pad_y=10, radius=8):
    tw, th = txt_size(draw, text, f)
    draw.rounded_rectangle([x, y, x + tw + pad_x*2, y + th + pad_y*2], radius=radius, fill=bg)
    draw.text((x + pad_x, y + pad_y), text, font=f, fill=fg)
    return tw + pad_x*2, th + pad_y*2  # returns (badge_w, badge_h)

# ─── OVERLAY HELPERS ─────────────────────────────────────────────────────────
def dark_overlay(img: Image.Image, color: tuple, alpha: int) -> Image.Image:
    """Blend a solid color over img with given alpha (0-255)."""
    overlay = Image.new("RGBA", img.size, (*color, alpha))
    base = img.convert("RGBA")
    return Image.alpha_composite(base, overlay).convert("RGB")

def gradient_bottom(canvas: Image.Image, color: tuple, start_y: int, height: int = 80):
    """Apply a vertical gradient from transparent to solid `color` at bottom of photo area."""
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    W = canvas.size[0]
    for i in range(height):
        alpha = int(255 * (i / height) ** 1.5)
        draw.rectangle([(0, start_y + i), (W, start_y + i + 1)], fill=(*color, alpha))
    base = canvas.convert("RGBA")
    return Image.alpha_composite(base, overlay).convert("RGB")

# ─── GEMINI CROP ─────────────────────────────────────────────────────────────
def gemini_crop(photo_path: Path, piece: str, img_w: int, img_h: int) -> dict:
    """Ask Gemini for the best crop box for this piece. Falls back to auto-crop."""
    prompts = {
        "p03": (
            "This drone photo shows a real estate project in Valle del Elqui, Chile. "
            "I need to crop it to a tall vertical 4:5 format (portrait). "
            "The ad headline is 'Solo 10 propietarios. Vista privilegiada.' "
            "The bottom 32% will be covered by a colored panel, so the photo shows the top 68%. "
            "Choose a crop that maximizes the mountain valley panorama and green landscape — "
            "ideally showing the valley depth and mountain range prominently. "
            f"Image is {img_w}x{img_h}px. Return ONLY JSON: {{\"x\": int, \"y\": int, \"w\": int, \"h\": int}}"
        ),
        "p04": (
            "This drone aerial photo shows land plots of a real estate project from above. "
            "I need to crop it to tall vertical 4:5 format for a retargeting ad about scarcity. "
            "A dark overlay will cover the full image (text on top). "
            "Choose a crop that best shows the plots/lots from above with good composition. "
            f"Image is {img_w}x{img_h}px. Return ONLY JSON: {{\"x\": int, \"y\": int, \"w\": int, \"h\": int}}"
        ),
        "p05": (
            "This drone photo shows cleared terrain and a concrete perimeter wall of a real estate project. "
            "I need to crop it to tall vertical 4:5 format. The bottom 42% will be a dark panel. "
            "Choose a crop where the concrete perimeter wall and cleared terrain platforms "
            "are clearly visible in the upper portion, with valley/mountains as background. "
            f"Image is {img_w}x{img_h}px. Return ONLY JSON: {{\"x\": int, \"y\": int, \"w\": int, \"h\": int}}"
        ),
    }

    try:
        from google import genai
        api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_APY_KEY")
                   or os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_GEMINI_API_KEY"))
        if not api_key:
            raise ValueError("Clave Gemini no encontrada en .env")

        client = genai.Client(api_key=api_key)
        with open(photo_path, "rb") as f:
            img_bytes = f.read()

        from google.genai import types
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                prompts[piece],
            ],
        )
        text = response.text.strip()
        start, end = text.find("{"), text.rfind("}") + 1
        if start >= 0 and end > start:
            crop = json.loads(text[start:end])
            # Validate and clamp
            x = max(0, min(int(crop.get("x", 0)), img_w - 1))
            y = max(0, min(int(crop.get("y", 0)), img_h - 1))
            w = min(int(crop.get("w", img_w)), img_w - x)
            h = min(int(crop.get("h", img_h)), img_h - y)
            print(f"  Gemini crop → x={x}, y={y}, w={w}, h={h}")
            return {"x": x, "y": y, "w": w, "h": h}

    except Exception as e:
        print(f"  Gemini crop falló ({e}) — usando auto-crop")

    # Auto-crop fallback: center crop to 4:5
    target_ratio = 4 / 5
    if img_w / img_h > target_ratio:
        nw = int(img_h * target_ratio)
        return {"x": (img_w - nw) // 2, "y": 0, "w": nw, "h": img_h}
    else:
        nh = int(img_w / target_ratio)
        return {"x": 0, "y": (img_h - nh) // 2, "w": img_w, "h": nh}

def load_and_crop(photo_path: Path, crop: dict, target_size: tuple) -> Image.Image:
    with Image.open(photo_path) as img:
        img = img.convert("RGB")
        box = (crop["x"], crop["y"], crop["x"] + crop["w"], crop["y"] + crop["h"])
        img = img.crop(box)
        # For 1:1, adjust to square from same crop
        if target_size[0] == target_size[1]:
            W, H = img.size
            side = min(W, H)
            img = img.crop(((W - side) // 2, 0, (W + side) // 2, side))
        img = img.resize(target_size, Image.LANCZOS)
        return img.copy()

# ─── PIECE COMPOSERS ─────────────────────────────────────────────────────────

def compose_p03(bg: Image.Image, fonts: dict, W: int, H: int) -> Image.Image:
    """P03 — Solo 10 propietarios. Vista privilegiada. (Captación)"""
    franja_h = int(H * 0.33)
    photo_h  = H - franja_h

    # Crop photo to fit top section
    photo = bg.resize((W, photo_h + 60), Image.LANCZOS).crop((0, 0, W, photo_h))

    # Canvas
    canvas = Image.new("RGB", (W, H), C["primary"])
    canvas.paste(photo, (0, 0))

    # Gradient transition photo → franja
    canvas = gradient_bottom(canvas, C["primary"], photo_h - 70, height=70)

    draw = ImageDraw.Draw(canvas)

    # Franja
    draw.rectangle([(0, photo_h), (W, H)], fill=C["primary"])

    # Badge "9 disponibles" — top right
    bf = font(fonts, "bold", 28)
    bw, bh = draw_rounded_badge(
        draw, "9 disponibles", bf,
        bg=C["urgency"], fg=C["urgency_text"],
        x=W - 200, y=22, pad_x=16, pad_y=9, radius=7
    )

    # Headline
    hf = font(fonts, "bold", 56)
    hy = photo_h + 26
    draw.text((40, hy), "Solo 10 propietarios.", font=hf, fill=C["white"])

    # Sub-headline
    sf = font(fonts, "regular", 30)
    sy = hy + txt_size(draw, "Solo 10 propietarios.", hf)[1] + 14
    draw.text((40, sy), "Vista los Naranjos — Valle del Elqui", font=sf, fill=C["white_dim"])

    # Logo text — bottom right
    lf = font(fonts, "semibold", 20)
    lw, _ = txt_size(draw, "Vista los Naranjos", lf)
    draw.text((W - lw - 28, H - 38), "Vista los Naranjos", font=lf, fill=C["white_dim"])

    return canvas


def compose_p04(bg: Image.Image, fonts: dict, W: int, H: int) -> Image.Image:
    """P04 — Solo quedan 9 disponibles. (Retargeting urgencia)"""
    # Full bleed + dark overlay
    photo = bg.resize((W, H), Image.LANCZOS)
    canvas = dark_overlay(photo, C["heading"], alpha=148)
    draw = ImageDraw.Draw(canvas)

    cx = W // 2

    # Hero number "9"
    nf = font(fonts, "bold", 260)
    nw, nh = txt_size(draw, "9", nf)
    ny = H // 2 - nh // 2 - 50
    draw.text((cx - nw // 2, ny), "9", font=nf, fill=C["urgency"])

    # "/10 disponibles"
    sf = font(fonts, "regular", 52)
    sw, sh = txt_size(draw, "/10 disponibles", sf)
    draw.text((cx - sw // 2, ny + nh + 4), "/10 disponibles", font=sf, fill=C["white"])

    # Bottom franja
    franja_h = 108
    draw.rectangle([(0, H - franja_h), (W, H)], fill=C["heading"])

    # Franja text
    ff = font(fonts, "regular", 27)
    ft = "El primero elige  ·  Precio de lanzamiento único"
    fw, fh = txt_size(draw, ft, ff)
    draw.text((cx - fw // 2, H - franja_h + (franja_h - fh) // 2 - 6), ft, font=ff, fill=C["white"])

    # Logo
    lf = font(fonts, "semibold", 19)
    lw, _ = txt_size(draw, "Vista los Naranjos", lf)
    draw.text((W - lw - 24, H - 30), "Vista los Naranjos", font=lf, fill=C["white_dim"])

    return canvas


def compose_p05(bg: Image.Image, fonts: dict, W: int, H: int) -> Image.Image:
    """P05 — Sin sorpresas. Todo listo. (Retargeting remoción de riesgo)"""
    franja_h = int(H * 0.43)
    photo_h  = H - franja_h

    photo = bg.resize((W, photo_h + 60), Image.LANCZOS).crop((0, 0, W, photo_h))

    canvas = Image.new("RGB", (W, H), C["heading"])
    canvas.paste(photo, (0, 0))

    # Gradient transition
    canvas = gradient_bottom(canvas, C["heading"], photo_h - 70, height=70)

    draw = ImageDraw.Draw(canvas)
    draw.rectangle([(0, photo_h), (W, H)], fill=C["heading"])

    # Headline
    hf = font(fonts, "bold", 50)
    hy = photo_h + 26
    draw.text((44, hy), "Sin sorpresas. Todo listo.", font=hf, fill=C["white"])

    # Separator
    sep_y = hy + txt_size(draw, "Sin sorpresas.", hf)[1] + 18
    draw.rectangle([(44, sep_y), (W - 44, sep_y + 1)], fill=(*C["white_dim"], 100))

    # Checklist — 2 columns
    checks = [
        ("+ Plataformas construidas", "+ Agua disponible hoy"),
        ("+ Porton automatico",       "+ Cierre perimetral"),
        ("+ Rol propio por parcela",  "+ Transferencia inmediata"),
    ]
    cf = font(fonts, "regular", 26)
    cy = sep_y + 18
    col1_x, col2_x = 44, W // 2 + 16
    line_h = int(txt_size(draw, "✓  Texto", cf)[1] * 1.55)

    for left, right in checks:
        draw.text((col1_x, cy), left, font=cf, fill=C["white_dim"])
        draw.text((col2_x, cy), right, font=cf, fill=C["white_dim"])
        cy += line_h

    # Logo
    lf = font(fonts, "semibold", 20)
    lw, _ = txt_size(draw, "Vista los Naranjos", lf)
    draw.text((W - lw - 28, H - 38), "Vista los Naranjos", font=lf, fill=C["white_dim"])

    return canvas


COMPOSERS = {
    "p03": compose_p03,
    "p04": compose_p04,
    "p05": compose_p05,
}

# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    print("\n  Meta Ads — Vista los Naranjos")
    print("=" * 48)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Check photos exist
    missing = [p for p, path in PHOTOS.items() if not path.exists()]
    if missing:
        for m in missing:
            print(f"ERROR: Foto no encontrada → {PHOTOS[m]}")
        sys.exit(1)

    print("\nDescargando fuentes Oswald...")
    fonts = download_fonts()
    print("  OK")

    for piece, photo_path in PHOTOS.items():
        print(f"\n{piece.upper()} — {PIECE_NAMES[piece]}")

        with Image.open(photo_path) as img:
            img_w, img_h = img.size

        print(f"  Foto: {photo_path.name} ({img_w}x{img_h}px)")
        print(f"  Consultando Gemini para crop óptimo...")
        crop = gemini_crop(photo_path, piece, img_w, img_h)

        for fmt, size in SIZES.items():
            W, H = size
            bg = load_and_crop(photo_path, crop, size)
            result = COMPOSERS[piece](bg, fonts, W, H)

            out_name = f"20260320_{PIECE_NAMES[piece]}_{fmt}.jpg"
            out_path = OUTPUT_DIR / out_name
            result.save(str(out_path), "JPEG", quality=92, optimize=True)
            print(f"  [OK] {out_name}")

    print(f"\nListo. Archivos en:\n  {OUTPUT_DIR}\n")


if __name__ == "__main__":
    main()
