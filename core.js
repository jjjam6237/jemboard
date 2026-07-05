// ── 필드 스키마 ────────────────────────────────────────────────────────────────
const FIELD_SCHEMA = {
  date:        { label:'날짜',     required:true,  aliases:['날짜','date','Date'] },
  weekday:     { label:'요일',     required:false, aliases:['요일','weekday','Weekday'] },
  device:      { label:'디바이스', required:false, aliases:['디바이스','device','Device'] },
  media:       { label:'매체',     required:false, aliases:['매체구분','매체','media','Media','Channel'] },
  campaign:    { label:'캠페인',   required:false, aliases:['캠페인','campaign','Campaign','캠페인명'] },
  route:       { label:'분류',     required:false, aliases:['대노선 구분','노선','분류','route','Route','Category'] },
  routeDetail: { label:'분류상세', required:false, aliases:['노선 세부 구분','분류상세','routeDetail','Sub Category'] },
  impr:        { label:'노출수',   required:true,  aliases:['노출수','노출','impressions','Impressions'] },
  clicks:      { label:'클릭수',   required:true,  aliases:['클릭','클릭수','clicks','Clicks'] },
  cost:        { label:'광고비',   required:true,  aliases:['광고비','cost','Cost','비용'] },
  conv:        { label:'전환수',   required:false, aliases:['전환수','전환','conversions','Conversions'] },
  revenue:     { label:'전환매출', required:false, aliases:['총 전환 매출','전환매출','revenue','Revenue','매출'] },
  gaConv:      { label:'GA전환',   required:false, aliases:['GA전환','GA전환수','GA Conversions'] },
  gaRev:       { label:'GA매출',   required:false, aliases:['GA매출','GA Revenue'] },
  appPurchase: { label:'앱구매',   required:false, aliases:['구매(App)','앱구매','App Purchase'] },
  appRevenue:  { label:'앱매출',   required:false, aliases:['매출액(App)','앱매출','App Revenue'] },
  appInstall:  { label:'앱설치',   required:false, aliases:['앱 설치 수','앱설치','App Install'] },
  webPurchase: { label:'웹구매',   required:false, aliases:['구매(Web)','웹구매','Web Purchase'] },
};

// ── 스키마 매핑 ─────────────────────────────────────────────────────────────────
const SchemaMap = {
  mapping: {},   // { fieldKey: actualHeaderName | null }
  headers: [],   // all headers from uploaded file
  _all: null, _headerIdx: -1, _colMap: {},

  autoMap(headers) {
    this.headers = headers;
    this.mapping = {};
    for (const [field, cfg] of Object.entries(FIELD_SCHEMA)) {
      const match = headers.find(h =>
        cfg.aliases.some(a => a.toLowerCase() === String(h).toLowerCase())
      );
      this.mapping[field] = match || null;
    }
  },

  set(field, header) { this.mapping[field] = header || null; },
  get(field) { return this.mapping[field] || null; },
  getMappedCount() { return Object.values(this.mapping).filter(Boolean).length; },
  hasCriticalMissing() { return ['date','impr','clicks','cost'].some(f => !this.mapping[f]); },

  _col(field) {
    const h = this.get(field);
    return h != null ? this._colMap[h] : undefined;
  },

  _extractRows() {
    const rows = [];
    for (let i = this._headerIdx + 1; i < this._all.length; i++) {
      const row = this._all[i] || [];
      const dateVal = row[this._col('date')];
      if (dateVal == null) continue;
      const date = parseDate(dateVal);
      if (!date) continue;
      rows.push({
        date,
        weekday:     String(row[this._col('weekday')]     || '').trim(),
        device:      String(row[this._col('device')]      || '').trim(),
        media:       String(row[this._col('media')]       || '').trim(),
        campaign:    String(row[this._col('campaign')]    || '').trim(),
        route:       String(row[this._col('route')]       || '').trim(),
        routeDetail: String(row[this._col('routeDetail')] || '').trim(),
        impr:        parseNum(row[this._col('impr')]),
        clicks:      parseNum(row[this._col('clicks')]),
        cost:        parseNum(row[this._col('cost')]),
        conv:        parseNum(row[this._col('conv')]),
        revenue:     parseNum(row[this._col('revenue')]),
        gaConv:      parseNum(row[this._col('gaConv')]),
        gaRev:       parseNum(row[this._col('gaRev')]),
        appPurchase: parseNum(row[this._col('appPurchase')]),
        appRevenue:  parseNum(row[this._col('appRevenue')]),
        appInstall:  parseNum(row[this._col('appInstall')]),
        webPurchase: parseNum(row[this._col('webPurchase')]),
      });
    }
    return rows;
  },

  reExtract() { return this._extractRows(); },
};

