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
// 사이트 주소(정본 URL). 커스텀 도메인(gongmae24.com)을 쓰고, 배포 전 임시 주소(*.pages.dev)는 정본으로 쓰지 않아요.
// SITE_URL 환경변수가 다른 도메인이면 그 값을 그대로 씁니다.
const RAW_SITE = (process.env.SITE_URL || '').trim().replace(/\/$/, '');
const SITE = RAW_SITE && !RAW_SITE.includes('.pages.dev') ? RAW_SITE : 'https://gongmae24.com';
// 공공데이터포털 '활용명세'에서 확인한 요청주소예요. 바뀌면 GitHub Variables로 덮어쓸 수 있어요.
// 해당 API를 활용신청하지 않았으면 그 부분만 건너뛰고 나머지는 정상으로 만들어져요.
const B = 'https://apis.data.go.kr/B010003';
const GOODS_URL = (process.env.ONBID_GOODS_URL || `${B}/OnbidMvastListSrvc2/getMvastCltrList2`).trim(); // 동산 물건목록
const CAR_URL = (process.env.ONBID_CAR_URL || `${B}/OnbidCarListSrvc2/getCarCltrList2`).trim();         // 차량 물건목록
const RANK_URL = (process.env.ONBID_RANK_URL || `${B}/OnbidItrsCltrRnkClgSrvc/getItrsCltrRnkClg`).trim();      // 관심물건순위
const RESULT_URL = (process.env.ONBID_RESULT_URL || `${B}/OnbidCltrBidRsltListSrvc2/getCltrBidRsltList2`).trim(); // 입찰결과목록
const NAVER_ID = (process.env.NAVER_CLIENT_ID || '').trim();     // (선택) 네이버 검색 API - 새 제품 최저가
const NAVER_SECRET = (process.env.NAVER_CLIENT_SECRET || '').trim();
const RESULT_TYPES = (process.env.ONBID_RESULT_CLTR_TYPES || '0001,0002,0003').split(',').map((s) => s.trim()).filter(Boolean);

const RLST_URL = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2';
// 물건상세 조회서비스(사진목록 포함). 공공데이터포털에서 각각 활용신청이 필요해요. 주소가 다르면 변수로 바꿔요.
const DTL_URL = {
  re: (process.env.ONBID_RLST_DTL_URL || `${B}/OnbidRlstDtlSrvc2/getRlstCltrDtl2`).trim(),
  goods: (process.env.ONBID_GOODS_DTL_URL || `${B}/OnbidMvastDtlSrvc2/getMvastCltrDtl2`).trim(),
  car: (process.env.ONBID_CAR_DTL_URL || `${B}/OnbidCarDtlSrvc2/getCarCltrDtl2`).trim()
};
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

async function callApi(base, params, { tries = 3, raw = false } = {}) {
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
      if (raw) return { json, text };
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

// 빈 값·'-'·'없음'은 빼요
function clean(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    const t = typeof v === 'number' ? v : String(v).trim();
    if (t === '' || t === 0 || /^(-|없음|미상|불상|해당없음|사진\s*참고|N\/A|null)$/i.test(String(t))) continue;
    out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
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

// 사건·증거 번호(예: 2024압제409호, 증제10호, 2023고단123)를 지워요
const CASE_NO = /(^|\s)(\d{2,4}\s*[가-힣]{1,3}\s*제?\s*\d+\s*호?|[가-힣]{0,2}증\s*제?\s*\d+\s*호?|제\s*\d+\s*호)(?=\s|$|[,.)\]])/g;
const stripCaseNo = (t) => String(t || '').replace(CASE_NO, ' ').replace(/\s+/g, ' ').trim();
const SD_SHORT = (sd) => String(sd || '').replace(/특별자치시|특별자치도|특별시|광역시/g, '')
  .replace(/^충청북도$/, '충북').replace(/^충청남도$/, '충남').replace(/^전라북도$|^전북$/, '전북').replace(/^전라남도$/, '전남')
  .replace(/^경상북도$/, '경북').replace(/^경상남도$/, '경남').replace(/도$/, '');
