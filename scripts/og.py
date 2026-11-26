#!/usr/bin/env python3
"""카톡·SNS 공유 카드(1200x630) 만들기.

build.mjs가 남긴 .cache/og-jobs.json을 읽어 dist/og/<물건id>.jpg를 그려요.
같은 내용의 카드는 .cache/og/에 저장해 두고 다시 그리지 않아요.
글꼴: 환경변수 OG_FONT_BOLD / OG_FONT_REG (없으면 시스템 한글 글꼴을 찾아요).
"""
import hashlib
import json
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'og')
OUT = os.path.join(ROOT, 'dist', 'og')
W, H = 1200, 630
WALL, INK, INK2, MUTED, HAMMER, LINE = (243, 239, 231), (21, 23, 28), (59, 63, 72), (107, 111, 120), (232, 89, 12), (226, 220, 207)
VERSION = 'v1'


def find_font(env, names):
    p = os.environ.get(env)
    if p and os.path.exists(p):
        return p
    for d in ['/usr/share/fonts', '/usr/local/share/fonts', os.path.join(ROOT, '.cache', 'fonts')]:
        for base, _, files in os.walk(d):
            for n in names:
                for f in files:
                    if f.lower() == n.lower():
                        return os.path.join(base, f)
    return None


BOLD = find_font('OG_FONT_BOLD', ['Pretendard-ExtraBold.otf', 'Pretendard-Bold.otf', 'NotoSansCJK-Bold.ttc', 'NotoSansCJKkr-Bold.otf'])
REG = find_font('OG_FONT_REG', ['Pretendard-Medium.otf', 'Pretendard-Regular.otf', 'NotoSansCJK-Regular.ttc', 'NotoSansCJKkr-Regular.otf']) or BOLD


def font(path, size):
    if not path:
        return ImageFont.load_default()
    try:
        return ImageFont.truetype(path, size, index=1 if path.endswith('.ttc') else 0)  # ttc의 1번이 한국어(KR)
    except Exception:
        return ImageFont.truetype(path, size)


def wrap(draw, text, f, width, max_lines):
    lines, cur = [], ''
    for ch in text:
        if draw.textlength(cur + ch, font=f) <= width:
            cur += ch
        else:
            # 낱말 중간에서 끊기지 않게 마지막 띄어쓰기에서 자르기
            cut = cur.rfind(' ')
            if cut > len(cur) * 0.5:
                lines.append(cur[:cut]); cur = cur[cut + 1:] + ch
            else:
                lines.append(cur); cur = ch
            if len(lines) == max_lines:
                break
    if len(lines) < max_lines and cur:
        lines.append(cur)
    if len(lines) == max_lines and ''.join(lines) != text.replace('\n', ''):
        last = lines[-1]
        while last and draw.textlength(last + '…', font=f) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + '…'
    return lines


