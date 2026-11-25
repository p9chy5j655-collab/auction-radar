// 인증키가 없을 때 쓰는 예시 데이터 (실제 물건이 아닙니다)
const H = 3600e3;
const at = (h) => new Date(Date.now() + h * H).toISOString();

const base = [
  { t: '서울특별시 송파구 ○○동 아파트 84㎡', sd: '서울특별시', sgg: '송파구', emd: '오금동', cat: 'home', use: '주거용건물 · 아파트', appr: 1240000000, min: 868000000, fails: 1, en: 40, bld: 84.9, mkt: { med: 1185000000, n: 7, ratio: 73 } },
  { t: '경기도 성남시 분당구 ○○동 오피스텔 29㎡', sd: '경기도', sgg: '성남시 분당구', emd: '정자동', cat: 'home', use: '주거용건물 · 오피스텔', appr: 320000000, min: 157000000, fails: 3, en: 70, bld: 29.1 },
  { t: '제주특별자치도 서귀포시 ○○동 단독주택', sd: '제주특별자치도', sgg: '서귀포시', emd: '서홍동', cat: 'home', use: '주거용건물 · 단독주택', appr: 560000000, min: 274000000, fails: 3, en: 130, bld: 112 },
  { t: '서울특별시 노원구 ○○동 아파트 59㎡', sd: '서울특별시', sgg: '노원구', emd: '상계동', cat: 'home', use: '주거용건물 · 아파트', appr: 620000000, min: 434000000, fails: 1, en: 20, bld: 59.9, mkt: { med: 585000000, n: 12, ratio: 74 }, isNew: true },
  { t: '인천광역시 연수구 ○○동 1층 상가 66㎡', sd: '인천광역시', sgg: '연수구', emd: '송도동', cat: 'shop', use: '상가용및업무용건물 · 근린생활시설', appr: 710000000, min: 348000000, fails: 3, en: 90 },
  { t: '강원특별자치도 평창군 ○○면 임야 3,300㎡', sd: '강원특별자치도', sgg: '평창군', emd: '봉평면', cat: 'land', use: '토지 · 임야', appr: 98000000, min: 34300000, fails: 5, en: 160, land: 3300 },
  { t: '경기도 화성시 ○○동 토지 지분 1/3', sd: '경기도', sgg: '화성시', emd: '봉담읍', cat: 'land', use: '토지 · 대지', appr: 150000000, min: 105000000, fails: 1, en: 55, land: 420, alc: true, isNew: true },
  { t: '서울특별시 강서구 ○○동 아파트 76㎡', sd: '서울특별시', sgg: '강서구', emd: '등촌동', cat: 'home', use: '주거용건물 · 아파트', appr: 880000000, min: 704000000, fails: 0, en: 150, bld: 76.4, mkt: { med: 905000000, n: 5, ratio: 78 }, isNew: true },
  { t: '부산광역시 해운대구 ○○동 오피스 120㎡', sd: '부산광역시', sgg: '해운대구', emd: '우동', cat: 'shop', use: '상가용및업무용건물 · 업무시설', appr: 540000000, min: 378000000, fails: 1, en: 30 },
  { t: '대구광역시 달서구 ○○동 공장용지', sd: '대구광역시', sgg: '달서구', emd: '성서동', cat: 'etc', use: '산업용및기타특수용건물 · 공장', appr: 1320000000, min: 660000000, fails: 2, en: 100 },
  { t: '롤렉스 서브마리너 손목시계', sd: '서울특별시', sgg: '종로구', emd: '', cat: 'goods', use: '동산 · 시계', appr: 13500000, min: 6750000, fails: 2, en: 45, isNew: true },
  { t: '골드바 1kg', sd: '서울특별시', sgg: '중구', emd: '', cat: 'goods', use: '동산 · 귀금속', appr: 158000000, min: 158000000, fails: 0, en: 110 },
  { t: '에르메스 버킨 핸드백', sd: '부산광역시', sgg: '부산진구', emd: '', cat: 'goods', use: '동산 · 잡화', appr: 19000000, min: 13300000, fails: 1, en: 60 },
  { t: '2021년식 벤츠 E클래스 세단', sd: '경기도', sgg: '화성시', emd: '', cat: 'car', use: '차량 · 승용차', appr: 42000000, min: 21000000, fails: 3, en: 22 },
  { t: '2019년식 포르쉐 카이엔', sd: '서울특별시', sgg: '강서구', emd: '', cat: 'car', use: '차량 · 승용차', appr: 68000000, min: 47600000, fails: 1, en: 75, isNew: true },
  { t: '2022년식 현대 포터2 화물차', sd: '대구광역시', sgg: '달서구', emd: '', cat: 'car', use: '차량 · 화물차', appr: 14500000, min: 7100000, fails: 3, en: 18 }
];

