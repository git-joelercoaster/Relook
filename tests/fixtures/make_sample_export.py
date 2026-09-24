#!/usr/bin/env python3
"""
Builds a small, entirely fictional Telegram HTML export for tests and screenshots.

Output: tests/fixtures/Telegram Desktop/
  ChatExport_2026-01-10/   the full chat
  ChatExport_2026-02-02/   a later export that overlaps the first (exercises merging)

It uses the same markup as Telegram Desktop's HTML export. People, messages and
pictures are made up. Requires Pillow (pip install pillow).
"""
import math
import os
import random
import shutil
import struct
import zlib

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Telegram Desktop")
CHAT = "Rivera Family"
random.seed(7)


# ------------------------------------------------------------------ pictures

def scene(path, size, sky, ground, sun=True, hills=3):
    """A soft, made-up landscape so photos look like photos without being anyone's."""
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(sky[0][i] + (sky[1][i] - sky[0][i]) * t) for i in range(3)))
    if sun:
        r = h // 9
        cx, cy = int(w * random.uniform(0.6, 0.85)), int(h * random.uniform(0.18, 0.32))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 236, 190))
    for k in range(hills):
        base = int(h * (0.55 + 0.12 * k))
        amp, freq, phase = h * 0.08, random.uniform(1.2, 2.4), random.uniform(0, 6.28)
        pts = [(x, base - amp * math.sin(x / w * freq * math.pi + phase)) for x in range(0, w + 8, 8)]
        shade = tuple(max(0, min(255, int(c * (1 - 0.18 * k)))) for c in ground)
        d.polygon(pts + [(w, h), (0, h)], fill=shade)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=86)
    thumb = img.copy()
    thumb.thumbnail((260, 260))
    base, ext = os.path.splitext(path)
    thumb.save(base + "_thumb" + ext if not path.endswith(".mp4_thumb.jpg") else path, quality=80)


def tiny_file(path, size=2048):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(os.urandom(size))


# ------------------------------------------------------------------ markup

HEAD = ('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Exported Data</title></head><body>'
        '<div class="page_wrap"><div class="page_header"><div class="content"><div class="text bold"> '
        + CHAT + ' </div></div></div><div class="page_body chat_page"><div class="history">')
TAIL = '</div></div></div></body></html>'
last_from = None


def msg(mid, when, frm, text=None, media="", fwd=None, reply=None):
    """when = (day, month, year, hh, mm)."""
    global last_from
    d, mo, y, hh, mm = when
    stamp = f"{d:02d}.{mo:02d}.{y} {hh:02d}:{mm:02d}:00 UTC-05:00"
    joined = frm == last_from
    last_from = frm
    h = f'<div class="message default clearfix{" joined" if joined else ""}" id="message{mid}">'
    if not joined:
        h += f'<div class="pull_left userpic_wrap"><div class="userpic userpic4"><div class="initials"> {frm[0]} </div></div></div>'
    h += f'<div class="body"><div class="pull_right date details" title="{stamp}"> {hh:02d}:{mm:02d} </div>'
    if not joined:
        h += f'<div class="from_name"> {frm} </div>'
    if reply:
        h += f'<div class="reply_to details"> In reply to <a href="#go_to_message{reply}">this message</a></div>'
    inner = (f'<div class="media_wrap clearfix">{media}</div>' if media else "") + (f'<div class="text"> {text} </div>' if text else "")
    if fwd:
        h += (f'<div class="pull_left forwarded userpic_wrap"></div><div class="forwarded body"><div class="from_name"> {fwd} '
              f'<span class="date details" title="{stamp}"> {d:02d}.{mo:02d}.{y}</span> </div>{inner}</div>')
    else:
        h += inner
    return h + "</div></div>"


def day(label):
    return f'<div class="message service" id="message-{random.randint(1, 99999)}"><div class="body details"> {label} </div></div>'


def link(url):
    return f'<a href="{url}">{url}</a>'


def photo(name):
    return f'<a class="photo_wrap clearfix pull_left" href="photos/{name}"><img class="photo" src="photos/{name.replace(".jpg", "_thumb.jpg")}"/></a>'


def video(name, dur):
    return (f'<a class="video_file_wrap clearfix pull_left" href="video_files/{name}"><div class="video_play_bg"><div class="video_play"></div></div>'
            f'<div class="video_duration"> {dur} </div><img class="video_file" src="video_files/{name}_thumb.jpg"/></a>')


def voice(name, dur):
    return (f'<a class="media clearfix pull_left block_link media_voice_message" href="voice_messages/{name}"><div class="fill pull_left"></div>'
            f'<div class="body"><div class="title bold"> Voice message </div><div class="status details"> {dur} </div></div></a>')


def document(name, size):
    return (f'<a class="media clearfix pull_left block_link media_file" href="files/{name}"><div class="fill pull_left"></div>'
            f'<div class="body"><div class="title bold"> {name} </div><div class="status details"> {size} </div></div></a>')


# ------------------------------------------------------------------ the chat

