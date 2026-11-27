// 지역·종류별 모아보기 페이지 (/c/*.html)
// 검색엔진에서 "서울 아파트 공매", "공매 골드바" 같은 말로 찾아 들어오는 입구이자, 사람이 종류별로 훑어보는 목록이에요.
// 모든 문장은 실제 데이터에서 센 숫자로만 만들어요(지어낸 설명 없음).
import fs from 'node:fs/promises';
import path from 'node:path';

const SD_SLUG = {
  서울: 'seoul', 경기: 'gyeonggi', 인천: 'incheon', 부산: 'busan', 대구: 'daegu', 광주: 'gwangju', 대전: 'daejeon', 울산: 'ulsan', 세종: 'sejong',
  강원: 'gangwon', 충북: 'chungbuk', 충남: 'chungnam', 전북: 'jeonbuk', 전남: 'jeonnam', 전남광주통합: 'jeonnam-gwangju', 경북: 'gyeongbuk', 경남: 'gyeongnam', 제주: 'jeju'
};
const SD_ORDER = Object.keys(SD_SLUG);
const SD_LABEL = { 전남광주통합: '전남·광주' };

// 부동산 종류: 아파트 / 주택·빌라 / 상가·업무 / 토지
const RE_TYPES = [
  { key: 'apt', name: '아파트', test: (it) => it.cat === 'home' && /아파트/.test(it.use || '') && !/상가|근린|오피스텔|점포/.test(it.t || ''), appCat: 'home',
    tip: '아파트는 국토교통부 실거래가와 비교할 수 있는 경우가 많아요. 물건 화면에서 같은 단지 최근 거래가를 함께 보세요. 공매 아파트는 대부분 낙찰자가 직접 명도(사는 사람 내보내기)를 해야 하니 점유 상태를 공고문에서 확인하세요.' },
  { key: 'house', name: '주택·빌라', test: (it) => it.cat === 'home' && !/아파트/.test(it.use || ''), appCat: 'home',
    tip: '다세대·단독주택은 시세 자료가 적어 감정가만 보고 판단하기 쉬워요. 대항력 있는 임차인이 있으면 보증금을 낙찰자가 떠안을 수 있으니, 공고문 유의사항과 전입 여부를 꼭 확인하세요.' },
  { key: 'shop', name: '상가·업무시설', test: (it) => it.cat === 'shop', appCat: 'shop',
    tip: '상가는 임차인, 밀린 관리비, 업종 제한이 수익을 크게 좌우해요. 감정가보다 현재 임대료와 공실 여부를 먼저 따져 보세요.' },
  { key: 'land', name: '토지', test: (it) => it.cat === 'land', appCat: 'land',
    tip: '토지는 도로에 닿아 있는지, 용도지역이 무엇인지에 따라 쓸모가 완전히 달라요. 토지이음(eum.go.kr)에서 지번으로 용도지역과 규제를 먼저 확인하세요. 지분만 파는 물건도 많아요.' }
];
// 동산·차량 종류
const G_TYPES = [
  { key: 'gold', name: '금·귀금속', h: '금·귀금속·골드바', tip: '귀금속은 무게와 순도로 값이 정해져요. 오늘 금 시세 × 무게보다 높게 쓰면 손해예요. 장신구의 세공비는 되팔 때 거의 쳐 주지 않아요.' },
  { key: 'luxury', name: '명품·시계', h: '명품·시계', tip: '감정가가 정품을 보장하지 않고 반품도 안 돼요. 새 제품 가격과 중고 시세를 함께 보고 보수적으로 쓰세요.' },
  { key: 'car', name: '중고차', h: '중고차', tip: '낙찰가 말고도 이전등록비(차량가의 약 7%)와 탁송비가 들어요. 성능점검기록이 없는 경우가 많아 보관 장소에서 직접 확인하는 게 좋아요.' },
  { key: 'bike', name: '오토바이', h: '오토바이', tip: '이륜차는 사용신고(번호판) 이전 절차가 따로 있어요. 보관 상태와 서류를 공고문에서 확인하세요.' },
  { key: 'elec', name: '전자기기', h: '전자기기·노트북·카메라', tip: '작동 여부와 구성품이 확인되지 않는 경우가 많아요. 출시 연도가 오래될수록 중고 값이 빨리 내려가요.' },
  { key: 'living', name: '생활·가구', h: '생활용품·가구', tip: '중고 가구·생활용품은 되팔 때 값이 낮고 운반비가 들어요. 직접 쓸 물건만 최저가 근처에서 노려 보세요.' },
  { key: 'machine', name: '기계·장비', h: '기계·장비', tip: '해체·운반·설치 비용은 낙찰자가 내는 경우가 대부분이에요. 견적을 먼저 받아 보고 그만큼 낮춰 쓰세요.' },
  { key: 'heavy', name: '중장비·선박', h: '중장비·선박', tip: '트레일러·크레인 운반비와 등록 비용이 커요. 면허·자격이 필요한 장비인지도 확인하세요.' }
];

