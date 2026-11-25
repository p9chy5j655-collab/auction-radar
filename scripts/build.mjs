// 경매레이더 빌드 스크립트
// 온비드·실거래가 공공데이터를 받아 정적 사이트(dist/)를 만듭니다.
// 인증키(DATA_GO_KR_KEY)가 없으면 예시 데이터로 만듭니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleItems, sampleResults } from './sample.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache');

const KEY = (process.env.DATA_GO_KR_KEY || '').trim();
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
// 공공데이터포털 '활용명세'에서 확인한 요청주소예요. 바뀌면 GitHub Variables로 덮어쓸 수 있어요.
// 해당 API를 활용신청하지 않았으면 그 부분만 건너뛰고 나머지는 정상으로 만들어져요.
const B = 'https://apis.data.go.kr/B010003';
const GOODS_URL = (process.env.ONBID_GOODS_URL || `${B}/OnbidMvastListSrvc2/getMvastCltrList2`).trim(); // 동산 물건목록
const CAR_URL = (process.env.ONBID_CAR_URL || `${B}/OnbidCarListSrvc2/getCarCltrList2`).trim();         // 차량 물건목록
const RANK_URL = (process.env.ONBID_RANK_URL || `${B}/OnbidItrsCltrRnkClgSrvc/getItrsCltrRnkClg`).trim();      // 관심물건순위
const RESULT_URL = (process.env.ONBID_RESULT_URL || `${B}/OnbidCltrBidRsltListSrvc2/getCltrBidRsltList2`).trim(); // 입찰결과목록
const NAVER_ID = (process.env.NAVER_CLIENT_ID || '').trim();     // (선택) 네이버 검색 API - 새 제품 최저가
const NAVER_SECRET = (process.env.NAVER_CLIENT_SECRET || '').trim();
const RESULT_TYPES = (process.env.ONBID_RESULT_CLTR_TYPES || '0001').split(',').map((s) => s.trim()).filter(Boolean);

const RLST_URL = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2';
const TRADE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const PROP_CODES = '0007,0010,0005,0002,0008,0003,0006,0011,0013';

// ---------- 공통 ----------
const log = (...a) => console.log('[build]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serviceKey() {
  // 포털의 Encoding 키·Decoding 키 어느 쪽을 넣어도 되게 한 번 풀어 둡니다.
  try { return decodeURIComponent(KEY); } catch { return KEY; }
}

function xmlItems(text) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(text))) {
    const obj = {};
    const fr = /<([A-Za-z0-9_가-힣]+)>([^<]*)<\/\1>/g;
    let f;
    while ((f = fr.exec(m[1]))) obj[f[1]] = f[2].trim();
    out.push(obj);
  }
  return out;
}

function pickHeader(text, json) {
  if (json) {
    const h = json.response?.header || json.header || json.cmmMsgHeader || {};
    return { code: String(h.resultCode ?? h.returnReasonCode ?? ''), msg: String(h.resultMsg ?? h.returnAuthMsg ?? h.errMsg ?? '') };
  }
  const code = (text.match(/<(?:resultCode|returnReasonCode)>([^<]*)</) || [])[1] || '';
  const msg = (text.match(/<(?:resultMsg|returnAuthMsg|errMsg)>([^<]*)</) || [])[1] || '';
  return { code, msg };
}

