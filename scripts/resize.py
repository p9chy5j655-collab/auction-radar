"""온비드 원본 사진(보통 2400×1800, 1MB 이상)을 사이트용 두 크기로 줄여요.
사용: python3 resize.py <폴더> <해시1> <해시2> ...
각 해시마다 <해시>.src 원본을 읽어 <해시>.jpg(긴 변 1080)와 <해시>_s.jpg(긴 변 480)를 만들고 원본은 지워요."""
import os, sys
from PIL import Image, ImageOps

d = sys.argv[1]
ok = fail = 0
for h in sys.argv[2:]:
    src = os.path.join(d, h + '.src')
    try:
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        for suffix, size, q in (('', 1080, 78), ('_s', 480, 74)):
            x = im.copy()
            x.thumbnail((size, size), Image.LANCZOS)
            x.save(os.path.join(d, f'{h}{suffix}.jpg'), 'JPEG', quality=q, optimize=True, progressive=True)
        ok += 1
    except Exception as e:  # 깨진 파일은 실패 표시만 남겨요
        fail += 1
        open(os.path.join(d, h + '.none'), 'w').close()
    finally:
        if os.path.exists(src):
            os.remove(src)
print(f'resize ok={ok} fail={fail}')
