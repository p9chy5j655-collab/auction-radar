(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 30;
  var CAT = { home: '아파트·주택', shop: '상가·업무', land: '토지', etc: '기타 부동산', goods: '명품·동산', car: '차량' };
  var ICON = {
    home: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
    shop: '<path d="M4 9l1-5h14l1 5"/><path d="M4 9v11h16V9"/><path d="M4 9h16"/><path d="M10 20v-5h4v5"/>',
    land: '<path d="M3 20l6-9 4 5 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>',
    etc: '<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M8 7V4h8v3"/>',
    goods: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/><path d="M12 21L8 9l4-6 4 6z"/>',
    car: '<path d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16"/><rect x="3" y="16" width="18" height="3" rx="1"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>'
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
  function isHalf(it) { return it.rate != null && it.rate <= 50 && !lowball(it); }
  function isCheap(it) { return it.mkt && it.mkt.ratio <= 85 && it.mkt.ratio >= 40 && !lowball(it); }
  function score(it) {
    var s = 0;
    if (it.cat === 'home') s += 3; else if (it.cat === 'shop' || it.cat === 'goods' || it.cat === 'car') s += 1.5;
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
    else if (c.purpose === 'fun') s += (it.cat === 'goods' || it.cat === 'car' ? 6 : 0) + disc / 10;
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
      if (st.cat !== 'all' && it.cat !== st.cat) return false;
      if (st.sido && shortSido(it.sd) !== st.sido) return false;
      if (q && (it.t + ' ' + it.sd + ' ' + it.sgg + ' ' + it.emd + ' ' + it.use + ' ' + (CAT[it.cat] || '')).toLowerCase().indexOf(q) === -1) return false;
      switch (st.tab) {
        case 'half': return isHalf(it);
        case 'rank': return !!it.rank;
        case 'cheap': return isCheap(it);
        case 'new': return it.isNew;
        case 'closing': return hoursLeft(it) <= 48;
        case 'odd': return it.cat === 'goods' || it.cat === 'car';
        case 'liked': return !!liked[it.id];
        case 'cond': return matchesCond(it, cond);
        default: return true;
      }
    });
    var sort = st.sort;
    if (sort === 'auto') sort = st.tab === 'rank' ? 'rank' : st.tab === 'half' ? 'rate' : st.tab === 'closing' ? 'end' : st.tab === 'cheap' ? 'mkt' : st.tab === 'cond' ? 'fit' : 'score';
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
    if (it.thumb) return '<div class="thumb ' + it.cat + '"><img src="' + esc(it.thumb) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<svg viewBox=&quot;0 0 24 24&quot; aria-hidden=&quot;true&quot;>' + ICON[it.cat].replace(/"/g, '&quot;') + '</svg>\'"></div>';
    return '<div class="thumb ' + it.cat + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[it.cat] + '</svg></div>';
  }

  function cardHtml(it) {
    var isLiked = !!liked[it.id];
    var badges = '<span class="badge">' + esc(CAT[it.cat]) + '</span>' +
      (it.rank ? '<span class="badge badge-hot">관심 ' + it.rank + '위</span>' : '') +
      (it.isNew ? '<span class="badge badge-new">NEW</span>' : '') +
      (it.cat === 'goods' || it.cat === 'car' ? '<span class="badge badge-odd">이색</span>' : '') +
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
    if (data.hasGoods) cats.push(['goods', CAT.goods]);
    if (data.hasCar) cats.push(['car', CAT.car]);
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
    var pool = data.items.filter(function (i) { return i.min != null && i.rate != null && !i.risk && !notStarted(i) && hoursLeft(i) > 6 && i.cat !== 'goods' && i.cat !== 'car'; });
    var it = pool.sort(function (a, b) { return score(b) - score(a); })[0];
    if (!it) { $('pick').hidden = true; return; }
    $('pick').innerHTML = '<div class="pick-label">오늘의 픽</div>' +
      '<a class="pick-card" href="' + itemUrl(it) + '">' +
      '<div class="pick-rate"><span>감정가의</span><b>' + it.rate + '<small>%</small></b></div>' +
      '<div class="pick-body"><div class="badges"><span class="badge">' + esc(CAT[it.cat]) + '</span>' + (it.rank ? '<span class="badge badge-hot">온비드 관심 ' + it.rank + '위</span>' : '') + '<span class="dday">' + esc(ddayLabel(it)) + '</span></div>' +
      '<div class="pick-title">' + esc(it.t) + '</div>' +
      '<div class="pick-price"><b>' + won(it.min) + '</b><s>감정 ' + won(it.appr) + '</s></div>' +
      '<div class="pick-plain">' + esc(plain(it)) + (isCheap(it) ? ' · 주변 시세의 ' + it.mkt.ratio + '%' : '') + '</div>' +
      '<span class="pick-cta">낙찰 도우미로 따져보기 →</span></div></a>';
  }
  function renderShelves(closing) {
    var items = data.items, shelves = [];
    var ranked = items.filter(function (i) { return i.rank; }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
    if (ranked.length) shelves.push({ title: '온비드에서 지금 뜨는 물건', sub: '일주일간 관심 저장 순위', go: 'rank', list: ranked, top: function (i) { return '<span class="badge badge-hot">' + i.rank + '위</span>'; } });
    var odd = items.filter(function (i) { return i.cat === 'goods' || i.cat === 'car'; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 10);
    if (odd.length) shelves.push({ title: '이게 이 가격?', sub: '명품·귀금속·차량 공매', go: 'odd', list: odd, top: function (i) { return '<span class="badge badge-odd">' + esc(CAT[i.cat]) + '</span>'; } });
    var half = items.filter(function (i) { return isHalf(i) && i.cat !== 'goods' && i.cat !== 'car'; }).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 10);
    if (half.length) shelves.push({ title: '반값 부동산', sub: '감정가 50% 이하', go: 'half', list: half, top: function (i) { return '<span class="badge">' + esc(CAT[i.cat]) + '</span>'; } });
    var cl = closing.slice().sort(function (a, b) { return score(b) - score(a); }).slice(0, 10);
    if (cl.length) shelves.push({ title: '곧 마감돼요', sub: '48시간 이내', go: 'closing', list: cl, top: function (i) { return '<span class="badge badge-red">' + esc(ddayLabel(i)) + '</span>'; } });
    $('shelves').innerHTML = shelves.map(function (sh) {
      return '<section><div class="section-head"><h2>' + esc(sh.title) + '</h2><button class="link-btn" data-go="' + sh.go + '">' + esc(sh.sub) + ' · 전체</button></div>' +
        '<div class="scroller">' + sh.list.map(function (i) { return miniHtml(i, sh.top(i)); }).join('') + '</div></section>';
    }).join('');
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
    renderPick(); renderShelves(closing); renderResults();

    var counts = {};
    items.forEach(function (i) { var s = shortSido(i.sd); counts[s] = (counts[s] || 0) + 1; });
    var sidos = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    $('sido').innerHTML = '<option value="">전국 (' + items.length.toLocaleString('ko-KR') + ')</option>' + sidos.map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + ' (' + counts[s].toLocaleString('ko-KR') + ')</option>';
    }).join('');

    var sgg = {};
    items.filter(function (i) { return i.cat === 'home' || i.cat === 'shop'; }).forEach(function (i) { if (i.sgg) sgg[i.sgg] = (sgg[i.sgg] || 0) + score(i); });
    var hot = Object.keys(sgg).sort(function (a, b) { return sgg[b] - sgg[a]; }).slice(0, 4).map(function (s) { return s.split(' ').pop(); });
    hot.push('반값 아파트');
    if (data.hasGoods) hot.push('명품');
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
      else if (w === '명품') { st.q = ''; st.cat = 'goods'; st.tab = 'top'; }
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