// 주소만 있는 물건명을 '부산 서구 아미동2가 대지 281㎡'처럼 읽기 쉬운 이름으로
// 차 이름 다듬기: 제조사 표기 통일, '기타 국내제조사' 같은 말·영문 중복·형식번호 빼기
const MAKER = { 현대자동차: '현대', '현대자동차(주)': '현대', 기아자동차: '기아', 기아: '기아', 한국지엠: '쉐보레', 'GM대우': '쉐보레', 쉐보레GM: '쉐보레', 르노삼성: '르노', 르노코리아: '르노', 쌍용자동차: 'KG모빌리티', 쌍용: 'KG모빌리티', 'Mercedes-Benz': '벤츠', 메르세데스벤츠: '벤츠', 'BMW': 'BMW' };
const UNKNOWN = /^(기타|없음|미상|불상|기타\s*(국내|해외)?\s*제조사|모델명?\s*불상|사진\s*참고)$/;
function carName(makerRaw, modelRaw, yearRaw, useRaw) {
  let mk = String(makerRaw || '').trim();
  mk = MAKER[mk] || mk.replace(/자동차$|\(주\)|㈜/g, '').trim();
  if (UNKNOWN.test(mk)) mk = '';
  let md = String(modelRaw || '').replace(/\s+/g, ' ').trim();
  md = md.replace(/Mercedes-Benz|메르세데스[-\s]?벤츠/gi, '').replace(/\(([A-Za-z\s\-]+)\)/g, (m, x) => (/[가-힣]/.test(md.replace(m, '')) ? '' : ` ${x}`))
    .replace(/\([^)]*\d[^)]*-[^)]*\)/g, '').replace(/^(기타\s*(국내|해외)?\s*제조사)\s*/, '').replace(/\s+/g, ' ').trim();
  if (UNKNOWN.test(md) || /불상|미상/.test(md)) md = '';
  if (mk && md.toLowerCase().includes(mk.toLowerCase())) mk = '';
  if (mk === '벤츠' && /벤츠/.test(md)) mk = '';
  const y = (String(yearRaw || '').match(/(19|20)\d{2}/) || [])[0];
  const kind = String(useRaw || '').split(/[·\/,\s]/).filter(Boolean).pop() || '';
  if (!md) return { name: `${kind || '차종'} (모델은 원문 확인)`, model: '', year: y || '', unknown: true };
  return { name: [mk, md, y ? `${y}년식` : ''].filter(Boolean).join(' '), model: [mk, md].filter(Boolean).join(' '), year: y || '', unknown: false };
}
function friendlyTitle(r, cat, land, bld) {
  const orig = (r.onbidCltrNm || '').replace(/\s+/g, ' ').trim();
  if (cat === 'goods') {
    // 앞에 붙은 보관 장소 주소(예: '경기도 김포시 사우동 941 ')는 빼요
    const t0 = stripCaseNo(orig).replace(/^.*?\d+\s*층\s*\d+\s*호[,\/]?\s*/, '').replace(/\[\s*[^\]\d가-힣A-Za-z]*\]|\[[^\]]*:\s*\]/g, ' ')
      .replace(/(\(주\)|㈜|주식회사)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const t = t0.replace(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)\S*(\s+\S+?(시|군|구|읍|면|동|리|가|로|길))*\s+(산\s*)?\d+(-\d+)?(번지)?\s+/, '').trim();
    // '시계 압수물'처럼 남으면 '압수물 · 시계' 순서로 보기 좋게
    const m = t.match(/^(.*?)\s*(압수물|몰수품|압류물)$/);
    const out = m && m[1] ? `${m[1]} (${m[2]})` : t;
    return out.length >= 2 ? out : orig;
  }
  if (cat === 'car' && (r.carMdlNm || r.carVhknNm)) {
    // 공고의 차종·모델·연식 칸으로 (가장 정확)
    return carName(r.cltrMkrNm, r.carMdlNm || r.carVhknNm, r.yrmdl, r.cltrUsgSclsCtgrNm).name;
  }
  if (cat === 'car') {
    // 보관 장소 주소, 차량번호, 차대번호는 빼고 차종·연식만 남겨요
    let t = orig.replace(/^.*?보관(소|서|장)?\s*(보관)?/, '').replace(/\[([^\]]*)\]?/g, ' $1 ').replace(/…|\.\.\./g, ' ')
      .replace(/\b\d{2,3}\s?[가-힣]\s?\d{4}\b/g, ' ').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, ' ').replace(/\b(KM|KN|KP|KL)[A-Z0-9]{2,15}\b/g, ' ')
      .replace(/(최초)?\s*등록일\s*[\d.\-]+|차대번호|차량운반구|차량번호|[가-힣A-Za-z]+\s*(\(주\)|㈜)|(\(주\)|㈜|주식회사)\s*[가-힣A-Za-z]*/g, ' ')
      .replace(/[()\/:,]/g, ' ').replace(/연식\s*/g, '').replace(/\b\d{3,4}\s*(배기량|cc|CC)/g, ' ').replace(/(^|\s)주(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    // 같은 단어 반복 제거 (BMW BMW X6 → BMW X6)
    const seenW = new Set();
    t = t.split(' ').filter((w) => { const k = w.toLowerCase(); if (seenW.has(k)) return false; seenW.add(k); return true; }).join(' ');
    // 주소만 남으면 차종을 알 수 없다고 표시
    if (/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/.test(t) || !/[A-Za-z가-힣]{2,}/.test(t.replace(/(19|20)\d{2}년식/, ''))) {
      const kind = String(r.cltrUsgSclsCtgrNm || '').split(/[·\/,\s]/).filter(Boolean).pop();
      return `${kind || '차종'} (모델은 원문 확인)`;
    }
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
    .replace(/[가-힣]+\d+(동|가)(?=[\s,]|$)/g, ' ').replace(/\S*\d+번?길(\s*\d+(-\d+)?)?/g, ' ').replace(/\S+(로|길)\s+\d+(-\d+)?/g, ' ')
    .replace(/제?\s*(지하|B|비)?\s*[\d\-]*\s*(층|호실|호|동|번지|필지)\]?/g, ' ').replace(/\d+\s*(차|단지|블럭|블록)/g, ' ')
    .replace(/[\d\-,~()\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  const SIDO_W = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청|전라|경상)(특별시|광역시|특별자치시|특별자치도|도|북도|남도)?$/;
  const named = /[가-힣A-Za-z]{2,}/.test(rest) && !/^(대|전|답|임야|도로|잡종지|구거)$/.test(rest) ? rest.split(' ').filter((w) => /[가-힣A-Za-z]{2,}/.test(w) && !/^[가-힣]{1,3}(리|읍|면|동)$/.test(w) && !/^(외|지상|지하|토지|건물|제|제지|제비|제씨|지층|매각|일괄|토지및건물|개호실|호실|단지|차|동비)$/.test(w) && !/(특별시|광역시|특별자치|도|시|군|구)$/.test(w) && !SIDO_W.test(w) && !/^제[가-힣A-Za-z]{1,2}$/.test(w) && !/^(일원|내|번길|공개매각|업무용부|내제조표)$/.test(w) && !/^[가-힣]{2,}(대로|로|길)$/.test(w) && w.length >= 2)
    .filter((w, i, arr) => arr.indexOf(w) === i).slice(0, 2).join(' ') : '';
  // 같은 건물의 다른 호수를 구별할 수 있게 동·호를 뒤에 붙여요
  const unit = (orig.match(/(\d+)\s*동\s*(?:제?\s*(?:지하)?\s*\d+\s*층\s*)?제?\s*(?:비|B)?\s*(\d+)\s*호(?!실)/) || []);
  const ho = unit[2] ? `${unit[1]}동 ${unit[2]}호` : ((orig.match(/제?\s*(?:비|B)?\s*(\d{2,5})\s*호(?!실)/) || [])[1] ? `${orig.match(/제?\s*(?:비|B)?\s*(\d{2,5})\s*호(?!실)/)[1]}호` : '');
  let nm = named || kind;
  if (nm && kind && nm !== kind && nm.endsWith(kind)) nm = nm; // 예: '○○아파트'
  nm = nm.replace(/(아파트)\s+아파트$/, '$1');
  const parts = [region, nm, ho, area ? `${Math.round(area * 10) / 10}㎡` : ''].filter(Boolean);
  return parts.length >= 2 ? parts.join(' ') : orig;
}

// 동산·차량 세부 분류 (용도 이름 + 물건명 키워드로 판정, 위에서부터 먼저 맞는 것)
function subOf(r, cat) {
  if (cat !== 'goods' && cat !== 'car') return '';
  const use = [r.cltrUsgMclsCtgrNm, r.cltrUsgSclsCtgrNm].filter(Boolean).join(' ');
  // '주식회사', '(주)' 같은 회사 표기는 판정 전에 지워요 (주식으로 잘못 잡히지 않게)
  const name = String(r.onbidCltrNm || '').replace(/\(주\)|㈜|주식회사|유한회사|농업회사법인|농협|수협|축협/g, ' ');
  const m = `${use} ${name}`;
  const HEAVY = /굴삭기|굴착기|포크레인|크레인|지게차|선박|보트|요트|트랙터|콤바인|이앙기|구보타|덤프|로더|불도저/;
  if (cat === 'car') return /^(중기|선박|항공)/.test(use) || HEAVY.test(m) ? 'heavy' : /이륜|오토바이|스쿠터/.test(m) ? 'bike' : 'car';
  if (/^(유가증권|NPL|무형자산|회원권)/.test(use) || /비상장|주권|보통주|우선주|출자증권|출자금|주식\s*[\d,]+\s*주|[\d,]+\s*주\b|채권|NPL|특허|상표권|저작권|디자인권|회원권|지분/.test(m)) return 'right';
  if (/골드바|순금|금괴|은괴|백금|금(열쇠|반지|목걸이|팔찌|거북|두꺼비|장)/.test(name)) return 'gold';
  if (/소프트웨어|소스코드|프로그램\s*저작|솔루션\s*소스/.test(name)) return 'right';
  if (/유실물|습득물/.test(name)) return 'goods_etc';
  if (/재고|원자재|원단|자재|농산물|수산물|축산물|주류|폐기물|고철|잡철|비철|재활용|플라스틱|파지|캔류|PET|EPS|파병|입목|임산물|벌채|생산물|부산물|맥류|암매각/.test(m)) return 'stock';
  // ① 물건 이름으로 먼저 판단 (용도 칸은 '시계/귀금속'처럼 넓게 묶여 있어 마지막에 봐요)
  const ELEC = /노트북|휴대폰|핸드폰|아이폰|갤럭시|아이패드|맥북|iMac|MacBook|태블릿|모니터|컴퓨터|PC|TV|카메라|냉장고|세탁기|에어컨|음수기|정수기|청소기|에어팟|스피커/i;
  if (/귀걸이|목걸이|팔찌|반지|펜던트|진주|브로치|골드바|순금|금괴|은괴|백금|\d+\s*[kK]\b|\d+\s*돈(?=\s|$|[^가-힣])/.test(name) && !/시계/.test(name)) return 'gold';
  if (/시계|롤렉스|까르띠에|에르메스|샤넬|루이비통|구찌|프라다|오메가|명품|핸드백|가방|지갑|위블로|불가리|티파니|버버리|페라가모|디올|발렌시아가|보테가/i.test(name)) return 'luxury';
  if (HEAVY.test(name)) return 'heavy';
  if (/머시닝|선반기|밀링|프레스|사출기|CNC|공작기계|컴프레서|발전기|보일러|컨베이어|포장기|성형기|멸균기|분석기|측정기|의료기기|장비|기계/.test(name)) return 'machine';
  if (/집기|사무용품|책상|의자|파티션|캐비닛|소파|침대|가구|진열대|테이블|스툴|조명|식기|주방|의류|잡화|악기|자판기/.test(name) && !/노트북|맥북|아이패드|휴대폰|아이폰|갤럭시/.test(name)) return 'living';
  if (ELEC.test(name)) return 'elec';
  if (/보석|다이아(?!몬드\s*테크)/.test(name)) return 'luxury';
  // ② 이름으로 모르면 용도 칸으로
  if (/^(중기|선박|항공)/.test(use)) return 'heavy';
  if (/귀금속/.test(use)) return 'gold';
  if (/시계|보석|명품/.test(use)) return 'luxury';
  if (/^(컴퓨터|전기|통신|가전)/.test(use)) return 'elec';
  if (/^(기계|측정|실험|의료|산업|공구)/.test(use) || /설비|공구/.test(m)) return 'machine';
  if (/가구|생활|사무|집기|비품|의류|잡화|주방|악기/.test(m)) return 'living';
  return 'goods_etc';
}

function normalize(r, kind) {
  const appr = num(r.apslEvlAmt) > 0 ? num(r.apslEvlAmt) : null;
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
    url: `https://www.onbid.co.kr/op/cltrpbancinf/cltrdtl/CltrDtlController/mvmnCltrDtl.do?${q}`,
    // 동산·차량 목록에 함께 오는 제품 정보 (없으면 빈 값). 차량번호는 개인정보 보호를 위해 쓰지 않아요.
    spec: kind === 're' ? undefined : clean({
      maker: r.cltrMkrNm, model: kind === 'car' ? (r.carMdlNm || r.carVhknNm) : r.mdlNm, kind: r.carVhknNm, year: kind === 'car' ? r.yrmdl : r.mnftYr,
      km: num(r.drvDstc), cc: num(r.dsvlm), fuel: r.fuelCont, color: r.carColrNm, qty: r.qntyCont, size: r.mvastSizeCont, weight: r.cltrWt,
      place: r.cltrCstdPlcNm, author: r.autrNm, product: r.cltrPrdctNm || r.mvastCmdtyNm, origin: r.prdlcPlorCont
    })
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

// 숨은 조건 가능성이 큰 물건(아주 싼 값·지분·토지만·건물만)은 시세 비교·낙찰 예측을 하지 않아요
export function isTrap(it) {
  return (it.rate != null && it.rate < 30) || it.alc || /지분|토지만|건물만|제시외/.test(`${it.t} ${it.addr || ''}`);
}
const aptKey = (s) => String(s || '').replace(/\s|아파트|APT|apt|\d+\s*차|\d+\s*단지|[()\[\]\-.,]/g, '').toLowerCase();
function attachMarket(items, trades, months) {
  const detail = {};
  for (const it of items) {
    // 아파트만, 같은 단지 이름이 확인될 때만 비교해요
    if (it.cat !== 'home' || !/아파트/.test(it.use) || !it.bld || !it.min || it.pnu.length < 5 || isTrap(it)) continue;
    const code = it.pnu.slice(0, 5);
    const pool = months.flatMap((ym) => trades[`${code}:${ym}`] || []);
    const tol = Math.max(3, it.bld * 0.07);
    // 주소의 시·구·동 이름은 빼고 단지 이름끼리만 비교해요 (예: '태평동'이 '태평' 단지와 섞이지 않게)
    const stem = (w) => String(w || '').replace(/(특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|가|리)$/, '');
    let addrN = String(it.addr || '');
    for (const w of [it.sd, it.sgg, it.emd, stem(it.emd), stem(it.sgg)]) if (w) addrN = addrN.split(w).join(' ');
    const nameKey = aptKey(addrN);
    const near = pool.filter((t) => {
      const k = aptKey(t.apt);
      return t.emd === it.emd && t.area && Math.abs(t.area - it.bld) <= tol && k.length >= 2 && k !== aptKey(stem(it.emd)) && nameKey.includes(k);
    });
    if (near.length < 2) continue;
    const med = median(near.map((t) => t.price));
    const ratio = Math.round((it.min / med) * 100);
    if (ratio < 40 || ratio > 150) continue;
    it.mkt = { med, n: near.length, ratio, apt: near[0].apt };
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
  const seenPb = new Set();
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
          const rate0 = Math.round((price / appr) * 100);
          if (rate0 < 20 || rate0 > 300) continue;
          const pb = String(r.onbidPbancNo || r.pbancNo || '');
          if (pb && seenPb.has(pb)) continue;
          if (pb) seenPb.add(pb);
          // 실제 응답 확인(2026-11-26): 0002 = 자동차·운송장비, 0003 = 동산
          const kind0 = type === '0001' ? 're' : type === '0002' ? 'car' : 'goods';
          const cat0 = categoryOf({ ...r, onbidCltrNm: r.onbidCltrNm || r.cltrNm }, kind0);
          const reg = regionFromName(r.onbidCltrNm || r.cltrNm);
          out.push({
            t: friendlyTitle({ ...r, onbidCltrNm: r.onbidCltrNm || r.cltrNm || '' }, cat0, num(r.landSqms), num(r.bldSqms)), sd: SD_SHORT(r.lctnSdnm) || reg.sd, sgg: r.lctnSggnm || reg.sgg,
            cat: cat0, appr, price,
            sub: (cat0 === 'goods' || cat0 === 'car') ? subOf({ ...r, onbidCltrNm: r.onbidCltrNm || r.cltrNm || '' }, cat0) : undefined,
            rate: Math.round((price / appr) * 100), bidders: pickBidders(r), dt: parseKst(r.opbdDt || r.opbdDtm || r.cltrOpbdDt || ''),
            // 퀴즈 힌트용: 용도, 면적, 유찰 횟수, 그 회차 최저 입찰가 (없으면 비워 둬요)
            use: r.cltrUsgSclsCtgrNm || r.cltrUsgMclsCtgrNm || '',
            area: num(r.bldSqms) || num(r.landSqms) || null,
            fails: num(r.usbdNft),
            min: num(r.lowstBidPrc) || num(r.lowstBidPrcIndctCont) || num(r.lwstBidPrc) || num(r.minBidPrc) || null,
            prop: r.prptDivNm || ''
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
// 동산·차량: 같은 종류(명품·금·전자·차량 등) 최근 낙찰가율 분포 (중간값과 가운데 50% 범위)
function goodsRates(results) {
  const g = {};
  const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i); return Math.round(a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo)); };
  for (const r of results) {
    if (!(r.cat === 'goods' || r.cat === 'car') || r.rate < 20 || r.rate > 300) continue;
    for (const k of [`${r.cat}|${r.sub || ''}`, r.cat]) (g[k] = g[k] || []).push(r.rate);
  }
  const out = {};
  for (const [k, arr] of Object.entries(g)) if (arr.length >= 3) out[k] = { med: q(arr, 0.5), lo: q(arr, 0.25), hi: q(arr, 0.75), n: arr.length };
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
  const sp = it.spec || {};
  if (it.cat === 'car' && sp.model) {
    const c = carName(sp.maker, sp.model, sp.year, it.use);
    return { kw: [c.model, c.year].filter(Boolean).join(' ').slice(0, 30), model: c.model, year: c.year, generic: c.unknown || c.model.length < 2 };
  }
  if (it.cat === 'car' && /원문 확인|미상|불상/.test(t)) return { kw: '', model: '', year: '', generic: true };
  // 공고에 모델명이 따로 있으면 그게 가장 정확해요
  const mdl = String(sp.model || '').trim();
  if (it.cat === 'goods' && mdl && /[A-Za-z0-9]{3,}/.test(mdl) && !/^(없음|미상|기타)$/.test(mdl)) {
    const code = (mdl.match(/[A-Za-z0-9][A-Za-z0-9\-]{3,}/) || [mdl])[0];
    return { kw: [sp.maker, code].filter(Boolean).join(' ').slice(0, 30), model: [sp.maker, mdl].filter(Boolean).join(' '), code, year: String(sp.year || ''), generic: false, fromSpec: true };
  }
  if (it.cat === 'car') {
    const y = (t.match(/(19|20)\d{2}(?=년식)/) || [])[0] || '';
    const model = t.replace(/(19|20)\d{2}년식/, ' ').replace(/승용|승합|화물|대형차|중형차|소형차|경차|자동차/g, ' ').replace(/\s+/g, ' ').trim();
    return { kw: [model, y].filter(Boolean).join(' ').slice(0, 30), model, year: y, generic: model.length < 2 };
  }
  t = stripCaseNo(t).replace(/^.*?보관(소|서|장)?\s*(보관)?/, ' ')
    .replace(/\(주\)\s*\S+|주식회사\s*\S+|㈜\s*\S+/g, ' ')
    .replace(/\(([^)]*)\)/g, ' $1 ').replace(/\[([^\]]*)\]/g, ' $1 ')
    .replace(/외\s*\d+\s*(점|건|개|종|대)/g, ' ').replace(/[\/:,·]/g, ' ').replace(/(^|\s)-+|-+(\s|$)/g, ' ');
  // 검색에 방해되는 관리용 단어(압수물·몰수품·체납·세관 등), 번호, 수량은 낱말 단위로 빼요
  const STOP = /^(압류|공매|일괄|매각|동산|비품|물품|일체|등|압수물품?|압수|몰수품?|체납|체납처분|세관|유실물|보관품?|각종|기타|중고품?|사용품|수량|품목|물건|상품|제품|외)$/;
  t = t.split(/\s+/).map((w) => w.replace(/^[.)\]]+|[.(\[]+$/g, ''))
    .filter((w) => w && !STOP.test(w) && !/^\d+([.)]|(점|개|식|대|건|종|호|번|EA|ea))?$/.test(w) && !/^제?\d+(호|번)$/.test(w))
    .join(' ').trim();
  const words = t.split(' ').filter(Boolean);
  // 제품번호(모델명)가 있으면 그걸 중심으로 검색해요. 예: SM-S928N, 126610LN, A2338
  const code = words.find((w) => /^[A-Za-z0-9][A-Za-z0-9\-]{3,}$/.test(w) && /\d/.test(w) && /[A-Za-z]/.test(w) && !/^\d+(kg|g|cm|mm|ml|cc)$/i.test(w))
    || words.find((w) => /^\d{5,}[A-Za-z]{0,4}$/.test(w));
  const BRAND = /^(롤렉스|오메가|까르띠에|태그호이어|에르메스|샤넬|루이비통|구찌|프라다|디올|삼성|갤럭시|애플|아이폰|맥북|아이패드|LG|엘지|소니|캐논|니콘|다이슨|발뮤다|Rolex|Omega|Cartier|Hermes|Chanel|Apple|Samsung|Sony|Canon|Nikon|Dyson)$/i;
  const brand = words.find((w) => BRAND.test(w)) || '';
  const generic = !code && (!words.length || words.every((w) => GENERIC.test(w)));
  const kw = code ? [brand, code].filter(Boolean).join(' ') : t;
  return { kw: kw.slice(0, 30), model: t, code: code || '', year: '', generic };
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
    // 제품번호가 공고에 있는 물건만 새 제품 가격을 찾아요 (금은 무게로 비교 가능해서 예외)
    if (it.cat !== 'goods' || !['gold', 'luxury', 'elec', 'living'].includes(it.sub) || (!k.code && it.sub !== 'gold') || k.generic) continue;
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
// JPEG·PNG 크기 읽기 (로그용)
function imgDims(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}
function sniffImg(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'webp';
  return null;
}
// ---------- 큰 사진: 물건상세 API의 사진목록 ----------
// 목록 API의 사진은 작은 썸네일이라, 상세 API에서 원본 사진 주소를 받아 씁니다.
// 응답 구조가 문서마다 달라서, 응답 안의 모든 문자열에서 이미지 주소를 찾아요. 물건당 한 번만 부르고 결과는 캐시해요.
function imageUrlsIn(obj, out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    const m = obj.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const u of m) if (/onbid\.co\.kr|\.(jpe?g|png|gif|webp)(\?|$)/i.test(u) && !/\.(pdf|hwp|docx?|xlsx?|zip)(\?|$)/i.test(u)) out.push(u.replace(/&amp;/g, '&'));
    return out;
  }
  if (Array.isArray(obj)) { for (const v of obj) imageUrlsIn(v, out); return out; }
  if (typeof obj === 'object') for (const v of Object.values(obj)) imageUrlsIn(v, out);
  return out;
}
async function attachPhotos(list) {
  const dir = path.join(CACHE, 'detail');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'photos.json');
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* 처음 */ }
  const MAX = Number(process.env.DETAIL_MAX_CALLS || 300); // 한 번 빌드에 부르는 최대 횟수
  const DAY_MAX = Number(process.env.DETAIL_DAY_MAX || 900); // 종류별 하루 최대 (개발계정 하루 1,000건 한도 안에서)
  const today = kstNow().toISOString().slice(0, 10);
  const day = cache.__day && cache.__day.d === today ? cache.__day : { d: today, n: {} };
  delete cache.__day;
  const dead = {};
  let calls = 0, found = 0, firstErr = '';
  const kindOf = (it) => (it.cat === 'goods' ? 'goods' : it.cat === 'car' ? 'car' : 're');
  for (const it of list) {
    const c = cache[it.id];
    if (c && (c.p.length || Date.now() - c.t < 7 * 864e5)) { if (c.p.length) it.photos = c.p; continue; }
    const k = kindOf(it);
    if (dead[k] || calls >= MAX || !DTL_URL[k] || (day.n[k] || 0) >= DAY_MAX) continue;
    const [mng, cdtn] = it.id.split('_');
    try {
      calls++; day.n[k] = (day.n[k] || 0) + 1;
      const { json, text } = await callApi(DTL_URL[k], { cltrMngNo: it.key || mng, pbctCdtnNo: cdtn, resultType: 'json', pageNo: 1, numOfRows: 10 }, { tries: 1, raw: true });
      const urls = [...new Set(imageUrlsIn(json || text))].filter((u) => u !== it.src).slice(0, 8);
      cache[it.id] = { t: Date.now(), p: urls };
      if (urls.length) { it.photos = urls; found++; }
    } catch (e) {
      if (!firstErr) firstErr = `${k}: ${e.message}`;
      if (/API 오류 4\d\d|SERVICE_KEY|SERVICE ACCESS|등록되지 않은|not found|\s(20|22|30|31|32|33)\s/i.test(e.message)) dead[k] = true;
    }
    await sleep(60);
  }
  // 60일 지난 기록은 정리
  for (const [id, c] of Object.entries(cache)) if (Date.now() - c.t > 60 * 864e5) delete cache[id];
  cache.__day = day;
  await fs.writeFile(file, JSON.stringify(cache));
  log(`큰 사진: 상세 조회 ${calls}건, 사진 찾음 ${found}건${Object.keys(dead).length ? `, 사용 안 됨: ${Object.keys(dead).join(',')}` : ''}${firstErr ? ` (첫 오류: ${firstErr.slice(0, 160)})` : ''}`);
  if (Object.keys(dead).length) log('  → 공공데이터포털에서 "차세대 온비드 부동산/동산/차량 물건상세 조회서비스"를 활용신청하고, 주소가 다르면 ONBID_RLST_DTL_URL 등 변수로 알려 주세요.');
}