export async function buildCollections({ DIST, SITE, ASSET_V, items, results, updatedAt, esc, won, kdate, SD_SHORT }) {
  const now = Date.now();
  const dir = path.join(DIST, 'c');
  await fs.mkdir(dir, { recursive: true });
  const sdOf = (it) => SD_SHORT(it.sd);
  const ok = (it) => !it.trap && it.min && !(it.rate != null && it.rate < 30);
  const pages = []; // { slug, name, list, res, tip, kind, sd, typeKey, appHref }

  // 부동산: 시도 × 종류, 그리고 전국 종류
  for (const T of RE_TYPES) {
    const all = items.filter((it) => !(it.cat === 'goods' || it.cat === 'car') && T.test(it));
    const allRes = results.filter((r) => !(r.cat === 'goods' || r.cat === 'car') && (T.key === 'apt' ? r.cat === 'home' && /아파트/.test(r.use || '') : T.key === 'house' ? r.cat === 'home' && !/아파트/.test(r.use || '') : r.cat === T.appCat));
    if (all.filter(ok).length >= 5) pages.push({ slug: `all-${T.key}`, name: `전국 ${T.name}`, h1: `전국 ${T.name} 공매`, list: all, res: allRes, tip: T.tip, kind: 're', typeKey: T.key, appHref: `../realestate.html?cat=${T.appCat}` });
    for (const sd of SD_ORDER) {
      const list = all.filter((it) => sdOf(it) === sd);
      if (list.filter(ok).length < 5) continue;
      const label = SD_LABEL[sd] || sd;
      pages.push({ slug: `${SD_SLUG[sd]}-${T.key}`, name: `${label} ${T.name}`, h1: `${label} ${T.name} 공매`, list, res: allRes.filter((r) => SD_SHORT(r.sd) === sd), tip: T.tip, kind: 're', sd, typeKey: T.key,
        appHref: `../realestate.html?cat=${T.appCat}&q=${encodeURIComponent(label.replace('·', ' '))}` });
    }
  }
  // 동산·차량
  for (const T of G_TYPES) {
    const list = items.filter((it) => (it.cat === 'goods' || it.cat === 'car') && it.sub === T.key);
    if (list.filter(ok).length < 3) continue;
    pages.push({ slug: `goods-${T.key}`, name: T.name, h1: `${T.h} 공매`, list, res: results.filter((r) => r.sub === T.key), tip: T.tip, kind: 'goods', typeKey: T.key,
      appHref: `../index.html?cat=${T.key === 'bike' ? 'car' : T.key}` });
  }
  // 특별 모음
  const cheapHome = items.filter((it) => it.cat === 'home' && it.min && it.min <= 1e8);
  if (cheapHome.filter(ok).length >= 5) pages.push({ slug: 'home-under-100m', name: '1억 이하 집', h1: '최저가 1억 이하 아파트·주택 공매', list: cheapHome, res: [], tip: RE_TYPES[1].tip, kind: 're', typeKey: 'cheap', appHref: '../realestate.html?tab=under1' });
  const half = items.filter((it) => !(it.cat === 'goods' || it.cat === 'car') && it.rate != null && it.rate <= 50 && it.rate >= 30);
  if (half.filter(ok).length >= 5) pages.push({ slug: 're-half', name: '반값 이하 부동산', h1: '감정가 반값 이하로 내려온 부동산 공매', list: half, res: [], tip: '여러 번 유찰돼 값이 내려간 물건이에요. 싸진 데는 이유가 있을 수 있으니 유찰 횟수와 공고문 유의사항(임차인, 지분, 건물만·토지만 매각)을 먼저 보세요.', kind: 're', typeKey: 'half', appHref: '../realestate.html?tab=halfre' });

  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const hoursLeft = (it) => (it.en ? (new Date(it.en).getTime() - now) / 3600e3 : 1e9);
  const dday = (it) => { const h = hoursLeft(it); if (h <= 0) return '마감'; if (h < 24) return '오늘·내일 마감'; return `D-${Math.ceil(h / 24)}`; };

  const head = (p, desc) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)} | 경매레이더</title>
