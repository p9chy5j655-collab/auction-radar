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
    var el = $('countdown');
    var dd = document.querySelector('[data-dday]');
    var toStart = it.st ? new Date(it.st).getTime() - Date.now() : 0;
    if (toStart > 0) {
      var sd = Math.floor(toStart / 864e5), sh = Math.floor(toStart % 864e5 / 36e5);
      el.textContent = '입찰 시작까지 ' + (sd ? sd + '일 ' : '') + sh + '시간';
      if (dd) { dd.textContent = '입찰 예정'; dd.className = 'badge badge-blue'; }
      return;
    }
    var ms = new Date(it.en).getTime() - Date.now();
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

  // 입찰 준비 도우미: 단계마다 바로 가는 버튼 + 돈 계획 + 마감 일정 저장
  var isRE = ['home', 'shop', 'land', 'etc'].indexOf(it.cat) !== -1;
  var addr = (it.addr || '').replace(/\s+외\s*\d+.*$/, '').trim();
  var addrQ = encodeURIComponent(addr);
  function link(label, href) { return '<a class="mini-btn" href="' + href + '" target="_blank" rel="noopener">' + label + '</a>'; }
  function btn(label, act) { return '<button class="mini-btn" type="button" data-act="' + act + '">' + label + '</button>'; }
  var onbid = it.url ? link('온비드 원문 열기', it.url) : '';
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
    var car = it.cat === 'car';
    steps = [
      ['공고문 원문 읽기', '보관 장소, 인도 방법과 기한, 보관료가 있는지 확인해요.', onbid],
      ['실물 확인하기', '보관 장소에 미리 가서 상태를 볼 수 있는지 공고문의 연락처로 문의해요.', mapBtns],
      car ? ['차량 이력 확인', '자동차등록원부로 압류·저당을, 보험개발원 카히스토리로 사고 이력을 확인해요. 차량번호는 공고문에서 확인하세요.', link('정부24', 'https://www.gov.kr') + link('카히스토리', 'https://www.carhistory.or.kr')]
          : ['진품·상태 확인', '명품·귀금속은 정품 여부와 보증서, 전자제품은 작동 여부를 확인할 수 있는지 알아봐요.', ''],
      ['시세 비교', '이 페이지의 시세 검색 버튼으로 비슷한 물건 가격을 봐요.', btn('시세 보기', 'mkt')],
      ['돈 계획 세우기', car ? '이전 등록비·취득세(차량)도 함께 계산해요.' : '운반비가 드는지도 함께 생각해요.', btn('돈 계획 보기', 'money')],
      ['마감 일정 저장', '입찰 마감을 캘린더에 넣어 둬요.', btn('구글 캘린더', 'gcal') + btn('휴대폰 캘린더', 'ics')]
    ];
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
    var cash = store.get('ar_cash', '');
    var loan = store.get('ar_loan', isRE ? 50 : 0);
    box.innerHTML = '<div class="form-grid"><label>내가 쓸 수 있는 현금<span class="input-row sm"><input id="cash" type="number" inputmode="numeric" value="' + cash + '" placeholder="예: 10000"><span>만원</span></span></label>' +
      '<label>대출 예상 비율<span class="input-row sm"><input id="loan" type="number" inputmode="decimal" min="0" max="90" value="' + loan + '"><span>%</span></span></label></div><div id="moneyOut" class="money-out"></div>';
    box.hidden = false;
    function out() {
      var c = (parseFloat($('cash').value) || 0) * 10000, l = (parseFloat($('loan').value) || 0) / 100;
      store.set('ar_cash', $('cash').value); store.set('ar_loan', $('loan').value);
      var deposit = bid * 0.1, rest = bid - deposit, loanAmt = rest * l, extra = bid * taxRate;
      var need = deposit + (rest - loanAmt) + extra;
      $('moneyOut').innerHTML =
        '<div class="mo-row"><span>입찰가 (내 입찰가 기준)</span><b>' + won(bid) + '</b></div>' +
        '<div class="mo-row"><span>① 입찰할 때 보증금 10%</span><b>' + won(deposit) + '</b></div>' +
        '<div class="mo-row"><span>② 낙찰 뒤 잔금</span><b>' + won(rest) + '</b></div>' +
        (l ? '<div class="mo-row"><span>　 그중 대출 예상 ' + Math.round(l * 100) + '%</span><b>−' + won(loanAmt) + '</b></div>' : '') +
        '<div class="mo-row"><span>③ 세금·등기비 등</span><b>' + won(extra) + '</b></div>' +
        '<div class="mo-row total"><span>내 돈으로 필요한 금액</span><b>' + won(need) + '</b></div>' +
        (c ? '<p class="' + (c >= need ? 'mo-ok' : 'mo-bad') + '">' + (c >= need ? '현금으로 충분해요. 여유 ' + won(c - need) : won(need - c) + ' 부족해요. 입찰가나 대출 계획을 다시 생각해 보세요.') + '</p>' : '') +
        '<p class="note">대출은 낙찰 후 심사라 안 나올 수도 있어요. 잔금 납부 기한은 공고문에서 확인하세요.</p>';
    }
    box.addEventListener('input', out); out();
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function utcStamp(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; }
  function calInfo() {
    var end = new Date(it.en), start = new Date(end.getTime() - 3600e3);
    return { title: '[입찰 마감] ' + it.t, start: start, end: end, desc: '경매레이더에서 저장한 일정이에요. 입찰 전 온비드 원문을 꼭 확인하세요.\n' + location.href };
  }
  $('checks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]');
    if (b) { done[b.dataset.c] = !done[b.dataset.c]; store.set('ar_chk_' + it.id, done); paintChecks(); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act;
    if (act === 'copy') {
      if (navigator.clipboard) navigator.clipboard.writeText(addr).then(function () { toast('주소를 복사했어요.'); }, function () { toast(addr); }); else toast(addr);
    } else if (act === 'mkt') {
      var t = document.querySelector('.compare, .link-row, #maxbid'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (act === 'money') {
      var m = $('money'); if (m && m.hidden) moneyPlan(); else if (m) m.hidden = true;
    } else if (act === 'gcal' || act === 'ics') {
      if (!it.en) { toast('마감 일시가 없는 물건이에요.'); return; }
      var c = calInfo();
      if (act === 'gcal') {
        window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(c.title) + '&dates=' + utcStamp(c.start) + '/' + utcStamp(c.end) + '&details=' + encodeURIComponent(c.desc), '_blank', 'noopener');
      } else {
        var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//auction-radar//KO', 'BEGIN:VEVENT', 'UID:' + it.id + '@auction-radar', 'DTSTAMP:' + utcStamp(new Date()), 'DTSTART:' + utcStamp(c.start), 'DTEND:' + utcStamp(c.end),
          'SUMMARY:' + c.title.replace(/[,;]/g, ' '), 'DESCRIPTION:' + c.desc.replace(/\n/g, '\\n').replace(/[,;]/g, ' '),
          'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:내일 입찰 마감', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
        var dl = document.createElement('a'); dl.href = url; dl.download = '입찰마감.ics'; document.body.appendChild(dl); dl.click(); dl.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        toast('일정 파일을 받았어요. 열면 캘린더에 추가돼요.');
      }
    }
  });
  paintChecks();

  calcMax(); calcBid();
})();