async function downloadThumbs(list) {
  const dir = path.join(CACHE, 'thumbs');
  await fs.mkdir(dir, { recursive: true });
  const { createHash } = await import('node:crypto');
  const have = new Set(await fs.readdir(dir).catch(() => []));
  const MAX_NEW = Number(process.env.THUMB_MAX_NEW || 1500);
  const jobs = [];
  // 큰 사진이 있으면 그걸 대표 사진으로, 나머지는 상세 화면 갤러리용(최대 4장)
  const expanded = [];
  for (const it of list) {
    if (it.photos && it.photos.length) {
      it.src = it.photos[0];
      for (const u of it.photos.slice(1, 4)) expanded.push({ src: u, _owner: it });
    }
    expanded.push(it);
  }
  for (const it of expanded) {
    if (!it.src) continue;
    const h = createHash('sha1').update(it.src).digest('hex').slice(0, 16);
    const hit = [...['jpg', 'png', 'gif', 'webp']].map((e) => `${h}.${e}`).find((f) => have.has(f));
    if (hit) { setFile(it, hit); continue; }
    // 실패 기록은 7일이 지나면 다시 시도해요
    if (have.has(`${h}.none`)) {
      const st = await fs.stat(path.join(dir, `${h}.none`)).catch(() => null);
      if (st && Date.now() - st.mtimeMs < 7 * 864e5) continue;
    }
    jobs.push([it, h]);
  }
  let ok = 0, fail = 0, firstFail = '', sizeNote = '';
  function setFile(x, f) { if (x._owner) (x._owner._gallery = x._owner._gallery || []).push(f); else x._thumbFile = f; }
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
        setFile(it, `${h}.${ext}`); ok++;
        if (!sizeNote) { const d = imgDims(buf); if (d) sizeNote = `${d.w}×${d.h}`; }
      } catch (e) { fail++; if (!firstFail) firstFail = e.message; }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  log(`사진: 새로 받음 ${ok}장${sizeNote ? ` (예: ${sizeNote})` : ''}, 실패 ${fail}장, 남은 대기 ${Math.max(0, jobs.length - MAX_NEW)}장${firstFail ? ` (첫 실패: ${firstFail})` : ''}`);
  // 60일 넘게 안 쓰인 사진 캐시는 정리
  const used = new Set(list.flatMap((it) => [it._thumbFile, ...(it._gallery || [])]).filter(Boolean));
  for (const f of await fs.readdir(dir)) {
    if (used.has(f)) continue;
    const st = await fs.stat(path.join(dir, f));
    if (Date.now() - st.mtimeMs > 60 * 864e5) await fs.rm(path.join(dir, f), { force: true });
  }
}

