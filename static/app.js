(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 30;
  var CAT = { home: '아파트·주택', shop: '상가·업무', land: '토지', etc: '기타 부동산', goods: '동산', car: '차량' };
  var SUB = { right: '주식·채권·권리', gold: '귀금속·금', luxury: '명품·시계', elec: '전자제품', machine: '기계·장비', living: '가구·생활', stock: '재고·원자재', goods_etc: '기타 동산', car: '자동차', heavy: '중장비·선박' };
  // 구경하는 재미가 있는 물건(이색): 주식·채권·재고·기계는 빼요
  var ODD = { luxury: 1, gold: 1, elec: 1, living: 1, car: 1, heavy: 1 };
  var GROUP = { luxury: 'gL', gold: 'gL', elec: 'eL', living: 'eL', car: 'cH', heavy: 'cH', right: 'oR', machine: 'oR', stock: 'oR', goods_etc: 'oR' };
  function isOdd(it) { return !!ODD[it.sub] || (!it.sub && (it.cat === 'goods' || it.cat === 'car')); }
  function grp(it) { return GROUP[it.sub] || it.cat; }
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
    { id: 'invest', label: '투자·시세차익' },
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
      return eok + '억' + (rest ? ' ' + rest.toLocaleString('ko-KR') + '만' : '');
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
  function lowball(it) { return it.rate != null && it.rate < 30; }
  function cheapOdd(it) { return isOdd(it) && it.min != null && it.min <= 1000000 && !it.risk && !lowball(it); }
  function isHalf(it) { return it.rate != null && it.rate <= 50 && !lowball(it); }
  function isCheap(it) { return it.mkt && it.mkt.ratio <= 85 && it.mkt.ratio >= 40 && !lowball(it); }
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
    var t = [
      { id: 'top', label: '주목', head: '주목할 물건', sub: '할인 폭, 지역, 주변 시세와의 차이를 함께 따져 골랐어요.' },
      { id: 'rank', label: '온비드 인기', head: '온비드에서 관심 많은 물건', sub: '온비드에서 일주일간 관심 저장이 많았던 순위예요.' },
      { id: 'half', label: '반값', head: '감정가 50% 이하 물건', sub: '여러 번 유찰돼 값이 많이 내려간 물건이에요.' },
      { id: 'cheapodd', label: '100만원 이하', head: '100만원 이하로 시작하는 물건', sub: '명품·전자제품·차량 중 최저가가 100만원 이하인 물건이에요. 위험 신호가 있는 물건은 뺐어요.' },
      { id: 'cheap', label: '시세보다 싼', head: '주변 시세보다 싼 아파트·주택', sub: '최저가가 같은 동 비슷한 면적 실거래 중간값의 85% 이하예요.' },
      { id: 'new', label: '새 물건', head: '새로 올라온 물건', sub: '최근 48시간 안에 입찰이 시작됐거나 바뀐 물건이에요.' },
      { id: 'closing', label: '마감 임박', head: '48시간 안에 마감', sub: '서두르세요. 입찰 마감이 가까운 순서예요.' }
    ];
    if (!data.hasRank) t = t.filter(function (x) { return x.id !== 'rank'; });
    if (data.hasGoods || data.hasCar) t.splice(3, 0, { id: 'odd', label: '이색', head: '이런 것도 공매에?', sub: '명품, 귀금속, 차량처럼 눈길 끄는 물건이에요.' });
    if (cond) t.unshift({ id: 'cond', label: '맞춤', head: '나에게 맞는 물건', sub: '' });
    var n = Object.keys(liked).length;
    if (n || st.tab === 'liked') t.push({ id: 'liked', label: '관심 ' + n, head: '관심 등록한 물건', sub: '마감이 지나면 목록에서 사라져요.' });
    return t;
  }

  function filtered() {
    var q = st.q.trim().toLowerCase();
    var list = data.items.filter(function (it) {
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
      score: function (a, b) { return score(b) - score(a); },
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

  function thumbHtml(it) {
    if (it.thumb) return '<div class="thumb ' + iconKey(it) + '"><img src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<svg viewBox=&quot;0 0 24 24&quot; aria-hidden=&quot;true&quot;>' + ICON[iconKey(it)].replace(/"/g, '&quot;') + '</svg>\'"></div>';
    return '<div class="thumb ' + iconKey(it) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[iconKey(it)] + '</svg></div>';
  }

  function cardHtml(it) {
    var isLiked = !!liked[it.id];
    var badges = '<span class="badge">' + esc(catLabel(it)) + '</span>' +
      (it.rank ? '<span class="badge badge-hot">관심 ' + it.rank + '위</span>' : '') +
      (it.isNew ? '<span class="badge badge-new">NEW</span>' : '') +
      (isOdd(it) ? '<span class="badge badge-odd">이색</span>' : '') +
      (it.risk ? '<span class="badge badge-warn">주의 ' + it.risk + '</span>' : '') +
      (it.pv ? '<span class="badge badge-blue">수의계약</span>' : '') +
      '<span class="dday">' + esc(ddayLabel(it)) + '</span>';
    return '<article class="card">' +
      '<a class="card-link" href="' + itemUrl(it) + '">' + thumbHtml(it) +
      '<div class="card-body"><div class="badges">' + badges + '</div>' +
      '<div class="card-title">' + esc(it.t) + '</div>' +
      '<div class="card-meta">' + esc([shortSido(it.sd), it.sgg, it.emd].filter(Boolean).join(' ')) + ' · 유찰 ' + it.fails + '회</div>' +
      '<div class="price-line"><b>' + won(it.min) + '</b><s>감정 ' + won(it.appr) + '</s></div></div>' +
      '<div class="rate-col">' + (it.rate != null ? '<span class="rate ' + (isHalf(it) ? 'hot' : '') + '">' + it.rate + '%</span>' : '') +
      (it.mkt && !lowball(it) ? '<span class="mkt">시세의 ' + it.mkt.ratio + '%</span>' : '') + '</div></a>' +
      '<div class="card-actions"><button data-like="' + esc(it.id) + '" aria-pressed="' + isLiked + '">' + HEART + (isLiked ? '관심 등록됨' : '관심 등록') + '</button>' +
      '<button data-share="' + esc(it.id) + '">' + SHARE + '친구에게 공유</button></div></article>';
  }

  function render() {
    var defs = tabsDef();
    if (!defs.some(function (t) { return t.id === st.tab; })) st.tab = 'top';
    var cur = defs.filter(function (t) { return t.id === st.tab; })[0];
    $('tabs').innerHTML = defs.map(function (t) {
      return '<button role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === st.tab) + '">' + esc(t.label) + '</button>';
    }).join('');

    var cats = [['all', '전체'], ['home', CAT.home], ['shop', CAT.shop], ['land', CAT.land], ['etc', '기타']];
    var present = {}; data.items.forEach(function (i) { present[grp(i)] = 1; });
    [['gL', '명품·귀금속'], ['eL', '전자·생활'], ['cH', '차량·중장비'], ['oR', '권리·기타 동산']].forEach(function (g) { if (present[g[0]]) cats.push(g); });
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
    return '<a class="mini" href="' + itemUrl(it) + '"><span class="mini-top">' + top +
      (it.rate != null ? '<span class="mini-rate">' + it.rate + '%</span>' : '') + '</span>' +
      (it.thumb ? '<span class="mini-img"><img src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>' : '') +
      '<span class="mini-title">' + esc(it.t) + '</span><span class="mini-region">' + esc([shortSido(it.sd), it.sgg].filter(Boolean).join(' ')) + '</span>' +
      '<span class="mini-price">' + won(it.min) + '</span></a>';
  }
  function renderPick() {
    var base = data.items.filter(function (i) { return i.min != null && i.rate != null && !i.risk && !lowball(i) && !notStarted(i) && hoursLeft(i) > 6; });
    var oddPool = base.filter(function (i) { return isOdd(i) && i.thumb; });
    var it = oddPool.sort(function (a, b) { return score(b) - score(a); })[0];
    var label = '오늘의 신기한 물건';
    if (!it) { it = base.filter(function (i) { return !isOdd(i); }).sort(function (a, b) { return score(b) - score(a); })[0]; label = '오늘의 픽'; }
    if (!it) { $('pick').hidden = true; return; }
    $('pick').innerHTML = '<div class="pick-label">' + label + '</div>' +
      '<a class="pick-card" href="' + itemUrl(it) + '">' +
      '<div class="pick-rate"><span>감정가의</span><b>' + it.rate + '<small>%</small></b></div>' +
      (it.thumb ? '<div class="pick-photo"><img src="' + esc(it.thumb) + '" alt="" onerror="this.parentNode.remove()"></div>' : '') +
      '<div class="pick-body"><div class="badges"><span class="badge">' + esc(catLabel(it)) + '</span>' + (it.rank ? '<span class="badge badge-hot">온비드 관심 ' + it.rank + '위</span>' : '') + '<span class="dday">' + esc(ddayLabel(it)) + '</span></div>' +
      '<div class="pick-title">' + esc(it.t) + '</div>' +
      '<div class="pick-price"><b>' + won(it.min) + '</b><s>감정 ' + won(it.appr) + '</s></div>' +
      '<div class="pick-plain">' + esc(plain(it)) + (isCheap(it) ? ' · 주변 시세의 ' + it.mkt.ratio + '%' : '') + '</div>' +
      '<span class="pick-cta">낙찰 도우미로 따져보기 →</span></div></a>';
  }
  function renderShelves(closing) {
    var items = data.items, shelves = [];
    var odd = items.filter(function (i) { return isOdd(i) && !i.risk; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 12);
    if (odd.length) shelves.push({ title: '이게 이 가격?', sub: '명품·금·차량·전자제품', go: 'odd', list: odd, top: function (i) { return '<span class="badge badge-odd">' + esc(catLabel(i)) + '</span>'; } });
    var small = items.filter(cheapOdd).sort(function (a, b) { return a.min - b.min; }).slice(0, 12);
    if (small.length) shelves.push({ title: '100만원 이하로 시작', sub: '커피값부터 도전', go: 'cheapodd', list: small, top: function (i) { return '<span class="badge">' + esc(catLabel(i)) + '</span>'; } });
    var ranked = items.filter(function (i) { return i.rank; }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
    if (ranked.length) shelves.push({ title: '온비드에서 지금 뜨는 물건', sub: '일주일간 관심 저장 순위', go: 'rank', list: ranked, top: function (i) { return '<span class="badge badge-hot">' + i.rank + '위</span>'; } });
    var cl = closing.slice().sort(function (a, b) { return score(b) - score(a); }).slice(0, 10);
    if (cl.length) shelves.push({ title: '곧 마감돼요', sub: '48시간 이내', go: 'closing', list: cl, top: function (i) { return '<span class="badge badge-red">' + esc(ddayLabel(i)) + '</span>'; } });
    var half = items.filter(function (i) { return isHalf(i) && !isOdd(i) && i.cat !== 'goods'; }).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 10);
    if (half.length) shelves.push({ title: '반값 부동산', sub: '감정가 50% 이하', go: 'half', list: half, top: function (i) { return '<span class="badge">' + esc(catLabel(i)) + '</span>'; } });
    $('shelves').innerHTML = shelves.map(function (sh) {
      return '<section><div class="section-head"><h2>' + esc(sh.title) + '</h2><button class="link-btn" data-go="' + sh.go + '">' + esc(sh.sub) + ' · 전체</button></div>' +
        '<div class="scroller">' + sh.list.map(function (i) { return miniHtml(i, sh.top(i)); }).join('') + '</div></section>';
    }).join('');
  }
  // 낙찰가 맞히기: 최근 실제 낙찰 결과로 4지선다 퀴즈 (기기에만 점수 저장)
  var quiz = { i: 0, answered: false };
  function quizPool() {
    return (data.results || []).filter(function (r) { return r.appr && r.price && r.rate >= 20 && r.rate <= 200; });
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

  function renderResults() {
    var rs = data.results || [];
    $('resultsWrap').hidden = !rs.length;
    $('results').innerHTML = rs.slice(0, 5).map(function (r) {
      var over = r.rate > 100;
      return '<div class="result-card"><div class="row-between"><b class="rc-title">' + esc(r.t) + '</b><span class="rc-tag ' + (over ? 'over' : r.rate < 70 ? 'low' : '') + '">' + (over ? '감정가보다 비싸게' : r.rate < 70 ? '싸게 낙찰' : '치열했어요') + '</span></div>' +
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
    renderPick(); renderQuiz(); renderShelves(closing); renderResults();

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
    $('updated').textContent = '온비드 공매 ' + (data.total || items.length).toLocaleString('ko-KR') + '건 중 주요 물건 · 매시간 업데이트' +
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
    else if (ds.go) { e.preventDefault(); go(ds.go); }
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
  else if (cond) st.tab = 'cond';
  fetch('data/items.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
    data = d;
    var ids = {}; d.items.forEach(function (i) { ids[i.id] = 1; });
    Object.keys(liked).forEach(function (k) { if (!ids[k]) delete liked[k]; });
    store.set('ar_liked', liked);
    renderStatic(); render();
  }).catch(function () {
    $('updated').textContent = '데이터를 불러오지 못했어요. 잠시 후 다시 열어 주세요.';
    $('list').innerHTML = '<div class="empty">데이터를 불러오지 못했어요.<br>인터넷 연결을 확인하고 새로고침해 주세요.</div>';
  });
})();
