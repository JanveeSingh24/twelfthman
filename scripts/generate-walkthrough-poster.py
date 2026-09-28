from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1600
HEIGHT = 900
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "twelfthman-long-walkthrough.png"
FONT_DIR = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_DIR / name, size)


def rounded_rectangle(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#07131d")
    draw = ImageDraw.Draw(image)

    for y in range(HEIGHT):
        blend = y / HEIGHT
        color = (
            int(7 + 3 * blend),
            int(19 + 16 * blend),
            int(29 + 26 * blend),
        )
        draw.line((0, y, WIDTH, y), fill=color)

    for x in range(0, WIDTH, 80):
        draw.line((x, 0, x, HEIGHT), fill="#112735", width=1)
    for y in range(0, HEIGHT, 80):
        draw.line((0, y, WIDTH, y), fill="#112735", width=1)

    heavy = font("segoeuib.ttf", 88)
    display = font("segoeuib.ttf", 60)
    body = font("segoeui.ttf", 30)
    small = font("segoeuib.ttf", 22)

    rounded_rectangle(draw, (90, 80, 374, 130), 25, "#19c9ad")
    draw.text((116, 90), "LOCAL-FIRST AI", font=small, fill="#06201e")

    draw.text((90, 190), "TwelfthMan", font=heavy, fill="#f5fbff")
    draw.text((90, 302), "The long walkthrough", font=display, fill="#a9c8d7")
    draw.text((94, 396), "A verified POC for deciding what stays local", font=body, fill="#d7e6ed")
    draw.text((94, 438), "and what can be reviewed in the cloud.", font=body, fill="#d7e6ed")

    rounded_rectangle(draw, (90, 570, 725, 700), 20, "#102d3b", outline="#245168", width=2)
    draw.ellipse((124, 607, 178, 661), fill="#19c9ad")
    draw.polygon([(147, 619), (147, 649), (170, 634)], fill="#06201e")
    draw.text((210, 600), "WATCH THE FULL WALKTHROUGH", font=small, fill="#f5fbff")
    draw.text((210, 635), "Routing, privacy boundaries, and evidence", font=body, fill="#a9c8d7")

    rounded_rectangle(draw, (930, 145, 1450, 680), 30, "#0b202c", outline="#2c6378", width=3)
    draw.text((980, 205), "ROUTE DECISION", font=small, fill="#87aebd")
    rounded_rectangle(draw, (980, 255, 1400, 353), 16, "#123847")
    draw.text((1014, 267), "Local", font=font("segoeuib.ttf", 48), fill="#f5fbff")
    draw.text((1016, 324), "routine, bounded tasks", font=font("segoeuib.ttf", 17), fill="#9fc4d0")
    draw.line((1190, 383, 1190, 435), fill="#19c9ad", width=6)
    draw.polygon([(1172, 422), (1208, 422), (1190, 450)], fill="#19c9ad")
    rounded_rectangle(draw, (980, 470, 1400, 568), 16, "#19313e")
    draw.text((1014, 482), "Cloud review", font=font("segoeuib.ttf", 48), fill="#f5fbff")
    draw.text((1016, 539), "reviewed, sanitized evidence", font=font("segoeuib.ttf", 17), fill="#b8cfda")
    draw.text((982, 620), "POC: real routes, real guardrails", font=small, fill="#19c9ad")

    draw.line((90, 790, 1510, 790), fill="#2a4d5c", width=2)
    draw.text((90, 820), "TWELFTHMAN  |  LOCAL-FIRST AI ROUTING POC", font=small, fill="#86a7b5")
    draw.text((1510, 820), "DEEP DIVE", font=small, fill="#19c9ad", anchor="ra")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, "PNG", optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()