<meta name="description" content="${esc(desc)}">
${SITE ? `<link rel="canonical" href="${esc(SITE)}/c/${esc(p.slug)}.html">` : ''}
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE ? esc(SITE) + '/og.png' : '../og.png'}">
<meta name="theme-color" content="#F3EFE7">
<link rel="manifest" href="../manifest.webmanifest">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="../style.css?v=${ASSET_V}">
</head>
<body>
<div class="app">
<div class="topbar">
<a class="icon-btn" href="index.html" aria-label="모아보기 목록"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
<span class="topbar-title">${esc(p.bar || '모아보기')}</span>
<a class="icon-btn" href="../index.html" aria-label="홈으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></a>
</div>`;
  const foot = `<p class="disclaimer">출처: 한국자산관리공사 온비드(공공데이터포털). 데이터 기준 ${esc(kdate(updatedAt))}, 매시간 업데이트. 숫자는 공개 데이터로 자동 계산한 참고 정보이며 투자 권유가 아니에요. 입찰 전 반드시 온비드 원문 공고를 확인하세요.<br><a href="../about.html">사이트 소개·문의</a> · <a href="../terms.html">이용약관·면책</a> · <a href="../privacy.html">개인정보처리방침</a></p>
<nav class="bottom-nav five" aria-label="하단 메뉴">
<a href="../index.html"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>구경</a>
<a href="../realestate.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>부동산</a>
<a href="../index.html?tab=liked"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>관심</a>
<a href="index.html" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>모아보기</a>
<a href="../guide.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6M8 11h6"/></svg>가이드</a>
</nav>
</div>
</body>
</html>`;

  const card = (it) => `<li><a class="cl-item" href="../item/${esc(it.id)}.html">${it.thumb ? `<span class="cl-img"><img src="${esc(it.thumb)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>` : ''}<span class="cl-body"><b>${esc(it.t)}</b><span class="cl-meta">${esc([SD_SHORT(it.sd), it.sgg].filter(Boolean).join(' '))}${it.fails ? ` · 유찰 ${it.fails}회` : ''} · ${esc(dday(it))}</span><span class="cl-price">${won(it.min)}${it.rate && it.rate < 100 ? ` <em>감정가의 ${it.rate}%</em>` : ''}</span></span></a></li>`;

  let written = 0;
  for (const p of pages) {
    const live = p.list.filter((it) => hoursLeft(it) > 0);
    const good = live.filter(ok);
    const rates = good.map((it) => it.rate).filter((r) => r != null && r > 0 && r <= 100);
    const med = median(rates);
    const halfN = good.filter((it) => it.rate != null && it.rate <= 50).length;
    const soonN = good.filter((it) => hoursLeft(it) <= 48).length;
    const minIt = good.reduce((a, b) => (!a || b.min < a.min ? b : a), null);
    const n = live.length;
    const sorted = [...good].sort((a, b) => (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0) || (a.rate ?? 100) - (b.rate ?? 100) || hoursLeft(a) - hoursLeft(b));
    const shown = sorted.slice(0, 60);
    const rr = p.res.filter((r) => r.rate >= 20 && r.rate <= 300);
    const rMed = median(rr.map((r) => r.rate));
    p.title = `${p.h1} 물건 ${n.toLocaleString('ko-KR')}건 (${kdate(updatedAt).split(' ')[0]} 기준)`;
    p.bar = p.name;
    const lede = `지금 온비드에서 입찰 중이거나 곧 시작하는 ${p.name} 공매 물건이 ${n.toLocaleString('ko-KR')}건 있어요.`
      + (med != null ? ` 최저 입찰가는 감정가의 중간값 ${med}% 수준이에요.` : '')
      + (halfN ? ` 감정가 반값 이하로 내려온 물건은 ${halfN}건이에요.` : '')
      + (soonN ? ` 48시간 안에 마감하는 물건은 ${soonN}건이에요.` : '');
    const desc = `${p.h1} 물건 ${n}건을 감정가 대비 싼 순서로 모았어요.${med != null ? ` 최저가는 감정가의 중간 ${med}% 수준.` : ''}${minIt ? ` 가장 낮은 최저가 ${won(minIt.min)}.` : ''} 매시간 업데이트되는 온비드 공매 정보.`;
    // 같은 지역 다른 종류, 같은 종류 다른 지역
    const rel1 = p.sd ? RE_TYPES.filter((T) => T.key !== p.typeKey).map((T) => bySlug.get(`${SD_SLUG[p.sd]}-${T.key}`)).filter(Boolean) : [];
    const rel2 = p.kind === 're' && RE_TYPES.some((T) => T.key === p.typeKey)
      ? SD_ORDER.filter((sd) => sd !== p.sd).map((sd) => bySlug.get(`${SD_SLUG[sd]}-${p.typeKey}`)).filter(Boolean).slice(0, 18)
      : pages.filter((q) => q.kind === p.kind && q.slug !== p.slug && !q.sd).slice(0, 12);
    const relHtml = (arr) => arr.map((q) => `<a class="chip" href="${esc(q.slug)}.html">${esc(q.name)}</a>`).join('');
    // 시군구 분포 (부동산 지역 페이지)
    const sggCount = {};
    if (p.sd) for (const it of live) if (it.sgg) sggCount[it.sgg] = (sggCount[it.sgg] || 0) + 1;
    const sggTop = Object.entries(sggCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '경매레이더', item: SITE ? `${SITE}/` : undefined },
      { '@type': 'ListItem', position: 2, name: '모아보기', item: SITE ? `${SITE}/c/index.html` : undefined },
      { '@type': 'ListItem', position: 3, name: p.h1 }] };
    const html = `${head(p, desc)}
