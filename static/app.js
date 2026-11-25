(function () {
  'use strict';
  // 페이지마다 없는 요소가 있어도 오류 없이 넘어가도록 빈 요소를 돌려줘요
  var DUMMY = document.createElement('div');
  var $ = function (id) { return document.getElementById(id) || DUMMY; };
  var MODE = document.body.getAttribute('data-mode') || 'goods'; // goods: 동산·차량 구경, re: 부동산
  var allItems = [];
  var PAGE = 30;
  var CAT = { home: '아파트·주택', shop: '상가·업무', land: '토지', etc: '기타 부동산', goods: '동산', car: '차량' };
  var SUB = { right: '주식·채권·권리', gold: '귀금속·금', luxury: '명품·시계', elec: '전자제품', machine: '기계·장비', living: '가구·생활', stock: '재고·원자재', goods_etc: '기타 동산', car: '자동차', heavy: '중장비·선박' };
  // 구경하는 재미가 있는 물건(이색): 주식·채권·재고·기계는 빼요
  var ODD = { luxury: 1, gold: 1, elec: 1, living: 1, car: 1, heavy: 1 };
  var GROUP = { luxury: 'gL', gold: 'gL', elec: 'eL', living: 'eL', car: 'cH', heavy: 'cH', right: 'oR', machine: 'oR', stock: 'oR', goods_etc: 'oR' };
  function isOdd(it) { return !!ODD[it.sub] || (!it.sub && (it.cat === 'goods' || it.cat === 'car')); }
  var GOODS_CATS = [['luxury', '명품·시계'], ['gold', '금·귀금속'], ['elec', '전자기기'], ['car', '자동차'], ['living', '생활·가구'], ['heavy', '중장비·선박'], ['oR', '권리·기타']];
  function grp(it) {
    if (MODE === 'goods') return ({ right: 'oR', machine: 'oR', stock: 'oR', goods_etc: 'oR' })[it.sub] || it.sub || it.cat;
    return GROUP[it.sub] || it.cat;
  }
  function catLabel(it) { return SUB[it.sub] || CAT[it.cat]; }
  function iconKey(it) { return it.sub && ICON[it.sub] ? it.sub : it.cat; }
  var ICON = {
    home: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
    shop: '<path d="M4 9l1-5h14l1 5"/><path d="M4 9v11h16V9"/><path d="M4 9h16"/><path d="M10 20v-5h4v5"/>',
    land: '<path d="M3 20l6-9 4 5 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
    etc: '<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M8 7V4h8v3"/>',
    goods: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/><path d="M12 21L8 9l4-6 4 6z"/>',
    car: '<path d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16"/><rect x="3" y="16" width="18" height="3" rx="1"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>',
    luxury: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/><path d="M12 21L8 9l4-6 4 6z"/>',
    gold: '<path d="M4 17l2-6h12l2 6z"/><path d="M8 11l1.5-5h5L16 11"/><path d="M4 17h16"/>',
    elec: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    living: '<path d="M4 12V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M3 12h18v5H3z"/><path d="M5 17v2M19 17v2"/>',
    machine: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    stock: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    right: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h7M9 17h5"/>',
    goods_etc: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/>',
    heavy: '<path d="M3 17h11v-5H8l-2 5"/><path d="M14 13l4-7 3 2-2 5"/><circle cx="6" cy="19" r="1.5"/><circle cx="12" cy="19" r="1.5"/>'
  };
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
  var SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  var PRICES = [
    { id: 'any', label: '상관없음', lo: 0, hi: Infinity },
    { id: 'u1', label: '1억 이하', lo: 0, hi: 1e8 },
    { id: 'u3', label: '1~3억', lo: 1e8, hi: 3e8 },
    { id: 'u6', label: '3~6억', lo: 3e8, hi: 6e8 },
    { id: 'o6', label: '6억 이상', lo: 6e8, hi: Infinity }
  ];

  var PURPOSES = [
    { id: 'live', label: '내가 살 집' },
    { id: 'invest', label: '투자 목적' },
    { id: 'small', label: '소액 재테크' },
    { id: 'fun', label: '구경·이색 물건' }
  ];
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };

  var data = { items: [], demo: false };
  var st = { tab: 'top', cat: 'all', sido: '', q: '', sort: 'auto', shown: PAGE };
  var liked = store.get('ar_liked', {});
  var cond = store.get('ar_cond', null);
  if (cond && !cond.purpose) cond.purpose = 'invest';
  var draft = cond ? { sidos: cond.sidos.slice(), price: cond.price, purpose: cond.purpose } : { sidos: [], price: 'any', purpose: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(v) {
    if (v == null) return '비공개';
    var man = Math.round(v / 10000);
    if (man >= 10000) {
      var eok = Math.floor(man / 10000), rest = man % 10000;
      return eok.toLocaleString('ko-KR') + '억' + (rest ? ' ' + rest.toLocaleString('ko-KR') + '만' : '');
    }
    return man.toLocaleString('ko-KR') + '만';
  }
  function hoursLeft(it) { return it.en ? (new Date(it.en).getTime() - Date.now()) / 3600e3 : Infinity; }
  function notStarted(it) { return it.st && new Date(it.st).getTime() > Date.now(); }
  function ddayLabel(it) {
    if (notStarted(it)) {
      var d = new Date(it.st);
      return '입찰 예정 ' + (d.getMonth() + 1) + '.' + d.getDate();
    }
    var h = hoursLeft(it);
    if (!isFinite(h)) return '';
    if (h < 0) return '마감';
    if (h < 24) return '오늘 마감 ' + Math.max(1, Math.floor(h)) + '시간 남음';
    return '마감 D-' + Math.ceil(h / 24);
  }
  // 감정가 30% 미만은 숨은 조건(인수 보증금·지분 등)이 많아 추천에서 빼요
  function lowball(it) { return !!it.trap || (it.rate != null && it.rate < 30); }
  function cheapOdd(it) { return isOdd(it) && it.min != null && it.min <= 1000000 && !it.risk && !lowball(it); }
  function isHalf(it) { return it.rate != null && it.rate <= 50 && !lowball(it); }
  function isCheap(it) { return it.mkt && it.mkt.ratio <= 85 && it.mkt.ratio >= 40 && !lowball(it); }
  function isGd(i) { return i.cat === 'goods' || i.cat === 'car'; }
  var RE_CATS = [['home', '아파트·주택'], ['shop', '상가·업무'], ['land', '토지']];
  function score(it) {
    var s = 0;
    if (it.cat === 'home') s += 3; else if (it.cat === 'shop' || isOdd(it)) s += 1.5;
    if (it.thumb) s += 1;
    if (/서울|경기/.test(it.sd)) s += 2;
    if (it.rate != null && !lowball(it)) s += Math.max(0, (100 - it.rate) / 12);
    if (isCheap(it)) s += Math.max(0, (100 - it.mkt.ratio) / 6);
    if (hoursLeft(it) < 72) s += 1;
    if (notStarted(it)) s -= 1;
    if (it.isNew) s += 1;
    if (it.rank) s += Math.max(0, 4 - it.rank / 5);
    s -= (it.risk || 0) * 1.5;
    return s;
  }
  function fitScore(it, c) {
    var s = score(it);
    var disc = it.rate != null ? 100 - it.rate : 0;
    var mk = it.mkt ? 100 - it.mkt.ratio : 0;
    if (c.purpose === 'live') s += mk / 4 - (it.risk || 0) * 3 + (it.cat === 'home' ? 2 : 0);
    else if (c.purpose === 'invest') s += disc / 8 + mk / 3;
    else if (c.purpose === 'small') s += it.min != null ? Math.max(0, 6 - it.min / 2e7) : 0;
    else if (c.purpose === 'fun') s += (isOdd(it) ? 6 : 0) + disc / 10;
    return s;
  }
  function matchesCond(it, c) {
    if (!c) return false;
    if (c.purpose === 'live' && it.cat !== 'home') return false;
    if (c.purpose === 'invest' && ['home', 'shop', 'land'].indexOf(it.cat) === -1) return false;
    if (c.purpose === 'small' && (it.min == null || it.min > 1e8)) return false;
    if (c.sidos.length && c.sidos.indexOf(shortSido(it.sd)) === -1) return false;
    var p = PRICES.filter(function (x) { return x.id === c.price; })[0] || PRICES[0];
    if (it.min == null) return c.price === 'any';
    return it.min >= p.lo && it.min < p.hi;
  }
  function shortSido(sd) {
    return String(sd || '').replace(/특별자치시|특별자치도|특별시|광역시|도$/g, '').replace(/^충청북$/, '충북').replace(/^충청남$/, '충남').replace(/^전라북$|^전북$/, '전북').replace(/^전라남$/, '전남').replace(/^경상북$/, '경북').replace(/^경상남$/, '경남') || '기타';
  }

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function itemUrl(it) { return 'item/' + encodeURIComponent(it.id) + '.html'; }
  function share(it) {
    var url = new URL(itemUrl(it), location.href).href;
    var title = it.t + ' · 최저 ' + won(it.min) + (it.rate ? ' (감정가의 ' + it.rate + '%)' : '');
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(title + '\n' + url).then(function () { toast('링크를 복사했어요. 카톡에 붙여넣어 보세요.'); }, function () { toast(url); });
    else toast(url);
  }

  // ---------- 그리기 ----------
  function tabsDef() {
    var t;
    if (MODE === 'goods') {
      t = [
        { id: 'top', label: '추천', head: '추천 물건', sub: '사진이 있고 눈길 끄는 물건을 먼저 보여드려요.' },
        { id: 'closing', label: '곧 마감', head: '48시간 안에 마감', sub: '입찰 마감이 가까운 순서예요.' },
        { id: 'new', label: '새로 들어온', head: '새로 들어온 물건', sub: '최근 48시간 안에 입찰이 시작됐거나 바뀐 물건이에요.' },
        { id: 'half', label: '반값', head: '감정가 50% 이하 물건', sub: '여러 번 유찰돼 값이 많이 내려간 물건이에요. 동산·차량을 먼저 보여드려요.' },
        { id: 'cheapodd', label: '100만원 이하', head: '100만원 이하로 시작하는 물건', sub: '최저가가 100만원 이하이고 위험 신호가 없는 물건이에요.' },
        { id: 'rank', label: '온비드 인기', head: '온비드에서 관심 많은 물건', sub: '온비드에서 일주일간 관심 저장이 많았던 순위예요.' }
      ];
    } else {
      t = [
        { id: 'top', label: '주목', head: '주목할 물건', sub: '할인 폭, 지역, 주변 시세와의 차이를 함께 따져 골랐어요.' },
        { id: 'rank', label: '온비드 인기', head: '온비드에서 관심 많은 물건', sub: '온비드에서 일주일간 관심 저장이 많았던 순위예요.' },
        { id: 'half', label: '반값', head: '감정가 50% 이하 물건', sub: '여러 번 유찰돼 값이 많이 내려간 물건이에요.' },
        { id: 'cheap', label: '시세보다 싼', head: '주변 시세보다 싼 아파트·주택', sub: '최저가가 같은 동 비슷한 면적 실거래 중간값의 85% 이하예요.' },
        { id: 'new', label: '새 물건', head: '새로 올라온 물건', sub: '최근 48시간 안에 입찰이 시작됐거나 바뀐 물건이에요.' },
        { id: 'closing', label: '마감 임박', head: '48시간 안에 마감', sub: '입찰 마감이 가까운 순서예요.' }
      ];
    }
    if (!data.items.some(function (i) { return i.rank; })) t = t.filter(function (x) { return x.id !== 'rank'; });
    if (cond) t.unshift({ id: 'cond', label: '맞춤', head: '나에게 맞는 물건', sub: '' });
    var n = Object.keys(liked).length;
    if (n || st.tab === 'liked') t.push({ id: 'liked', label: '관심 ' + n, head: '관심 등록한 물건', sub: '동산·부동산 모두 모아 보여드려요. 마감이 지나면 사라져요.' });
    return t;
  }

  function filtered() {
    var q = st.q.trim().toLowerCase();
    var source = (st.tab === 'liked' || MODE === 'goods') ? allItems : data.items;
    var list = source.filter(function (it) {
      if (st.cat !== 'all' && grp(it) !== st.cat) return false;
      if (st.sido && shortSido(it.sd) !== st.sido) return false;
      if (q && (it.t + ' ' + it.sd + ' ' + it.sgg + ' ' + it.emd + ' ' + it.use + ' ' + (CAT[it.cat] || '')).toLowerCase().indexOf(q) === -1) return false;
      switch (st.tab) {
        case 'half': return isHalf(it);
        case 'rank': return !!it.rank;
        case 'cheapodd': return cheapOdd(it);
        case 'cheap': return isCheap(it);
        case 'new': return it.isNew;
        case 'closing': return hoursLeft(it) <= 48;
        case 'odd': return isOdd(it);
        case 'liked': return !!liked[it.id];
        case 'cond': return matchesCond(it, cond);
        default: return true;
      }
    });
    var sort = st.sort;
    if (sort === 'auto') sort = st.tab === 'cheapodd' ? 'low' : st.tab === 'rank' ? 'rank' : st.tab === 'half' ? 'rate' : st.tab === 'closing' ? 'end' : st.tab === 'cheap' ? 'mkt' : st.tab === 'cond' ? 'fit' : 'score';
    var cmp = {
      score: function (a, b) { return (MODE === 'goods' ? (isGd(b) ? 1 : 0) - (isGd(a) ? 1 : 0) : 0) || score(b) - score(a); },
      rank: function (a, b) { return (a.rank || 99) - (b.rank || 99); },
      fit: function (a, b) { return fitScore(b, cond) - fitScore(a, cond); },
      rate: function (a, b) { return (a.rate == null ? 999 : a.rate) - (b.rate == null ? 999 : b.rate); },
      mkt: function (a, b) { return (a.mkt ? a.mkt.ratio : 999) - (b.mkt ? b.mkt.ratio : 999); },
      end: function (a, b) { return hoursLeft(a) - hoursLeft(b); },
      low: function (a, b) { return (a.min == null ? Infinity : a.min) - (b.min == null ? Infinity : b.min); },
      high: function (a, b) { return (b.min || 0) - (a.min || 0); }
    }[sort];
    return list.sort(cmp);
  }

  // 사진이 없을 때 쓰는 2톤 일러스트 (사람 없음)
  var ART = {
    watch:'<svg viewBox="0 0 100 100"><rect x="38" y="6" width="24" height="22" rx="4" fill="#9C3D5E" opacity=".35"/><rect x="38" y="72" width="24" height="22" rx="4" fill="#9C3D5E" opacity=".35"/><circle cx="50" cy="50" r="27" fill="#fff" stroke="#9C3D5E" stroke-width="5"/><circle cx="50" cy="50" r="19" fill="#2B2F3A"/><path d="M50 36v14l9 6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/><rect x="78" y="46" width="5" height="8" rx="2" fill="#9C3D5E"/></svg>',
    bag:'<svg viewBox="0 0 100 100"><path d="M34 34c0-12 7-18 16-18s16 6 16 18" fill="none" stroke="#8A5A3C" stroke-width="5"/><rect x="18" y="34" width="64" height="48" rx="8" fill="#C27A4A"/><path d="M18 50h64" stroke="#8A5A3C" stroke-width="3"/><rect x="44" y="46" width="12" height="10" rx="2" fill="#E9C46A"/></svg>',
    gold:'<svg viewBox="0 0 100 100"><path d="M20 70l10-28h40l10 28z" fill="#E0A82E"/><path d="M30 42h40l-6-14H36z" fill="#F2C94C"/><path d="M36 28h28" stroke="#FFF3C4" stroke-width="3"/><text x="50" y="64" text-anchor="middle" font-size="9" font-weight="800" fill="#7A5300" font-family="sans-serif">999.9</text></svg>',
    car:'<svg viewBox="0 0 100 100"><path d="M12 62l6-16c2-5 6-8 12-8h36c6 0 10 3 13 8l9 16v10H12z" fill="#2F4B7C"/><path d="M28 46l5-8h28l7 8z" fill="#BFD3EE"/><circle cx="30" cy="72" r="8" fill="#15171C"/><circle cx="72" cy="72" r="8" fill="#15171C"/><circle cx="30" cy="72" r="3" fill="#C9CDD6"/><circle cx="72" cy="72" r="3" fill="#C9CDD6"/></svg>',
    suv:'<svg viewBox="0 0 100 100"><path d="M10 64l4-18c1-5 5-8 10-8h40c5 0 9 2 12 6l12 14v12H10z" fill="#6B2E2E"/><path d="M22 46l3-6h34l9 6z" fill="#D9E4F2"/><circle cx="28" cy="72" r="9" fill="#15171C"/><circle cx="74" cy="72" r="9" fill="#15171C"/><circle cx="28" cy="72" r="3.5" fill="#C9CDD6"/><circle cx="74" cy="72" r="3.5" fill="#C9CDD6"/></svg>',
    truck:'<svg viewBox="0 0 100 100"><rect x="8" y="36" width="30" height="32" rx="4" fill="#2F6FB0"/><rect x="13" y="41" width="18" height="11" rx="2" fill="#D9E4F2"/><rect x="40" y="50" width="52" height="18" fill="#8D96A3"/><circle cx="24" cy="72" r="7" fill="#15171C"/><circle cx="74" cy="72" r="7" fill="#15171C"/></svg>',
    apt:'<svg viewBox="0 0 100 100"><rect x="22" y="14" width="34" height="72" fill="#3E6B4A"/><rect x="56" y="34" width="24" height="52" fill="#5E8C68"/><g fill="#E7F2E5"><rect x="28" y="22" width="8" height="6"/><rect x="42" y="22" width="8" height="6"/><rect x="28" y="34" width="8" height="6"/><rect x="42" y="34" width="8" height="6"/><rect x="28" y="46" width="8" height="6"/><rect x="42" y="46" width="8" height="6"/><rect x="28" y="58" width="8" height="6"/><rect x="42" y="58" width="8" height="6"/><rect x="62" y="42" width="12" height="6"/><rect x="62" y="54" width="12" height="6"/></g><rect x="36" y="72" width="8" height="14" fill="#E7F2E5"/></svg>',
    house:'<svg viewBox="0 0 100 100"><path d="M14 50l36-28 36 28" fill="none" stroke="#3E6B4A" stroke-width="6" stroke-linejoin="round"/><rect x="24" y="48" width="52" height="34" fill="#5E8C68"/><rect x="44" y="60" width="12" height="22" fill="#E7F2E5"/><rect x="30" y="56" width="9" height="9" fill="#E7F2E5"/><rect x="61" y="56" width="9" height="9" fill="#E7F2E5"/></svg>',
    land:'<svg viewBox="0 0 100 100"><path d="M6 80l26-38 16 22 12-14 34 30z" fill="#7C6A43"/><path d="M32 42l7 10-7-2-7 2z" fill="#F4EDDD"/><circle cx="74" cy="26" r="8" fill="#D9A441"/><path d="M6 86h88" stroke="#7C6A43" stroke-width="3" stroke-dasharray="4 4"/></svg>',
    shop:'<svg viewBox="0 0 100 100"><rect x="16" y="40" width="68" height="44" fill="#5B4B8A"/><path d="M12 28h76l-6 14H18z" fill="#8A7BC0"/><path d="M12 28h76" stroke="#5B4B8A" stroke-width="2"/><rect x="24" y="52" width="24" height="32" fill="#E9E5F3"/><rect x="54" y="52" width="22" height="16" fill="#E9E5F3"/></svg>',
    elec:'<svg viewBox="0 0 100 100"><rect x="18" y="24" width="64" height="40" rx="4" fill="#24446B"/><rect x="23" y="29" width="54" height="30" rx="2" fill="#BFD7F2"/><path d="M10 68h80l-6 8H16z" fill="#8D96A3"/><rect x="70" y="40" width="16" height="30" rx="3" fill="#15171C"/><rect x="72" y="43" width="12" height="22" rx="1" fill="#6FA8DC"/></svg>',
    heavy:'<svg viewBox="0 0 100 100"><rect x="14" y="58" width="44" height="12" rx="6" fill="#3B3F48"/><rect x="22" y="40" width="26" height="18" rx="3" fill="#E0A82E"/><rect x="28" y="44" width="10" height="9" fill="#FFF3C4"/><path d="M48 46l20-16 14 20" fill="none" stroke="#E0A82E" stroke-width="6" stroke-linejoin="round"/><path d="M78 50l8 10-12 2z" fill="#7A5300"/><circle cx="22" cy="64" r="3" fill="#C9CDD6"/><circle cx="50" cy="64" r="3" fill="#C9CDD6"/></svg>',
    box:'<svg viewBox="0 0 100 100"><path d="M50 14l32 14v40L50 84 18 68V28z" fill="#B38B59"/><path d="M50 14l32 14-32 14-32-14z" fill="#D9B98A"/><path d="M50 42v42" stroke="#8A6A3F" stroke-width="3"/><path d="M34 21l32 14" stroke="#F4E4C8" stroke-width="5"/></svg>',
    doc:'<svg viewBox="0 0 100 100"><rect x="24" y="12" width="52" height="72" rx="6" fill="#fff" stroke="#5B4B8A" stroke-width="4"/><g stroke="#8A7BC0" stroke-width="4" stroke-linecap="round"><path d="M34 30h32M34 42h32M34 54h20"/></g><circle cx="62" cy="70" r="10" fill="#C0262D"/><path d="M58 70l3 3 5-6" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    living:'<svg viewBox="0 0 100 100"><rect x="16" y="46" width="68" height="22" rx="6" fill="#C2410C"/><rect x="22" y="32" width="56" height="18" rx="6" fill="#F08A4B"/><rect x="12" y="44" width="10" height="26" rx="4" fill="#9A3412"/><rect x="78" y="44" width="10" height="26" rx="4" fill="#9A3412"/><path d="M22 70v8M78 70v8" stroke="#5B2A0E" stroke-width="4"/></svg>'
  };
  var TINT = { watch: '#F4E3EA', bag: '#F4E3EA', gold: '#F6E9C4', car: '#DFEAF6', suv: '#DFEAF6', truck: '#DFEAF6', apt: '#E3EEE2', house: '#E3EEE2', land: '#ECE4D3', shop: '#E9E5F3', elec: '#DDE8F5', heavy: '#F6ECCF', box: '#EFE6D6', doc: '#E9E5F3', living: '#F8E3D6' };
  function artKey(it) {
    var t = it.t || '';
    switch (it.sub || it.cat) {
      case 'luxury': return /가방|백|핸드백|지갑/.test(t) ? 'bag' : 'watch';
      case 'gold': return 'gold';
      case 'elec': return 'elec';
      case 'car': return /포터|봉고|트럭|화물|카고/.test(t) ? 'truck' : /SUV|카이엔|팰리세이드|쏘렌토|싼타페|X[3-7]|GV80|카니발|투싼|스포티지/.test(t) ? 'suv' : 'car';
      case 'heavy': return 'heavy';
      case 'machine': return 'heavy';
      case 'living': return 'living';
      case 'right': case 'stock': return 'doc';
      case 'goods_etc': return 'box';
      case 'home': return /아파트|오피스텔|도시형|빌라|다세대|연립/.test(t + (it.use || '')) ? 'apt' : 'house';
      case 'land': return 'land';
      case 'shop': return 'shop';
      default: return 'shop';
    }
  }
  function shortName(it) {
    var t = String(it.t || '').replace(/\s*\((압수물|몰수품|압류물)\)$/, '').replace(/^\d{4}년식\s*/, '');
    var w = t.split(' '), out = '';
    for (var i = 0; i < w.length; i++) { var n = out ? out + ' ' + w[i] : w[i]; if (n.length > 10) break; out = n; }
    return out || t.slice(0, 10);
  }
  // 사진이 없거나 못 불러오면 종류별 일러스트가 보여요
  function cover(it, cls) {
    var a = artKey(it);
    return '<div class="' + cls + ' cv art" style="background:' + TINT[a] + '">' + ART[a] +
      (it.thumb ? '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
  }
  function coverOld(it, cls) {
    var k = iconKey(it);
    return '<div class="' + cls + ' cv cv-' + k + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>' +
      '<span class="cv-label">' + esc(catLabel(it)) + '</span>' +
      (it.thumb ? '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
  }
  function badgesOf(it) {
    // 카드당 배지는 최대 2개: 마감·예정 1개 + 새로 들어옴/주의 1개
    var b = [], h = hoursLeft(it);
    if (notStarted(it)) b.push('<span class="badge badge-blue">' + esc(ddayLabel(it)) + '</span>');
    else if (h <= 72) b.push('<span class="badge badge-red">' + esc(ddayLabel(it)) + '</span>');
    else if (isFinite(h)) b.push('<span class="badge">' + esc(ddayLabel(it)) + '</span>');
    if (it.risk) b.push('<span class="badge badge-warn">주의 ' + it.risk + '</span>');
    else if (it.isNew) b.push('<span class="badge badge-new">NEW</span>');
    return b.slice(0, 2).join('');
  }
  function cardHtml(it) {
    var isLiked = !!liked[it.id];
    var region = MODE === 'goods' ? (it.cat === 'car' ? '차량' : catLabel(it)) + (it.sd ? ' · ' + shortSido(it.sd) : '')
      : [shortSido(it.sd), it.sgg, it.emd].filter(Boolean).join(' ') + ' · 유찰 ' + it.fails + '회';
    var rateTxt = it.rate != null && !lowball(it) ? '<em class="' + (isHalf(it) ? 'hot' : '') + '">감정가의 ' + it.rate + '%</em>' : '';
    return '<article class="card2">' +
      '<a class="card2-link" href="' + itemUrl(it) + '">' + cover(it, 'card2-ph') +
      '<div class="card2-body"><div class="badges">' + badgesOf(it) + '</div>' +
      '<div class="card-title">' + esc(it.t) + '</div>' +
      '<div class="card-meta">' + esc(region) + '</div>' +
      '<div class="price2"><b>' + won(it.min) + '</b>' + rateTxt + '</div>' +
      (MODE === 're' && it.mkt && !lowball(it) ? '<div class="mkt">주변 시세의 ' + it.mkt.ratio + '%</div>' : '') +
      '</div></a>' +
      '<button class="heart" data-like="' + esc(it.id) + '" aria-pressed="' + isLiked + '" aria-label="관심 등록">' + HEART + '</button></article>';
  }

  function render() {
    var defs = tabsDef();
    if (!defs.some(function (t) { return t.id === st.tab; })) st.tab = 'top';
    var cur = defs.filter(function (t) { return t.id === st.tab; })[0];
    $('tabs').innerHTML = defs.map(function (t) {
      return '<button role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === st.tab) + '">' + esc(t.label) + '</button>';
    }).join('');

    var cats = [['all', '전체']];
    var present = {}; (MODE === 'goods' ? allItems : data.items).forEach(function (i) { present[grp(i)] = 1; });
    (MODE === 'goods' ? GOODS_CATS.concat(RE_CATS) : [['home', CAT.home], ['shop', CAT.shop], ['land', CAT.land], ['etc', '기타']])
      .forEach(function (g) { if (present[g[0]]) cats.push([g[0], g[1]]); });
    $('cats').innerHTML = cats.map(function (c) {
      return '<button class="chip" data-cat="' + c[0] + '" aria-pressed="' + (st.cat === c[0]) + '">' + esc(c[1]) + '</button>';
    }).join('');

    var list = filtered();
    var head = cur.head;
    if (st.q.trim()) head = '‘' + st.q.trim() + '’ 검색 결과';
    $('heading').textContent = head;
    $('sub').textContent = st.tab === 'cond' && cond ? condText(cond) : cur.sub;
    $('count').textContent = list.length.toLocaleString('ko-KR') + '건';
    var shown = list.slice(0, st.shown);
    if (shown.length) $('list').innerHTML = shown.map(cardHtml).join('');
    else $('list').innerHTML = '<div class="empty">' + (st.tab === 'liked' ? '하트를 눌러 관심 물건을 모아보세요.' : '조건에 맞는 물건이 지금은 없어요.<br>검색어나 지역을 바꿔 보세요.') + '</div>';
    $('more').hidden = list.length <= st.shown;
    $('more').textContent = '더 보기 (' + (list.length - st.shown).toLocaleString('ko-KR') + '건 남음)';

    var n = Object.keys(liked).length;
    $('likedCount').hidden = !n; $('likedCount').textContent = n;
    $('clearQ').hidden = !st.q;
  }

  function plain(it) {
    if (it.appr && it.min) return '감정가보다 ' + won(it.appr - it.min) + ' 싸게 시작해요';
    return '';
  }
  function miniHtml(it, top) {
    return '<a class="mini2" href="' + itemUrl(it) + '">' + cover(it, 'mini2-ph') +
      '<span class="mini2-top">' + top + '</span>' +
      '<span class="mini-title">' + esc(it.t) + '</span>' +
      '<span class="mini-price">' + won(it.min) + (it.rate != null && !lowball(it) ? ' <em>' + it.rate + '%</em>' : '') + '</span></a>';
  }
  function renderPick() {
    var base = data.items.filter(function (i) { return i.min != null && i.rate != null && !i.risk && !lowball(i) && !notStarted(i) && hoursLeft(i) > 6; });
    var it, label;
    if (MODE === 'goods') {
      var day = Math.floor(Date.now() / 864e5);
      var pool = base.filter(function (i) { return isOdd(i) && i.thumb; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 7);
      if (!pool.length) pool = base.filter(isOdd).sort(function (a, b) { return score(b) - score(a); }).slice(0, 7);
      it = pool[day % (pool.length || 1)]; label = '오늘의 한 점';
    } else {
      it = base.sort(function (a, b) { return score(b) - score(a); })[0]; label = '오늘의 픽';
    }
    if (!it) { $('pick').hidden = true; return; }
    var big = MODE === 'goods';
    $('pick').innerHTML = '<div class="pick-label">' + label + '</div>' +
      '<a class="pick2' + (big ? ' big' : '') + '" href="' + itemUrl(it) + '">' + cover(it, 'pick2-ph') +
      '<div class="pick2-body"><div class="badges"><span class="badge">' + esc(catLabel(it)) + '</span>' + badgesOf(it) + '</div>' +
      '<div class="pick-title">' + esc(it.t) + '</div>' +
      '<div class="pick-price"><b>' + won(it.min) + '</b><span class="rate-chip">감정가의 ' + it.rate + '%</span></div>' +
      '<div class="pick-plain">' + (it.appr ? '감정가 ' + won(it.appr) + '원짜리가 ' + won(it.min) + '원부터 시작해요. ' + (it.fails ? it.fails + '번 유찰돼(안 팔려서) 값이 내려왔어요.' : '처음 나온 물건이에요.') : '') + (MODE === 're' && isCheap(it) ? ' · 주변 시세의 ' + it.mkt.ratio + '%' : '') + '</div>' +
      '<span class="pick-cta">' + (big ? '이 물건 자세히 보기 →' : '낙찰 도우미로 따져보기 →') + '</span></div></a>';
  }
  // 첫 화면: 회전 낱말 + 진열장(실제 물건) + 사실 띠
  var rotTimer = null;
  function heroPool() {
    return allItems.filter(function (i) { return i.min != null && !i.trap && !lowball(i) && !i.risk && !notStarted(i) && hoursLeft(i) > 6 && ['right', 'stock', 'goods_etc'].indexOf(i.sub) === -1 && !/차종 미상/.test(i.t); });
  }
  function lotHtml(it) {
    var tag = it.rate == null ? '감정가 비공개' : it.rate >= 100 ? '감정가 그대로' : '감정가의 ' + it.rate + '%';
    return '<a class="lot' + (isGd(it) ? '' : ' re') + '" href="' + itemUrl(it) + '" aria-label="' + esc(it.t + ', 최저 ' + won(it.min) + '원, ' + tag) + '">' +
      '<div class="frame">' + cover(it, 'ph') + '</div><span class="tag">' + esc(tag) + '</span>' +
      '<div class="cap"><div class="t">' + esc(it.t) + '</div><div class="p">' + esc(won(it.min)) + '<small>원부터</small></div></div></a>';
  }
  function renderHero() {
    if (MODE !== 'goods' || !document.getElementById('wall')) return;
    var pool = heroPool();
    var g = pool.filter(isGd).sort(function (a, b) { return (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0) || score(b) - score(a); });
    var r = pool.filter(function (i) { return !isGd(i); }).sort(function (a, b) { return (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0) || score(b) - score(a); });
    // 같은 종류가 이어지지 않게 섞고, 부동산은 사이사이에만
    var bySub = {}; g.forEach(function (i) { var k = i.sub || i.cat; (bySub[k] = bySub[k] || []).push(i); });
    var gm = [], keys = Object.keys(bySub), more = true;
    while (more && gm.length < 12) { more = false; keys.forEach(function (k) { if (bySub[k].length && gm.length < 12) { gm.push(bySub[k].shift()); more = true; } }); }
    var reN = Math.max(4, 12 - gm.length), rm = r.slice(0, reN);
    var all = []; var gi = 0, ri = 0;
    while (gi < gm.length || ri < rm.length) { if (gi < gm.length) all.push(gm[gi++]); if (gi < gm.length) all.push(gm[gi++]); if (ri < rm.length) all.push(rm[ri++]); }
    var wide = window.matchMedia('(min-width:960px)').matches;
    var row = function (list, cls) { var h = list.map(lotHtml).join(''); return '<div class="row ' + cls + '">' + h + h + '</div>'; };
    if (all.length < 3) { $('wall').hidden = true; }
    else if (wide) { var n = Math.ceil(all.length / 3); $('wall').innerHTML = row(all.slice(0, n), 'r1') + row(all.slice(n, 2 * n), 'r2') + row(all.slice(2 * n).concat(all.slice(0, 1)), 'r3'); }
    else { var h2 = Math.ceil(all.length / 2); $('wall').innerHTML = row(all.slice(0, h2), 'r1') + row(all.slice(h2), 'r2'); }
    // 회전 낱말: 실제 동산 이름 (없으면 부동산 종류)
    var words = gm.slice(0, 6).map(shortName).filter(function (w) { return w.length >= 2; });
    if (words.length < 3) words = words.concat(['반값 아파트', '임야', '상가']).slice(0, 6);
    var rot = document.querySelector('#rot span');
    if (rot && words.length) {
      var wi = 0; rot.textContent = words[0];
      if (rotTimer) clearInterval(rotTimer);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) rotTimer = setInterval(function () {
        rot.classList.add('out');
        setTimeout(function () { wi = (wi + 1) % words.length; rot.textContent = words[wi]; rot.classList.remove('out'); }, 350);
      }, 2400);
    }
    // 사실 띠
    var gN = allItems.filter(isGd).length, rN = allItems.length - gN;
    var soon = allItems.filter(function (i) { return hoursLeft(i) <= 48 && hoursLeft(i) > 0; }).length;
    $('facts').innerHTML = '<button data-go="top" data-gocat="all"><b>' + gN.toLocaleString('ko-KR') + '점</b><span>명품·차·금 등 동산</span></button>' +
      '<a href="realestate.html"><b>' + rN.toLocaleString('ko-KR') + '건</b><span>집·땅·상가</span></a>' +
      '<button data-go="closing" data-gocat="all"><b>' + soon.toLocaleString('ko-KR') + '건</b><span>48시간 안에 마감</span></button>';
    // 검색 예시는 실제 있는 이름으로
    if (words.length >= 2) $('q').placeholder = words.slice(0, 3).join(', ') + '…';
  }

  function renderCircles() {
    var el = document.getElementById('circles'); if (!el) return;
    var cnt = {}; allItems.forEach(function (i) { var g = grp(i); cnt[g] = (cnt[g] || 0) + 1; });
    var AK = { luxury: 'watch', gold: 'gold', elec: 'elec', car: 'car', living: 'living', heavy: 'heavy', oR: 'doc', home: 'apt', shop: 'shop', land: 'land' };
    el.innerHTML = GOODS_CATS.concat(RE_CATS).filter(function (g) { return cnt[g[0]]; }).map(function (g) {
      var a = AK[g[0]] || 'box';
      return '<button class="cat2" data-circle="' + g[0] + '"><i style="background:' + TINT[a] + '">' + ART[a] + '</i>' + esc(g[1]) + ' <em>' + cnt[g[0]].toLocaleString('ko-KR') + '</em></button>';
    }).join('');
  }
  function shelfHtml(sh) {
    return '<section class="shelf' + (sh.re ? ' shelf-re' : '') + '"><div class="section-head"><h2>' + (sh.re ? '<span class="re-tag">부동산</span>' : '') + esc(sh.title) + '</h2><button class="link-btn" data-go="' + sh.go + '"' + (sh.cat ? ' data-gocat="' + sh.cat + '"' : '') + '>' + esc(sh.sub) + ' · 전체</button></div>' +
      '<div class="scroller">' + sh.list.map(function (i) { return miniHtml(i, sh.top(i)); }).join('') + '</div></section>';
  }
  function renderShelves(closing) {
    var items = data.items, shelves = [];
    var dd = function (i) { return '<span class="badge badge-red">' + esc(ddayLabel(i)) + '</span>'; };
    var lab = function (i) { return '<span class="badge">' + esc(catLabel(i)) + '</span>'; };
    var cl = closing.filter(function (i) { return !i.risk; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 12);
    if (MODE === 'goods') {
      if (cl.length) shelves.push({ title: '오늘·내일 마감', sub: '48시간 이내', go: 'closing', list: cl, top: dd });
      var small = items.filter(cheapOdd).sort(function (a, b) { return a.min - b.min; }).slice(0, 12);
      if (small.length) shelves.push({ title: '100만 원 이하로 시작해요', sub: '소액 물건', go: 'cheapodd', list: small, top: lab });
      [['luxury', '명품·시계 모음'], ['car', '자동차 모음'], ['elec', '전자기기 모음'], ['gold', '금·귀금속 모음']].forEach(function (c) {
        var l = items.filter(function (i) { return i.sub === c[0] && !i.risk; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 12);
        if (l.length >= 2) shelves.push({ title: c[1], sub: l.length + '건 이상', go: 'top', cat: c[0], list: l, top: function (i) { return badgesOf(i); } });
      });
      var ranked = items.filter(function (i) { return i.rank && !i.trap && !lowball(i); }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
      if (ranked.length) shelves.push({ title: '온비드에서 관심 많은 물건', sub: '이번 주 관심 저장 순', go: 'rank', list: ranked, top: function (i) { return '<span class="badge badge-hot">' + i.rank + '위</span>'; } });
      // 동산이 적어도 첫 화면이 비지 않게 부동산 줄을 사이사이 넣어요 (위험 신호 있는 물건 제외)
      var reS = [], reAll = allItems.filter(function (i) { return !isGd(i) && !i.trap && !lowball(i) && i.min != null; });
      var half = reAll.filter(isHalf).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 10);
      if (half.length) reS.push({ title: '반값까지 내려온 부동산', sub: '감정가 50% 이하', go: 'half', cat: 'all', list: half, top: lab });
      var under1 = reAll.filter(function (i) { return i.cat === 'home' && i.min <= 1e8; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 10);
      if (under1.length) reS.push({ title: '1억 이하로 시작하는 집', sub: '아파트·주택', go: 'top', cat: 'home', list: under1, top: lab });
      var metro = reAll.filter(function (i) { return /서울|경기|인천/.test(i.sd) && (i.cat === 'home' || i.cat === 'shop') && i.rate != null && i.rate <= 80; }).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 10);
      if (metro.length) reS.push({ title: '수도권 집·상가, 감정가 80% 이하', sub: '서울·경기·인천', go: 'top', cat: 'home', list: metro, top: function (i) { return '<span class="badge">' + esc(shortSido(i.sd)) + '</span>'; } });
      var mk = reAll.filter(isCheap).sort(function (a, b) { return a.mkt.ratio - b.mkt.ratio; }).slice(0, 10);
      if (mk.length) reS.push({ title: '같은 단지 실거래가보다 낮게 시작하는 아파트', sub: '실거래가 비교', go: 'top', cat: 'home', list: mk, top: function (i) { return '<span class="badge badge-blue">시세의 ' + i.mkt.ratio + '%</span>'; } });
      reS.forEach(function (x) { x.re = true; });
      var mixed = [], gi = 0, ri = 0;
      while (gi < shelves.length || ri < reS.length) { if (gi < shelves.length) mixed.push(shelves[gi++]); if (ri < reS.length) mixed.push(reS[ri++]); }
      shelves = mixed;
    } else {
      var ranked2 = items.filter(function (i) { return i.rank && !i.trap && !lowball(i); }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
      if (ranked2.length) shelves.push({ title: '온비드에서 관심 많은 물건', sub: '이번 주 관심 저장 순', go: 'rank', list: ranked2, top: function (i) { return '<span class="badge badge-hot">' + i.rank + '위</span>'; } });
      if (cl.length) shelves.push({ title: '곧 마감돼요', sub: '48시간 이내', go: 'closing', list: cl, top: dd });
      var half = items.filter(isHalf).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 10);
      if (half.length) shelves.push({ title: '반값 부동산', sub: '감정가 50% 이하', go: 'half', list: half, top: lab });
    }
    $('shelves').innerHTML = shelves.map(shelfHtml).join('');
  }
  // 낙찰가 맞히기: 최근 실제 낙찰 결과로 4지선다 퀴즈 (기기에만 점수 저장)
  var quiz = { i: 0, answered: false };
  function quizPool() {
    var all = (data.results || []).filter(function (r) { return r.appr && r.price && r.rate >= 20 && r.rate <= 200; });
    // 구경 화면에서는 동산·차량 낙찰 결과로 문제를 내고, 부족할 때만 다른 결과를 섞어요
    if (MODE === 'goods') {
      var g = all.filter(function (r) { return r.cat === 'goods' || r.cat === 'car'; });
      return g.length >= 3 ? g : g.concat(all.filter(function (r) { return r.cat !== 'goods' && r.cat !== 'car'; }));
    }
    return all;
  }
  function renderQuiz() {
    var pool = quizPool();
    if (!pool.length) { $('quiz').hidden = true; return; }
    $('quiz').hidden = false;
    var day = Math.floor(Date.now() / 864e5);
    var r = pool[(day + quiz.i) % pool.length];
    var sc = store.get('ar_quiz', { right: 0, total: 0, streak: 0 });
    $('quizScore').textContent = sc.total ? '맞힌 문제 ' + sc.right + '/' + sc.total + (sc.streak > 1 ? ' · ' + sc.streak + '연속' : '') : '';
    // 정답(실제 낙찰가율)과 그럴듯한 오답 3개
    var rates = [r.rate], cands = [r.rate - 25, r.rate - 12, r.rate + 12, r.rate + 25, r.rate + 40, r.rate - 35];
    var seed = (day + quiz.i) % 5;
    for (var k = 0; rates.length < 4 && k < cands.length; k++) {
      var c = Math.round(cands[(k + seed) % cands.length]);
      if (c >= 10 && rates.every(function (x) { return Math.abs(x - c) >= 8; })) rates.push(c);
    }
    var opts = rates.map(function (x) { return { rate: x, price: x === r.rate ? r.price : Math.round(r.appr * x / 100 / 1e5) * 1e5, ok: x === r.rate }; })
      .sort(function (a, b) { return a.price - b.price; });
    quiz.opts = opts; quiz.r = r; quiz.answered = false;
    $('quizBody').innerHTML = '<div class="quiz-q"><span class="badge">' + esc(CAT[r.cat] || '공매') + '</span><b>' + esc(r.t) + '</b>' +
      '<span class="muted small">' + esc([shortSido(r.sd), r.sgg].filter(Boolean).join(' ')) + ' · 감정가 <b>' + won(r.appr) + '</b></span></div>' +
      '<div class="quiz-opts">' + opts.map(function (o, i) { return '<button class="quiz-opt" data-qa="' + i + '">' + won(o.price) + '</button>'; }).join('') + '</div>' +
      '<div class="quiz-result" id="quizResult"></div>';
  }
  function answerQuiz(i) {
    if (quiz.answered) return;
    quiz.answered = true;
    var o = quiz.opts[i], r = quiz.r;
    var sc = store.get('ar_quiz', { right: 0, total: 0, streak: 0 });
    sc.total++; if (o.ok) { sc.right++; sc.streak++; } else sc.streak = 0;
    store.set('ar_quiz', sc);
    document.querySelectorAll('.quiz-opt').forEach(function (b, k) {
      b.disabled = true;
      if (quiz.opts[k].ok) b.classList.add('ok'); else if (k === i) b.classList.add('no');
    });
    $('quizResult').innerHTML = '<p><b>' + (o.ok ? '정답이에요! ' : '아쉬워요. ') + '</b>실제로는 <b>' + won(r.price) + '</b>, 감정가의 <b>' + r.rate + '%</b>에 팔렸어요' +
      (r.bidders ? ' (' + r.bidders + '명 경쟁)' : '') + '. ' + (r.rate > 100 ? '감정가보다 비싸게 팔렸어요. 인기 물건은 경쟁이 붙으면 이렇게 돼요.' : r.rate < 70 ? '여러 번 유찰돼 값이 많이 내려간 뒤 팔린 경우가 많아요.' : '') + '</p>' +
      '<div class="quiz-next"><button class="btn-outline" id="quizNext" type="button">다음 문제</button><button class="btn-outline" id="quizShare" type="button">친구에게 내기</button></div>';
    $('quizScore').textContent = '맞힌 문제 ' + sc.right + '/' + sc.total + (sc.streak > 1 ? ' · ' + sc.streak + '연속' : '');
  }

  // 구경 화면: 많이 싸게 나온 부동산을 '왜 싼지' 설명과 함께 (위험 신호가 있는 물건은 빼요)
  function dealWhy(it) {
    var s = '감정가 ' + won(it.appr) + '짜리가 ' + won(it.min) + '부터 시작해요. ';
    if (it.fails >= 1) s += '그동안 ' + it.fails + '번 아무도 사지 않아(유찰) 회차마다 최저가가 내려왔어요.';
    else s += '처음부터 감정가보다 낮은 값으로 나온 물건이에요.';
    return s;
  }
  function renderDeals() {
    var el = document.getElementById('reDeals'); if (!el || MODE !== 'goods') return;
    var isG = function (i) { return i.cat === 'goods' || i.cat === 'car'; };
    var re = allItems.filter(function (i) {
      return !isG(i) && i.appr && i.min && i.rate != null && i.rate >= 30 && i.rate <= 60 && !i.trap && !i.risk && !notStarted(i) && hoursLeft(i) > 6;
    });
    var catW = { home: 3, shop: 1, land: 0, etc: 0 };
    re.sort(function (a, b) {
      var sa = (a.mkt ? 15 : 0) + (a.thumb ? 5 : 0) + (catW[a.cat] || 0) + (60 - a.rate) / 3;
      var sb = (b.mkt ? 15 : 0) + (b.thumb ? 5 : 0) + (catW[b.cat] || 0) + (60 - b.rate) / 3;
      return sb - sa;
    });
    var sparse = data.items.length < 30;
    var list = re.slice(0, sparse ? 5 : 3);
    if (!list.length) { el.hidden = true; return; }
    el.innerHTML = '<div class="section-head"><h2>감정가보다 많이 내려온 부동산</h2><a class="link-btn" href="realestate.html?tab=half">반값 부동산 전체</a></div>' +
      '<p class="section-sub">감정가의 60% 이하로 내려온 집·땅·상가 중 위험 신호가 없는 물건만 골랐어요.</p>' +
      list.map(function (it) {
        return '<a class="deal" href="' + itemUrl(it) + '">' + cover(it, 'deal-ph') +
          '<div class="deal-body"><div class="deal-top"><span class="badge badge-blue">부동산</span><span class="badge">' + esc(catLabel(it)) + '</span>' + badgesOf(it) + '</div>' +
          '<div class="card-title">' + esc(it.t) + '</div>' +
          '<div class="deal-price"><b>' + won(it.min) + '</b><span class="rate-chip">감정가의 ' + it.rate + '%</span></div>' +
          '<p class="deal-why">' + esc(dealWhy(it)) + '</p>' +
          (it.mkt ? '<p class="deal-mkt">같은 단지 최근 실거래 중간값 ' + won(it.mkt.med) + ' → 그 값의 ' + it.mkt.ratio + '%예요.</p>' : '') +
          '<span class="deal-cta">왜 내려왔는지 보기 →</span></div></a>';
      }).join('') +
      '<p class="note pad-x">싸게 나온 데는 이유가 있을 수 있어요. 입찰 전 공고문과 등기부를 꼭 확인하세요.</p>';
    el.hidden = false;
    // 동산이 적을 때는 퀴즈 위로 올려 첫 화면을 채워요
    if (sparse) { var q = document.getElementById('quiz'); if (q && q.parentNode) q.parentNode.insertBefore(el, q); }
  }

  // 오늘의 숫자: 매일 바뀌는 사실 카드 (투자 표현 없이)
  function renderNumbers() {
    var el = document.getElementById('extras'); if (!el || MODE !== 'goods') return;
    var real = data.items.filter(function (i) { return i.min != null && i.sub !== 'right' && i.sub !== 'stock'; });
    var cars = real.filter(function (i) { return i.cat === 'car'; }).sort(function (a, b) { return b.min - a.min; });
    var cards = [];
    if (cars.length) cards.push(['오늘 가장 비싼 차', won(cars[0].min), cars[0].t, cars[0]]);
    if (cars.length > 1) cards.push(['오늘 가장 싼 차', won(cars[cars.length - 1].min), cars[cars.length - 1].t, cars[cars.length - 1]]);
    if (cars.length > 1 && cars[cars.length - 1].min > 0) cards.push(['같은 돈이면?', Math.round(cars[0].min / cars[cars.length - 1].min) + '대', cars[0].t + ' 시작가로 ' + cars[cars.length - 1].t + '를 살 수 있는 수 (시작가 기준)', null]);
    var newN = real.filter(function (i) { return i.isNew; }).length;
    cards.push(['새로 들어온 물건', newN + '점', '최근 48시간', null, 'new']);
    var smallN = real.filter(cheapOdd).length;
    if (smallN) cards.push(['100만 원 이하', smallN + '점', '소액으로 구경해요', null, 'cheapodd']);
    el.innerHTML = '<section class="numbers"><div class="scroller">' + cards.map(function (c) {
      var inner = '<span class="num-label">' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b><span class="num-sub">' + esc(c[2]) + '</span>';
      return c[3] ? '<a class="num" href="' + itemUrl(c[3]) + '">' + inner + '</a>' : '<button class="num" ' + (c[4] ? 'data-go="' + c[4] + '"' : 'disabled') + '>' + inner + '</button>';
    }).join('') + '</div></section>';
  }

  function renderResults() {
    var rs = data.results || [];
    $('resultsWrap').hidden = !rs.length;
    $('results').innerHTML = rs.slice(0, MODE === 'goods' ? 3 : 5).map(function (r) {
      var over = r.rate > 100;
      return '<div class="result-card"><div class="row-between"><b class="rc-title">' + esc(r.t) + '</b><span class="rc-tag ' + (over ? 'over' : r.rate < 70 ? 'low' : r.bidders >= 3 ? '' : 'low') + '">' + (over ? '감정가보다 높게' : r.bidders >= 3 ? r.bidders + '명 경쟁' : r.rate < 90 ? '감정가보다 낮게' : '감정가 근처') + '</span></div>' +
        '<div class="rc-line">감정 ' + won(r.appr) + ' → <strong>' + won(r.price) + '</strong><span class="rc-rate">' + r.rate + '%</span></div>' +
        '<div class="bar"><i style="width:' + Math.min(100, r.rate) + '%' + (over ? ';background:var(--red)' : '') + '"></i></div>' +
        '<div class="card-meta">' + esc([shortSido(r.sd), r.sgg].filter(Boolean).join(' ')) + (r.bidders ? ' · ' + r.bidders + '명 경쟁' : '') + '</div></div>';
    }).join('');
  }

  function renderStatic() {
    var items = data.items;
    $('sNew').innerHTML = items.filter(function (i) { return i.isNew; }).length + '<small>건</small>';
    var closing = items.filter(function (i) { return hoursLeft(i) <= 48 && hoursLeft(i) > 0; }).sort(function (a, b) { return hoursLeft(a) - hoursLeft(b); });
    $('sClosing').innerHTML = closing.length + '<small>건</small>';
    $('sHalf').innerHTML = items.filter(isHalf).length + '<small>건</small>';
    renderHero(); renderCircles(); renderPick(); renderNumbers(); renderQuiz(); renderShelves(closing); renderDeals(); renderResults();

    var counts = {};
    items.forEach(function (i) { var s = shortSido(i.sd); counts[s] = (counts[s] || 0) + 1; });
    var sidos = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    $('sido').innerHTML = '<option value="">전국 (' + items.length.toLocaleString('ko-KR') + ')</option>' + sidos.map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + ' (' + counts[s].toLocaleString('ko-KR') + ')</option>';
    }).join('');

    var sgg = {};
    items.filter(function (i) { return i.cat === 'home' || i.cat === 'shop'; }).forEach(function (i) { if (i.sgg) sgg[i.sgg] = (sgg[i.sgg] || 0) + score(i); });
    var hot = Object.keys(sgg).sort(function (a, b) { return sgg[b] - sgg[a]; }).slice(0, 4).map(function (s) { return s.split(' ').pop(); });
    hot.unshift('100만원 이하');
    if (data.hasGoods) hot.unshift('명품');
    hot.push('반값 아파트');
    $('hot').innerHTML = hot.map(function (w) { return '<button data-hot="' + esc(w) + '">#' + esc(w) + '</button>'; }).join('');

    var d = data.updatedAt ? new Date(data.updatedAt) : null;
    $('updated').textContent = (MODE === 'goods' ? '지금 공매 중 ' + allItems.length.toLocaleString('ko-KR') + '건' : '온비드 부동산 공매 ' + items.length.toLocaleString('ko-KR') + '건 · 매시간 업데이트') +
      (d ? ' · ' + d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' 기준' : '');
    $('demo').hidden = !data.demo;
    var ageH = d ? (Date.now() - d.getTime()) / 3600e3 : 0;
    if (!data.demo && ageH > 3) {
      $('stale').textContent = '지금 보이는 정보는 ' + Math.floor(ageH) + '시간 전 기준이에요. 그 사이 바뀐 내용이 있을 수 있으니 입찰 전 온비드 원문을 꼭 확인하세요.';
      $('stale').hidden = false;
    }
    renderCond();
  }

  function condText(c) {
    var p = PRICES.filter(function (x) { return x.id === c.price; })[0] || PRICES[0];
    var pu = PURPOSES.filter(function (x) { return x.id === c.purpose; })[0];
    return (pu ? pu.label + ' · ' : '') + (c.sidos.length ? c.sidos.join('·') : '전국') + ' · 예산 ' + p.label;
  }
  function renderCond() {
    var counts = {};
    data.items.forEach(function (i) { var s = shortSido(i.sd); counts[s] = (counts[s] || 0) + 1; });
    var sidos = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    $('condSido').innerHTML = sidos.map(function (s) {
      return '<button class="chip" data-csido="' + esc(s) + '" aria-pressed="' + (draft.sidos.indexOf(s) !== -1) + '">' + esc(s) + '</button>';
    }).join('');
    $('condPurpose').innerHTML = PURPOSES.map(function (p) {
      return '<button class="chip" data-cpurpose="' + p.id + '" aria-pressed="' + (draft.purpose === p.id) + '">' + p.label + '</button>';
    }).join('');
    $('condSave').disabled = !draft.purpose;
    $('condSave').textContent = draft.purpose ? '맞춤 물건 보기' : '목적을 먼저 골라 주세요';
    $('onboard').hidden = !!cond || store.get('ar_onboard_closed', false);
    $('condPrice').innerHTML = PRICES.map(function (p) {
      return '<button class="chip" data-cprice="' + p.id + '" aria-pressed="' + (draft.price === p.id) + '">' + p.label + '</button>';
    }).join('');
    $('condForm').hidden = !!cond && !condEditing;
    $('condDone').hidden = !cond || condEditing;
    if (cond) {
      var n = data.items.filter(function (i) { return matchesCond(i, cond); }).length;
      $('condSummary').textContent = condText(cond) + ' — 맞는 물건이 지금 ' + n + '건 있어요. 다음에 들어오면 새로 올라온 물건을 위에 알려드릴게요.';
      var fresh = data.items.filter(function (i) { return matchesCond(i, cond) && i.st && new Date(i.st).getTime() > (cond.seen || 0); });
      if (fresh.length && !noticeShown) {
        $('condNotice').innerHTML = '<span>맞춤 조건에 맞는 <b>새 물건 ' + fresh.length + '건</b>이 올라왔어요.</span><button id="condGo">보기</button>';
        $('condNotice').hidden = false;
        noticeShown = true;
      }
    }
  }
  var condEditing = false, noticeShown = false;

  // ---------- 이벤트 ----------
  var fb = document.getElementById('findBtn');
  if (fb) fb.addEventListener('click', function () { st.q = $('q').value; st.tab = 'top'; st.cat = 'all'; st.shown = PAGE; render(); $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  function go(tab) { st.tab = tab; st.shown = PAGE; render(); $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button,[data-go]');
    if (!b) return;
    var ds = b.dataset;
    if (ds.qa) { answerQuiz(+ds.qa); return; }
    if (b.id === 'quizNext') { quiz.i++; renderQuiz(); return; }
    if (b.id === 'quizShare') {
      var txt = '이 물건 공매에서 얼마에 팔렸을까? 맞혀 봐!\n' + quiz.r.t + ' (감정가 ' + won(quiz.r.appr) + ')';
      var u = location.origin + location.pathname;
      if (navigator.share) navigator.share({ title: '얼마에 팔렸을까?', text: txt, url: u }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt + '\n' + u).then(function () { toast('문제를 복사했어요. 카톡에 붙여넣어 보세요.'); });
      return;
    }
    if (ds.tab) { st.tab = ds.tab; st.shown = PAGE; render(); }
    else if (ds.cat) { st.cat = ds.cat; st.shown = PAGE; render(); }
    else if (ds.circle) { st.cat = ds.circle; st.tab = 'top'; st.shown = PAGE; render(); $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (ds.go) { e.preventDefault(); if (ds.gocat) st.cat = ds.gocat; go(ds.go); }
    else if (ds.like) {
      if (liked[ds.like]) delete liked[ds.like]; else { liked[ds.like] = Date.now(); toast('관심 물건에 담았어요.'); }
      store.set('ar_liked', liked); render();
    } else if (ds.share) {
      share(data.items.filter(function (i) { return i.id === ds.share; })[0]);
    } else if (ds.hot) {
      var w = ds.hot;
      if (w === '반값 아파트') { st.q = ''; st.cat = 'home'; st.tab = 'half'; }
      else if (w === '명품') { st.q = ''; st.cat = 'gL'; st.tab = 'top'; }
      else if (w === '100만원 이하') { st.q = ''; st.cat = 'all'; st.tab = 'cheapodd'; }
      else { st.q = w; st.tab = 'top'; st.cat = 'all'; }
      $('q').value = st.q; st.shown = PAGE; go(st.tab);
    } else if (ds.csido) {
      var i = draft.sidos.indexOf(ds.csido);
      if (i === -1) draft.sidos.push(ds.csido); else draft.sidos.splice(i, 1);
      renderCond();
    } else if (ds.cprice) { draft.price = ds.cprice; renderCond(); }
    else if (ds.cpurpose) {
      draft.purpose = ds.cpurpose;
      if (ds.cpurpose === 'small' && draft.price === 'any') draft.price = 'u1';
      renderCond();
    }
    else if (b.id === 'onboardGo') { store.set('ar_onboard_closed', true); $('onboard').hidden = true; $('alert').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (b.id === 'condSave') {
      if (!draft.purpose) return;
      cond = { sidos: draft.sidos.slice(), price: draft.price, purpose: draft.purpose, seen: Date.now() };
      store.set('ar_cond', cond); condEditing = false; renderCond(); toast('맞춤 조건을 저장했어요.'); go('cond');
    } else if (b.id === 'condEdit') { condEditing = true; renderCond(); }
    else if (b.id === 'condShow' || b.id === 'condGo') {
      $('condNotice').hidden = true;
      if (cond) { cond.seen = Date.now(); store.set('ar_cond', cond); }
      go('cond');
    } else if (b.id === 'likedBtn') { go('liked'); }
    else if (b.id === 'more') { st.shown += PAGE; render(); }
    else if (b.id === 'clearQ') { st.q = ''; $('q').value = ''; render(); $('q').focus(); }
  });
  var qTimer;
  $('q').addEventListener('input', function (e) {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { st.q = e.target.value; st.shown = PAGE; render(); }, 150);
  });
  $('sido').addEventListener('change', function (e) { st.sido = e.target.value; st.shown = PAGE; render(); });
  $('sort').addEventListener('change', function (e) { st.sort = e.target.value; render(); });

  // ---------- 홈 화면 추가 (PWA) ----------
  var deferred;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    if (!store.get('ar_install_closed', false)) $('install').hidden = false;
  });
  $('installBtn').addEventListener('click', function () {
    if (deferred) { deferred.prompt(); deferred = null; $('install').hidden = true; }
    else { $('install').hidden = true; store.set('ar_install_closed', true); }
  });
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  if (ios && !store.get('ar_install_closed', false)) {
    $('installText').textContent = '공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 쓸 수 있어요.';
    $('installBtn').textContent = '닫기';
    $('install').hidden = false;
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});

  // ---------- 시작 ----------
  var params = new URLSearchParams(location.search);
  if (params.get('tab')) st.tab = params.get('tab');
  if (params.get('cat')) st.cat = params.get('cat');
  else if (cond) st.tab = 'cond';
  fetch('data/items.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
    d.items = d.items.filter(function (i) { return !(i.en && new Date(i.en).getTime() < Date.now()); });
    allItems = d.items;
    var isG = function (i) { return i.cat === 'goods' || i.cat === 'car'; };
    data = Object.assign({}, d, { items: d.items.filter(function (i) { return MODE === 'goods' ? isG(i) : !isG(i); }) });
    // 결과: 구경 화면은 동산·차량 결과를 먼저, 없으면 전체
    var gRes = (d.results || []).filter(isG);
    data.results = MODE === 'goods' ? (gRes.length ? gRes.concat((d.results || []).filter(function (r) { return !isG(r); })) : (d.results || [])) : (d.results || []).filter(function (r) { return !isG(r); });
    var ids = {}; d.items.forEach(function (i) { ids[i.id] = 1; });
    Object.keys(liked).forEach(function (k) { if (!ids[k]) delete liked[k]; });
    store.set('ar_liked', liked);
    renderStatic(); render();
  }).catch(function () {
    $('updated').textContent = '데이터를 불러오지 못했어요. 잠시 후 다시 열어 주세요.';
    $('list').innerHTML = '<div class="empty">데이터를 불러오지 못했어요.<br>인터넷 연결을 확인하고 새로고침해 주세요.</div>';
  });
})();