async function callApi(base, params, { tries = 3 } = {}) {
  const url = new URL(base);
  url.searchParams.set('serviceKey', serviceKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      let json = null;
      if (/^\s*[{[]/.test(text)) { try { json = JSON.parse(text); } catch { /* XML로 처리 */ } }
      const { code, msg } = pickHeader(text, json);
      if (code === '03' || /NODATA/i.test(msg)) return { items: [], total: 0 };
      if (!res.ok || (code && !['00', '0', '000', 'INFO-000'].includes(code))) {
        throw new Error(`API 오류 ${res.status} ${code} ${msg || text.slice(0, 160)}`);
      }
      let items;
      let total = 0;
      if (json) {
        const body = json.response?.body || json.body || {};
        let it = body.items?.item ?? body.items ?? [];
        if (!Array.isArray(it)) it = it && typeof it === 'object' ? [it] : [];
        items = it;
        total = Number(body.totalCount || items.length);
      } else {
        items = xmlItems(text);
        total = Number((text.match(/<totalCount>(\d+)</) || [])[1] || items.length);
      }
      return { items, total };
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

// ---------- 날짜 ----------
function kstNow() { return new Date(Date.now() + 9 * 3600e3); }
function parseKst(s) {
  if (!s) return null;
  const d = String(s).replace(/\D/g, '');
  if (d.length < 8 || d.startsWith('2999')) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10) || '00'}:${d.slice(10, 12) || '00'}:00+09:00`;
  const t = new Date(iso);
  return isNaN(t) ? null : t.toISOString();
}
function num(v) {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && String(v).replace(/[^\d]/g, '') !== '' ? n : null;
}

// ---------- 온비드 정규화 ----------
function categoryOf(r, kind) {
  if (kind === 'goods') return 'goods';
  if (kind === 'car') return 'car';
  const mid = String(r.cltrUsgMclsCtgrId || '');
  if (mid === '10200') return 'home';
  if (mid === '10300') return 'shop';
  if (mid === '10100') return 'land';
  return 'etc';
}

const SD_SHORT = (sd) => String(sd || '').replace(/특별자치시|특별자치도|특별시|광역시/g, '')
  .replace(/^충청북도$/, '충북').replace(/^충청남도$/, '충남').replace(/^전라북도$|^전북$/, '전북').replace(/^전라남도$/, '전남')
  .replace(/^경상북도$/, '경북').replace(/^경상남도$/, '경남').replace(/도$/, '');
// 주소만 있는 물건명을 '부산 서구 아미동2가 대지 281㎡'처럼 읽기 쉬운 이름으로
function friendlyTitle(r, cat, land, bld) {
  const orig = (r.onbidCltrNm || '').replace(/\s+/g, ' ').trim();
  if (cat === 'goods') {
    // 앞에 붙은 보관 장소 주소(예: '경기도 김포시 사우동 941 ')는 빼요
    const t = orig.replace(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)\S*(\s+\S+?(시|군|구|읍|면|동|리|가|로|길))*\s+(산\s*)?\d+(-\d+)?(번지)?\s+/, '').trim();
    return t.length >= 2 ? t : orig;
  }
  if (cat === 'car') {
    // 보관 장소 주소, 차량번호, 차대번호는 빼고 차종·연식만 남겨요
    let t = orig.replace(/^.*?보관(소|서|장)?\s*(보관)?/, '').replace(/\[[^\]]*\]/g, ' ')
      .replace(/\b\d{2,3}\s?[가-힣]\s?\d{4}\b/g, ' ').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, ' ')
      .replace(/[()\/:,]/g, ' ').replace(/연식\s*/g, '').replace(/\b\d{3,4}\s*(배기량|cc|CC)/g, ' ').replace(/\s+/g, ' ').trim();
    const y = (t.match(/(19|20)\d{2}\s*(년식|년)?/) || [])[0];
    if (y) t = `${t.replace(y, ' ').replace(/\s+/g, ' ').trim()} ${y.replace(/\s*(년식|년)$/, '')}년식`;
    return t.length >= 2 ? t : orig;
  }
  const region = [SD_SHORT(r.lctnSdnm), r.lctnSggnm, r.lctnEmdNm].filter(Boolean).join(' ');
  const KIND = { 전: '밭', 답: '논', 대: '대지', 과: '과수원', 목: '목장용지', 잡: '잡종지' };
  const kind0 = r.cltrUsgSclsCtgrNm || r.cltrUsgMclsCtgrNm || '';
  const kind = KIND[kind0] || kind0;
  const area = bld ? bld : land;
  // 원래 이름에 단지명·건물명 같은 고유 이름이 있으면 살려요
  const rest = orig.replace(String(r.lctnSdnm || ''), '').replace(String(r.lctnSggnm || ''), '').replace(String(r.lctnEmdNm || ''), '')
    .replace(/제?\s*[\d\-]+\s*(동|층|호|번지|필지)/g, ' ').replace(/[\d\-,~()]+/g, ' ').replace(/\s+/g, ' ').trim();
  const named = /[가-힣A-Za-z]{2,}/.test(rest) && !/^(대|전|답|임야|도로|잡종지|구거)$/.test(rest) ? rest.split(' ').filter((w) => /[가-힣A-Za-z]{2,}/.test(w) && !/^[가-힣]{1,3}(리|읍|면|동)$/.test(w) && !/^(외|지상|지하|토지|건물)$/.test(w)).slice(0, 2).join(' ') : '';
  const parts = [region, named || kind, area ? `${Math.round(area * 10) / 10}㎡` : ''].filter(Boolean);
  return parts.length >= 2 ? parts.join(' ') : orig;
}

// 동산·차량 세부 분류 (용도 이름 + 물건명 키워드로 판정, 위에서부터 먼저 맞는 것)
function subOf(r, cat) {
  if (cat !== 'goods' && cat !== 'car') return '';
  const use = [r.cltrUsgMclsCtgrNm, r.cltrUsgSclsCtgrNm].filter(Boolean).join(' ');
  const m = `${use} ${r.onbidCltrNm || ''}`;
  if (cat === 'car') return /^(중기|선박|항공)/.test(use) || /굴삭기|포크레인|크레인|지게차|선박|보트|요트/.test(m) ? 'heavy' : 'car';
  if (/^(유가증권|NPL|무형자산|회원권)/.test(use) || /비상장|주식|주권|채권|NPL|특허|상표권|저작권|회원권|출자|지분/.test(m)) return 'right';
  if (/귀금속/.test(use) || /순금|골드바|금괴|은괴|백금|\d+\s*돈\b/.test(m)) return 'gold';
  if (/시계/.test(use) || /롤렉스|까르띠에|에르메스|샤넬|루이비통|구찌|프라다|오메가|명품|가방|보석|다이아/.test(m)) return 'luxury';
  if (/^(중기|선박|항공)/.test(use) || /굴삭기|포크레인|크레인|지게차|선박|보트|요트/.test(m)) return 'heavy';
  if (/^(컴퓨터|전기|통신|가전)/.test(use) || /노트북|컴퓨터|모니터|휴대폰|아이폰|갤럭시|TV|카메라|가전/.test(m)) return 'elec';
  if (/^(기계|측정|실험|의료|산업|공구)/.test(use) || /기계|설비|장비|멸균기|공작|공구/.test(m)) return 'machine';
  if (/가구|생활|사무|집기|비품|의류|잡화|주방|악기/.test(m)) return 'living';
  if (/재고|원자재|원단|자재|농|수산|축산|주류|폐기물|고철/.test(m)) return 'stock';
  return 'goods_etc';
}

function normalize(r, kind) {
  const appr = num(r.apslEvlAmt);
  const min = num(r.lowstBidPrcIndctCont);
  const id = `${r.cltrMngNo}_${r.pbctCdtnNo ?? 0}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const q = new URLSearchParams({
    onbidCltrno: r.onbidCltrno ?? '', onbidPbancNo: r.onbidPbancNo ?? '', pbctNo: r.pbctNo ?? '', pbctCdtnNo: r.pbctCdtnNo ?? ''
  });
  const cat0 = categoryOf(r, kind);
  const sub0 = subOf(r, cat0);
  const land0 = num(r.landSqms), bld0 = num(r.bldSqms);
  return {
    id, key: String(r.cltrMngNo || ''), sub: sub0 || undefined,
    t: friendlyTitle(r, cat0, land0, bld0) || '이름 없는 물건',
    addr: (r.onbidCltrNm || '').trim(),
    sd: r.lctnSdnm || '', sgg: r.lctnSggnm || '', emd: r.lctnEmdNm || '',
    cat: categoryOf(r, kind),
    use: [r.cltrUsgMclsCtgrNm, r.cltrUsgSclsCtgrNm].filter(Boolean).join(' · '),
    appr, min,
    rate: appr && min ? Math.round((min / appr) * 100) : null,
    fails: num(r.usbdNft) || 0,
    st: parseKst(r.cltrBidBgngDt), en: parseKst(r.cltrBidEndDt),
    stat: r.pbctStatNm || '',
    // 온비드 사진은 직접 띄우면 막혀서, 사이트의 /img 통로(functions/img.js)를 거쳐 보여줘요
    // 사진 원본 주소. 빌드 때 받아 사이트에 함께 올리고(downloadThumbs), 받은 것만 thumb로 보여줘요
    src: /^https?:\/\//.test(r.thnlImgUrlAdr || '') ? r.thnlImgUrlAdr : '',
    thumb: '',
    land: num(r.landSqms), bld: num(r.bldSqms),
    prop: r.prptDivNm || '', org: r.orgNm || '', req: r.rqstOrgNm || '',
    evc: r.evcRsbyTrgtCont || '', how: [r.cptnMthodNm, r.bidMthodNm].filter(Boolean).join(' · '),
    pv: r.pvctTrgtYn === 'Y',
    alc: r.alcYn === 'Y',
    mod: parseKst(r.mdfcnDt),
    pnu: String(r.ltnoPnu || r.rdnmPnu || ''),
    url: `https://www.onbid.co.kr/op/cltrpbancinf/cltrdtl/CltrDtlController/mvmnCltrDtl.do?${q}`
  };
}

async function fetchList(base, kind) {
  const out = [];
  for (const pv of ['N', 'Y']) {
    for (let page = 1; page <= 12; page++) {
      const { items, total } = await callApi(base, {
        pageNo: page, numOfRows: 5000, resultType: 'json', prptDivCd: PROP_CODES, pvctTrgtYn: pv, dspsMthodCd: '0001'
      });
      if (page === 1 && pv === 'N' && items[0] && kind !== 're') log(`${kind} 필드: ${Object.keys(items[0]).join(',')}`);
      out.push(...items.map((r) => normalize(r, kind)));
      log(kind, `수의계약=${pv}`, `페이지 ${page}`, `${items.length}건 / 전체 ${total}`);
      if (!items.length || page * 5000 >= total) break;
      await sleep(150);
    }
  }
  return out;
}

// ---------- 실거래가 ----------
function recentMonths(n) {
  const d = kstNow();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function normTrade(r) {
  const price = num(r.dealAmount ?? r['거래금액']);
  return {
    apt: (r.aptNm ?? r['아파트'] ?? '').trim(),
    emd: (r.umdNm ?? r['법정동'] ?? '').trim(),
    area: num(r.excluUseAr ?? r['전용면적']),
    floor: num(r.floor ?? r['층']),
    ymd: `${r.dealYear ?? r['년']}-${String(r.dealMonth ?? r['월']).padStart(2, '0')}-${String(r.dealDay ?? r['일']).padStart(2, '0')}`,
    price: price ? price * 10000 : null,
    cancel: Boolean((r.cdealType ?? r['해제여부'] ?? '').trim())
  };
}

async function loadTrades(lawdCodes) {
  const today = kstNow().toISOString().slice(0, 10).replace(/-/g, '');
  const file = path.join(CACHE, `trades-${today}.json`);
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* 새로 받음 */ }
  const months = recentMonths(3);
  const jobs = [];
  for (const code of lawdCodes) for (const ym of months) if (!cache[`${code}:${ym}`]) jobs.push([code, ym]);
  log(`실거래가: 필요한 호출 ${jobs.length}건 (오늘 캐시 ${Object.keys(cache).length}건)`);
  const MAX_CALLS = Number(process.env.TRADE_MAX_CALLS || 900);
  let i = 0;
  async function worker() {
    while (i < Math.min(jobs.length, MAX_CALLS)) {
      const [code, ym] = jobs[i++];
      try {
        const all = [];
        for (let page = 1; page <= 5; page++) {
          const { items, total } = await callApi(TRADE_URL, { LAWD_CD: code, DEAL_YMD: ym, pageNo: page, numOfRows: 1000 });
          all.push(...items.map(normTrade));
          if (page * 1000 >= total) break;
        }
        cache[`${code}:${ym}`] = all.filter((t) => t.price && !t.cancel);
      } catch (e) {
        log('실거래가 실패', code, ym, e.message);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache));
  return { cache, months };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function attachMarket(items, trades, months) {
  const detail = {};
  for (const it of items) {
    if (it.cat !== 'home' || !it.bld || !it.min || it.pnu.length < 5) continue;
    const code = it.pnu.slice(0, 5);
    const pool = months.flatMap((ym) => trades[`${code}:${ym}`] || []);
    const tol = Math.max(3, it.bld * 0.07);
    const near = pool.filter((t) => t.emd === it.emd && t.area && Math.abs(t.area - it.bld) <= tol);
    if (near.length < 2) continue;
    const med = median(near.map((t) => t.price));
    it.mkt = { med, n: near.length, ratio: Math.round((it.min / med) * 100) };
    detail[it.id] = near.sort((a, b) => b.ymd.localeCompare(a.ymd)).slice(0, 6);
  }
  return detail;
}

// ---------- 관심물건 순위 (온비드에서 일주일간 관심 저장이 많은 물건) ----------
async function fetchRanks() {
  const out = [];
  for (const div of ['부동산', '동산', '자동차']) {
    try {
      const { items } = await callApi(RANK_URL, { pageNo: 1, numOfRows: 20, resultType: 'json', cltrDivNm: div });
      items.forEach((r, i) => {
        const rank = num(r.rnk ?? r.rank ?? r.rnkNo ?? r.cltrRnk) || i + 1;
        if (r.cltrMngNo) out.push({ key: String(r.cltrMngNo), cond: r.pbctCdtnNo, rank, div, raw: r });
      });
      log(`관심순위 ${div}: ${items.length}건`, items[0] ? `필드: ${Object.keys(items[0]).join(',')}` : '');
    } catch (e) { log('관심순위 실패', div, e.message); }
  }
  return out;
}

// ---------- 입찰결과 (최근 낙찰 사례) ----------
function pickPrice(r) {
  // 실제 응답에서 확인한 낙찰가 필드(scfbAmt)를 대소문자 상관없이 먼저 찾아요
  for (const [k, v] of Object.entries(r)) if (k.toLowerCase() === 'scfbamt' && num(v)) return num(v);
  const prefer = ['sbidAmt', 'scsbdAmt', 'scsbidAmt', 'sccsBidAmt', 'sbidPrc', 'scsbdPrc', 'bidAmt', 'sbidBidAmt'];
  for (const k of prefer) if (num(r[k])) return num(r[k]);
  const forced = process.env.ONBID_RESULT_PRICE_FIELD;
  if (forced && num(r[forced])) return num(r[forced]);
  for (const [k, v] of Object.entries(r)) {
    if (/lowst|apsl|frst|rto|rate|ymd|dt$|no$|cd$/i.test(k)) continue;
    if (/(sbid|scsbd|succ|sccs).*(amt|prc)/i.test(k) && num(v)) return num(v);
  }
  return null;
}
function pickBidders(r) {
  // 온비드 입찰결과목록의 유효입찰자수(vldBddrNope). 0명도 유효한 값이라 null로만 걸러요.
  const vld = num(r.vldBddrNope);
  if (vld !== null) return vld;
  for (const [k, v] of Object.entries(r)) if (/(pcpn|prtc|bidr|nmpr|bidPsn|tndr).*(cnt|nft|num)/i.test(k) && num(v) !== null) return num(v);
  return null;
}
// 입찰결과에는 지역 코드가 비어 있어서(lctnSdnm 등 공백) 물건명 앞 주소에서 시도·시군구를 뽑아요.
function regionFromName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  const first = parts[0] || '';
  const shortSido = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(first);
  if (!shortSido && !/(시|도)$/.test(first)) return { sd: '', sgg: '' };
  return { sd: SD_SHORT(first), sgg: /(시|군|구)$/.test(parts[1] || '') ? parts[1] : '' };
}
function ymdKst(offsetDays) {
  const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
async function fetchResults() {
  const out = [];
  for (const type of RESULT_TYPES) {
    try {
      // 입찰결과목록은 최신순이라 3쪽(3,000건)은 하루치뿐이에요. 화면의 "최근 2주" 기준에 맞게 전 페이지를 읽어요(최대 25쪽).
      for (let page = 1; page <= 25; page++) {
        const { items, total } = await callApi(RESULT_URL, {
          pageNo: page, numOfRows: 1000, resultType: 'json', cltrTypeCd: type, prptDivCd: PROP_CODES,
          opbdDtStart: ymdKst(-14), opbdDtEnd: ymdKst(-1)
        });
        if (page === 1 && items[0]) log(`입찰결과 필드: ${Object.keys(items[0]).join(',')}`);
        for (const r of items) {
          // 임대(0002) 결과의 scfbAmt는 매각 낙찰가가 아니라 임대료·보증금이라 낙찰 사례로 쓰지 않아요.
          if (String(r.dspsMthodCd || '') === '0002') continue;
          const price = pickPrice(r);
          const appr = num(r.apslEvlAmt);
          const stat = `${r.pbctStatNm || ''}${r.bidRsltNm || ''}${r.pbctStatCd || ''}`;
          if (!price || !appr || /유찰|취소|0011|0012/.test(stat)) continue;
          const reg = regionFromName(r.onbidCltrNm || r.cltrNm);
          out.push({
            t: (r.onbidCltrNm || r.cltrNm || '').trim(), sd: reg.sd, sgg: reg.sgg,
            cat: categoryOf(r, type === '0001' ? 're' : 'goods'), appr, price,
            rate: Math.round((price / appr) * 100), bidders: pickBidders(r), dt: parseKst(r.opbdDt || r.opbdDtm || r.cltrOpbdDt || '')
          });
        }
        log(`입찰결과 유형${type} 페이지 ${page}: ${items.length}건 / 전체 ${total}`);
        if (!items.length || page * 1000 >= total) break;
      }
    } catch (e) { log('입찰결과 실패', type, e.message); }
  }
  if (RESULT_URL && !out.length) log('입찰결과에서 낙찰가를 찾지 못했어요. 위 필드 목록을 보고 ONBID_RESULT_PRICE_FIELD 변수를 정해 주세요.');
  else log(`입찰결과 낙찰 사례 ${out.length}건 집계 (최근 2주·매각 기준)`);
  return out;
}
function regionRates(results) {
  const g = {};
  for (const r of results) {
    if (!r.sd || r.rate > 300) continue;
    const k = `${r.sd}|${r.cat}`;
    (g[k] = g[k] || []).push(r.rate);
  }
  const out = {};
  for (const [k, arr] of Object.entries(g)) if (arr.length >= 3) out[k] = { med: median(arr), n: arr.length };
  return out;
}

// ---------- 이색 물건: 검색어 · 새 제품 최저가(네이버 쇼핑 API) ----------
// 물건 이름에서 주소·회사명·관리용 단어를 빼고 '브랜드·모델·연식'만 뽑아 검색어를 만들어요
const GENERIC = /^(노트북|컴퓨터|모니터|휴대폰|핸드폰|시계|가방|의류|신발|가구|기계|기계류|설비|공구|사무용품|사무기기|집기|비품|물품|재고|재고품|귀금속|주류|원단|자재|부품|전자제품|가전|가전제품|기타)$/;
function keywordOf(it) {
  let t = it.t;
  if (it.cat === 'car') {
    const y = (t.match(/(19|20)\d{2}(?=년식)/) || [])[0] || '';
    const model = t.replace(/(19|20)\d{2}년식/, ' ').replace(/승용|승합|화물|대형차|중형차|소형차|경차|자동차/g, ' ').replace(/\s+/g, ' ').trim();
    return { kw: [model, y].filter(Boolean).join(' ').slice(0, 30), model, year: y, generic: model.length < 2 };
  }
  t = t.replace(/^.*?보관(소|서|장)?\s*(보관)?/, ' ')
    .replace(/\(주\)\s*\S+|주식회사\s*\S+|㈜\s*\S+/g, ' ')
    .replace(/\(([^)]*)\)/g, ' $1 ').replace(/\[[^\]]*\]/g, ' ')
    .replace(/압류|공매|일괄|매각|동산|외\s*\d+\s*(점|건|개|종)|\d+\s*(점|개|식|대|EA|ea)\b|비품|물품|일체|등\b/g, ' ')
    .replace(/[\/:,·]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = t.split(' ').filter(Boolean);
  const generic = !words.length || words.every((w) => GENERIC.test(w));
  return { kw: t.slice(0, 30), model: t, year: '', generic };
}
async function attachNewPrices(items) {
  const targets = items.filter((it) => it.cat === 'goods' || it.cat === 'car');
  if (!NAVER_ID || !NAVER_SECRET || !targets.length) return;
  const today = kstNow().toISOString().slice(0, 10).replace(/-/g, '');
  const file = path.join(CACHE, `naver-${today}.json`);
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* 새로 받음 */ }
  let calls = 0;
  for (const it of targets) {
    const k = keywordOf(it);
    if (it.cat !== 'goods' || k.generic || !['gold', 'luxury', 'elec', 'living'].includes(it.sub)) continue;
    const kw = k.kw;
    if (!(kw in cache) && calls < 300) {
      calls++;
      try {
        const u = `https://openapi.naver.com/v1/search/shop.json?display=20&sort=sim&query=${encodeURIComponent(kw)}`;
        const res = await fetch(u, { headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET }, signal: AbortSignal.timeout(15000) });
        const j = await res.json();
        // productType 1~3: 일반 상품(새 제품). 중고·단종·판매예정은 뺍니다.
        const prices = (j.items || []).filter((x) => [1, 2, 3].includes(Number(x.productType))).map((x) => num(x.lprice)).filter(Boolean);
        cache[kw] = prices.length >= 3 ? median(prices.sort((a, b) => a - b).slice(0, 5)) : null;
        await sleep(120);
      } catch (e) { log('네이버 쇼핑 실패', kw, e.message); }
    }
    if (cache[kw]) it.newp = cache[kw];
  }
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache));
  log(`네이버 쇼핑 새 제품가: 호출 ${calls}건`);
}