<header class="coll-hero">
<span class="coll-kicker">${esc(kdate(updatedAt))} 기준 · 매시간 업데이트</span>
<h1>${esc(p.h1)}</h1>
<p>${esc(lede)}</p>
<div class="coll-stats">
<div><b>${n.toLocaleString('ko-KR')}<small>건</small></b><span>진행 중</span></div>
<div><b>${med != null ? med + '<small>%</small>' : '-'}</b><span>감정가 대비 중간</span></div>
<div><b>${halfN}<small>건</small></b><span>반값 이하</span></div>
<div><b>${soonN}<small>건</small></b><span>48시간 내 마감</span></div>
</div>
<a class="btn-primary coll-app" href="${esc(p.appHref)}">필터·검색으로 전체 보기</a>
</header>
${shown.length ? `<section class="card-block"><h2>감정가 대비 싼 순서 ${shown.length < good.length ? `(상위 ${shown.length}건)` : ''}</h2><p class="muted small">사진 있는 물건을 먼저, 그다음 감정가 대비 최저가가 낮은 순서예요. 너무 싸서 숨은 조건이 의심되는 물건(감정가 30% 미만 등)은 뺐어요.</p><ol class="cl-list">${shown.map(card).join('')}</ol></section>` : ''}
${rr.length >= 3 ? `<section class="card-block"><h2>최근 2주 실제 낙찰 결과</h2><p>같은 종류${p.sd ? `·같은 지역` : ''} 물건이 최근 2주 동안 ${rr.length}건 낙찰됐고, 낙찰가는 감정가의 중간값 <b>${rMed}%</b>였어요.</p>${rr.slice(0, 5).map((r) => `<div class="result-row"><b>${esc(r.t)}</b><span>감정 ${won(r.appr)} → <strong>${won(r.price)}</strong> · ${r.rate}%${r.bidders ? ` · ${r.bidders}명 경쟁` : ''}</span></div>`).join('')}</section>` : ''}
${sggTop.length > 1 ? `<section class="card-block"><h2>${esc(SD_LABEL[p.sd] || p.sd)} 어디에 많을까</h2><div class="chips">${sggTop.map(([g, c]) => `<span class="chip chip-static">${esc(g)} ${c}건</span>`).join('')}</div></section>` : ''}
<section class="card-block"><h2>${esc(p.name)} 공매, 이것부터 확인하세요</h2><p>${esc(p.tip)}</p><p class="muted small">처음이라면 <a href="../guide.html">공매 초보 가이드</a>에서 가입부터 낙찰 후까지 5단계를 먼저 보세요.</p></section>
${rel1.length ? `<section class="card-block"><h2>${esc(SD_LABEL[p.sd] || p.sd)}의 다른 공매</h2><div class="chips">${relHtml(rel1)}</div></section>` : ''}
${rel2.length ? `<section class="card-block"><h2>${p.sd ? '다른 지역 ' + esc(RE_TYPES.find((T) => T.key === p.typeKey).name) : '다른 종류도 보기'}</h2><div class="chips">${relHtml(rel2)}</div></section>` : ''}
<script type="application/ld+json">${JSON.stringify(crumbs).replace(/</g, '\\u003c')}</script>
${foot}`;
    await fs.writeFile(path.join(dir, `${p.slug}.html`), html);
    p.n = n;
    written++;
  }

  // 모아보기 첫 페이지
  const gPages = pages.filter((p) => p.kind === 'goods');
  const special = pages.filter((p) => p.slug.startsWith('all-') || ['home-under-100m', 're-half'].includes(p.slug));
  const table = SD_ORDER.filter((sd) => RE_TYPES.some((T) => bySlug.has(`${SD_SLUG[sd]}-${T.key}`))).map((sd) => `<tr><th>${esc(SD_LABEL[sd] || sd)}</th>${RE_TYPES.map((T) => { const q = bySlug.get(`${SD_SLUG[sd]}-${T.key}`); return `<td>${q ? `<a href="${esc(q.slug)}.html">${q.n}</a>` : '-'}</td>`; }).join('')}</tr>`).join('');
  const hub = { slug: 'index', title: '지역·종류별 공매 물건 모아보기', bar: '모아보기' };
  const hubDesc = `온비드 공매 물건을 지역(서울·경기·부산 등)과 종류(아파트·토지·상가·중고차·금·명품)별로 모았어요. 매시간 업데이트.`;
  await fs.writeFile(path.join(dir, 'index.html'), `${head(hub, hubDesc)}