// ── 컬러 ────────────────────────────────────────────────────────────────────────
const DEVICE_COLORS = { 'Mobile':'#f39c12','PC':'#4c9eff' };
const CHART_COLORS = ['#4c9eff','#2ecc71','#e74c3c','#f39c12','#9b59b6','#1abc9c','#e67e22','#00bcd4'];

const _dimColorCache = {};
function getDimColor(value) {
  if (!value) return '#888';
  if (DEVICE_COLORS[value]) return DEVICE_COLORS[value];
  if (!_dimColorCache[value]) {
    const idx = Object.keys(_dimColorCache).length % CHART_COLORS.length;
    _dimColorCache[value] = CHART_COLORS[idx];
  }
  return _dimColorCache[value];
}

// ── 지표 ─────────────────────────────────────────────────────────────────────
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
  dims: {},  // { fieldKey: sortedUniqueValues[] }

  load(rows) {
    this.raw = rows;
    const dimFields = ['media', 'device', 'route', 'campaign', 'weekday', 'routeDetail'];
    this.dims = {};
    dimFields.forEach(f => {
      const vals = [...new Set(rows.map(r => r[f]).filter(Boolean))].sort();
      if (vals.length >= 1) this.dims[f] = vals;
    });
    this.filtered = [...rows];
  },

  filter({ from, to, dimFilters = {} }) {
    this.filtered = this.raw.filter(r => {
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      for (const [field, vals] of Object.entries(dimFilters)) {
        if (vals?.length && !vals.includes(r[field])) return false;
      }
      return true;
    });
  },

  getAggForPeriod(from, to, dimFilters = {}) {
    const rows = this.raw.filter(r => {
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      for (const [field, vals] of Object.entries(dimFilters)) {
        if (vals?.length && !vals.includes(r[field])) return false;
      }
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

  byDim(field) {
    const m = {};
    this.filtered.forEach(r => {
      const k = r[field] || '';
      if (!m[k]) m[k] = { ...emptyAgg(k), [field]: k };
      accumulate(m[k], r);
    });
    return Object.values(m).map(d => { derived(d); return d; });
  },

  byDateDim(field) {
    const m = {};
    this.filtered.forEach(r => {
      const k = `${r.date}__${r[field] || ''}`;
      if (!m[k]) m[k] = { ...emptyAgg(r.date), [field]: r[field] || '' };
      accumulate(m[k], r);
    });
    return Object.values(m).map(derived);
  },

  byMedia()     { return this.byDim('media'); },
  byRoute()     { return this.byDim('route'); },
  byDateMedia() { return this.byDateDim('media'); },
  byDateDevice(){ return this.byDateDim('device'); },

  // getAggForPeriod(기간 필터)과 byDim(차원별 그룹)을 합친 버전.
  // this.filtered(사이드바 필터 상태)를 건드리지 않고 임의 기간 × 차원 조합을 조회할 때 사용 (예: 리포트 생성)
  byDimForPeriod(field, from, to, dimFilters = {}) {
    const rows = this.raw.filter(r => {
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      for (const [f, vals] of Object.entries(dimFilters)) {
        if (vals?.length && !vals.includes(r[f])) return false;
      }
      return true;
    });
    const m = {};
    rows.forEach(r => {
      const k = r[field] || '';
      if (!m[k]) m[k] = { ...emptyAgg(k), [field]: k };
      accumulate(m[k], r);
    });
    return Object.values(m).map(d => { derived(d); return d; });
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
      download: 'report.csv',
    });
    a.click();
  },
};

// ── 키워드 탭 스키마 (범용 광고주 지원) ──────────────────────────────────────────
const KW_FIELD_SCHEMA = {
  keyword: { label:'키워드',   required:true,  aliases:['키워드','keyword','Keyword','검색어'] },
  date:    { label:'일자',     required:true,  aliases:['일자','날짜','date','Date'] },
  impr:    { label:'노출수',   required:true,  aliases:['노출','노출수','impressions','Impressions'] },
  clicks:  { label:'클릭수',   required:true,  aliases:['클릭','클릭수','clicks','Clicks'] },
  cost:    { label:'광고비',   required:true,  aliases:['광고비','비용','cost','Cost','지출'] },
  conv:    { label:'전환수',   required:false, aliases:['총 전환','전환수','전환','conversions','Conversions'] },
  revenue: { label:'전환매출', required:false, aliases:['총 전환매출','전환매출','매출','revenue','Revenue'] },
};