// ---------- 사진: 온비드는 다른 사이트에서 사진을 직접 띄우거나 Cloudflare를 거쳐 받는 걸 막아서,
// 빌드할 때 한 번 받아 사이트에 함께 올려요. 받은 사진은 캐시에 두고 새 물건 사진만 새로 받아요.
function sniffImg(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'webp';
  return null;
}
async function downloadThumbs(list) {
  const dir = path.join(CACHE, 'thumbs');
  await fs.mkdir(dir, { recursive: true });
  const { createHash } = await import('node:crypto');
  const have = new Set(await fs.readdir(dir).catch(() => []));
  const MAX_NEW = Number(process.env.THUMB_MAX_NEW || 1500);
  const jobs = [];
  for (const it of list) {
    if (!it.src) continue;
    const h = createHash('sha1').update(it.src).digest('hex').slice(0, 16);
    const hit = [...['jpg', 'png', 'gif', 'webp']].map((e) => `${h}.${e}`).find((f) => have.has(f));
    if (hit) it._thumbFile = hit; else if (!have.has(`${h}.none`)) jobs.push([it, h]);
  }
  let ok = 0, fail = 0, firstFail = '';
  let i = 0;
  async function worker() {
    while (i < Math.min(jobs.length, MAX_NEW)) {
      const [it, h] = jobs[i++];
      try {
        const res = await fetch(it.src, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'image/*,*/*' }, signal: AbortSignal.timeout(15000) });
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = res.ok && buf.length > 200 ? sniffImg(buf) : null;
        if (!ext || buf.length > 2_000_000) {
          fail++;
          if (!firstFail) firstFail = `상태 ${res.status}, 형식 ${res.headers.get('content-type')}, ${buf.length}바이트`;
          if (res.ok) await fs.writeFile(path.join(dir, `${h}.none`), '');
          continue;
        }
        await fs.writeFile(path.join(dir, `${h}.${ext}`), buf);
        it._thumbFile = `${h}.${ext}`; ok++;
      } catch (e) { fail++; if (!firstFail) firstFail = e.message; }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  log(`사진: 새로 받음 ${ok}장, 실패 ${fail}장, 남은 대기 ${Math.max(0, jobs.length - MAX_NEW)}장${firstFail ? ` (첫 실패: ${firstFail})` : ''}`);
  // 60일 넘게 안 쓰인 사진 캐시는 정리
  const used = new Set(list.map((it) => it._thumbFile).filter(Boolean));
  for (const f of await fs.readdir(dir)) {
    if (used.has(f)) continue;
    const st = await fs.stat(path.join(dir, f));
    if (Date.now() - st.mtimeMs > 60 * 864e5) await fs.rm(path.join(dir, f), { force: true });
  }
}