<header class="coll-hero">
<span class="coll-kicker">${esc(kdate(updatedAt))} 기준 · 매시간 업데이트</span>
<h1>지역·종류별 모아보기</h1>
<p>보고 싶은 종류를 누르면 지금 입찰 중인 물건을 감정가 대비 싼 순서로 보여드려요.</p>
</header>
${gPages.length ? `<section class="card-block"><h2>동산·차량</h2><div class="chips">${gPages.map((p) => `<a class="chip" href="${esc(p.slug)}.html">${esc(p.name)} ${p.n}</a>`).join('')}</div></section>` : ''}
${special.length ? `<section class="card-block"><h2>전국 부동산</h2><div class="chips">${special.map((p) => `<a class="chip" href="${esc(p.slug)}.html">${esc(p.name)} ${p.n}</a>`).join('')}</div></section>` : ''}
<section class="card-block"><h2>지역별 부동산</h2><p class="muted small">숫자는 진행 중인 물건 수예요. 누르면 그 지역 목록으로 가요.</p>
<div class="coll-table-wrap"><table class="coll-table"><thead><tr><th>지역</th>${RE_TYPES.map((T) => `<th>${esc(T.name)}</th>`).join('')}</tr></thead><tbody>${table}</tbody></table></div></section>
${foot}`);
  written++;

  // 물건 상세에서 모아보기로 가는 링크용
  const collOf = (it) => {
    if (it.cat === 'goods' || it.cat === 'car') { const q = bySlug.get(`goods-${it.sub}`); return q ? { href: `../c/${q.slug}.html`, name: `${q.name} 공매 모아보기` } : null; }
    const T = RE_TYPES.find((x) => x.test(it));
    if (!T) return null;
    const q = bySlug.get(`${SD_SLUG[SD_SHORT(it.sd)]}-${T.key}`) || bySlug.get(`all-${T.key}`);
    return q ? { href: `../c/${q.slug}.html`, name: `${q.name} 공매 모아보기` } : null;
  };
  return { urls: ['c/index.html', ...pages.map((p) => `c/${p.slug}.html`)], count: written, collOf };
}