// 기존 제주항공 포맷 하위호환: 시트명 → 매체 라벨. 매칭 안 되면 시트명을 그대로 매체 라벨로 사용.
const KW_SHEET_MEDIA_ALIAS = { 'N_통합':'네이버', 'G_통합':'구글', 'K_통합':'카카오', 'D_통합':'당근' };

// 매칭 안 된 나머지 텍스트 컬럼이 기존 '노선'/'디바이스'와 같은 의미면 익숙한 key/label을 부여(하위호환),
// 그 외 컬럼은 헤더명을 그대로 key/label로 삼아 동적 차원으로 취급한다.
const KW_DIM_ALIAS = {
  route:  { label:'노선',    aliases:['노선명','노선','대노선 구분','분류','route','Route','Category'] },
  device: { label:'디바이스', aliases:['디바이스','device','Device'] },
};
function kwDimDef(header) {
  const h = String(header || '').trim();
  for (const [key, cfg] of Object.entries(KW_DIM_ALIAS)) {
    if (cfg.aliases.some(a => a.toLowerCase() === h.toLowerCase())) return { key, label: cfg.label };
  }
  return { key: h, label: h };
}

// 일별 합계 → 파생지표. KWStore._agg(기간 제한 있음)와 액션 큐(전체기간, from/to=null)가 공용으로 사용.
function sumDaily(daily, from, to) {
  const tot = { impr:0, clicks:0, cost:0, conv:0, revenue:0 };
  Object.entries(daily || {}).forEach(([d, v]) => {
    if ((!from || d >= from) && (!to || d <= to)) {
      tot.impr += v.impr; tot.clicks += v.clicks; tot.cost += v.cost; tot.conv += v.conv; tot.revenue += v.revenue;
    }
  });
  tot.ctr  = tot.impr>0   ? tot.clicks/tot.impr*100 : 0;
  tot.cpc  = tot.clicks>0 ? tot.cost/tot.clicks     : 0;
  tot.cpa  = tot.conv>0   ? tot.cost/tot.conv        : 0;
  tot.roas = tot.cost>0   ? tot.revenue/tot.cost     : 0;
  return tot;
}

// ── 키워드 스키마 매핑 (SchemaMap과 동일 패턴, 키워드 탭 전용 — 캠페인 탭 코드는 건드리지 않음) ──
const KWSchemaMap = {
  mapping: {}, headers: [],
  KEY: 'jb_kw_schema_map',

  autoMap(headers) {
    this.headers = headers;
    this.mapping = {};
    for (const [field, cfg] of Object.entries(KW_FIELD_SCHEMA)) {
      const match = headers.find(h => cfg.aliases.some(a => a.toLowerCase() === String(h).toLowerCase()));
      this.mapping[field] = match || null;
    }
  },
  set(field, header) { this.mapping[field] = header || null; },
  get(field) { return this.mapping[field] || null; },
  getMappedCount() { return Object.values(this.mapping).filter(Boolean).length; },
  hasCriticalMissing() {
    return Object.entries(KW_FIELD_SCHEMA).some(([f, cfg]) => cfg.required && !this.mapping[f]);
  },

  // 매핑되지 않은 나머지 헤더 중 "텍스트 컬럼"만 동적 차원 후보로 반환.
  // 샘플 20행 중 숫자로 파싱되는 비율이 80% 이상이면 수치 컬럼으로 보고 제외(중복 지표 컬럼 노이즈 방지).
  dimHeaders(headers, sampleRows) {
    const used = new Set(Object.values(this.mapping).filter(Boolean));
    return headers.filter(h => {
      if (!h || used.has(h)) return false;
      const idx = headers.indexOf(h);
      const sample = sampleRows.slice(0, 20).map(r => r[idx]).filter(v => v !== null && v !== undefined && v !== '');
      if (!sample.length) return true;
      const numericCount = sample.filter(v => typeof v === 'number' || !isNaN(parseFloat(String(v).replace(/,/g,'')))).length;
      return numericCount / sample.length < 0.8;
    });
  },

  // localStorage에 헤더 시그니처별로 매핑 결과 캐시 — 같은 포맷 재업로드 시 모달 없이 재사용.
  loadCached(headers) {
    try {
      const all = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      return all[headers.join('|')] || null;
    } catch(e) { return null; }
  },
  saveCached(headers, dims) {
    try {
      const all = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      all[headers.join('|')] = { mapping: { ...this.mapping }, dims };
      localStorage.setItem(this.KEY, JSON.stringify(all));
    } catch(e) {}
  },
};

