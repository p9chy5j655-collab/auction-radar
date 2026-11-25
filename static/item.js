(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var it = JSON.parse($('item-data').textContent);
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };
  function won(v) {
    if (v == null || !isFinite(v)) return '-';
    var neg = v < 0; v = Math.abs(v);
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
    var ms = new Date(it.en).getTime() - Date.now();
    var el = $('countdown');
    var dd = document.querySelector('[data-dday]');
    if (ms <= 0) { el.textContent = '마감됐어요'; if (dd) dd.textContent = '마감'; return; }
    var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    el.textContent = (d ? d + '일 ' : '') + h + '시간 ' + m + '분';
    if (dd) dd.textContent = d ? '마감 D-' + (d + (h || m ? 1 : 0)) : '오늘 마감';
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
    var title = document.title.replace(' | 경매레이더', '');
    if (navigator.share) { navigator.share({ title: title, url: location.href }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(title + '\n' + location.href).then(function () { toast('링크를 복사했어요. 카톡에 붙여넣어 보세요.'); });
  });

  // 최대 입찰가 계산 (만원 단위 입력)
  var defaults = {
    sell: it.mkt ? Math.round(it.mkt.med / 10000) : (it.appr ? Math.round(it.appr / 10000) : 0),
    profit: 10,
    // 주택 1채 기준 대략값(취득세+지방교육세), 그 외 부동산 4.6%. 이용자가 바꿀 수 있어요.
    tax: it.cat === 'home' ? ((it.min || 0) <= 6e8 ? 1.1 : (it.min || 0) <= 9e8 ? 2.2 : 3.3) : (it.cat === 'car' ? 7 : it.cat === 'goods' ? 0 : 4.6),
    fee: 0.5,
    repair: it.cat === 'home' ? 500 : 0,
    evict: it.cat === 'home' ? 300 : 0
  };
  var saved = store.get('ar_mb', {});
  var fields = { sell: 'mbSell', profit: 'mbProfit', tax: 'mbTax', fee: 'mbFee', repair: 'mbRepair', evict: 'mbEvict' };
  Object.keys(fields).forEach(function (k) {
    var v = (k === 'sell' || k === 'tax') ? defaults[k] : (saved[k] != null ? saved[k] : defaults[k]);
    $(fields[k]).value = v;
    $(fields[k]).addEventListener('input', calcMax);
  });
  var maxBid = null;
  function val(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : 0; }
  function calcMax() {
    var sell = val('mbSell') * 10000, profit = val('mbProfit') / 100, tax = val('mbTax') / 100, fee = val('mbFee') / 100;
    var fixed = (val('mbRepair') + val('mbEvict')) * 10000;
    store.set('ar_mb', { profit: val('mbProfit'), tax: val('mbTax'), fee: val('mbFee'), repair: val('mbRepair'), evict: val('mbEvict') });
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
      html += '<span class="line">세금·등기비 약 ' + won(maxBid * (tax + fee)) + ' + 수리·명도 ' + won(fixed) + ' = 부대비용 약 ' + won(cost) + '</span>';
    }
    $('mbResult').innerHTML = html;
    var q = $('quick').querySelector('[data-v="max"]');
    if (q) q.disabled = !maxBid;
  }

  // 내 입찰가 판정
  var bidInput = $('bid');
  bidInput.value = it.min ? Math.round(it.min / 10000) : '';
  var quick = [['최저가로', function () { return it.min ? Math.round(it.min / 10000) : 0; }]];
  quick.push(['최대 입찰가로', function () { return maxBid ? Math.round(maxBid / 10000) : 0; }, 'max']);
  quick.push(['+500만', function () { return val('bid') + 500; }], ['+1,000만', function () { return val('bid') + 1000; }], ['−500만', function () { return Math.max(0, val('bid') - 500); }]);
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
    else if (it.min != null && bid < it.min) box('#FEF3F2', '#B42318', '최저 입찰가보다 낮아요', '최저 입찰가 ' + won(it.min) + ' 이상으로 써야 입찰할 수 있어요.');
    else if (maxBid && bid > maxBid) box('#FFFAEB', '#B54708', '최대 입찰가를 넘었어요', '위에서 계산한 손익분기 금액보다 ' + won(bid - maxBid) + ' 높아요. 낙찰돼도 남는 게 없을 수 있어요.');
    else if (it.mkt && bid >= it.mkt.med * 0.95) box('#EEF4FF', '#1D4ED8', '시세에 가까워요', '주변 실거래 중간값의 ' + Math.round(bid / it.mkt.med * 100) + '%예요. 일반 매매와 비교해 공매로 사는 이점이 작아요.');
    else box('#ECFDF3', '#067647', '계산상 남는 범위예요', '최대 입찰가 안쪽이에요. 같은 물건에 몇 명이 들어올지에 따라 결과는 달라질 수 있어요.');
    $('vsAppr').textContent = it.appr ? Math.round(bid / it.appr * 100) + '%' : '-';
    if ($('vsMkt')) $('vsMkt').textContent = it.mkt ? Math.round(bid / it.mkt.med * 100) + '%' : '-';
    $('deposit').textContent = won(bid * 0.1);
  }

  // 체크리스트
  var checks = [
    ['공고문 원문 읽기', '유의사항, 배분요구 종기, 매각 제외 대상을 확인해요.'],
    ['등기부등본 확인', '낙찰 후에도 남는 권리(말소되지 않는 권리)가 있는지 봐요.'],
    ['점유자·임차인 확인', '공매는 인도명령 제도가 없어 명도를 협의나 소송으로 해야 할 수 있어요.'],
    ['현장 방문·시세 확인', '사진과 실제 상태, 주변 실거래가를 직접 비교해요.'],
    ['잔금·대출 계획', '납부 기한과 대출 가능 금액을 미리 확인해요.']
  ];
  var done = store.get('ar_chk_' + it.id, {});
  function paintChecks() {
    $('checks').innerHTML = checks.map(function (c, i) {
      return '<button class="check" data-c="' + i + '" aria-pressed="' + !!done[i] + '"><span class="box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span><span><span class="ct">' + c[0] + '</span><span class="cd">' + c[1] + '</span></span></button>';
    }).join('');
    $('checkCount').textContent = Object.keys(done).filter(function (k) { return done[k]; }).length + ' / ' + checks.length;
  }
  $('checks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]'); if (!b) return;
    done[b.dataset.c] = !done[b.dataset.c]; store.set('ar_chk_' + it.id, done); paintChecks();
  });
  paintChecks();

  calcMax(); calcBid();
})();