def build_messages():
    m = []
    m.append(day("12 October 2025"))
    m.append(msg(1001, (12, 10, 2025, 9, 14), "Maya Rivera", "Morning everyone! Who's in for the lake trip in November? 🏕️"))
    m.append(msg(1002, (12, 10, 2025, 9, 20), "Leo Rivera", "In. Found a cabin: " + link("https://en.wikipedia.org/wiki/Log_cabin")))
    m.append(msg(1003, (12, 10, 2025, 9, 22), "Leo Rivera", "Sleeps 8, has a fire pit"))
    m.append(msg(1004, (12, 10, 2025, 10, 5), "Abuela Rosa", "Yo llevo los tamales 😄"))
    m.append(msg(1005, (12, 10, 2025, 10, 7), "Maya Rivera", "😂😂🙌"))
    m.append(day("3 November 2025"))
    m.append(msg(1006, (3, 11, 2025, 18, 30), "Sam Ortiz", "Packing list, please check it", document("packing-list.pdf", "84.2 KB")))
    m.append(msg(1007, (3, 11, 2025, 18, 41), "Maya Rivera", "Weather looks perfect " + link("https://www.weather.gov/")))
    m.append(day("15 November 2025"))
    m.append(msg(1008, (15, 11, 2025, 7, 58), "Leo Rivera", "Sunrise from the dock", photo("photo_1@15-11-2025_07-58-00.jpg")))
    m.append(msg(1009, (15, 11, 2025, 8, 3), "Abuela Rosa", None, voice("audio_1@15-11-2025_08-03-00.ogg", "00:42")))
    m.append(msg(1010, (15, 11, 2025, 12, 20), "Sam Ortiz", "Kayak race!", video("video_1@15-11-2025_12-20-00.mp4", "01:12")))
    m.append(msg(1011, (15, 11, 2025, 16, 45), "Maya Rivera", "Golden hour 😍", photo("photo_2@15-11-2025_16-45-00.jpg")))
    m.append(msg(1012, (15, 11, 2025, 16, 46), "Maya Rivera", None, photo("photo_3@15-11-2025_16-46-00.jpg")))
    m.append(msg(1013, (15, 11, 2025, 21, 10), "Leo Rivera", "Best trip in years. Same time next year?", reply=1008))
    m.append(day("24 December 2025"))
    m.append(msg(1014, (24, 12, 2025, 11, 0), "Sam Ortiz", "The recipe everyone asked about", fwd="Tía Carmen", media=photo("photo_4@24-12-2025_11-00-00.jpg")))
    m.append(msg(1015, (24, 12, 2025, 11, 5), "Abuela Rosa", "¡Feliz Navidad familia! 🎄 " + link("https://www.youtube.com/watch?v=dQw4w9WgXcQ")))
    m.append(msg(1016, (24, 12, 2025, 20, 15), "Maya Rivera", "Snow at last", photo("photo_missing.jpg")))
    m.append(day("9 January 2026"))
    m.append(msg(1017, (9, 1, 2026, 19, 2), "Leo Rivera", "Photos from the trip are all in one album now " + link("https://example.com/album/lake-2025")))
    m.append(msg(1018, (9, 1, 2026, 19, 4), "Maya Rivera", "Thank you!! 🙏"))
    return m


def write_export(folder, messages, per_page):
    base = os.path.join(OUT, folder)
    os.makedirs(base, exist_ok=True)
    pages = [messages[i:i + per_page] for i in range(0, len(messages), per_page)]
    for i, page in enumerate(pages):
        name = "messages.html" if i == 0 else f"messages{i + 1}.html"
        with open(os.path.join(base, name), "w", encoding="utf-8") as f:
            f.write(HEAD + "".join(page) + TAIL)
    return base


def add_media(base):
    scene(os.path.join(base, "photos/photo_1@15-11-2025_07-58-00.jpg"), (1200, 800), ((255, 179, 136), (140, 170, 214)), (58, 92, 72))
    scene(os.path.join(base, "photos/photo_2@15-11-2025_16-45-00.jpg"), (1200, 800), ((247, 160, 90), (120, 80, 150)), (70, 60, 80), hills=4)
    scene(os.path.join(base, "photos/photo_3@15-11-2025_16-46-00.jpg"), (800, 1100), ((150, 200, 240), (220, 235, 245)), (80, 120, 90), sun=False)
    scene(os.path.join(base, "photos/photo_4@24-12-2025_11-00-00.jpg"), (1000, 1000), ((240, 225, 205), (225, 205, 180)), (190, 120, 70), sun=False, hills=2)
    scene(os.path.join(base, "video_files/video_1@15-11-2025_12-20-00.mp4_thumb.jpg"), (480, 270), ((120, 190, 235), (200, 230, 250)), (40, 110, 150), hills=2)
    tiny_file(os.path.join(base, "video_files/video_1@15-11-2025_12-20-00.mp4"))
    tiny_file(os.path.join(base, "voice_messages/audio_1@15-11-2025_08-03-00.ogg"))
    tiny_file(os.path.join(base, "files/packing-list.pdf"))
    # photo_missing.jpg is deliberately absent: Telegram sometimes skips files.


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    messages = build_messages()
    full = write_export("ChatExport_2026-01-10", messages, per_page=8)
    add_media(full)
    # A later export of the same chat that overlaps the first: Relook merges them.
    later = write_export("ChatExport_2026-02-02", messages[-8:], per_page=8)
    add_media(later)
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