// ── 키워드 액션 큐 (순수 함수 — KWStore 상태를 건드리지 않고 입력만으로 판정) ─────
const ActionQueue = {
  // rawRows: KWStore.raw(daily 있음, 로컬/업로드 모드에서만 호출). allDates: KWStore.allDates.
  // cfg: { excludeDays, minClicks }. 최근 excludeDays일 클릭합 >= minClicks AND 전환합 === 0 이면 제외 후보.
  detectExclusion(rawRows, allDates, cfg) {
    const days = (allDates || []).slice(-cfg.excludeDays);
    if (!days.length) return [];
    const from = days[0], to = days[days.length - 1];
    const out = [];
    rawRows.forEach(r => {
      const { clicks, conv } = sumDaily(r.daily, from, to);
      if (clicks >= cfg.minClicks && conv === 0) {
        out.push({ key:r.key, keyword:r.keyword, media:r.media, clicks, conv,
          reason: `최근 ${cfg.excludeDays}일 클릭 ${Math.round(clicks)} / 전환 0` });
      }
    });
    return out;
  },

  // 전체기간 집계 기준 grade==='scale'인 키워드 중, 목표 CPA가 있으면 CPA <= 목표 * (marginPct/100)인 것만.
  // targetCpa가 없으면(0/미설정) grade만으로 선정.
  detectScaleUp(rawRows, targetCpa, cfg, gradeFn) {
    const out = [];
    rawRows.forEach(r => {
      const agg = sumDaily(r.daily, null, null);
      if (gradeFn(agg) !== 'scale') return;
      let reason = `등급 확장 (ROAS ${agg.roas.toFixed(2)}x)`;
      if (targetCpa) {
        if (!(agg.cpa > 0 && agg.cpa <= targetCpa * (cfg.marginPct / 100))) return;
        reason += ` · CPA ${Math.round(agg.cpa).toLocaleString()} ≤ 목표×${cfg.marginPct}%`;
      }
      out.push({ key:r.key, keyword:r.keyword, media:r.media, cpa:agg.cpa, roas:agg.roas, reason });
    });
    return out;
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
      setTimeout(() => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
          const sheetName = wb.SheetNames.find(n => n.includes('raw') || n.includes('합계')) || wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

          let headerIdx = -1, colMap = {};
          const dateAliases = FIELD_SCHEMA.date.aliases;
          for (let i = 0; i < Math.min(10, all.length); i++) {
            const row = all[i] || [];
            const dateCol = row.findIndex(c =>
              dateAliases.some(a => a.toLowerCase() === String(c || '').trim().toLowerCase())
            );
            if (dateCol !== -1) {
              headerIdx = i;
              row.forEach((name, ci) => { colMap[String(name || '').trim()] = ci; });
              break;
            }
          }
          if (headerIdx === -1) { UI.hideLoading(); alert('날짜 컬럼을 찾을 수 없습니다. 헤더 행을 확인해 주세요.'); return; }

          const headers = (all[headerIdx] || []).map(h => String(h || '').trim()).filter(Boolean);
          SchemaMap.autoMap(headers);
          SchemaMap._all = all;
          SchemaMap._headerIdx = headerIdx;
          SchemaMap._colMap = colMap;

          const rows = SchemaMap._extractRows();

          if (!rows.length) {
            UI.hideLoading();
            const dbg = [
              '시트 목록: ' + wb.SheetNames.join(', '),
              '선택된 시트: ' + sheetName,
              '전체 행 수: ' + all.length,
              '헤더 행 idx: ' + headerIdx,
              '행0 샘플: ' + JSON.stringify((all[0]||[]).slice(0,5)),
              '행1 샘플: ' + JSON.stringify((all[1]||[]).slice(0,5)),
              'colMap: ' + JSON.stringify(colMap),
              '날짜 매핑: ' + SchemaMap.get('date'),
            ].join('\n');
            document.getElementById('empty').innerHTML = '<pre style="background:#1e2130;color:#e8eaf0;padding:20px;border-radius:10px;font-size:12px;text-align:left;max-width:700px;">' + dbg + '</pre>';
            document.getElementById('empty').classList.remove('hidden');
            return;
          }
          Store.load(rows);
          document.getElementById('fname').textContent = ' — ' + file.name;
          UI.hideLoading();
          UI.render();
          MappingUI.updateBadge();
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
