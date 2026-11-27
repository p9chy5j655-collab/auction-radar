// 물건상세 조회서비스의 기능 이름(operation)을 찾는 일회성 점검 스크립트. 인증키는 출력하지 않아요.
const key = (process.env.DATA_GO_KR_KEY || '').trim();
const B = 'https://apis.data.go.kr/B010003';
const kinds = {
  re: { svc: 'OnbidRlstDtlSrvc2', w: ['Rlst', 'RlstCltr'], id: '2026-03125-001', c: '6249458' },
  goods: { svc: 'OnbidMvastDtlSrvc2', w: ['Mvast', 'MvastCltr'], id: '2026-0400-007681', c: '6255537' },
  car: { svc: 'OnbidCarDtlSrvc2', w: ['Car', 'CarCltr'], id: '2026-1100-063391', c: '6293677' }
};
const tails = ['Dtl', 'DtlInf', 'DtlInfo', 'Detail', 'DtlList', 'DtlInq', 'Inf', 'Info', 'BasInf', 'DtlInfList', 'DtlInfInq'];
for (const [k, v] of Object.entries(kinds)) {
  const ops = [];
  for (const w of v.w) for (const t of tails) for (const n of ['2', '']) ops.push(`get${w}${t}${n}`);
  let hit = false;
  for (const op of ops) {
    const u = new URL(`${B}/${v.svc}/${op}`);
    u.searchParams.set('serviceKey', key);
    for (const [a, b] of Object.entries({ pageNo: 1, numOfRows: 10, resultType: 'json', cltrMngNo: v.id, pbctCdtnNo: v.c })) u.searchParams.set(a, b);
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      if (/NO_OPENAPI_SERVICE/.test(t)) continue;
      hit = true;
      console.log(`FOUND ${k} ${op} status=${r.status}`);
      console.log(t.slice(0, 3000).replaceAll(key, '***'));
      break;
    } catch (e) { console.log(k, op, 'ERR', e.message); }
  }
  if (!hit) console.log(`NONE ${k}`);
}