def photo_panel(thumb, size):
    w, h = size
    panel = Image.new('RGB', size, (234, 228, 216))
    if thumb and os.path.exists(thumb):
        try:
            im = Image.open(thumb).convert('RGB')
            bg = im.resize((w, h)).filter(ImageFilter.GaussianBlur(28))
            panel.paste(bg, (0, 0))
            # 작은 사진을 억지로 키우지 않게: 원본 비율로, 최대 2.2배까지만
            scale = min(w * 0.86 / im.width, h * 0.86 / im.height, 2.2)
            fg = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
            frame = Image.new('RGB', (fg.width + 16, fg.height + 16), (255, 255, 255))
            frame.paste(fg, (8, 8))
            panel.paste(frame, ((w - frame.width) // 2, (h - frame.height) // 2))
            return panel
        except Exception:
            pass
    d = ImageDraw.Draw(panel)
    d.text((w // 2, h // 2), '사진은 온비드 원문에서', font=font(REG, 30), fill=MUTED, anchor='mm')
    return panel


def draw_card(job, path):
    im = Image.new('RGB', (W, H), WALL)
    im.paste(photo_panel(job.get('thumb'), (500, H)), (0, 0))
    d = ImageDraw.Draw(im)
    x, maxw = 548, W - 548 - 56
    # 상단: 로고·종류
    d.rounded_rectangle((x, 56, x + 40, 96), 10, fill=INK)
    d.ellipse((x + 9, 65, x + 31, 87), outline=(255, 185, 138), width=3)
    d.text((x + 54, 76), '경매레이더', font=font(BOLD, 30), fill=INK, anchor='lm')
    kind = job.get('kind') or '공매'
    kf = font(BOLD, 24)
    kw = d.textlength(kind, font=kf)
    d.rounded_rectangle((W - 56 - kw - 28, 58, W - 56, 94), 18, fill=(255, 255, 255), outline=LINE)
    d.text((W - 56 - kw / 2 - 14, 76), kind, font=kf, fill=INK2, anchor='mm')
    # 물건 이름 (최대 2줄)
    tf = font(BOLD, 50)
    y = 140
    for line in wrap(d, job.get('t') or '', tf, maxw, 2):
        d.text((x, y), line, font=tf, fill=INK); y += 64
    if job.get('region'):
        d.text((x, y + 4), job['region'], font=font(REG, 28), fill=MUTED); y += 44
    # 가격
    y = max(y + 24, 330)
    pf = font(BOLD, 76)
    price = f"{job.get('min', '')}원부터"
    d.text((x, y), price, font=pf, fill=INK)
    y += 100
    if job.get('rate'):
        rt = f"감정가의 {job['rate']}%"
        rf = font(BOLD, 32)
        rw = d.textlength(rt, font=rf)
        d.rounded_rectangle((x, y, x + rw + 32, y + 52), 12, fill=HAMMER)
        d.text((x + 16, y + 26), rt, font=rf, fill=(255, 255, 255), anchor='lm')
        if job.get('appr'):
            d.text((x + rw + 52, y + 26), f"감정가 {job['appr']}원", font=font(REG, 28), fill=MUTED, anchor='lm')
    elif job.get('appr'):
        d.text((x, y + 26), f"감정가 {job['appr']}원", font=font(REG, 30), fill=MUTED, anchor='lm')
    # 하단
    foot = '출처: 온비드 · gongmae24.com' + (f" · {job['end']} 마감" if job.get('end') else '')
    d.text((x, H - 56), foot, font=font(REG, 24), fill=MUTED, anchor='ls')
    im.save(path, 'JPEG', quality=84, optimize=True, progressive=True)


def main():
    jobs_path = os.path.join(ROOT, '.cache', 'og-jobs.json')
    if not os.path.exists(jobs_path):
        print('[og] 작업 목록이 없어요'); return
    jobs = json.load(open(jobs_path, encoding='utf8'))
    os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if not BOLD:
        print('[og] 한글 글꼴을 찾지 못했어요. 공유 카드는 공통 이미지로 대신해요.', file=sys.stderr)
    made = reused = failed = 0
    used = set()
    for j in jobs:
        thumb_sig = os.path.getsize(j['thumb']) if j.get('thumb') and os.path.exists(j['thumb']) else 0
        key = hashlib.sha1(json.dumps([VERSION, {k: v for k, v in j.items() if k != 'thumb'}, thumb_sig], ensure_ascii=False).encode()).hexdigest()[:16]
        cpath = os.path.join(CACHE, key + '.jpg')
        used.add(key + '.jpg')
        try:
            if os.path.exists(cpath):
                reused += 1
            else:
                draw_card(j, cpath); made += 1
            shutil.copyfile(cpath, os.path.join(OUT, j['id'] + '.jpg'))
        except Exception as e:  # 한 장이 실패해도 나머지는 계속, 실패한 건 공통 이미지로
            failed += 1
            shutil.copyfile(os.path.join(ROOT, 'dist', 'og.png'), os.path.join(OUT, j['id'] + '.jpg'))
            if failed == 1:
                print('[og] 첫 실패:', e, file=sys.stderr)
    for f in os.listdir(CACHE):
        if f not in used:
            os.remove(os.path.join(CACHE, f))
    print(f'[og] 공유 카드 새로 {made}장, 재사용 {reused}장, 실패 {failed}장')


if __name__ == '__main__':
    main()