export function sampleItems() {
  return base.map((b, i) => {
    const id = `DEMO-${String(i + 1).padStart(3, '0')}_1`;
    const item = {
      id, t: b.t, sd: b.sd, sgg: b.sgg, emd: b.emd, cat: b.cat, use: b.use,
      appr: b.appr, min: b.min, rate: Math.round((b.min / b.appr) * 100), fails: b.fails,
      st: at(-24), en: at(b.en), stat: '입찰진행중', thumb: '',
      land: b.land || null, bld: b.bld || null,
      prop: b.cat === 'goods' || b.cat === 'car' ? '압류재산' : '압류재산',
      org: '한국자산관리공사', req: '', evc: b.cat === 'home' ? '매수인' : '', how: '일반경쟁 · 최고가방식',
      pv: false, alc: Boolean(b.alc), mod: b.isNew ? at(-3) : at(-200), isNew: Boolean(b.isNew), pnu: '',
      url: 'https://www.onbid.co.kr'
    };
    if (b.mkt) {
      item.mkt = b.mkt;
      item.demoTrades = [0, 1, 2, 3].map((k) => ({
        ymd: new Date(Date.now() - (k * 17 + 5) * 24 * H).toISOString().slice(0, 10),
        apt: '○○아파트', emd: b.emd, area: b.bld, floor: 3 + k * 4,
        price: Math.round((b.mkt.med * (0.96 + k * 0.025)) / 1e6) * 1e6
      }));
    }
    return item;
  });
}

export function sampleResults() {
  const d = (k) => new Date(Date.now() - k * 864e5).toISOString();
  return [
    { t: '서울특별시 노원구 ○○동 아파트 59㎡', sd: '서울특별시', sgg: '노원구', cat: 'home', appr: 620000000, price: 571000000, rate: 92, bidders: 23, dt: d(1) },
    { t: '샤넬 클래식 플랩백', sd: '서울특별시', sgg: '중구', cat: 'goods', appr: 11000000, price: 12400000, rate: 113, bidders: 17, dt: d(1) },
    { t: '경기도 고양시 ○○동 오피스텔 33㎡', sd: '경기도', sgg: '고양시 일산동구', cat: 'home', appr: 210000000, price: 158000000, rate: 75, bidders: 6, dt: d(2) },
    { t: '충청남도 당진시 ○○리 토지 1,650㎡', sd: '충청남도', sgg: '당진시', cat: 'land', appr: 210000000, price: 98000000, rate: 47, bidders: 2, dt: d(3) },
    { t: '서울특별시 강동구 ○○동 아파트 84㎡', sd: '서울특별시', sgg: '강동구', cat: 'home', appr: 1150000000, price: 1062000000, rate: 92, bidders: 31, dt: d(4) },
    { t: '서울특별시 송파구 ○○동 빌라 49㎡', sd: '서울특별시', sgg: '송파구', cat: 'home', appr: 380000000, price: 301000000, rate: 79, bidders: 9, dt: d(5) }
  ];
}