// ---------- HTML ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function won(v) {
  if (v === null || v === undefined) return '비공개';
  const man = Math.round(v / 10000);
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = man % 10000;
    return `${eok}억${rest ? ' ' + rest.toLocaleString('ko-KR') + '만' : ''}원`;
  }
  return `${man.toLocaleString('ko-KR')}만원`;
}
const CAT_NAME = { home: '아파트·주택', shop: '상가·업무', land: '토지', etc: '기타 부동산', goods: '동산', car: '차량' };
const SUB_NAME = { right: '주식·채권·권리', gold: '귀금속·금', luxury: '명품·시계', elec: '전자제품', machine: '기계·장비', living: '가구·생활', stock: '재고·원자재', goods_etc: '기타 동산', car: '자동차', heavy: '중장비·선박' };
const catName = (it) => SUB_NAME[it.sub] || CAT_NAME[it.cat];
const kdate = (iso) => {
  if (!iso) return '-';
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// '왜 공매에 나왔을까' — 재산 종류별 일반적인 설명 (개별 사연을 지어내지 않아요)
const WHY = [
  [/압류/, '세금을 못 낸 재산', '국세나 지방세를 내지 않아 세무서·지자체가 압류한 재산이에요. 밀린 세금을 받으려고 한국자산관리공사(캠코)가 대신 팔아요.'],
  [/국유/, '나라가 갖고 있던 재산', '정부가 갖고 있지만 쓰지 않는 재산을 파는 거예요. 국가 재산이라 권리관계가 비교적 단순한 편이에요.'],
  [/공유/, '지자체가 갖고 있던 재산', '시·군·구 같은 지방자치단체가 쓰지 않는 재산을 파는 거예요.'],
  [/수탁/, '다른 기관이 판매를 맡긴 재산', '금융회사나 공공기관이 캠코에 판매를 맡긴 재산이에요. 맡긴 기관의 조건이 공고문에 따로 있을 수 있어요.'],
  [/금융|담보/, '대출 담보였던 재산', '대출을 갚지 못해 금융회사가 담보로 잡았던 재산을 파는 거예요.'],
  [/파산/, '파산한 회사·사람의 재산', '파산 절차에서 빚을 나눠 갚으려고 파는 재산이에요.'],
  [/유입|공공개발/, '공공기관이 정리하는 재산', '공공기관이 사들였거나 넘겨받은 재산을 다시 파는 거예요.'],
  [/기타|일반/, '공공기관이 파는 재산', '공공기관이 온비드를 통해 직접 파는 재산이에요. 기관마다 조건이 달라 공고문을 꼭 봐야 해요.']
];
function whyCard(it) {
  const hit = WHY.find(([re]) => re.test(it.prop || ''));
  if (!hit) return '';
  return `<div class="why"><span class="why-label">왜 공매에 나왔을까?</span><b>${esc(hit[1])}</b><p>${esc(hit[2])}</p></div>`;
}

function plainSummary(it) {
  const parts = [];
  if (it.appr && it.min) parts.push(`감정가보다 ${won(it.appr - it.min)} 싸게 시작해요`);
  if (it.fails) parts.push(`지금까지 ${it.fails}번 팔리지 않았어요`);
  if (it.mkt) parts.push(`주변 실거래 중간값의 ${it.mkt.ratio}% 수준이에요`);
  return parts.length ? `한 줄 요약: ${parts.join(', ')}.` : '';
}

function reportPage(items, results, demo, updatedAt) {
  const d = new Date(Date.now() + 9 * 3600e3);
  const week = `${d.getUTCMonth() + 1}월 ${Math.ceil(d.getUTCDate() / 7)}주차`;
  const clean = items.filter((it) => it.min && it.rate && !risksOf(it).some(([h]) => /공유지분|비공개|주의 단어|비정상/.test(h)));
  const half = clean.filter((it) => ['home', 'shop', 'land'].includes(it.cat)).sort((a, b) => a.rate - b.rate).slice(0, 5);
  const cheap = clean.filter((it) => it.mkt).sort((a, b) => a.mkt.ratio - b.mkt.ratio).slice(0, 3);
  const ODD_SUBS = ['luxury', 'gold', 'elec', 'living', 'car', 'heavy'];
  const odd = clean.filter((it) => ODD_SUBS.includes(it.sub) && it.rate >= 30).sort((a, b) => (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0) || a.rate - b.rate).slice(0, 5);
  const line = (it, i) => `${i + 1}. ${it.t} — 최저 ${won(it.min)} (감정가의 ${it.rate}%, 유찰 ${it.fails}회, 마감 ${kdate(it.en)})`;
  const block = (title, list, extra) => list.length ? `<section class="card-block"><h2>${esc(title)}</h2><ol class="rank-list">${list.map((it) => `<li><a href="item/${esc(it.id)}.html"><b>${esc(it.t)}</b><span>${esc([it.sd, it.sgg].filter(Boolean).join(' '))} · 유찰 ${it.fails}회 · 마감 ${esc(kdate(it.en))}</span><span class="rl-price">최저 ${won(it.min)} <em>${extra(it)}</em></span></a></li>`).join('')}</ol></section>` : '';
  const text = [
    `[경매레이더] ${week} 반값 공매 리포트`,
    ...(odd.length ? ['', '■ 이번 주 가장 신기한 공매 물건', ...odd.map(line)] : []),
    '', '■ 감정가 대비 가장 싼 부동산 TOP 5', ...half.map(line),
    ...(cheap.length ? ['', '■ 주변 시세보다 싼 아파트·주택', ...cheap.map((it, i) => `${line(it, i)} · 시세의 ${it.mkt.ratio}%`)] : []),
    '', `데이터: 한국자산관리공사 온비드(${kdate(updatedAt)} 기준). 입찰 전 온비드 원문 공고를 꼭 확인하세요.`,
    SITE ? `자세히 보기: ${SITE}/report.html` : ''
  ].join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(week)} 반값 공매 리포트 | 경매레이더</title>
<meta name="description" content="${esc(`${week} 온비드 공매 중 감정가 대비 가장 싼 부동산 TOP 5, 시세보다 싼 아파트, 이색 공매 물건을 정리했어요.`)}">
${SITE ? `<link rel="canonical" href="${esc(SITE)}/report.html">` : ''}
<meta property="og:title" content="${esc(week)} 반값 공매 리포트">
<meta property="og:image" content="${SITE ? esc(SITE) + '/og.png' : 'og.png'}">
<meta name="theme-color" content="#16181D">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="app">
<div class="topbar">
<a class="icon-btn" href="index.html" aria-label="홈으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
<span class="topbar-title">주간 리포트</span>
<span style="width:44px"></span>
</div>
${demo ? '<div class="demo-bar">예시 데이터로 만든 리포트예요.</div>' : ''}
<header class="report-hero"><span>${esc(week)} · ${esc(kdate(updatedAt))} 기준</span><h1>이번 주<br>신기한 공매·반값 리포트</h1><p>온비드에 올라온 공매 물건 ${items.length.toLocaleString('ko-KR')}건 중 감정가 대비 싼 물건을 자동으로 골랐어요. 공유지분·최저가 비공개·감정가 30% 미만 물건은 뺐어요.</p></header>
${block('이번 주 가장 신기한 공매 물건', odd, (it) => `감정가의 ${it.rate}%`)}
${block('감정가 대비 가장 싼 부동산 TOP 5', half, (it) => `감정가의 ${it.rate}%`)}
${block('주변 시세보다 싼 아파트·주택', cheap, (it) => `시세의 ${it.mkt.ratio}%`)}
${results.length ? `<section class="card-block"><h2>최근 이렇게 낙찰됐어요</h2>${results.slice(0, 5).map((r) => `<div class="result-row"><b>${esc(r.t)}</b><span>감정 ${won(r.appr)} → <strong>${won(r.price)}</strong> · ${r.rate}%${r.bidders ? ` · ${r.bidders}명 경쟁` : ''}</span></div>`).join('')}</section>` : ''}
<section class="card-block">
<h2>블로그·카톡에 공유하기</h2>
<p class="muted small">아래 내용을 그대로 복사해 붙여넣을 수 있어요.</p>
<textarea id="copyText" class="copy-box" readonly>${esc(text)}</textarea>
<button class="btn-primary" id="copyBtn" type="button">내용 복사하기</button>
</section>
<p class="disclaimer">출처: 한국자산관리공사 온비드(공공데이터포털). 순위는 공개 데이터로 자동 계산한 참고 정보이며 투자 권유가 아니에요. 입찰 전 반드시 온비드 원문 공고를 확인하세요.<br><a href="terms.html">이용약관·면책</a></p>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
{
  const b = document.getElementById('copyBtn'), t = document.getElementById('copyText'), toast = document.getElementById('toast');
  b.addEventListener('click', () => {
    const done = () => { toast.textContent = '복사했어요. 블로그나 카톡에 붙여넣어 보세요.'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); };
    if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, () => { t.select(); });
    else { t.select(); }
  });
}
</script>
</body>
</html>`;
}

export function risksOf(it) {
  const r = [];
  if (it.sub === 'right') {
    const npl = /NPL|채권|대출/.test(it.t + it.use);
    r.push(['현금으로 바꾸기 어려운 권리 물건', npl
      ? '물건을 직접 갖는 게 아니라 돈을 받을 권리(채권)를 사는 거예요. 실제로 얼마를 회수할 수 있는지 따져야 해서 초보자에게는 권하지 않아요.'
      : '비상장주식·특허·회원권 같은 권리는 사고팔 곳이 거의 없어 현금으로 바꾸기 어렵고, 가치를 직접 따져야 해요. 초보자에게는 권하지 않아요.']);
  }
  if (it.sub === 'machine' || it.sub === 'heavy') r.push(['운반·설치 비용이 따로 들어요', '기계·장비는 옮기고 설치하는 비용, 면허나 등록이 필요할 수 있어요. 공고문의 보관 장소와 인도 조건을 확인하세요.']);
  if (it.sub === 'stock') r.push(['수량이 많은 재고·원자재예요', '한꺼번에 파는 경우가 많아 개인이 쓰기 어렵고, 보관·운반 비용이 들어요.']);
  if (it.alc) r.push(['공유지분 물건', '전체가 아니라 일부 지분만 팔아요. 다른 공유자가 있어 사용·처분이 어려울 수 있어요.']);
  if (/매수인|낙찰자|매수자/.test(it.evc || '') && ['home', 'shop', 'etc'].includes(it.cat)) r.push(['명도 책임이 낙찰자에게 있어요', '공매 물건은 대부분 그래요. 살고 있는 사람이 있으면 내보내는 일(명도)을 직접 해야 하니 비용과 시간을 계산에 넣으세요.']);
  if (it.fails >= 4) r.push([`유찰 ${it.fails}회`, '여러 번 팔리지 않은 이유가 있을 수 있어요. 권리관계·현장 상태를 꼭 확인하세요.']);
  if (/지분|토지만|건물만|제시외/.test(it.t)) r.push(['물건명에 주의 단어', '지분·토지만·건물만·제시외 같은 표현이 있어요. 공고문에서 범위를 확인하세요.']);
  if (it.rate != null && it.rate < 30) r.push(['가격이 비정상적으로 낮아요', `감정가의 ${it.rate}%예요. 이렇게 싼 물건은 낙찰자가 떠안는 임차인 보증금, 일부 지분만 파는 경우, 건물만 또는 토지만 파는 경우처럼 숨은 조건이 있는 경우가 많아요. 공고문 유의사항을 꼭 확인하세요.`]);
  if (it.min === null) r.push(['최저가 비공개', '최저 입찰가가 공개되지 않은 물건이에요.']);
  if ((it.cat === 'home') && !it.mkt) r.push(['시세 비교 없음', '주변 실거래 자료를 찾지 못했어요. 시세를 직접 확인하세요.']);
  return r;
}

function itemPage(it, trades, similar, demo, updatedAt) {
  const risks = risksOf(it);
  const region = [it.sd, it.sgg, it.emd].filter(Boolean).join(' ');
  const title = `${it.t} 공매 · 최저 ${won(it.min)}${it.rate ? ` (감정가의 ${it.rate}%)` : ''}`;
  const desc = `${region} ${CAT_NAME[it.cat]} 공매 물건. 감정가 ${won(it.appr)}, 최저입찰가 ${won(it.min)}, 유찰 ${it.fails}회, 입찰 마감 ${kdate(it.en)}.`;
  const canonical = SITE ? `${SITE}/item/${it.id}.html` : '';
  const rows = [
    ['재산 종류', it.prop], ['용도', it.use], ['소재지', region],
    ['토지 면적', it.land ? `${it.land.toLocaleString('ko-KR')}㎡ (약 ${Math.round(it.land / 3.3058)}평)` : ''],
    ['건물 면적', it.bld ? `${it.bld.toLocaleString('ko-KR')}㎡ (약 ${Math.round(it.bld / 3.3058)}평)` : ''],
    ['입찰 방식', it.how], ['집행기관', it.org], ['명도 책임', it.evc], ['진행 상태', it.stat]
  ].filter((r) => r[1]);
  const tradeRows = trades.map((t) => `<tr><td>${esc(t.ymd.slice(2).replace(/-/g, '.'))}</td><td>${esc(t.apt)}</td><td>${t.area}㎡ · ${t.floor ?? '-'}층</td><td class="num">${won(t.price)}</td></tr>`).join('');
  const simCards = similar.map((s) => `<a class="mini" href="${esc(s.id)}.html"><span class="mini-rate">${s.rate ? `감정가의 ${s.rate}%` : esc(CAT_NAME[s.cat])}</span><span class="mini-title">${esc(s.t)}</span><span class="mini-region">${esc([s.sgg, s.emd].join(' '))}</span><span class="mini-price">${won(s.min)}</span></a>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} | 경매레이더</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(it.thumb ? (SITE + it.thumb) : (SITE ? SITE + '/og.png' : '../og.png'))}">