// ---------- HTML ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function won(v) {
  if (v > 0 && v < 10000) return `${Math.round(v).toLocaleString('ko-KR')}원`;
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
const SUB_NAME = { right: '주식·채권·권리', gold: '금·귀금속', luxury: '명품·시계', elec: '전자기기', machine: '기계·장비', living: '생활·가구', stock: '재고·원자재', goods_etc: '기타 동산', car: '자동차', bike: '오토바이', heavy: '중장비·선박' };
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

// 동산·차량 이름 앞에 붙은 보관 장소 주소만 뽑아요 (예: '경기도 화성시 남양읍 남양리 1077')
function placeOf(it) {
  if (!['goods', 'car'].includes(it.cat)) return '';
  const m = String(it.addr || '').match(/^((서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)\S*(\s+\S+?(시|군|구|읍|면|동|리|가|로|길))+\s+(산\s*)?\d+(-\d+)?)/);
  return m ? m[1] : '';
}

function plainSummary(it) {
  const parts = [];
  if (it.appr && it.min && it.appr > it.min) parts.push(`감정가보다 ${won(it.appr - it.min)} 싸게 시작해요`);
  else if (it.appr && it.min && it.appr === it.min) parts.push('감정가 그대로 시작해요');
  if (it.fails) parts.push(`지금까지 ${it.fails}번 팔리지 않았어요`);
  if (it.mkt && !isTrap(it)) parts.push(`같은 단지 실거래 중간값의 ${it.mkt.ratio}% 수준이에요`);
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
<link rel="stylesheet" href="style.css?v=${ASSET_V}">
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

// 동산·차량 입찰가 가이드: 이용자가 숫자를 넣지 않아도 물건 특성과 실제 낙찰 데이터로 범위를 보여줘요
const GUIDE_NOTE = {
  luxury: ['정품 보증이 없어요', '감정가는 정품을 보장하지 않고 반품도 안 돼요. 그래서 새 제품 가격의 80%를 넘기지 않는 걸 기준선으로 잡았어요.', 0.8],
  gold: ['금값을 기준으로 따져요', '귀금속은 무게·순도로 값이 정해져요. 오늘 금 시세 × 무게보다 높게 쓰면 손해예요. 장신구 세공비는 되팔 때 쳐 주지 않아요.', 0.95],
  elec: ['작동 여부를 모를 수 있어요', '전자기기는 작동 확인·구성품이 없으면 값이 크게 떨어지고, 출시가 오래될수록 빨리 내려가요. 새 제품 가격의 60%를 기준선으로 잡았어요.', 0.6],
  car: ['이전등록비가 더 들어요', '낙찰가 외에 취득세 등 이전등록비(차량가의 약 7%)와 탁송·수리비가 들어요. 실제 드는 돈으로 중고차 시세와 비교하세요.', 1],
  heavy: ['운반·등록 비용이 커요', '중장비·선박은 운반(트레일러·크레인)과 등록 비용이 따로 들어요. 견적을 먼저 받아 보고 그만큼 낮춰 쓰세요.', 1],
  machine: ['쓸 곳이 정해져 있어야 해요', '기계·장비는 사 줄 사람을 찾기 어렵고 운반·설치비가 들어요. 직접 쓸 계획이 없다면 최저가 근처가 무난해요.', 1],
  living: ['운반비와 상태를 감안해요', '가구·생활용품은 중고 값이 낮고 운반비가 들어요. 최저가 근처에서 시작하는 게 무난해요.', 1]
};
// 차량(자동차·오토바이)과 중장비·선박을 구분해요
const isCarIt = (it) => it.cat === 'car' && it.sub !== 'heavy';
function goodsGuide(it, kw) {
  if (!it.min) return null;
  if (isTrap(it) || it.sub === 'right') {
    const why = it.sub === 'right' ? ['현금으로 바꾸기 어려워요', '주식·채권·지분 같은 권리는 사 줄 곳이 정해져 있지 않으면 되팔기 어려워요. 가치를 직접 따질 수 없다면 최저 입찰가 근처가 안전해요.', 1]
      : ['값이 내려온 이유부터 확인하세요', '감정가보다 지나치게 싸게 나온 물건은 상태·지분·사용 제한 같은 조건이 붙어 있는 경우가 많아요. 이유를 확인하기 전에는 최저 입찰가 근처에서만 생각하세요.', 1];
    const lines = [{ k: 'min', label: '최저 입찰가', v: it.min, sub: '이보다 낮게는 입찰할 수 없어요' }];
    if (it.appr) lines.push({ k: 'appr', label: '감정가', v: it.appr, sub: '감정가는 이 물건의 실제 가치를 보장하지 않아요' });
    return { lines, lo: it.min, hi: it.min, note: why, hot: false, carFee: false, capUsed: false };
  }
  const note = GUIDE_NOTE[isCarIt(it) ? 'car' : it.sub] || ['상태를 사진으로만 봐요', '동산은 미리 실물을 보기 어렵고 반품이 안 돼요. 그만큼 낮춰 쓰는 게 안전해요.', 1];
  const lines = [];
  lines.push({ k: 'min', label: '최저 입찰가', v: it.min, sub: '이보다 낮게는 입찰할 수 없어요' });
  let mid = null;
  if (it.gr && it.appr) {
    mid = Math.round(it.appr * it.gr.med / 100 / 1e4) * 1e4;
    lines.push({ k: 'gr', label: '비슷한 물건 실제 낙찰 수준', v: mid, sub: `최근 2주 ${it.gr.same ? `같은 종류(${SUB_NAME[it.sub] || CAT_NAME[it.cat]})` : (isCarIt(it) ? '차량' : '동산')} 낙찰 ${it.gr.n}건은 감정가의 ${it.gr.lo}~${it.gr.hi}%(중간 ${it.gr.med}%)에 팔렸어요` });
  }
  const conf = it.cat === 'car' ? false : (!!kw?.code || it.sub === 'gold');
  if (it.newp && conf) lines.push({ k: 'new', label: '새 제품 가격', v: it.newp, sub: '네이버 쇼핑 같은 제품번호 최저가 기준' });
  if (it.appr) lines.push({ k: 'appr', label: '감정가', v: it.appr, sub: '이 선을 넘기면 공매로 살 이유가 줄어요' });
  // 상한: 감정가, (새 제품 가격 × 기준 비율), 차량은 이전등록비 7%를 뺀 값
  let cap = it.appr || null;
  if (it.newp && conf && note[2] < 1) cap = Math.min(cap || Infinity, it.newp * note[2]);
  if (isCarIt(it) && cap) cap = cap / 1.07;
  let lo = it.min, hi = cap ? Math.max(it.min, cap) : null, hot = false;
  if (mid) {
    const gLo = Math.round(it.appr * it.gr.lo / 100), gHi = Math.round(it.appr * it.gr.hi / 100);
    // 비슷한 물건이 감정가(상한)보다 비싸게 팔렸어도 상한을 넘겨 권하지 않아요
    if (cap && gLo > cap) { hot = true; lo = it.min; hi = Math.max(it.min, cap); }
    else { lo = Math.max(it.min, gLo); hi = hi ? Math.min(hi, Math.max(lo, gHi)) : gHi; }
    if (cap && lo > cap) lo = Math.max(it.min, cap);
  }
  if (!hi) hi = lo;
  if (hi && hi < lo) hi = lo;
  // 만원 단위로 맞추되, 최저 입찰가보다 낮아지지 않게 (1만원 미만 물건은 그대로)
  const r10 = (v) => (v == null ? null : it.min < 1e4 ? Math.max(it.min, Math.round(v)) : Math.max(Math.ceil(it.min / 1e4) * 1e4, Math.round(v / 1e4) * 1e4));
  return { lines, lo: r10(lo), hi: r10(hi), note, hot, carFee: isCarIt(it), capUsed: !!(it.newp && conf && note[2] < 1) };
}

// 동산·차량 전용 카드: 물건 카드, 받아 오는 방법, 꼭 확인할 것
function goodsCards(it, kw, place) {
  const isCar = isCarIt(it);
  const heavy = it.sub === 'heavy';
  const sp = it.spec || {};
  const n = (v) => Number(v).toLocaleString('ko-KR');
  const facts = (isCar
    ? [['차종', kw.model], ['연식', kw.year ? `${kw.year}년식` : '공고문 확인'], ['주행거리', sp.km ? `${n(sp.km)}km` : ''], ['연료', sp.fuel], ['배기량', sp.cc ? `${n(sp.cc)}cc` : ''], ['색상', sp.color], ['보관 장소', sp.place || place || [it.sd, it.sgg, it.emd].filter(Boolean).join(' ') || '공고문 확인']]
    : [['종류', catName(it)], ['제조사', sp.maker], ['브랜드', sp.model && !/[A-Za-z0-9]{3,}/.test(sp.model) && !kw.code ? sp.model : ''], ['모델명·제품번호', kw.code || (sp.model && /[A-Za-z0-9]{3,}/.test(sp.model) ? sp.model : '') || '공고에 없음 (원문 사진에서 확인)'], ['제조 연도', sp.year], ['수량', sp.qty], ['크기', sp.size], ['무게', sp.weight], ['작가', sp.author], ['원산지', sp.origin], ['보관 장소', sp.place || place || [it.sd, it.sgg, it.emd].filter(Boolean).join(' ') || '공고문 확인']])
    .filter((f) => f[1]);
  const auth = { luxury: '명품', gold: '귀금속', elec: '전자제품' }[it.sub];
  if (it.sub === 'right') {
    return `<section class="card-block">
<h2>권리 카드</h2>
<dl class="info">${[['종류', '주식·채권·권리'], ['내용', it.t], ['수량', sp.qty]].filter((f) => f[1]).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
</section>
<section class="card-block">
<h2>어떻게 넘겨받아요?</h2>
<ul class="facts">${[
      ['물건이 아니라 권리예요', '주식·출자증권·채권·특허처럼 서류상 권리를 사는 거예요. 받아 올 물건은 없어요.'],
      ['명의 이전 절차', '낙찰 뒤 잔금을 내면 발행 회사나 관리 기관에 명의 변경(명의개서·양도 통지)을 해야 해요. 방법은 공고문에서 확인하세요.'],
      ['팔 곳을 먼저 생각하세요', '비상장주식·채권은 사 줄 사람을 직접 찾아야 해요. 현금으로 바꿀 방법이 없다면 입찰을 다시 생각해 보세요.']
    ].map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('')}</ul>
</section>`;
  }
  return `<section class="card-block">
<h2>${isCar ? '차량 카드' : heavy ? '장비 카드' : '물건 카드'}</h2>
<dl class="info">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
<p class="note">${Object.keys(sp).length ? '온비드 공고에 적힌 정보예요.' : '공고 제목에서 뽑은 정보예요.'} 상태·구성품·${isCar ? '주행거리' : '보증서'}는 온비드 원문의 사진과 상세 설명에서 확인하세요.</p>
</section>
<section class="card-block">
<h2>${isCar ? '사기 전에 꼭 확인' : '어떻게 받아 와요?'}</h2>
<ul class="facts">${(isCar ? [
    ['사고·침수 이력', '카히스토리(보험개발원)에서 차량번호로 조회할 수 있어요. 차량번호는 온비드 원문에서 확인하세요.'],
    ['압류·저당', '공매로 팔린 차는 보통 압류·저당이 말소되지만, 공고문의 말소 조건을 꼭 확인하세요.'],
    ['이전등록', '낙찰 후 직접 이전등록을 해야 하고 취득세 등(차량가의 약 7%)이 들어요. 가이드 입찰가와 돈 계획에 반영해 두었어요.'],
    ['차 상태', '시동·열쇠·서류 유무는 공고마다 달라요. 보관소에 미리 문의할 수 있는지 공고문을 보세요.']
  ] : [
    ['직접 받아 오기', `대부분 낙찰자가 보관 장소${place ? `(${place})` : ''}에서 직접 받아 와요. 택배로 보내 주지 않는 경우가 많아요.`],
    ['대금 납부', '낙찰 후 정해진 기한 안에 잔금을 내야 물건을 받을 수 있어요. 기한은 공고문에 있어요.'],
    ['상태 그대로', '사진과 설명만 보고 사는 거라 반품·교환이 어려워요. 하자가 있어도 낙찰자 책임인 경우가 많아요.'],
    ...(auth ? [['정품 여부', `${auth}은 감정서·보증서가 함께 오는지 공고문에서 확인하세요. 감정가는 정품을 보장하지 않아요.`]] : [])
  ]).map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('')}</ul>
</section>`;
}

let ASSET_V = '';
function itemPage(it, trades, similar, demo, updatedAt) {
  const risks = risksOf(it);
  const G = it.cat === 'goods' || it.cat === 'car';
  const isCar = isCarIt(it);
  const kw = G ? keywordOf(it) : null;
  const place = G ? placeOf(it) : '';
  const region = [it.sd, it.sgg, it.emd].filter(Boolean).join(' ');
  const title = it.min ? `${won(it.min)}부터 · ${it.t}${it.rate && it.rate < 100 ? ` (감정가의 ${it.rate}%)` : ''}` : `${it.t} (최저가 비공개)`;
  const desc = `${region} ${CAT_NAME[it.cat]} 공매 물건. 감정가 ${won(it.appr)}, 최저입찰가 ${won(it.min)}, 유찰 ${it.fails}회, 입찰 마감 ${kdate(it.en)}.`;
  const canonical = SITE ? `${SITE}/item/${it.id}.html` : '';
  const rows = [
    ['재산 종류', it.prop], ['용도', it.use], [G ? '보관 지역' : '소재지', G ? (place || region) : region],
    ['토지 면적', it.land ? `${it.land.toLocaleString('ko-KR')}㎡ (약 ${Math.round(it.land / 3.3058)}평)` : ''],
    ['건물 면적', it.bld ? `${it.bld.toLocaleString('ko-KR')}㎡ (약 ${Math.round(it.bld / 3.3058)}평)` : ''],
    ['입찰 방식', it.how], ['집행기관', it.org], ['명도 책임', G ? '' : it.evc], ['진행 상태', it.stat]
  ].filter((r) => r[1]);
  const tradeRows = trades.map((t) => `<tr><td>${esc(t.ymd.slice(2).replace(/-/g, '.'))}</td><td>${esc(t.apt)}</td><td>${t.area}㎡ · ${t.floor ?? '-'}층</td><td class="num">${won(t.price)}</td></tr>`).join('');
  const simCards = similar.map((s) => `<a class="mini" href="${esc(s.id)}.html">${s.thumb ? `<span class="mini-img"><img src="..${esc(s.thumb.replace(/^\.?\/?/, '/'))}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>` : ''}<span class="mini-rate">${s.rate ? `감정가의 ${s.rate}%` : esc(SUB_NAME[s.sub] || CAT_NAME[s.cat])}</span><span class="mini-title">${esc(s.t)}</span><span class="mini-region">${esc([s.sgg, s.emd].join(' '))}</span><span class="mini-price">${won(s.min)}</span></a>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} | 경매레이더</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${it.lowValue ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(it.og ? SITE + it.og : it.thumb ? (SITE + it.thumb) : (SITE ? SITE + '/og.png' : '../og.png'))}">
${it.og ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="manifest" href="../manifest.webmanifest">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icon-192.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="../style.css?v=${ASSET_V}">
</head>
<body class="item-page">
<div class="app">
<div class="topbar">
<a class="icon-btn" href="../${G ? 'index' : 'realestate'}.html" aria-label="목록으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
<span class="topbar-title">${G ? (it.sub === 'heavy' ? '중장비 공매' : isCar ? '차량 공매' : '동산 공매') : '부동산 공매'}</span>
<span class="topbar-actions">
<button class="icon-btn" id="share" aria-label="공유하기"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button>
<button class="icon-btn like-btn" id="like" aria-label="관심 등록" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
</span>
</div>
${demo ? '<div class="demo-bar">지금 보이는 물건은 예시 데이터예요. 인증키를 넣으면 실제 공매 물건으로 바뀌어요.</div>' : ''}
<div class="photo2 cv cv-${esc(['goods', 'car'].includes(it.cat) ? (it.cat === 'car' ? 'car' : it.sub || 'goods_etc') : it.cat)}${G ? ' big' : ''}">
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
<a class="photo-src" href="${esc(it.url)}" target="_blank" rel="noopener">온비드 원문에서 사진 보기</a>
${(() => {
  const pics = [it.thumb, ...(it.gallery || [])].filter(Boolean);
  if (!pics.length) return '';
  // 사진을 억지로 늘리지 않게: 흐린 같은 사진을 배경에 깔고, 원본 비율 그대로 가운데에 보여줘요
  return `<div class="gal" id="gal">${pics.map((p, i) => `<figure class="gal-item"><img class="gal-bg" src="${esc(p)}" alt="" aria-hidden="true" loading="${i ? 'lazy' : 'eager'}"><img class="gal-fg" src="${esc(p)}" alt="${esc(it.t)} 사진 ${i + 1}" loading="${i ? 'lazy' : 'eager'}" onerror="this.closest('figure').remove()"></figure>`).join('')}</div>${pics.length > 1 ? `<span class="gal-count" id="galCount">1 / ${pics.length}</span>` : ''}<span class="gal-src">출처: 온비드</span>`;
})()}
</div>

<section class="card-block item-head">
<div class="badges">
<span class="badge">${esc(catName(it))}</span>
${it.prop ? `<span class="badge">${esc(it.prop)} 공매</span>` : ''}
${it.pv ? '<span class="badge badge-blue">수의계약 가능</span>' : ''}
${it.rank ? `<span class="badge badge-hot">온비드 관심 ${it.rank}위</span>` : ''}
<span class="badge badge-red" data-dday="${esc(it.en || '')}">마감 -</span>
</div>
<h1 class="item-title">${esc(it.t)}</h1>
<p class="muted">${G ? esc(place ? `보관: ${place}` : (it.sd || '')) : esc(it.addr && it.addr !== it.t ? it.addr : region)} · 유찰 ${it.fails}회${it.st && new Date(it.st).getTime() > Date.now() ? ` · 입찰 시작 ${esc(kdate(it.st))}` : ''}</p>
<div class="price-box">
<div class="price-main">
<div><span class="muted small">최저 입찰가</span><strong class="price-big">${won(it.min)}</strong></div>
${it.rate ? `<span class="rate-pill ${it.rate <= 50 && !isTrap(it) ? 'hot' : ''}">감정가의 ${it.rate}%</span>` : ''}
</div>
<div class="grid2">
<div><span class="muted small">감정가</span><b>${it.appr ? won(it.appr) : '비공개'}</b></div>
<div><span class="muted small">감정가보다</span><b class="orange">${it.appr && it.min ? (it.appr > it.min ? won(it.appr - it.min) + ' 낮음' : it.appr === it.min ? '감정가 그대로' : won(it.min - it.appr) + ' 높음') : '-'}</b></div>
<div><span class="muted small">입찰 기간</span><b>${kdate(it.st)} ~ ${kdate(it.en)}</b></div>
<div><span class="muted small">마감까지</span><b class="red" id="countdown">-</b></div>
</div>
</div>
${it.next && it.next.length ? `<div class="next-rounds"><b>다음 회차 일정</b>${it.next.map((n) => `<span>${esc(kdate(n.en))} 마감 · 최저 ${won(n.min)}${n.rate ? ` (${n.rate}%)` : ''}</span>`).join('')}<small>이번에 안 팔리면 이 일정으로 다시 나와요. 값이 내려가는 만큼 경쟁도 생길 수 있어요.</small></div>` : ''}
<p class="plain">${G && it.appr && it.min && it.appr > it.min ? `감정가 ${won(it.appr)}짜리가 <b>${won(it.min)}</b>부터 시작해요. ` : ''}${esc(plainSummary(it))}</p>
${whyCard(it)}
<details class="glossary"><summary>이 말이 무슨 뜻이에요?</summary>
<dl>
<div><dt>감정가</dt><dd>전문 감정평가사가 매긴 물건의 값이에요. 시세와 다를 수 있어요.</dd></div>
<div><dt>최저 입찰가</dt><dd>이번 회차에 입찰할 수 있는 가장 낮은 금액이에요. 이보다 낮게 쓰면 무효예요.</dd></div>
<div><dt>유찰</dt><dd>아무도 입찰하지 않아 팔리지 않은 거예요. 유찰될 때마다 최저 입찰가가 내려가요.</dd></div>
${G ? '<div><dt>인도</dt><dd>낙찰 뒤 대금을 다 내고 물건을 넘겨받는 일이에요. 보통 보관 장소에서 직접 받아 와요.</dd></div>' : '<div><dt>명도</dt><dd>낙찰 뒤 살고 있는 사람을 내보내고 집을 넘겨받는 일이에요.</dd></div>'}
<div><dt>수의계약</dt><dd>입찰 없이 정해진 가격에 바로 계약할 수 있는 상태예요.</dd></div>
</dl></details>
</section>

${G ? goodsCards(it, kw, place) : ''}

${isTrap(it) ? (G ? `<section class="card-block trap"><b>값이 많이 내려온 이유를 먼저 확인하세요</b><p class="muted small">${it.rate != null ? `감정가의 ${it.rate}%까지 내려온 물건이에요.` : '지분이나 일부만 파는 물건이에요.'} ${it.sub === 'right' ? '권리는 실제로 얼마를 회수할 수 있는지 따져야 해요.' : '동산은'} 상태가 나쁘거나 등록·폐기·사용 제한 같은 조건이 붙어 있는 경우가 있어요. 공고문의 유의사항과 사진을 먼저 확인하세요.</p></section>` : `<section class="card-block trap"><b>숨은 조건 가능성이 큰 물건이에요</b><p class="muted small">값이 감정가보다 지나치게 낮거나 지분·토지만·건물만 파는 표현이 있어요. 이런 물건은 시세 비교와 낙찰가 예측이 맞지 않아 보여드리지 않아요. 공고문의 유의사항을 먼저 확인하세요.</p></section>`) : ''}
${!G && !isTrap(it) && it.rr && it.rr.n >= 5 && it.appr && it.min && it.appr * it.rr.med / 100 >= it.min ? `<section class="card-block">
<h2>얼마에 낙찰될까?</h2>
<p class="muted small">최근 2주 ${esc(it.sd)} ${esc(CAT_NAME[it.cat])} 공매 ${it.rr.n}건은 감정가의 <b>${it.rr.med}%</b>(중간값)에 낙찰됐어요.</p>
<div class="compare">
<div><span class="muted small">이 비율이면</span><b>${won(it.appr * it.rr.med / 100)}</b></div>
<div><span class="muted small">최저가보다</span><b class="orange">${won(it.appr * it.rr.med / 100 - it.min)} 높음</b></div>
</div>
<p class="note">같은 지역·종류의 최근 낙찰 결과 중간값이에요. 물건마다 사정이 달라 실제 낙찰가는 크게 다를 수 있어요.</p>
</section>` : ''}

${it.mkt && !isTrap(it) ? `<section class="card-block" id="mktSec">
<h2>같은 단지 시세와 비교</h2>
<p class="muted small">같은 단지(${esc(it.mkt.apt || it.emd)}) 비슷한 면적(${Math.round(it.bld * 10) / 10}㎡ 안팎)의 최근 3개월 실거래 ${it.mkt.n}건 기준이에요.</p>
<div class="compare">
<div><span class="muted small">실거래 중간값</span><b>${won(it.mkt.med)}</b></div>
<div><span class="muted small">최저 입찰가는</span><b class="${it.mkt.ratio <= 80 ? 'orange' : ''}">시세의 ${it.mkt.ratio}%</b></div>
</div>
<table class="trades"><thead><tr><th>거래일</th><th>단지</th><th>면적·층</th><th class="num">거래가</th></tr></thead><tbody>${tradeRows}</tbody></table>
<p class="note">공매 물건과 같은 단지라는 보장은 없어요. 면적 기준(전용·공급)이 다를 수 있으니 참고만 하세요.</p>
</section>` : ''}

${(it.cat === 'goods' || it.cat === 'car') && !['right', 'stock'].includes(it.sub) ? (() => {
  const k = keywordOf(it);
  const isCar = isCarIt(it);
  const usedQ = encodeURIComponent(isCar ? `${k.model} ${k.year ? k.year + '년식 ' : ''}중고차 시세` : `${k.kw} 중고 시세`);
  const newQ = encodeURIComponent(k.kw);
  const confirmed = it.cat === 'car' ? !k.generic : (!!k.code || it.sub === 'gold');
  return `<section class="card-block">
<h2>시장에선 얼마일까?</h2>
${confirmed ? `<p class="muted small">${isCar ? '공고의 차종·연식으로 찾았어요' : it.sub === 'gold' && !k.code ? '공고의 품목·중량으로 찾았어요' : '공고에 적힌 제품번호로 찾았어요'}: <b>${esc(isCar ? `${k.model}${k.year ? ' · ' + k.year + '년식' : ''}` : k.kw)}</b></p>
${it.newp && !isCar ? `<div class="compare"><div><span class="muted small">새 제품 가격(네이버 쇼핑)</span><b>${won(it.newp)}</b></div><div><span class="muted small">공매 최저가는</span><b class="orange">새 제품의 ${Math.round((it.min || 0) / it.newp * 100)}%</b></div></div>
<p class="note">같은 검색어로 찾은 새 상품 최저가 5개의 중간값이에요. 상태·구성품이 다를 수 있어요.</p>` : ''}
<div class="link-row">
<a class="btn-outline" href="https://search.naver.com/search.naver?query=${usedQ}" target="_blank" rel="noopener">${isCar ? '중고차 시세 보기' : '중고 시세 보기'}</a>
${isCar ? '' : `<a class="btn-outline" href="https://search.shopping.naver.com/search/all?query=${newQ}" target="_blank" rel="noopener">새 제품 가격 보기</a>`}
</div>` : `<p class="plain">공고에 제품번호(모델번호)가 없어서 시세를 자동으로 보여드리지 않아요. 비슷해 보이는 다른 제품 가격이 섞이면 판단을 그르칠 수 있거든요.</p>
<p class="muted small">온비드 원문의 사진·상세 설명에서 제품번호를 확인했다면 아래에 넣어 바로 찾아보세요.</p>
<label class="input-row sm" for="codeIn"><input id="codeIn" type="text" autocomplete="off" placeholder="예: 126610LN, SM-S928N"></label>
<div class="link-row" id="codeLinks" hidden>
<a class="btn-outline" id="codeUsed" href="#" target="_blank" rel="noopener">중고 시세 보기</a>
<a class="btn-outline" id="codeNew" href="#" target="_blank" rel="noopener">새 제품 가격 보기</a>
</div>
<div class="link-row"><a class="btn-outline" href="${esc(it.url)}" target="_blank" rel="noopener">온비드 원문에서 제품번호 확인</a></div>`}
<p class="note">외부 사이트로 이동해요. 경매레이더는 중고거래 사이트의 정보를 수집하지 않아요.</p>
</section>`;
})() : ''}

<section class="card-block">
<h2>위험 신호</h2>
${risks.length ? `<ul class="risks">${risks.map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('')}</ul>` : `<p class="ok-line">데이터상 눈에 띄는 위험 신호는 없어요. 그래도 ${G ? '공고문의 물건 상태·인도 조건은' : '공고문과 등기부는'} 꼭 확인하세요.</p>`}
</section>

${G ? (() => {
  const gd = goodsGuide(it, kw);
  if (!gd) return '<details class="card-block fold" id="maxbid"><summary><h2>얼마까지 쓰면 될까?</h2></summary><p class="muted small">최저 입찰가가 공개되지 않은 물건이라 가이드를 만들 수 없어요. 온비드 원문을 확인하세요.</p>';
  const max = Math.max(...gd.lines.map((l) => l.v));
  return `<details class="card-block fold" id="maxbid" open>
<summary><h2>얼마까지 쓰면 될까?</h2><span class="muted small">이 물건 기준 가이드</span></summary>
<div class="guide-range"><span>가이드 입찰가</span><b>${won(gd.lo)}${gd.hi && gd.hi > gd.lo ? ` ~ ${won(gd.hi)}` : ''}</b><small>${gd.hot ? '비슷한 물건이 최근 감정가보다 높게 팔렸지만, 감정가를 넘겨 쓰는 건 권하지 않아요' : gd.hi && gd.hi > gd.lo ? '이 범위 안에서 쓰는 걸 권해요' : gd.lo === it.min ? '최저 입찰가 근처에서 쓰는 걸 권해요' : '이 금액 근처에서 쓰는 걸 권해요'}</small></div>
<ul class="ladder2">${gd.lines.sort((a, b) => a.v - b.v).map((l) => `<li class="l-${l.k}"><div class="ld-top"><span>${esc(l.label)}</span><b>${won(l.v)}</b></div><div class="ld-bar"><i style="width:${Math.max(4, Math.round(l.v / max * 100))}%"></i></div><small>${esc(l.sub)}</small></li>`).join('')}</ul>
<div class="guide-why"><b>${esc(gd.note[0])}</b><p>${esc(gd.capUsed ? gd.note[1] : gd.note[1].replace(/\s*(그래서 )?새 제품 가격의 \d+%[^.]*\.\s*$/, ''))}</p></div>
<p class="note">가이드는 최저 입찰가, 같은 종류 물건의 최근 낙찰가율, 새 제품 가격, 감정가로 계산한 참고값이에요. 낙찰이나 수익을 보장하지 않아요.${gd.carFee ? ' 차량은 이전등록비(약 7%)를 뺀 값을 상한으로 계산했어요.' : ''}</p>
<script type="application/json" id="guide-data">${JSON.stringify({ lo: gd.lo, hi: gd.hi })}</script>`;
})() : `<details class="card-block fold" id="maxbid" open>
<summary><h2>얼마까지 써도 될까?</h2><span class="muted small">${G ? '시세만 넣으면 계산돼요' : '최대 입찰가 거꾸로 계산'}</span></summary>
<p class="muted small">${G ? '되팔거나 새로 살 때 가격에서 원하는 이익과 비용을 빼고, 손해 보지 않는 최대 입찰가를 계산해요.' : '팔 때 예상 가격에서 비용과 원하는 이익을 빼고, 손해 보지 않는 최대 입찰가를 거꾸로 계산해요.'}</p>
<div class="form-grid">
<label>${G ? (isCar ? '중고차 시세' : '중고 시세') : '예상 매도가(시세)'}<span class="input-row sm"><input id="mbSell" type="number" inputmode="numeric" min="0" step="${G ? 1 : 100}"><span>만원</span></span></label>
<label>원하는 이익<span class="input-row sm"><input id="mbProfit" type="number" inputmode="decimal" min="0" max="50" step="1"><span>%</span></span></label>
${G ? (isCar ? `<label>이전등록비(취득세 등)<span class="input-row sm"><input id="mbTax" type="number" inputmode="decimal" min="0" max="15" step="0.1"><span>%</span></span></label>
<label>수리·탁송비<span class="input-row sm"><input id="mbRepair" type="number" inputmode="numeric" min="0" step="10"><span>만원</span></span></label>` : `<label>운반·수리비<span class="input-row sm"><input id="mbRepair" type="number" inputmode="numeric" min="0" step="1"><span>만원</span></span></label>`) : `<label>취득세 등 세금<span class="input-row sm"><input id="mbTax" type="number" inputmode="decimal" min="0" max="15" step="0.1"><span>%</span></span></label>
<label>등기·법무비<span class="input-row sm"><input id="mbFee" type="number" inputmode="decimal" min="0" max="5" step="0.1"><span>%</span></span></label>
<label>수리비<span class="input-row sm"><input id="mbRepair" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></span></label>
<label>명도·이사비<span class="input-row sm"><input id="mbEvict" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></span></label>`}
</div>
<div class="maxbid-result" id="mbResult"></div>
<p class="note">${G ? (isCar ? '차량 취득세는 차종·용도에 따라 달라요. 기본값 7%는 대략적인 출발점이에요.' : '동산은 보통 취득세·등기비가 없지만 공고문의 부가세·수수료 조건을 꼭 확인하세요.') : '세율은 물건 종류·보유 주택 수·지역에 따라 달라져요. 기본값은 대략적인 출발점일 뿐이니 본인 상황에 맞게 바꾸세요. 세금은 세무사, 권리관계는 법무사 확인을 권해요.'}</p>
`}
<h3 class="sub-h">내 입찰가로 계산해 보기</h3>

<label class="input-row" for="bid"><input id="bid" type="number" inputmode="numeric" min="0" step="100"><span>만원</span></label>
<div class="chips" id="quick"></div>
<div class="verdict" id="verdict"></div>
<div class="grid2 stat-grid">
<div class="stat"><span class="muted small">감정가 대비</span><b id="vsAppr">-</b></div>
<div class="stat"><span class="muted small">${it.mkt ? '시세 대비' : '입찰보증금(10%)'}</span><b id="${it.mkt ? 'vsMkt' : 'deposit'}">-</b></div>
${it.mkt ? '<div class="stat"><span class="muted small">입찰보증금(10%)</span><b id="deposit">-</b></div>' : ''}
</div>
<p class="note">보증금은 압류재산 공매 기준(입찰가의 10%)으로 계산했어요. 공고마다 다를 수 있으니 원문을 꼭 확인하세요.</p>
</details>

<section class="card-block">
<h2>물건 정보</h2>
<dl class="info">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
</section>

<details class="card-block fold">
<summary><h2>입찰 준비 도우미</h2><span class="accent small" id="checkCount">0 / 0</span></summary>
<p class="muted small">단계마다 바로 가는 버튼을 눌러 확인하고, 끝낸 단계는 체크해 두세요. 이 기기에 저장돼요.</p>
<div class="prep" id="checks"></div>
</details>

${similar.length ? `<section class="card-block no-pad-x"><h2 class="pad-x">비슷한 물건</h2><div class="scroller">${simCards}</div></section>` : ''}

<p class="disclaimer">출처: 한국자산관리공사 온비드, 국토교통부 실거래가 공개시스템(공공데이터포털). 데이터 기준 ${esc(kdate(updatedAt))}. 정보에 오류가 있을 수 있으니 입찰 전 반드시 온비드 원문 공고를 확인하세요. 계산 결과는 참고용이며 낙찰이나 수익을 보장하지 않아요.<br><a href="../terms.html">이용약관·면책</a> · <a href="../privacy.html">개인정보처리방침</a></p>

<div class="bottom-bar">
<button class="btn-outline" id="like2">관심 등록</button>
<a class="btn-primary" href="${esc(it.url)}" target="_blank" rel="noopener">온비드 원문 보기</a>
</div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script type="application/json" id="item-data">${JSON.stringify({ id: it.id, t: it.t, cat: it.cat, sub: it.sub || '', appr: it.appr, min: it.min, st: it.st, en: it.en, mkt: it.mkt || null, trap: !!isTrap(it), addr: ['goods', 'car'].includes(it.cat) ? '' : (it.addr || [it.sd, it.sgg, it.emd].filter(Boolean).join(' ')), place: placeOf(it), url: it.url }).replace(/</g, '\\u003c')}</script>
<script src="../item.js?v=${ASSET_V}" defer></script>
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
  // 값이 말이 안 되는 물건(최저가가 감정가의 1.5배 초과)은 빼요
  items = items.filter((it) => !(it.appr && it.min && it.min > it.appr * 1.5));
  // 같은 물건의 여러 회차는 가장 먼저 마감하는 회차 하나만 남기고, 나머지는 '다음 회차'로 붙여요
  {
    const byKey = new Map();
    for (const it of items) { const k = it.key || it.id; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(it); }
    items = [];
    for (const arr of byKey.values()) {
      arr.sort((a, b) => (a.en || '9').localeCompare(b.en || '9'));
      const head = arr[0];
      if (arr.length > 1) head.next = arr.slice(1, 4).map((x) => ({ en: x.en, min: x.min, rate: x.rate }));
      items.push(head);
    }
  }
  if (!demo && items.length === 0) throw new Error('API에서 받은 물건이 0건이에요. 이전 배포를 유지하기 위해 중단합니다.');
  if (process.env.SHOW_PHOTOS === '0') for (const it of items) it.src = '';
  const recent = (iso) => iso && now - new Date(iso).getTime() < 48 * 3600e3 && new Date(iso).getTime() <= now;
  for (const it of items) if (it.isNew === undefined) it.isNew = Boolean(recent(it.st) || recent(it.mod));
  // 입찰 마감이 가까운 물건만 (기본 45일). 너무 먼 물건과 파일 수 한도(Cloudflare 2만 개)를 함께 관리해요.
  const WINDOW = Number(process.env.WINDOW_DAYS || 45) * 864e5;
  const PAGE_MAX = Number(process.env.PAGE_MAX || 15000);
  if (!demo) {
    // 동산·차량은 사이트의 주인공이라 기간 제한 없이 모두 남기고, 부동산만 마감 45일 이내·개수 제한을 둬요
    const isG = (it) => it.cat === 'goods' || it.cat === 'car';
    const goodsAll = items.filter(isG);
    let reAll = items.filter((it) => !isG(it) && (it.pv || !it.en || new Date(it.en).getTime() - now <= WINDOW));
    const roomRe = Math.max(0, PAGE_MAX - goodsAll.length);
    if (reAll.length > roomRe) reAll = reAll.sort((a, b) => (a.en || '9').localeCompare(b.en || '9')).slice(0, roomRe);
    items = [...goodsAll, ...reAll];
    log(`동산·차량 ${goodsAll.length}건, 부동산 ${reAll.length}건`);
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
  const gRates = goodsRates(results);
  for (const it of items) {
    const rr = rates[`${SD_SHORT(it.sd)}|${it.cat}`];
    if (rr) it.rr = rr;
    if (it.cat === 'goods' || it.cat === 'car') {
      const same = gRates[`${it.cat}|${it.sub || ''}`];
      const g = same || gRates[it.cat];
      if (g) it.gr = { ...g, same: !!same };
    }
  }
  results.sort((a, b) => (b.dt || '').localeCompare(a.dt || '') || b.price - a.price);

  const updatedAt = new Date().toISOString();
  await fs.rm(DIST, { recursive: true, force: true });
  await copyDir(path.join(ROOT, 'static'), DIST);
  // 고친 화면이 바로 보이도록: 스타일·스크립트 주소에 빌드 번호를 붙여 브라우저가 옛 파일을 쓰지 않게 해요
  const V = Date.now().toString(36);
  const bust = (h) => h.replace(/(href|src)="(\.\.\/)?(style\.css|app\.js|item\.js)"/g, `$1="$2$3?v=${V}"`);
  for (const f of await fs.readdir(DIST)) if (f.endsWith('.html')) { const fp = path.join(DIST, f); await fs.writeFile(fp, bust(await fs.readFile(fp, 'utf8'))); }
  ASSET_V = V;
  // 카톡 미리보기 이미지는 절대 주소여야 잘 떠요
  if (SITE) for (const f of ['index.html', 'realestate.html', 'guide.html', 'report.html']) {
    const fp = path.join(DIST, f);
    try { const h = await fs.readFile(fp, 'utf8'); await fs.writeFile(fp, h.replace('content="og.png"', `content="${SITE}/og.png"`)); } catch (e) { /* 없는 파일 */ }
  }
  await fs.mkdir(path.join(DIST, 'data'), { recursive: true });
  await fs.mkdir(path.join(DIST, 'item'), { recursive: true });

  const LIST_MAX = Number(process.env.LIST_MAX || 2500);
  for (const it of items) it.trap = isTrap(it) || undefined;
  const prio = (it) => (it.trap ? -5 : 0) + (it.cat === 'home' ? 3 : it.cat === 'shop' ? 1.5 : it.cat === 'goods' || it.cat === 'car' ? 2 : 0)
    + (it.rate != null && it.rate >= 30 ? (100 - it.rate) / 12 : 0) + (it.mkt && it.mkt.ratio >= 40 ? 3 : 0) + (it.rank && !it.trap ? 10 : 0) + (it.isNew ? 1 : 0)
    + (it.en && new Date(it.en).getTime() - now < 3 * 864e5 ? 2 : 0) + (/서울|경기/.test(it.sd) ? 1.5 : 0);
  // 목록 파일: 동산·차량은 전부, 부동산은 남은 자리만큼 우선순위 높은 순
  const gList = items.filter((it) => it.cat === 'goods' || it.cat === 'car');
  const rList = items.filter((it) => !(it.cat === 'goods' || it.cat === 'car')).sort((a, b) => prio(b) - prio(a)).slice(0, Math.max(0, LIST_MAX - gList.length));
  const listed = [...gList, ...rList];
  // 목록에 보이는 물건의 사진만 받아요 (파일 수·용량 관리)
  if (!demo) {
    // 동산·차량과 우선순위 높은 부동산부터 큰 사진을 찾아요
    await attachPhotos(listed);
    await downloadThumbs(listed);
    await fs.mkdir(path.join(DIST, 't'), { recursive: true });
    for (const it of listed) {
      for (const g of it._gallery || []) await fs.copyFile(path.join(CACHE, 'thumbs', g), path.join(DIST, 't', g));
      if (it._gallery) it.gallery = it._gallery.map((g) => `/t/${g}`);
      if (!it._thumbFile) continue;
      await fs.copyFile(path.join(CACHE, 'thumbs', it._thumbFile), path.join(DIST, 't', it._thumbFile));
      it.thumb = `/t/${it._thumbFile}`;
    }
  }
  // 검색엔진에 내보낼 가치가 낮은 페이지(권리·재고, 함정 물건, 목록 밖이면서 사진 없는 물건)는 검색 제외
  { const listedIds = new Set(listed.map((x) => x.id));
    for (const it of items) it.lowValue = (['right', 'stock'].includes(it.sub) || !!it.trap || (!listedIds.has(it.id) && !it.thumb)) || undefined; }
  // 카톡 공유 카드: 동산·차량(권리·재고 제외)과 우선순위 높은 부동산 600건만 만들어요 (scripts/og.py가 그림을 그려요)
  const OG_MAX_RE = Number(process.env.OG_MAX_RE || 600);
  const ogTargets = [...gList.filter((it) => !['right', 'stock'].includes(it.sub)), ...rList.slice(0, OG_MAX_RE)].filter((it) => it.min);
  const ogJobs = ogTargets.map((it) => {
    it.og = `/og/${it.id}.jpg`;
    const G = it.cat === 'goods' || it.cat === 'car';
    return {
      id: it.id, t: it.t, kind: G ? (it.cat === 'car' ? '차량 공매' : `${SUB_NAME[it.sub] || '동산'} 공매`) : `${CAT_NAME[it.cat] || '부동산'} 공매`,
      min: won(it.min), appr: it.appr ? won(it.appr) : '', rate: it.rate && it.rate < 100 && !it.trap ? it.rate : null,
      region: G ? '' : [SD_SHORT(it.sd), it.sgg].filter(Boolean).join(' '), end: it.en ? kdate(it.en) : '',
      thumb: it._thumbFile ? path.join(CACHE, 'thumbs', it._thumbFile) : ''
    };
  });
  await fs.writeFile(path.join(ROOT, '.cache', 'og-jobs.json'), JSON.stringify(ogJobs)).catch(async () => { await fs.mkdir(CACHE, { recursive: true }); await fs.writeFile(path.join(CACHE, 'og-jobs.json'), JSON.stringify(ogJobs)); });
  log(`공유 카드 대상 ${ogJobs.length}건`);

  const slim = listed.map((it) => {
    const { pnu, evc, how, org, req, land, bld, url, prop, alc, key, addr, mod, stat, src, _thumbFile, _gallery, gallery, photos, spec, og, lowValue, ...rest } = it;
    return { ...rest, risk: risksOf(it).filter(([h]) => h !== '시세 비교 없음' && !h.startsWith('명도')).length };
  });
  const gRes = results.filter((r) => (r.cat === 'goods' || r.cat === 'car') && r.t).slice(0, 20);
  const recentResults = [...gRes, ...results.filter((r) => r.cat !== 'goods' && r.cat !== 'car').slice(0, 12)];
  await fs.writeFile(path.join(DIST, 'data', 'items.json'), JSON.stringify({
    updatedAt, demo, hasGoods: items.some((i) => i.cat === 'goods'), hasCar: items.some((i) => i.cat === 'car'),
    hasRank: items.some((i) => i.rank), total: items.length, results: recentResults, items: slim
  }));
  // 첫 화면용 가벼운 데이터: 동산·차량 + 화면 진열에 쓰는 부동산 일부 + 미리 센 숫자. 전체 목록은 뒤에서 따로 받아요.
  {
    const soon = (it) => it.en && new Date(it.en).getTime() - now <= 48 * 3600e3 && new Date(it.en).getTime() > now;
    const gIds = new Set(slim.filter((x) => x.cat === 'goods' || x.cat === 'car').map((x) => x.id));
    const started = (x) => !x.st || new Date(x.st).getTime() <= now;
    const reSlim = slim.filter((x) => !gIds.has(x.id)).sort((a, b) => started(b) - started(a));
    const pickRe = new Set([
      ...reSlim.slice(0, 300), ...reSlim.filter((x) => x.rank), ...reSlim.filter(soon).slice(0, 80),
      ...reSlim.filter((x) => x.rate != null && x.rate <= 60 && !x.trap).slice(0, 120), ...reSlim.filter((x) => x.mkt).slice(0, 60)
    ]);
    const homeItems = [...slim.filter((x) => gIds.has(x.id)), ...pickRe];
    const stats = {
      total: listed.length, goods: listed.filter((x) => (x.cat === 'goods' || x.cat === 'car') && !['right', 'stock'].includes(x.sub)).length,
      re: listed.filter((x) => !(x.cat === 'goods' || x.cat === 'car')).length, soon: listed.filter(soon).length
    };
    await fs.writeFile(path.join(DIST, 'data', 'home.json'), JSON.stringify({
      updatedAt, demo, partial: true, stats, hasGoods: items.some((i) => i.cat === 'goods'), hasCar: items.some((i) => i.cat === 'car'),
      hasRank: items.some((i) => i.rank), total: items.length, results: recentResults, items: homeItems
    }));
    log(`첫 화면 데이터 ${homeItems.length}건`);
    // 검색엔진·느린 폰을 위해 첫 화면 목록 30개를 미리 그려 둬요 (스크립트가 돌면 바로 바뀌어요)
    const goodOne = (x) => (x.thumb ? 2 : 0) + (x.rate != null && x.rate < 100 ? 1 : 0) + (['luxury', 'gold', 'car', 'elec'].includes(x.sub) ? 2 : 0);
    const pre = slim.filter((x) => (x.cat === 'goods' || x.cat === 'car') && !['right', 'stock', 'goods_etc', 'machine'].includes(x.sub) && x.min && !x.trap)
      .sort((a, b) => goodOne(b) - goodOne(a)).slice(0, 20).concat(reSlim.filter((x) => !x.trap).slice(0, 10));
    const preHtml = pre.map((x) => `<a class="pre-item" href="item/${esc(x.id)}.html"><b>${esc(x.t)}</b><span>${won(x.min)}${x.rate && x.rate < 100 ? ` · 감정가의 ${x.rate}%` : ''}</span></a>`).join('');
    for (const f of ['index.html']) {
      const fp = path.join(DIST, f);
      const h = await fs.readFile(fp, 'utf8');
      await fs.writeFile(fp, h.replace('<div class="list" id="list"></div>', `<div class="list" id="list">${preHtml}</div>`));
    }
  }
  // 검색 색인: 상세 페이지가 있는 모든 물건 (id, 이름, 시도, 시군구, 종류, 최저가, 감정가 대비%)
  await fs.writeFile(path.join(DIST, 'data', 'search.json'), JSON.stringify(items.filter((it) => !['right', 'stock'].includes(it.sub) || true)
    .map((it) => [it.id, it.t, SD_SHORT(it.sd), it.sgg || '', it.cat, it.min ?? null, it.rate && it.rate < 100 && !it.trap ? it.rate : 0])));
  await fs.writeFile(path.join(DIST, 'report.html'), reportPage(items, recentResults, demo, updatedAt));

  for (const it of items) {
    const Gx = it.cat === 'goods' || it.cat === 'car';
    const same = (s) => s.id !== it.id && s.cat === it.cat && !s.trap && (!Gx || s.sub === it.sub);
    const near = (a, b) => Math.abs(Math.log((a.min || 1) / (it.min || 1))) - Math.abs(Math.log((b.min || 1) / (it.min || 1)));
    const similar = Gx ? items.filter((s) => same(s) && s.min).sort((a, b) => ((b.use === it.use) - (a.use === it.use)) || near(a, b)).slice(0, 4)
      : items.filter((s) => same(s) && s.sd === it.sd && s.sgg === it.sgg).slice(0, 4);
    if (!Gx && similar.length < 2) similar.push(...items.filter((s) => same(s) && s.sd === it.sd && !similar.includes(s)).slice(0, 4 - similar.length));
    await fs.writeFile(path.join(DIST, 'item', `${it.id}.html`), itemPage(it, tradeDetail[it.id] || [], similar, demo, updatedAt));
  }
  // Cloudflare Pages는 한 사이트에 파일 2만 개까지라 미리 확인해요 (공유 카드는 다음 단계에서 더해져요)
  { let n = 0; const walk = async (d) => { for (const e of await fs.readdir(d, { withFileTypes: true })) { if (e.isDirectory()) await walk(path.join(d, e.name)); else n++; } };
    await walk(DIST); n += items.filter((it) => it.og).length;
    log(`배포 파일 약 ${n.toLocaleString('ko-KR')}개 (한도 20,000)${n > 18000 ? ' ⚠ 한도에 가까워요. LIST_MAX·OG_MAX_RE를 줄이세요.' : ''}`); }

  if (SITE) {
    const urls = [`${SITE}/`, `${SITE}/realestate.html`, `${SITE}/report.html`, `${SITE}/guide.html`, `${SITE}/terms.html`, `${SITE}/privacy.html`, ...items.filter((it) => !it.lowValue).map((it) => `${SITE}/item/${it.id}.html`)];
    log(`사이트맵 ${urls.length}개 (검색 제외 ${items.filter((it) => it.lowValue).length}개)`);
    await fs.writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
    await fs.writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  } else {
    await fs.writeFile(path.join(DIST, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  }
  log(`완료: dist/ (물건 페이지 ${items.length}개)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
