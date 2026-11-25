// 온비드 물건 사진을 대신 불러와 보여주는 통로 (Cloudflare Pages Function)
// 온비드 서버가 다른 사이트에서 직접 사진을 띄우는 걸 막아서, 우리 주소를 거쳐 보여줘요.
// 온비드 사진 주소만 허용하고, 하루 동안 임시 캐시만 해요.
const ALLOWED = /^https:\/\/(www\.)?onbid\.co\.kr\/op\/cm\/syc\/filemng\//;

function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'image/webp';
  return null;
}

export async function onRequestGet(context) {
  const { request } = context;
  const target = new URL(request.url).searchParams.get('u') || '';
  if (!ALLOWED.test(target)) return new Response('허용되지 않은 주소예요.', { status: 400 });

  const cache = caches.default;
  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  let up;
  try {
    up = await fetch(target, {
      headers: { Referer: 'https://www.onbid.co.kr/', 'User-Agent': 'Mozilla/5.0 (compatible; auction-radar)' },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
  } catch {
    return new Response('사진을 불러오지 못했어요.', { status: 502 });
  }
  if (!up.ok) return new Response('사진이 없어요.', { status: 404 });
  const buf = await up.arrayBuffer();
  const type = sniff(new Uint8Array(buf.slice(0, 12)));
  if (!type || buf.byteLength < 200) return new Response('사진이 아니에요.', { status: 404 });

  const res = new Response(buf, {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }
  });
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