<meta name="theme-color" content="#16181D">
<link rel="manifest" href="../manifest.webmanifest">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icon-192.png">
<link rel="stylesheet" href="../style.css">
</head>
<body>
<div class="app">
<div class="topbar">
<a class="icon-btn" href="../index.html" aria-label="목록으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
<span class="topbar-title">물건 상세</span>
<span class="topbar-actions">
<button class="icon-btn" id="share" aria-label="공유하기"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button>
<button class="icon-btn like-btn" id="like" aria-label="관심 등록" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
</span>
</div>
${demo ? '<div class="demo-bar">지금 보이는 물건은 예시 데이터예요. 인증키를 넣으면 실제 공매 물건으로 바뀌어요.</div>' : ''}
<div class="photo ${it.thumb ? '' : 'photo-empty'}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="${esc(it.t)} 사진" onerror="this.parentNode.className='photo photo-empty';this.outerHTML='<span>사진을 불러오지 못했어요. 온비드 원문에서 확인해 주세요.</span>'">` : `<span>사진이 없는 물건이에요</span>`}</div>

<section class="card-block">
<div class="badges">
<span class="badge">${esc(catName(it))}</span>
${it.prop ? `<span class="badge">${esc(it.prop)} 공매</span>` : ''}
${it.pv ? '<span class="badge badge-blue">수의계약 가능</span>' : ''}
${it.rank ? `<span class="badge badge-hot">온비드 관심 ${it.rank}위</span>` : ''}
<span class="badge badge-red" data-dday="${esc(it.en || '')}">마감 -</span>
</div>
<h1 class="item-title">${esc(it.t)}</h1>
<p class="muted">${esc(it.addr && it.addr !== it.t ? it.addr : region)} · 유찰 ${it.fails}회${it.st && new Date(it.st).getTime() > Date.now() ? ` · 입찰 시작 ${esc(kdate(it.st))}` : ''}</p>
<div class="price-box">
<div class="price-main">
<div><span class="muted small">최저 입찰가</span><strong class="price-big">${won(it.min)}</strong></div>
${it.rate ? `<span class="rate-pill ${it.rate <= 50 ? 'hot' : ''}">감정가의 ${it.rate}%</span>` : ''}
</div>
<div class="grid2">
<div><span class="muted small">감정가</span><b>${won(it.appr)}</b></div>
<div><span class="muted small">감정가보다</span><b class="orange">${it.appr && it.min ? won(it.appr - it.min) + ' 낮음' : '-'}</b></div>
<div><span class="muted small">입찰 기간</span><b>${kdate(it.st)} ~ ${kdate(it.en)}</b></div>
<div><span class="muted small">마감까지</span><b class="red" id="countdown">-</b></div>
</div>
</div>
<p class="plain">${esc(plainSummary(it))}</p>
${whyCard(it)}
<details class="glossary"><summary>이 말이 무슨 뜻이에요?</summary>
<dl>
<div><dt>감정가</dt><dd>전문 감정평가사가 매긴 물건의 값이에요. 시세와 다를 수 있어요.</dd></div>
<div><dt>최저 입찰가</dt><dd>이번 회차에 입찰할 수 있는 가장 낮은 금액이에요. 이보다 낮게 쓰면 무효예요.</dd></div>
<div><dt>유찰</dt><dd>아무도 입찰하지 않아 팔리지 않은 거예요. 유찰될 때마다 최저 입찰가가 내려가요.</dd></div>
<div><dt>명도</dt><dd>낙찰 뒤 살고 있는 사람을 내보내고 집을 넘겨받는 일이에요.</dd></div>
<div><dt>수의계약</dt><dd>입찰 없이 정해진 가격에 바로 계약할 수 있는 상태예요.</dd></div>
</dl></details>
</section>

