// ── 컬럼 인덱스 (raw(합계) 시트 기준, 0-based) ──────────────────────────────
const CI = {
  date:0, weekday:1, type:2, device:3, media:4, campaign:5,
  route:6, routeDetail:7,
  impr:8, clicks:9, cost:10,
  conv:11, revenue:12,
  gaConv:13, gaRev:14,
  appPurchase:15, appRevenue:16, appInstall:17, webPurchase:18
};

// 헤더 행이 있으면 offset +1 (sheet_to_json header:1 사용 시 데이터만 옴)
// sheet_to_json({header:1}) → 배열 배열, 0번=헤더, 1번~=데이터
// 실제 컬럼 B=index1 → 0-based 배열에서 index1

const ROUTE_COLORS = {
  '자사':'#4c9eff','국내선':'#2ecc71','일본':'#e74c3c','동남아':'#f39c12',
  '중화권':'#9b59b6','대양주':'#1abc9c','몽골':'#e67e22','일반':'#00bcd4','네이버 브랜드검색':'#ff6b9d'
};
const MEDIA_COLORS = { '네이버':'#03c75a','구글':'#4285f4','네이버 브랜드검색_종합':'#00b4d8' };
const DEVICE_COLORS = { 'Mobile':'#f39c12','PC':'#4c9eff' };
const CHART_COLORS = ['#4c9eff','#2ecc71','#e74c3c','#f39c12','#9b59b6','#1abc9c','#e67e22','#00bcd4'];

const METRICS = {
  cost:    { label:'광고비',    fmt:'won' },
  impr:    { label:'노출수',    fmt:'num' },
  clicks:  { label:'클릭수',   fmt:'num' },
  conv:    { label:'전환수',   fmt:'num' },
  revenue: { label:'전환매출', fmt:'won' },
  ctr:     { label:'CTR',      fmt:'pct' },
  cpc:     { label:'CPC',      fmt:'won' },
  cpa:     { label:'CPA',      fmt:'won' },
  roas:    { label:'ROAS',     fmt:'roas' },
  gaConv:  { label:'GA전환',   fmt:'num' },
  gaRev:   { label:'GA매출',   fmt:'won' },
  appInstall:{ label:'앱설치', fmt:'num' },
};
const LOWER_BETTER = new Set(['cpc','cpa','cost']);

function fmt(key, v) {
  const m = METRICS[key];
  if (!m) return v;
  if (m.fmt === 'won')  return '₩' + Math.round(v).toLocaleString();
  if (m.fmt === 'pct')  return v.toFixed(2) + '%';
  if (m.fmt === 'roas') return v.toFixed(2) + 'x';
  return Math.round(v).toLocaleString();
}

function parseNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (!s || s === '-') return 0;
  return parseFloat(s.replace(/[,\s₩]/g, '')) || 0;
}

