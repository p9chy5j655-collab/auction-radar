(function () {
  'use strict';
  // 물건 종류마다 화면 구성이 달라 없는 칸이 있어도 오류 없이 0으로 계산해요
  var $ = function (id) { return document.getElementById(id) || document.createElement('input'); };
  var it = JSON.parse($('item-data').textContent);
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };
  function won(v) {
    if (v == null || !isFinite(v)) return '-';
    var neg = v < 0; v = Math.abs(v);
    if (v > 0 && v < 10000) return (neg ? '−' : '') + Math.round(v).toLocaleString('ko-KR') + '원';
    var man = Math.round(v / 10000), s;
    if (man >= 10000) { var eok = Math.floor(man / 10000), rest = man % 10000; s = eok + '억' + (rest ? ' ' + rest.toLocaleString('ko-KR') + '만' : '') + '원'; }
    else s = man.toLocaleString('ko-KR') + '만원';
    return (neg ? '−' : '') + s;
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // 마감 카운트다운
  function tick() {
    if (!it.en) return;
    var el = $('countdown');
    var dd = document.querySelector('[data-dday]');
    var toStart = it.st ? new Date(it.st).getTime() - Date.now() : 0;
    if (toStart > 0) {
      var sd = Math.floor(toStart / 864e5), sh = Math.floor(toStart % 864e5 / 36e5);
      el.textContent = (sd ? sd + '일 ' : '') + sh + '시간';
      var lab = el.parentNode && el.parentNode.querySelector('.muted'); if (lab) lab.textContent = '입찰 시작까지';
      if (dd) { dd.textContent = '입찰 예정'; dd.className = 'badge badge-blue'; }
      return;
    }
    var ms = new Date(it.en).getTime() - Date.now();
    if (ms <= 0) { el.textContent = '마감됐어요'; if (dd) dd.textContent = '마감'; return; }
    var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    el.textContent = (d ? d + '일 ' : '') + h + '시간 ' + m + '분';
    var kd = function (t) { return Math.floor((t + 9 * 3600e3) / 864e5); };
    var cd = kd(new Date(it.en).getTime()) - kd(Date.now());
    if (dd) dd.textContent = cd <= 0 ? '오늘 마감' : cd === 1 ? '내일 마감' : '마감 D-' + cd;
  }
  tick(); setInterval(tick, 30000);

  // 관심·공유
  var liked = store.get('ar_liked', {});
  function paintLike() {
    var on = !!liked[it.id];
    $('like').setAttribute('aria-pressed', on);
    $('like2').setAttribute('aria-pressed', on);
    $('like2').textContent = on ? '관심 등록됨' : '관심 등록';
  }
  function toggleLike() {
    liked = store.get('ar_liked', {});
    if (liked[it.id]) delete liked[it.id]; else { liked[it.id] = Date.now(); toast('관심 물건에 담았어요.'); }
    store.set('ar_liked', liked); paintLike();
  }
  $('like').addEventListener('click', toggleLike);
  $('like2').addEventListener('click', toggleLike);
  paintLike();
  $('share').addEventListener('click', function () {
    var title = document.title.replace(' | 공매24', '');
    if (navigator.share) { navigator.share({ title: title, url: location.href }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(title + '\n' + location.href).then(function () { toast('링크를 복사했어요. 카톡에 붙여넣어 보세요.'); });
  });

  // 최대 입찰가 계산 (만원 단위 입력)
  var defaults = {
    sell: it.mkt ? Math.round(it.mkt.med / 10000) : (it.appr ? Math.round(it.appr / 10000) : 0),
    profit: 10,
    // 주택 1채 기준 대략값(취득세+지방교육세), 그 외 부동산 4.6%. 이용자가 바꿀 수 있어요.
    tax: it.cat === 'home' ? ((it.min || 0) <= 6e8 ? 1.1 : (it.min || 0) <= 9e8 ? 2.2 : 3.3) : ((it.cat === 'car' && it.sub !== 'heavy') ? 7 : (it.cat === 'goods' || it.cat === 'car') ? 0 : 4.6),
    fee: 0.5,
    repair: it.cat === 'home' ? 500 : 0,
    evict: it.cat === 'home' ? 300 : 0
  };
  var MBKEY = 'ar_mb_' + (it.cat === 'home' ? 'home' : it.cat);
  var saved = store.get(MBKEY, {});
  var fields = { sell: 'mbSell', profit: 'mbProfit', tax: 'mbTax', fee: 'mbFee', repair: 'mbRepair', evict: 'mbEvict' };
  Object.keys(fields).forEach(function (k) {
    var v = (k === 'sell' || k === 'tax') ? defaults[k] : (saved[k] != null ? saved[k] : defaults[k]);
    $(fields[k]).value = v;
    $(fields[k]).addEventListener('input', calcMax);
  });
  var maxBid = null;
  function val(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : 0; }
  var GUIDE = null;
  try { var gdEl = document.getElementById('guide-data'); if (gdEl) GUIDE = JSON.parse(gdEl.textContent); } catch (e) { GUIDE = null; }
  function calcMax() {
    if (GUIDE) {
      maxBid = GUIDE.hi || null;
      var qb = $('quick').querySelector && $('quick').querySelector('[data-v="max"]');
      if (qb) qb.hidden = !maxBid;
      return;
    }
    var sell = val('mbSell') * 10000, profit = val('mbProfit') / 100, tax = val('mbTax') / 100, fee = val('mbFee') / 100;
    var fixed = (val('mbRepair') + val('mbEvict')) * 10000;
    store.set(MBKEY, { profit: val('mbProfit'), tax: val('mbTax'), fee: val('mbFee'), repair: val('mbRepair'), evict: val('mbEvict') });
    var target = sell * (1 - profit) - fixed;
    maxBid = target > 0 ? Math.floor(target / (1 + tax + fee) / 100000) * 100000 : 0;
    var cost = maxBid * (tax + fee) + fixed;
    var html;
    if (!sell) html = '<span class="line">예상 매도가를 넣어 주세요.</span>';
    else {
      html = '<span class="line">손해 보지 않는 최대 입찰가</span><span class="big">' + won(maxBid) + '</span>';
      if (it.min != null) {
        var gap = maxBid - it.min;
        html += '<span class="line">' + (gap >= 0
          ? '최저 입찰가보다 <b style="color:#86EFAC">' + won(gap) + '</b> 여유가 있어요. 이 범위 안에서 경쟁을 고려해 정하세요.'
          : '최저 입찰가보다 <b style="color:#FDA29B">' + won(-gap) + '</b> 부족해요. 이 조건이면 입찰을 다시 생각해 보세요.') + '</span>';
      }
      html += '<span class="line">' + (G ? ((it.cat === 'car' && it.sub !== 'heavy') ? '이전등록비 약 ' + won(maxBid * (tax + fee)) + ' + 수리비 ' : '운반·수리비 ') : '세금·등기비 약 ' + won(maxBid * (tax + fee)) + ' + 수리·명도 ') + won(fixed) + ' = 부대비용 약 ' + won(cost) + '</span>';
    }
    $('mbResult').innerHTML = html;
    var q = $('quick').querySelector('[data-v="max"]');
    if (q) q.disabled = !maxBid;
  }

  // 내 입찰가 판정
  var bidInput = $('bid');
  // 만원 단위로 올림해서 넣어요 (내림하면 최저가보다 낮아져 입찰할 수 없는 금액이 돼요)
  var minMan = it.min ? Math.ceil(it.min / 10000) : '';
  bidInput.value = minMan;
  var quick = [['최저가로', function () { return minMan || 0; }]];
  // (가이드가 없는 물건은 계산 결과가 있어야 버튼을 보여줘요)
  quick.push([GUIDE ? '가이드 상한으로' : '최대 입찰가로', function () { return maxBid ? Math.round(maxBid / 10000) : 0; }, 'max']);
  var G = it.cat === 'goods' || it.cat === 'car';
  var m0 = it.min || 0;
  // 물건 값에 맞는 단위로 올리고 내려요
  var stepA = G ? (m0 < 5e6 ? 10 : m0 < 3e7 ? 50 : m0 < 1e8 ? 100 : 500) : (m0 < 1e8 ? 100 : 500), stepB = stepA * 2;
  var lbl = function (n) { return n >= 1000 ? (n / 1000).toLocaleString('ko-KR') + ',000만' : n + '만'; };
  quick.push(['+' + lbl(stepA), function () { return val('bid') + stepA; }], ['+' + lbl(stepB), function () { return val('bid') + stepB; }], ['−' + lbl(stepA), function () { return Math.max(0, val('bid') - stepA); }]);
  $('quick').innerHTML = quick.map(function (q, i) { return '<button class="chip" data-q="' + i + '"' + (q[2] ? ' data-v="' + q[2] + '"' : '') + '>' + q[0] + '</button>'; }).join('');
  $('quick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (!b) return;
    bidInput.value = quick[+b.dataset.q][1](); calcBid();
  });
  bidInput.addEventListener('input', calcBid);
  function calcBid() {
    var bid = val('bid') * 10000;
    var v = $('verdict');
    var box = function (bg, color, title, text) { v.style.background = bg; v.innerHTML = '<b style="color:' + color + '">' + title + '</b><span>' + text + '</span>'; };
    if (!bid) box('#F7F8FA', '#3A3F4A', '입찰가를 넣어 보세요', '금액을 넣으면 감정가·시세와 비교해 드려요.');
    else if (it.trap) box('#FFFAEB', '#B54708', '숨은 조건부터 확인하세요', '값이 많이 내려온 이유(지분·점유자·상태 등)를 공고문에서 확인하기 전에는 계산 결과를 믿기 어려워요.');
    else if (it.min != null && bid < it.min) box('#FEF3F2', '#B42318', '최저 입찰가보다 낮아요', '최저 입찰가 ' + won(it.min) + ' 이상으로 써야 입찰할 수 있어요.');
    else if (maxBid && bid > maxBid) box('#FFFAEB', '#B54708', GUIDE ? '가이드 상한을 넘었어요' : '최대 입찰가를 넘었어요', GUIDE ? '가이드 상한보다 ' + won(bid - maxBid) + ' 높아요. 이 값이면 공매로 사는 이점이 줄어요.' : '위에서 계산한 손익분기 금액보다 ' + won(bid - maxBid) + ' 높아요. 낙찰돼도 남는 게 없을 수 있어요.');
    else if (it.mkt && bid >= it.mkt.med * 0.95) box('#EEF4FF', '#1D4ED8', '시세에 가까워요', '주변 실거래 중간값의 ' + Math.round(bid / it.mkt.med * 100) + '%예요. 일반 매매와 비교해 공매로 사는 이점이 작아요.');
    else if (GUIDE && GUIDE.lo && bid < GUIDE.lo) box('#EEF4FF', '#1D4ED8', '가이드보다 낮게 썼어요', '입찰은 할 수 있지만, 비슷한 물건이 팔린 값보다 낮아 낙찰될 가능성은 낮을 수 있어요.');
    else if (!maxBid) box('#F7F8FA', '#3A3F4A', '판단할 기준이 없어요', GUIDE ? '비교할 낙찰 사례나 감정가가 없어 가이드를 만들지 못했어요. 공고문과 시세를 직접 확인하세요.' : '위 계산기에 예상 매도가(시세)를 넣으면 판단해 드려요.');
    else box('#ECFDF3', '#067647', GUIDE ? '가이드 범위 안이에요' : '계산상 남는 범위예요', (GUIDE ? '가이드 범위 안쪽이에요' : '최대 입찰가 안쪽이에요') + '. 같은 물건에 몇 명이 들어올지에 따라 결과는 달라질 수 있어요.');
    $('vsAppr').textContent = it.appr && bid ? Math.round(bid / it.appr * 100) + '%' : '-';
    if ($('vsMkt')) $('vsMkt').textContent = it.mkt && bid ? Math.round(bid / it.mkt.med * 100) + '%' : '-';
    $('deposit').textContent = bid ? won(bid * 0.1) : '-';
  }

  // 입찰 준비 도우미: 단계마다 바로 가는 버튼 + 돈 계획 + 마감 일정 저장
  var isRE = ['home', 'shop', 'land', 'etc'].indexOf(it.cat) !== -1;
  // 주소: '외 N필지' 같은 말과 괄호 설명은 빼고, 호수·번지까지만 남겨요
  var addr = (function (a) {
    a = String(a || '').replace(/\s*외\s*\d+\s*(필지|개|건|동|호|점|대)\S*/g, ' ').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    var m = a.match(/^(.*?\d+\s*호)/) || a.match(/^(.*?\d+(-\d+)?\s*(번지)?)(\s|$)/);
    return (m ? m[1] : a).trim();
  })(it.addr);
  var addrQ = encodeURIComponent(addr);
  function link(label, href) { return '<a class="mini-btn" href="' + href + '" target="_blank" rel="noopener">' + label + '</a>'; }
  function btn(label, act) { return '<button class="mini-btn" type="button" data-act="' + act + '">' + label + '</button>'; }
  var onbid = it.url ? link('온비드 원문 열기', it.url) : '';
  var place = it.place || '';
  var mapBtns = addr ? link('네이버 지도', 'https://map.naver.com/p/search/' + addrQ) + link('카카오맵', 'https://map.kakao.com/?q=' + addrQ) : '';
  var steps;
  if (isRE) {
    steps = [
      ['공고문 원문 읽기', '유의사항, 배분요구 종기, 매각에서 빠지는 것(제외 대상)을 먼저 확인해요.', onbid],
      ['등기부등본 확인', '낙찰 뒤에도 사라지지 않는 권리가 있는지 봐요. 주소를 복사해 인터넷등기소에서 열람해요(유료).', btn('주소 복사', 'copy') + link('인터넷등기소', 'https://www.iros.go.kr')],
      ['사는 사람 확인', '온비드 원문의 임대차 정보를 보고, 주민센터에서 전입세대 열람으로 실제 거주자를 확인해요. 공매는 인도명령 제도가 없어 명도가 더 어려울 수 있어요.', onbid],
      ['현장 가 보기', '사진과 실제 상태, 주변 환경, 관리비 체납 여부(관리사무소)를 직접 확인해요.', mapBtns],
      ['시세 다시 확인', '이 페이지의 시세 비교와 국토부 실거래가를 함께 봐요.', btn('이 페이지 시세 보기', 'mkt') + link('국토부 실거래가', 'https://rt.molit.go.kr')],
      ['돈 계획 세우기', '아래 계산에 내 현금을 넣어 보증금과 잔금을 낼 수 있는지 확인해요.', btn('돈 계획 보기', 'money')],
      ['마감 일정 저장', '입찰 마감을 놓치지 않게 캘린더에 넣어 둬요.', btn('구글 캘린더', 'gcal') + btn('휴대폰 캘린더', 'ics')]
    ];
  } else if (it.sub === 'right') {
    steps = [
      ['공고문 원문 읽기', '몇 주(몇 %)를 파는지, 양도 제한이 있는지 확인해요.', onbid],
      ['회사 정보 찾아보기', '전자공시(DART)에서 회사 이름으로 재무제표와 감사보고서를 찾아봐요. 공시가 없는 회사도 많아요.', link('DART 전자공시', 'https://dart.fss.or.kr')],
      ['팔 수 있는지 생각하기', '비상장주식은 사줄 사람을 직접 찾아야 해요. 현금으로 바꿀 방법을 먼저 정하세요.', ''],
      ['마감 일정 저장', '입찰 마감을 캘린더에 넣어 둬요.', btn('구글 캘린더', 'gcal') + btn('휴대폰 캘린더', 'ics')]
    ];
  } else {
    // 동산·차량: 종류마다 확인할 것이 달라요
    var mapPlace = place ? link('보관 장소 지도', 'https://map.naver.com/p/search/' + encodeURIComponent(place)) : '';
    var nv = function (q) { return 'https://search.naver.com/search.naver?query=' + encodeURIComponent(q); };
    var MONEY = ['돈 계획 세우기', '보증금(입찰가의 10%)과 잔금, 운반비까지 내 현금으로 되는지 확인해요. 동산은 대출이 거의 안 돼요.', btn('돈 계획 보기', 'money')];
    var CAL = ['마감 일정 저장', '입찰 마감을 놓치지 않게 캘린더에 넣어 둬요. 하루 전 알림이 같이 들어가요.', btn('구글 캘린더', 'gcal') + btn('휴대폰 캘린더', 'ics')];
    var PICK = ['받으러 갈 날 정하기', '낙찰 뒤 잔금을 내고 정해진 기한 안에 보관 장소에서 직접 받아 와요. 거리와 시간을 미리 잡아 두세요.', mapPlace];
    var sub = it.sub;
    if ((it.cat === 'car' && it.sub !== 'heavy')) {
      steps = [
        ['차량번호·보관소 확인', '온비드 원문에서 차량번호, 보관소 위치, 열쇠·서류가 있는지 확인해요. 아래 단계에서 차량번호가 필요해요.', onbid + mapPlace],
        ['사고·침수 이력 조회', '보험개발원 카히스토리에서 차량번호로 사고·침수·용도 변경 이력을 볼 수 있어요(유료).', link('카히스토리', 'https://www.carhistory.or.kr')],
        ['압류·저당 확인', '자동차등록원부로 압류·저당이 몇 건인지 봐요. 공매 뒤 말소되는지는 공고문 조건으로 확인해요.', link('정부24', 'https://www.gov.kr') + onbid],
        ['같은 차 시세 보기', '같은 차종·연식 중고차 시세와 비교해요. 주행거리와 상태에 따라 차이가 커요.', btn('시세 보기', 'mkt')],
        ['가져오는 방법 정하기', '이전등록과 보험 가입 전에는 바로 운전해 오기 어려울 수 있어요. 탁송·견인 비용을 알아봐요.', link('탁송 비용 찾아보기', nv('차량 탁송 비용'))],
        ['이전등록 준비', '낙찰 뒤 차량등록사업소에서 이전등록을 하고 취득세 등(약 7%)을 내요. 돈 계획에 넣어 두었어요.', btn('가이드 보기', 'calc')],
        MONEY, CAL
      ];
    } else if (sub === 'luxury') {
      steps = [
        ['사진에서 모델·각인 찾기', '원문 사진을 크게 보고 모델명, 레퍼런스 번호, 시리얼 각인이 보이는지 확인해요. 찾으면 위 \'시장에선 얼마일까\'에 넣어 보세요.', onbid + btn('제품번호 넣기', 'code')],
        ['구성품 확인', '보증서, 박스, 영수증, 감정서가 함께 오는지 공고문에서 봐요. 구성품이 없으면 되팔 때 값이 크게 떨어져요.', onbid],
        ['같은 모델 시세 보기', '제품번호가 확인된 경우에만 중고·새 제품 가격을 비교해요. 비슷한 다른 모델 가격과 섞지 마세요.', btn('시세 보기', 'mkt')],
        ['정품 확인 방법 정하기', '감정가는 정품을 보장하지 않아요. 낙찰 뒤 어디서 정품 감정을 받을지, 비용은 얼마인지 미리 알아봐요.', link('정품 감정 찾아보기', nv('명품 정품 감정 비용'))],
        PICK, MONEY, CAL
      ];
    } else if (sub === 'gold') {
      steps = [
        ['순도·무게 확인', '공고문이나 감정서에서 순도(24K·18K·14K)와 무게(g·돈)를 찾아요. 1돈은 3.75g이에요.', onbid],
        ['오늘 금값으로 따져 보기', '순금 1돈 시세 × 무게 × 순도 비율로 대략적인 값을 계산해요. 18K는 약 75%, 14K는 약 58.5%예요.', link('오늘 금 시세', nv('오늘 금시세'))],
        ['팔 곳과 매입가 알아보기', '금은방이 사 주는 값(매입가)은 파는 값보다 낮아요. 장신구는 세공비를 쳐 주지 않는 경우가 많아요.', link('금 매입가 찾아보기', nv('금 매입 시세'))],
        PICK, MONEY, CAL
      ];
    } else if (sub === 'elec') {
      steps = [
        ['정확한 모델번호 확인', '원문 사진의 라벨이나 설명에서 모델번호(예: SM-S928N, A2338)를 찾아요. 같은 이름도 모델번호에 따라 값이 크게 달라요.', onbid + btn('제품번호 넣기', 'code')],
        ['작동·구성품 확인', '작동 확인 여부, 충전기·케이블 같은 구성품이 있는지 공고문에서 봐요. 표시가 없으면 고장 가능성을 감안해요.', onbid],
        ['잠금·초기화 문제 생각하기', '휴대폰·노트북은 이전 사용자 계정 잠금이 걸려 있으면 쓰기 어려워요. 공고문에 초기화 여부가 있는지 확인해요.', onbid],
        ['같은 모델 시세 보기', '모델번호가 확인되면 중고 시세와 새 제품 가격을 비교해요. 출시가 오래된 제품은 값이 빨리 떨어져요.', btn('시세 보기', 'mkt')],
        PICK, MONEY, CAL
      ];
    } else if (sub === 'heavy' || sub === 'machine') {
      steps = [
        ['공고문 원문 읽기', '수량, 연식, 작동 여부, 인도 기한과 보관료 조건을 확인해요.', onbid],
        ['운반 방법·비용 알아보기', '트럭이나 크레인이 필요할 수 있어요. 보관 장소에서 받을 곳까지 운반 견적을 먼저 받아 보세요.', mapPlace + link('운반 견적 찾아보기', nv((sub === 'heavy' ? '중장비' : '기계') + ' 운반 비용'))],
        ['등록·면허 필요 여부', sub === 'heavy' ? '건설기계·선박은 등록이 필요하고, 운전하려면 해당 면허가 있어야 해요. 등록 서류가 함께 오는지 공고문에서 봐요.' : '의료·산업 기계는 쓰는 데 허가나 신고가 필요할 수 있어요. 어디에 쓸지 먼저 정해요.', onbid],
        ['되팔 곳 생각해 보기', '같은 종류 중고 장비 시세를 찾아보고, 사 줄 곳이 있는지 알아봐요.', btn('시세 보기', 'mkt')],
        MONEY, CAL
      ];
    } else {
      steps = [
        ['수량·구성 확인', '몇 개를 한꺼번에 파는지, 무엇이 포함되는지 공고문에서 확인해요. 동산은 묶음으로 파는 경우가 많아요.', onbid],
        ['사진으로 상태 보기', '미리 실물을 보기 어려운 경우가 많아요. 사진과 상세 설명으로 상태를 확인하고, 궁금한 점은 담당기관에 문의해요.', onbid],
        ['실어 올 차 정하기', '부피와 무게를 보고 승용차로 될지, 화물차가 필요한지 정해요.', mapPlace],
        MONEY, CAL
      ];
    }
  }
  var done = store.get('ar_chk_' + it.id, {});
  function paintChecks() {
    $('checks').innerHTML = steps.map(function (c, i) {
      return '<div class="prep-step"><button class="check" data-c="' + i + '" aria-pressed="' + !!done[i] + '"><span class="box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span><span><span class="ct">' + (i + 1) + '. ' + c[0] + '</span><span class="cd">' + c[1] + '</span></span></button>' +
        (c[2] ? '<div class="prep-actions">' + c[2] + '</div>' : '') +
        (c[0] === '돈 계획 세우기' ? '<div class="money" id="money" hidden></div>' : '') + '</div>';
    }).join('');
    var n = Object.keys(done).filter(function (k) { return done[k]; }).length;
    $('checkCount').textContent = n + ' / ' + steps.length + (n === steps.length ? ' 준비 끝!' : '');
  }
  function moneyPlan() {
    var box = $('money'); if (!box) return;
    var bid = (val('bid') || (it.min ? it.min / 10000 : 0)) * 10000;
    var taxRate = (val('mbTax') + val('mbFee')) / 100;
    if (!document.getElementById('mbTax') && (it.cat === 'car' && it.sub !== 'heavy')) taxRate = 0.07;
    var fixedCost = (val('mbRepair') + val('mbEvict')) * 10000;
    var ownCost = !isRE && !document.getElementById('mbRepair');
    var cash = store.get('ar_cash', '');
    var loan = isRE ? store.get('ar_loan', 50) : 0;
    box.innerHTML = '<div class="form-grid"><label>내가 쓸 수 있는 현금<span class="input-row sm"><input id="cash" type="number" inputmode="numeric" value="' + cash + '" placeholder="' + (isRE ? '예: 10000' : '예: 300') + '"><span>만원</span></span></label>' +
      (ownCost ? '<label>운반·수리 등 예상 비용<span class="input-row sm"><input id="mvCost" type="number" inputmode="numeric" min="0" value="' + (store.get('ar_mv', '') || '') + '" placeholder="예: 10"><span>만원</span></span></label>' : '') +
      (isRE ? '<label>대출 예상 비율<span class="input-row sm"><input id="loan" type="number" inputmode="decimal" min="0" max="90" value="' + loan + '"><span>%</span></span></label>' : '') + '</div><div id="moneyOut" class="money-out"></div>';
    box.hidden = false;
    function out() {
      var c = (parseFloat($('cash').value) || 0) * 10000, l = isRE ? (parseFloat($('loan').value) || 0) / 100 : 0;
      store.set('ar_cash', $('cash').value); if (isRE) store.set('ar_loan', $('loan').value);
      if (ownCost) { fixedCost = (parseFloat($('mvCost').value) || 0) * 10000; store.set('ar_mv', $('mvCost').value); }
      var deposit = bid * 0.1, rest = bid - deposit, loanAmt = rest * l, extra = bid * taxRate + fixedCost;
      var need = deposit + (rest - loanAmt) + extra;
      $('moneyOut').innerHTML =
        '<div class="mo-row"><span>입찰가 (내 입찰가 기준)</span><b>' + won(bid) + '</b></div>' +
        '<div class="mo-row"><span>① 입찰할 때 보증금 10%</span><b>' + won(deposit) + '</b></div>' +
        '<div class="mo-row"><span>② 낙찰 뒤 잔금</span><b>' + won(rest) + '</b></div>' +
        (l ? '<div class="mo-row"><span>　 그중 대출 예상 ' + Math.round(l * 100) + '%</span><b>−' + won(loanAmt) + '</b></div>' : '') +
        '<div class="mo-row"><span>③ ' + (isRE ? '세금·등기비·수리·명도비' : (it.cat === 'car' && it.sub !== 'heavy') ? '이전등록비(약 7%)' : '운반·수리비') + '</span><b>' + won(extra) + '</b></div>' +
        '<div class="mo-row total"><span>내 돈으로 필요한 금액</span><b>' + won(need) + '</b></div>' +
        (c ? '<p class="' + (c >= need ? 'mo-ok' : 'mo-bad') + '">' + (c >= need ? '현금으로 충분해요. 여유 ' + won(c - need) : won(need - c) + (isRE ? ' 부족해요. 입찰가나 대출 계획을 다시 생각해 보세요.' : ' 부족해요. 동산은 대출이 어려우니 입찰가를 낮춰 보세요.')) + '</p>' : '') +
        '<p class="note">' + (isRE ? '③은 위 계산기의 세금·수리·명도비예요. 대출은 낙찰 후 심사라 안 나올 수도 있어요. ' : (it.cat === 'car' && it.sub !== 'heavy') ? '③은 취득세 등 약 7%만 넣었어요. 탁송·수리비는 따로 더하세요. ' : '③은 위에 직접 넣은 예상 비용이에요. ') + '잔금 납부 기한은 공고문에서 확인하세요.</p>';
    }
    box.addEventListener('input', out); out();
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function utcStamp(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; }
  function calInfo() {
    var end = new Date(it.en), start = new Date(end.getTime() - 3600e3);
    return { title: '[입찰 마감] ' + it.t, start: start, end: end, desc: '공매24에서 저장한 일정이에요. 입찰 전 온비드 원문을 꼭 확인하세요.\n' + location.href };
  }
  $('checks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]');
    if (b) { done[b.dataset.c] = !done[b.dataset.c]; store.set('ar_chk_' + it.id, done); paintChecks(); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'copy') {
      if (navigator.clipboard) navigator.clipboard.writeText(addr).then(function () { toast('주소를 복사했어요.'); }, function () { toast(addr); }); else toast(addr);
    } else if (act === 'mkt') {
      var t = document.getElementById('mktSec') || document.querySelector('.link-row') || document.getElementById('maxbid'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'code' || act === 'calc') {
      var tg = act === 'code' ? (document.getElementById('codeIn') || document.querySelector('.link-row')) : document.getElementById('maxbid');
      if (tg) { if (tg.tagName === 'DETAILS') tg.open = true; tg.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (tg.focus && act === 'code') tg.focus(); }
    } else if (act === 'money') {
      var m = $('money'); if (m && m.hidden) moneyPlan(); else if (m) m.hidden = true;
    } else if (act === 'gcal' || act === 'ics') {
      if (!it.en) { toast('마감 일시가 없는 물건이에요.'); return; }
      var c = calInfo();
      if (act === 'gcal') {
        window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(c.title) + '&dates=' + utcStamp(c.start) + '/' + utcStamp(c.end) + '&details=' + encodeURIComponent(c.desc), '_blank', 'noopener');
      } else {
        var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//auction-radar//KO', 'BEGIN:VEVENT', 'UID:' + it.id + '@auction-radar', 'DTSTAMP:' + utcStamp(new Date()), 'DTSTART:' + utcStamp(c.start), 'DTEND:' + utcStamp(c.end),
          'SUMMARY:' + c.title.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1'), 'DESCRIPTION:' + c.desc.replace(/\n/g, '\\n').replace(/[,;]/g, ' '),
          'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:내일 입찰 마감', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
        var dl = document.createElement('a'); dl.href = url; dl.download = '입찰마감.ics'; document.body.appendChild(dl); dl.click(); dl.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        toast('일정 파일을 받았어요. 열면 캘린더에 추가돼요.');
      }
    }
  });
  paintChecks();

  // 제품번호 직접 입력 → 정확한 번호로만 검색
  var codeIn = $('codeIn');
  if (codeIn) {
    codeIn.addEventListener('input', function () {
      var c = codeIn.value.trim();
      var ok = /[A-Za-z0-9]/.test(c) && c.length >= 3;
      $('codeLinks').hidden = !ok;
      if (ok) {
        $('codeUsed').href = 'https://search.naver.com/search.naver?query=' + encodeURIComponent(c + ' 중고 시세');
        $('codeNew').href = 'https://search.shopping.naver.com/search/all?query=' + encodeURIComponent(c);
      }
    });
  }

  calcMax(); calcBid();

  // 사진 여러 장: 넘길 때 '2 / 5' 표시
  var gal = document.getElementById('gal'), gc = document.getElementById('galCount');
  if (gal && gc) gal.addEventListener('scroll', function () {
    var n = gal.children.length, i = Math.round(gal.scrollLeft / Math.max(1, gal.clientWidth));
    gc.textContent = Math.min(n, i + 1) + ' / ' + n;
  }, { passive: true });

  // 뒤로 버튼: 사이트 안에서 왔으면 보던 목록(탭·필터·스크롤)으로 돌아가요
  var backA = document.querySelector('.topbar a.icon-btn');
  if (backA && document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) {
    backA.addEventListener('click', function (e) { e.preventDefault(); history.back(); });
  }
})();