<div class="helper-head"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/></svg><div><b>낙찰 도우미</b><span>시세·위험·최대 입찰가를 한 번에 따져 봐요</span></div></div>

${it.rr && it.appr ? `<section class="card-block">
<h2>얼마에 낙찰될까?</h2>
<p class="muted small">최근 2주 ${esc(it.sd)} ${esc(CAT_NAME[it.cat])} 공매 ${it.rr.n}건은 감정가의 <b>${it.rr.med}%</b>(중간값)에 낙찰됐어요.</p>
<div class="compare">
<div><span class="muted small">이 비율이면</span><b>${won(it.appr * it.rr.med / 100)}</b></div>
<div><span class="muted small">최저가보다</span><b class="${it.min && it.appr * it.rr.med / 100 > it.min ? 'orange' : ''}">${it.min ? (it.appr * it.rr.med / 100 >= it.min ? won(it.appr * it.rr.med / 100 - it.min) + ' 높음' : '낮음') : '-'}</b></div>
</div>
<p class="note">같은 지역·종류의 최근 낙찰 결과 중간값이에요. 물건마다 사정이 달라 실제 낙찰가는 크게 다를 수 있어요.</p>
</section>` : ''}

${it.mkt ? `<section class="card-block">
<h2>주변 시세와 비교</h2>
<p class="muted small">${esc(it.emd)} 비슷한 면적(${it.bld}㎡ 안팎) 아파트의 최근 3개월 실거래 ${it.mkt.n}건 기준이에요.</p>
<div class="compare">
<div><span class="muted small">실거래 중간값</span><b>${won(it.mkt.med)}</b></div>
<div><span class="muted small">최저 입찰가는</span><b class="${it.mkt.ratio <= 80 ? 'orange' : ''}">시세의 ${it.mkt.ratio}%</b></div>
</div>
<table class="trades"><thead><tr><th>거래일</th><th>단지</th><th>면적·층</th><th class="num">거래가</th></tr></thead><tbody>${tradeRows}</tbody></table>
<p class="note">공매 물건과 같은 단지라는 보장은 없어요. 면적 기준(전용·공급)이 다를 수 있으니 참고만 하세요.</p>
</section>` : ''}