function parseDate(v) {
  if (v === null || v === undefined) return '';
  // Excel 날짜 시리얼 숫자 (raw:true 일 때)
  if (typeof v === 'number' && v > 40000 && v < 70000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return `${y}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-');
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s.replace(/\./g, '-');
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  return '';
}

function derived(d) {
  d.ctr  = d.impr > 0    ? d.clicks / d.impr * 100 : 0;
  d.cpc  = d.clicks > 0  ? d.cost / d.clicks : 0;
  d.cpa  = d.conv > 0    ? d.cost / d.conv : 0;
  d.roas = d.cost > 0    ? d.revenue / d.cost : 0;
  return d;
}

function emptyAgg(date) {
  return { date, impr:0, clicks:0, cost:0, conv:0, revenue:0, gaConv:0, gaRev:0, appPurchase:0, appRevenue:0, appInstall:0, webPurchase:0 };
}

function accumulate(agg, r) {
  agg.impr       += r.impr;
  agg.clicks     += r.clicks;
  agg.cost       += r.cost;
  agg.conv       += r.conv;
  agg.revenue    += r.revenue;
  agg.gaConv     += r.gaConv;
  agg.gaRev      += r.gaRev;
  agg.appPurchase+= r.appPurchase;
  agg.appRevenue += r.appRevenue;
  agg.appInstall += r.appInstall;
  agg.webPurchase+= r.webPurchase;
  return agg;
}

// ── STORE ─────────────────────────────────────────────────────────────────────
const Store = {
  raw: [], filtered: [],
  devices: [], medias: [], routes: [],

  load(rows) {
    this.raw = rows;
    this.devices = [...new Set(rows.map(r => r.device).filter(Boolean))].sort();
    this.medias  = [...new Set(rows.map(r => r.media).filter(Boolean))].sort();
    this.routes  = [...new Set(rows.map(r => r.route).filter(Boolean))].sort();
    this.filtered = [...rows];
  },

  filter({ from, to, devices, medias, routes }) {
    this.filtered = this.raw.filter(r => {
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      if (devices?.length && !devices.includes(r.device)) return false;
      if (medias?.length  && !medias.includes(r.media))   return false;
      if (routes?.length  && !routes.includes(r.route))   return false;
      return true;
    });
  },

  getAggForPeriod(from, to, devices, medias, routes) {
    const rows = this.raw.filter(r => {
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      if (devices?.length && !devices.includes(r.device)) return false;
      if (medias?.length  && !medias.includes(r.media))   return false;
      if (routes?.length  && !routes.includes(r.route))   return false;
      return true;
    });
    const agg = emptyAgg('');
    rows.forEach(r => accumulate(agg, r));
    return derived(agg);
  },

  byDate() {
    const m = {};
    this.filtered.forEach(r => {
      if (!m[r.date]) m[r.date] = emptyAgg(r.date);
      accumulate(m[r.date], r);
    });
    return Object.values(m).sort((a,b)=>a.date>b.date?1:-1).map(derived);
  },

  byMedia() {
    const m = {};
    this.filtered.forEach(r => {
      if (!m[r.media]) m[r.media] = { ...emptyAgg(r.media), media: r.media };
      accumulate(m[r.media], r);
    });
    return Object.values(m).map(d => { derived(d); return d; });
  },

  byRoute() {
    const m = {};
    this.filtered.forEach(r => {
      if (!m[r.route]) m[r.route] = { ...emptyAgg(r.route), route: r.route };
      accumulate(m[r.route], r);
    });
    return Object.values(m).map(d => { derived(d); return d; });
  },

  byDateMedia() {
    const m = {};
    this.filtered.forEach(r => {
      const k = `${r.date}__${r.media}`;
      if (!m[k]) m[k] = { ...emptyAgg(r.date), media: r.media };
      accumulate(m[k], r);
    });
    return Object.values(m).map(derived);
  },

  byDateDevice() {
    const m = {};
    this.filtered.forEach(r => {
      const k = `${r.date}__${r.device}`;
      if (!m[k]) m[k] = { ...emptyAgg(r.date), device: r.device };
      accumulate(m[k], r);
    });
    return Object.values(m).map(derived);
  },

  exportCSV() {
    const bd = this.byDate();
    const cols = ['날짜','노출수','클릭수','CTR(%)','광고비','CPC','전환수','CPA','전환매출','ROAS','GA전환','GA매출','앱설치'];
    const rows = bd.map(r => [
      r.date, r.impr, r.clicks, r.ctr.toFixed(2), Math.round(r.cost),
      Math.round(r.cpc), r.conv, Math.round(r.cpa), Math.round(r.revenue),
      r.roas.toFixed(2), r.gaConv, Math.round(r.gaRev), r.appInstall
    ]);
    const csv = '﻿' + [cols, ...rows].map(r=>r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
      download: 'jeju_sa_report.csv',
    });
    a.click();
  },
};

// ── PARSER ────────────────────────────────────────────────────────────────────
const Parser = {
  load(file) {
    if (!file) return;
    UI.hideUpload();
    UI.showLoading('데이터 파싱 중...');
    const reader = new FileReader();
    reader.onload = e => {
      setTimeout(() => { // let loading UI render
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
          const sheetName = wb.SheetNames.find(n => n.includes('raw') || n.includes('합계')) || wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

          let headerIdx = -1, colMap = {};
          for (let i = 0; i < Math.min(10, all.length); i++) {
            const row = all[i] || [];
            const dateCol = row.findIndex(c => String(c || '').trim() === '날짜');
            if (dateCol !== -1) {
              headerIdx = i;
              row.forEach((name, ci) => { colMap[String(name || '').trim()] = ci; });
              break;
            }
          }
          if (headerIdx === -1) { UI.hideLoading(); alert('날짜 컬럼을 찾을 수 없습니다. raw(합계) 시트를 확인해 주세요.'); return; }

          const rows = [];
          for (let i = headerIdx + 1; i < all.length; i++) {
            const row = all[i] || [];
            const dateVal = row[colMap['날짜']];
            if (dateVal === null || dateVal === undefined) continue;
            const date = parseDate(dateVal);
            if (!date) continue;

            rows.push({
              date,
              weekday:     String(row[colMap['요일']] || '').trim(),
              device:      String(row[colMap['디바이스']] || '').trim(),
              media:       String(row[colMap['매체구분']] || '').trim(),
              campaign:    String(row[colMap['캠페인']] || '').trim(),
              route:       String(row[colMap['대노선 구분']] || '').trim(),
              routeDetail: String(row[colMap['노선 세부 구분']] || '').trim(),
              impr:        parseNum(row[colMap['노출수']]),
              clicks:      parseNum(row[colMap['클릭']]),
              cost:        parseNum(row[colMap['광고비']]),
              conv:        parseNum(row[colMap['전환수']]),
              revenue:     parseNum(row[colMap['총 전환 매출']]),
              gaConv:      parseNum(row[colMap['GA전환']]),
              gaRev:       parseNum(row[colMap['GA매출']]),
              appPurchase: parseNum(row[colMap['구매(App)']]),
              appRevenue:  parseNum(row[colMap['매출액(App)']]),
              appInstall:  parseNum(row[colMap['앱 설치 수']]),
              webPurchase: parseNum(row[colMap['구매(Web)']]),
            });
          }

          if (!rows.length) {
            UI.hideLoading();
            // 진단 정보를 페이지에 출력
            const dbg = [
              '시트 목록: ' + wb.SheetNames.join(', '),
              '선택된 시트: ' + sheetName,
              '전체 행 수: ' + all.length,
              '헤더 행 idx: ' + headerIdx,
              '행0 샘플: ' + JSON.stringify((all[0]||[]).slice(0,5)),
              '행1 샘플: ' + JSON.stringify((all[1]||[]).slice(0,5)),
              'colMap: ' + JSON.stringify(colMap),
              '날짜 col idx: ' + colMap['날짜'],
              '날짜 첫 값(raw): ' + (all[headerIdx+1]||[])[colMap['날짜']],
              'parseDate 결과: ' + parseDate((all[headerIdx+1]||[])[colMap['날짜']]),
            ].join('\n');
            document.getElementById('empty').innerHTML = '<pre style="background:#1e2130;color:#e8eaf0;padding:20px;border-radius:10px;font-size:12px;text-align:left;max-width:700px;">' + dbg + '</pre>';
            document.getElementById('empty').classList.remove('hidden');
            return;
          }
          Store.load(rows);
          document.getElementById('fname').textContent = ' — ' + file.name;
          UI.hideLoading();
          UI.render();
          JBStorage.saveCampaign(file.name, rows);
          document.getElementById('btn-deploy').classList.remove('hidden');
          document.getElementById('btn-deploy-kw').classList.remove('hidden');
          document.getElementById('btn-reset-kw').classList.remove('hidden');
        } catch(err) {
          UI.hideLoading();
          alert('파일 파싱 오류: ' + err.message);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
  },
};