${(it.cat === 'goods' || it.cat === 'car') && !['right', 'stock'].includes(it.sub) ? (() => {
  const k = keywordOf(it);
  const isCar = it.cat === 'car';
  const usedQ = encodeURIComponent(isCar ? `${k.model} ${k.year ? k.year + '년식 ' : ''}중고차 시세` : `${k.kw} 중고 시세`);
  const newQ = encodeURIComponent(k.kw);
  return `<section class="card-block">
<h2>시장에선 얼마일까?</h2>
${!k.generic ? `<p class="muted small">물건 이름에서 자동으로 뽑은 검색어: <b>${esc(isCar ? `${k.model}${k.year ? ' · ' + k.year + '년식' : ''}` : k.kw)}</b></p>` : ''}
${it.newp && !isCar && !k.generic ? `<div class="compare"><div><span class="muted small">새 제품 가격(네이버 쇼핑)</span><b>${won(it.newp)}</b></div><div><span class="muted small">공매 최저가는</span><b class="orange">새 제품의 ${Math.round((it.min || 0) / it.newp * 100)}%</b></div></div>
<p class="note">같은 검색어로 찾은 새 상품 최저가 5개의 중간값이에요. 세부 모델·상태가 다를 수 있어요.</p>` : ''}
${k.generic ? `<p class="plain">이 물건은 공고에 브랜드·모델명이 없어 시세를 자동으로 찾기 어려워요. 온비드 원문의 사진과 상세 설명에서 모델명을 확인한 뒤 검색해 보세요.</p>` : `<p class="muted small">${isCar ? '같은 차종·연식의 중고차 시세를' : '비슷한 제품의 중고 시세를'} 아래 버튼으로 바로 확인할 수 있어요.</p>
<div class="link-row">
<a class="btn-outline" href="https://search.naver.com/search.naver?query=${usedQ}" target="_blank" rel="noopener">${isCar ? '중고차 시세 보기' : '중고 시세 보기'}</a>
${isCar ? '' : `<a class="btn-outline" href="https://search.shopping.naver.com/search/all?query=${newQ}" target="_blank" rel="noopener">새 제품 가격 보기</a>`}
</div>`}
<p class="note">외부 사이트로 이동해요. 경매레이더는 중고거래 사이트의 정보를 수집하지 않아요.</p>
</section>`;
})() : ''}

<section class="card-block">
<h2>위험 신호</h2>
${risks.length ? `<ul class="risks">${risks.map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('')}</ul>` : '<p class="ok-line">데이터상 눈에 띄는 위험 신호는 없어요. 그래도 공고문과 등기부는 꼭 확인하세요.</p>'}
</section>

<section class="card-block" id="maxbid">
<h2>얼마까지 써도 될까?</h2>
<p class="muted small">팔 때 예상 가격에서 비용과 원하는 이익을 빼고, 손해 보지 않는 최대 입찰가를 거꾸로 계산해요.</p>
<div class="form-grid">
<label>예상 매도가(시세)<span class="input-row sm"><input id="mbSell" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></span></label>
<label>원하는 이익<span class="input-row sm"><input id="mbProfit" type="number" inputmode="decimal" min="0" max="50" step="1"><span>%</span></span></label>
<label>취득세 등 세금<span class="input-row sm"><input id="mbTax" type="number" inputmode="decimal" min="0" max="15" step="0.1"><span>%</span></span></label>
<label>등기·법무비<span class="input-row sm"><input id="mbFee" type="number" inputmode="decimal" min="0" max="5" step="0.1"><span>%</span></span></label>
<label>수리비<span class="input-row sm"><input id="mbRepair" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></span></label>
<label>명도·이사비<span class="input-row sm"><input id="mbEvict" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></span></label>
</div>
<div class="maxbid-result" id="mbResult"></div>
<p class="note">세율은 물건 종류·보유 주택 수·지역에 따라 달라져요. 기본값은 대략적인 출발점일 뿐이니 본인 상황에 맞게 바꾸세요. 세금은 세무사, 권리관계는 법무사 확인을 권해요.</p>
</section>

<section class="card-block">
<h2>내 입찰가로 계산해 보기</h2>
<label class="input-row" for="bid"><input id="bid" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></label>
<div class="chips" id="quick"></div>
<div class="verdict" id="verdict"></div>
<div class="grid2 stat-grid">
<div class="stat"><span class="muted small">감정가 대비</span><b id="vsAppr">-</b></div>
<div class="stat"><span class="muted small">${it.mkt ? '시세 대비' : '입찰보증금(10%)'}</span><b id="${it.mkt ? 'vsMkt' : 'deposit'}">-</b></div>
${it.mkt ? '<div class="stat"><span class="muted small">입찰보증금(10%)</span><b id="deposit">-</b></div>' : ''}
</div>
<p class="note">보증금은 압류재산 공매 기준(입찰가의 10%)으로 계산했어요. 공고마다 다를 수 있으니 원문을 꼭 확인하세요.</p>
</section>

<section class="card-block">
<h2>물건 정보</h2>
<dl class="info">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
</section>

<section class="card-block">
<div class="row-between"><h2>입찰 준비 도우미</h2><span class="accent small" id="checkCount">0 / 0</span></div>
<p class="muted small">단계마다 바로 가는 버튼을 눌러 확인하고, 끝낸 단계는 체크해 두세요. 이 기기에 저장돼요.</p>
<div class="prep" id="checks"></div>
</section>

${similar.length ? `<section class="card-block no-pad-x"><h2 class="pad-x">비슷한 물건</h2><div class="scroller">${simCards}</div></section>` : ''}

<p class="disclaimer">출처: 한국자산관리공사 온비드, 국토교통부 실거래가 공개시스템(공공데이터포털). 데이터 기준 ${esc(kdate(updatedAt))}. 정보에 오류가 있을 수 있으니 입찰 전 반드시 온비드 원문 공고를 확인하세요. 계산 결과는 참고용이며 낙찰이나 수익을 보장하지 않아요.<br><a href="../terms.html">이용약관·면책</a> · <a href="../privacy.html">개인정보처리방침</a></p>

<div class="bottom-bar">
<button class="btn-outline" id="like2">관심 등록</button>
<a class="btn-primary" href="${esc(it.url)}" target="_blank" rel="noopener">온비드 원문 보기</a>
</div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script type="application/json" id="item-data">${JSON.stringify({ id: it.id, t: it.t, cat: it.cat, sub: it.sub || '', appr: it.appr, min: it.min, st: it.st, en: it.en, mkt: it.mkt || null, addr: it.addr || [it.sd, it.sgg, it.emd].filter(Boolean).join(' '), url: it.url }).replace(/</g, '\\u003c')}</script>
<script src="../item.js" defer></script>
</body>
</html>`;
}

// ---------- 메인 ----------
async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

async function main() {
  const demo = !KEY;
  let items;
  if (demo) {
    log('인증키가 없어 예시 데이터로 만듭니다.');
    items = sampleItems();
  } else {
    items = await fetchList(RLST_URL, 're');
    if (GOODS_URL) { try { items.push(...(await fetchList(GOODS_URL, 'goods'))); } catch (e) { log('동산 목록 실패', e.message); } }
    if (CAR_URL) { try { items.push(...(await fetchList(CAR_URL, 'car'))); } catch (e) { log('차량 목록 실패', e.message); } }
  }

  // 지금 입찰 가능한 물건만 (마감 지난 것 제외)
  const now = Date.now();
  const seen = new Set();
  items = items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    if (it.en && new Date(it.en).getTime() < now) return false;
    return !/마감|낙찰|유찰|취소/.test(it.stat) || it.pv;
  });
  if (!demo && items.length === 0) throw new Error('API에서 받은 물건이 0건이에요. 이전 배포를 유지하기 위해 중단합니다.');
  if (process.env.SHOW_PHOTOS === '0') for (const it of items) it.src = '';
  const recent = (iso) => iso && now - new Date(iso).getTime() < 48 * 3600e3 && new Date(iso).getTime() <= now;
  for (const it of items) if (it.isNew === undefined) it.isNew = Boolean(recent(it.st) || recent(it.mod));
  // 입찰 마감이 가까운 물건만 (기본 45일). 너무 먼 물건과 파일 수 한도(Cloudflare 2만 개)를 함께 관리해요.
  const WINDOW = Number(process.env.WINDOW_DAYS || 45) * 864e5;
  const PAGE_MAX = Number(process.env.PAGE_MAX || 15000);
  if (!demo) {
    items = items.filter((it) => it.pv || !it.en || new Date(it.en).getTime() - now <= WINDOW);
    if (items.length > PAGE_MAX) items = items.sort((a, b) => (a.en || '9').localeCompare(b.en || '9')).slice(0, PAGE_MAX);
  }
  log(`정리된 물건 ${items.length}건`);

  if (!demo) await attachNewPrices(items);
  else for (const it of items) if (it.t.includes('롤렉스')) it.newp = 15900000;
  let tradeDetail = {};
  if (!demo && process.env.SKIP_TRADES !== '1') {
    const codes = [...new Set(items.filter((it) => it.cat === 'home' && it.pnu.length >= 5).map((it) => it.pnu.slice(0, 5)))];
    try {
      const { cache, months } = await loadTrades(codes);
      tradeDetail = attachMarket(items, cache, months);
    } catch (e) { log('실거래가 단계 건너뜀', e.message); }
  } else if (demo) {
    for (const it of items) if (it.demoTrades) { tradeDetail[it.id] = it.demoTrades; delete it.demoTrades; }
  }

  // 온비드 관심순위·최근 낙찰 결과
  let results = [];
  if (demo) {
    [[0, 1], [3, 2], [10, 3], [14, 4], [7, 5]].forEach(([i, r]) => { if (items[i]) items[i].rank = r; });
    results = sampleResults();
  } else {
    if (RANK_URL) {
      const ranks = await fetchRanks();
      for (const rk of ranks) {
        const hit = items.find((it) => it.key === rk.key && (rk.cond == null || it.id.endsWith(`_${rk.cond}`))) || items.find((it) => it.key === rk.key);
        if (hit && (!hit.rank || rk.rank < hit.rank)) hit.rank = rk.rank;
      }
    }
    if (RESULT_URL) results = await fetchResults();
  }
  const rates = regionRates(results);
  for (const it of items) {
    // 물건목록의 시도는 '경기도'처럼 원형이고 입찰결과는 물건명에서 뽑아 '경기'처럼 줄여 쓰므로 양쪽을 같은 기준으로 맞춰요.
    const rr = rates[`${SD_SHORT(it.sd)}|${it.cat}`];
    if (rr) it.rr = rr;
  }
  results.sort((a, b) => (b.dt || '').localeCompare(a.dt || '') || b.price - a.price);

  const updatedAt = new Date().toISOString();
  await fs.rm(DIST, { recursive: true, force: true });
  await copyDir(path.join(ROOT, 'static'), DIST);
  await fs.mkdir(path.join(DIST, 'data'), { recursive: true });
  await fs.mkdir(path.join(DIST, 'item'), { recursive: true });

  const LIST_MAX = Number(process.env.LIST_MAX || 2500);
  const prio = (it) => (it.cat === 'home' ? 3 : it.cat === 'shop' ? 1.5 : it.cat === 'goods' || it.cat === 'car' ? 2 : 0)
    + (it.rate != null && it.rate >= 30 ? (100 - it.rate) / 12 : 0) + (it.mkt && it.mkt.ratio >= 40 ? 3 : 0) + (it.rank ? 10 : 0) + (it.isNew ? 1 : 0)
    + (it.en && new Date(it.en).getTime() - now < 3 * 864e5 ? 2 : 0) + (/서울|경기/.test(it.sd) ? 1.5 : 0);
  const listed = items.length > LIST_MAX ? [...items].sort((a, b) => prio(b) - prio(a)).slice(0, LIST_MAX) : items;
  // 목록에 보이는 물건의 사진만 받아요 (파일 수·용량 관리)
  if (!demo) {
    await downloadThumbs(listed);
    await fs.mkdir(path.join(DIST, 't'), { recursive: true });
    for (const it of listed) {
      if (!it._thumbFile) continue;
      await fs.copyFile(path.join(CACHE, 'thumbs', it._thumbFile), path.join(DIST, 't', it._thumbFile));
      it.thumb = `/t/${it._thumbFile}`;
    }
  }
  const slim = listed.map((it) => {
    const { pnu, evc, how, org, req, land, bld, url, prop, alc, key, addr, mod, stat, src, _thumbFile, ...rest } = it;
    return { ...rest, risk: risksOf(it).filter(([h]) => h !== '시세 비교 없음' && !h.startsWith('명도')).length };
  });
  const recentResults = results.filter((r) => r.cat !== 'goods' || r.t).slice(0, 12);
  await fs.writeFile(path.join(DIST, 'data', 'items.json'), JSON.stringify({
    updatedAt, demo, hasGoods: items.some((i) => i.cat === 'goods'), hasCar: items.some((i) => i.cat === 'car'),
    hasRank: items.some((i) => i.rank), total: items.length, results: recentResults, items: slim
  }));
  await fs.writeFile(path.join(DIST, 'report.html'), reportPage(items, recentResults, demo, updatedAt));

  for (const it of items) {
    const similar = items.filter((s) => s.id !== it.id && s.cat === it.cat && s.sgg === it.sgg).slice(0, 4);
    if (similar.length < 2) similar.push(...items.filter((s) => s.id !== it.id && s.cat === it.cat && s.sd === it.sd && !similar.includes(s)).slice(0, 4 - similar.length));
    await fs.writeFile(path.join(DIST, 'item', `${it.id}.html`), itemPage(it, tradeDetail[it.id] || [], similar, demo, updatedAt));
  }

  if (SITE) {
    const urls = [`${SITE}/`, `${SITE}/report.html`, `${SITE}/guide.html`, `${SITE}/terms.html`, ...items.map((it) => `${SITE}/item/${it.id}.html`)];
    await fs.writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
    await fs.writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  } else {
    await fs.writeFile(path.join(DIST, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  }
  log(`완료: dist/ (물건 페이지 ${items.length}개)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
