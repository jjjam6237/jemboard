// ── CHARTS ────────────────────────────────────────────────────────────────────
const CH = {
  trend: null, media: null, route: null, device: null, dod: null,
  trendMetric: 'cost', mediaMetric: 'cost', routeMetric: 'cost', dodMetric: 'cost',

  co(extra={}) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b90a0', font:{size:11}, boxWidth:10 } }, tooltip: { mode:'index', intersect:false } },
      scales: {
        x: { ticks: { color:'#8b90a0', font:{size:9}, maxTicksLimit:16 }, grid: { color:'#2a2d3e' } },
        y: { ticks: { color:'#8b90a0', font:{size:10} }, grid: { color:'#2a2d3e' } },
      }, ...extra,
    };
  },

  renderAll() {
    const bd = Store.byDate();
    this.renderTrend(bd);
    this.renderMedia();
    this.renderRoute();
    this.renderDevice(bd);
    this.renderDoD(bd);
  },

  renderTrend(bd) {
    const m = this.trendMetric;
    const labels = bd.map(r => r.date.slice(5));
    const data   = bd.map(r => r[m] || 0);
    if (this.trend) this.trend.destroy();
    this.trend = new Chart(document.getElementById('c-trend'), {
      type: 'line',
      data: { labels, datasets: [{ label: METRICS[m]?.label || m, data, borderColor: '#4c9eff', backgroundColor:'#4c9eff18', tension:0.4, pointRadius: bd.length>30?0:3, fill:true, borderWidth:2 }] },
      options: this.co(),
    });
  },

  renderMedia() {
    const m = this.mediaMetric;
    const all = Store.byDateMedia();
    const medias = [...new Set(all.map(r=>r.media))].sort();
    const dates  = [...new Set(all.map(r=>r.date))].sort().slice(-14);
    const byKey  = {};
    all.forEach(r => { byKey[`${r.date}__${r.media}`] = r; });
    const datasets = medias.map(media => ({
      label: media,
      data: dates.map(d => (byKey[`${d}__${media}`]?.[m] || 0)),
      backgroundColor: (MEDIA_COLORS[media] || '#666') + 'aa',
      borderColor: MEDIA_COLORS[media] || '#666',
      borderWidth: 1, borderRadius: 3,
    }));
    if (this.media) this.media.destroy();
    this.media = new Chart(document.getElementById('c-media'), {
      type: 'bar',
      data: { labels: dates.map(d=>d.slice(5)), datasets },
      options: this.co({ plugins: { legend: { labels:{color:'#8b90a0',font:{size:10},boxWidth:10} }, tooltip:{mode:'index',intersect:false} } }),
    });
  },

  renderRoute() {
    const m = this.routeMetric;
    const rd = Store.byRoute().sort((a,b) => (b[m]||0)-(a[m]||0));
    const labels = rd.map(r=>r.route);
    const data   = rd.map(r=>r[m]||0);
    const bgColors = labels.map(l => (ROUTE_COLORS[l] || '#888') + 'cc');
    if (this.route) this.route.destroy();
    this.route = new Chart(document.getElementById('c-route'), {
      type: 'bar',
      data: { labels, datasets: [{ label: METRICS[m]?.label||m, data, backgroundColor: bgColors, borderWidth:0, borderRadius:4 }] },
      options: this.co({
        indexAxis: 'y',
        plugins: { legend:{display:false}, tooltip:{intersect:false} },
        scales: {
          x: { ticks:{color:'#8b90a0',font:{size:10}}, grid:{color:'#2a2d3e'} },
          y: { ticks:{color:'#8b90a0',font:{size:10}}, grid:{display:false} },
        },
      }),
    });
  },

  renderDevice(bd) {
    const recent = bd.slice(-14);
    const allDd  = Store.byDateDevice();
    const dates  = recent.map(r=>r.date);
    const byKey  = {};
    allDd.forEach(r => { byKey[`${r.date}__${r.device}`] = r; });
    const devices  = Store.devices;
    const datasets = devices.map(dev => ({
      label: dev,
      data: dates.map(d => (byKey[`${d}__${dev}`]?.cost || 0)),
      backgroundColor: (DEVICE_COLORS[dev] || '#888') + 'aa',
      borderColor: DEVICE_COLORS[dev] || '#888',
      borderWidth:1, borderRadius:3,
    }));
    if (this.device) this.device.destroy();
    this.device = new Chart(document.getElementById('c-device'), {
      type: 'bar',
      data: { labels: dates.map(d=>d.slice(5)), datasets },
      options: this.co({ plugins:{legend:{labels:{color:'#8b90a0',font:{size:10},boxWidth:10}},tooltip:{mode:'index',intersect:false}} }),
    });
  },

  renderDoD(bd) {
    const m = this.dodMetric;
    const recent = bd.slice(-15);
    const labels=[], changes=[];
    for (let i=1;i<recent.length;i++) {
      const p=recent[i-1][m]||0, c=recent[i][m]||0;
      labels.push(recent[i].date.slice(5));
      changes.push(p===0?0:parseFloat(((c-p)/p*100).toFixed(1)));
    }
    if (this.dod) this.dod.destroy();
    this.dod = new Chart(document.getElementById('c-dod'), {
      type: 'bar',
      data: { labels, datasets:[{ label:'변화율(%)', data:changes,
        backgroundColor:changes.map(v=>v>=0?'#2ecc7188':'#e74c3c88'),
        borderColor:changes.map(v=>v>=0?'#2ecc71':'#e74c3c'),
        borderWidth:1, borderRadius:3 }] },
      options: this.co({
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y.toFixed(1)+'%'}}},
        scales:{
          x:{ticks:{color:'#8b90a0',font:{size:9}},grid:{display:false}},
          y:{ticks:{color:'#8b90a0',font:{size:10},callback:v=>v+'%'},grid:{color:'#2a2d3e'}},
        }
      }),
    });
  },
};

// ── INSIGHTS ──────────────────────────────────────────────────────────────────
const Ins = {
  a(text) { return `<span class="ins-action">💡 <strong>반영 제안</strong>: ${text}</span>`; },

  gen() {
    const bd = Store.byDate();
    const out = [];
    if (bd.length < 2) return [{ type:'neu', icon:'ℹ️', text:'2일 이상의 데이터가 필요합니다.' }];

    const last = bd[bd.length-1], prev = bd[bd.length-2];

    // 7일 집계
    const L7 = bd.slice(-7).reduce((acc,r)=>{
      acc.impr+=r.impr; acc.clicks+=r.clicks; acc.cost+=r.cost; acc.conv+=r.conv; acc.revenue+=r.revenue; return acc;
    }, {impr:0,clicks:0,cost:0,conv:0,revenue:0});
    L7.ctr  = L7.impr>0   ? L7.clicks/L7.impr*100 : 0;
    L7.cvr  = L7.clicks>0 ? L7.conv/L7.clicks*100  : 0;
    L7.cpc  = L7.clicks>0 ? L7.cost/L7.clicks      : 0;
    L7.cpa  = L7.conv>0   ? L7.cost/L7.conv         : 0;
    L7.roas = L7.cost>0   ? L7.revenue/L7.cost       : 0;

    // ① 전일 대비 핵심 지표 변화
    [['cost','광고비'],['conv','전환수'],['roas','ROAS'],['cpa','CPA'],['ctr','CTR']].forEach(([m,label])=>{
      const c=last[m]||0, p=prev[m]||0;
      if (!p) return;
      const pct=(c-p)/p*100;
      if (Math.abs(pct)<10) return;
      const lb=LOWER_BETTER.has(m), good=lb?pct<0:pct>0;
      const actions = {
        cost_up:  '급격한 광고비 증가가 ROAS 개선으로 이어졌는지 확인하세요. 효율 개선 없이 비용만 늘었다면 예산 재조정이 필요합니다.',
        conv_dn:  '전환 급감 시 ① 전환 추적 오류 → ② 노출/클릭 감소 → ③ 키워드 제외 처리 순으로 점검하세요.',
        roas_dn:  '매출 단가가 낮은 노선·시즌 키워드를 점검하고, 고단가 노선(일본·동남아) 입찰가 상향을 검토하세요.',
        cpa_up:   '① 저성과 키워드 입찰가 하향 → ② 전환율 낮은 소재 교체 → ③ 경쟁사 광고 집행 현황 확인 순으로 대응하세요.',
        ctr_dn:   '광고 제목에 출발지·목적지를 직접 명시하고, 특가/최저가 등 즉각적인 혜택 문구를 추가해 클릭률을 높이세요.',
      };
      let action = '';
      if (m==='cost'&&pct>20) action=actions.cost_up;
      else if (m==='conv'&&pct<-15) action=actions.conv_dn;
      else if (m==='roas'&&pct<-15) action=actions.roas_dn;
      else if (m==='cpa'&&pct>15) action=actions.cpa_up;
      else if (m==='ctr'&&pct<-15) action=actions.ctr_dn;
      out.push({
        type: good?'pos':'neg', icon: good?'📈':'📉',
        text: `<strong>${label}</strong> 전일(${prev.date}) 대비 <strong>${pct>0?'+':''}${pct.toFixed(1)}%</strong> &nbsp;${fmt(m,p)} → ${fmt(m,c)}${action?'<br>'+this.a(action):''}`,
      });
    });

    // ② CTR 수준 진단
    if (L7.ctr > 0) {
      if (L7.ctr < 1.5) {
        out.push({ type:'warn', icon:'🎯',
          text: `최근 7일 평균 CTR <strong>${L7.ctr.toFixed(2)}%</strong> — 검색광고 평균(2~3%) 대비 낮습니다.<br>${this.a('광고 제목에 출발지·도착지를 직접 명시하고, 키워드 매칭 타입을 확장→구문→일치 순으로 좁혀 광고 노출 품질을 높이세요. 낮은 CTR 키워드는 QS(품질지수) 하락으로 CPC 상승을 유발합니다.')}` });
      } else if (L7.ctr >= 4) {
        out.push({ type:'pos', icon:'🎯',
          text: `최근 7일 평균 CTR <strong>${L7.ctr.toFixed(2)}%</strong> — 높은 클릭률을 기록 중입니다.<br>${this.a('CTR이 높을 때 CVR(전환율)도 함께 확인하세요. CTR 대비 CVR이 낮다면 랜딩 페이지와 키워드 의도가 불일치할 수 있습니다.')}` });
      }
    }

    // ③ CVR(전환율) 진단
    if (L7.cvr > 0 && L7.cvr < 1.5) {
      out.push({ type:'warn', icon:'🔄',
        text: `최근 7일 평균 CVR <strong>${L7.cvr.toFixed(2)}%</strong> — 클릭 대비 전환 효율이 낮습니다.<br>${this.a('① 랜딩 페이지 로딩 속도(3초 초과 시 이탈률 급증) → ② 예약 버튼 가시성 → ③ 검색 키워드와 랜딩 페이지 내용 일치 여부를 순서대로 점검하세요. Mobile CVR이 특히 낮다면 모바일 UX 최적화가 시급합니다.')}` });
    }

    // ④ 매체별 효율 격차 + 예산 배분 제안
    const rm = Store.byMedia();
    if (rm.length >= 2) {
      rm.sort((a,b)=>b.roas-a.roas);
      const best=rm[0], worst=rm[rm.length-1];
      const gap = (best.roas>0&&worst.roas>0) ? best.roas/worst.roas : 0;
      if (gap > 1.3) {
        out.push({ type:'neu', icon:'📡',
          text: `매체 ROAS — ${rm.map(m=>`<strong>${m.media}</strong> ${fmt('roas',m.roas)}`).join(' / ')}<br>${this.a(`${best.media}의 예산 비중을 높이고, ${worst.media}는 소재·타겟 최적화 후 2주 관찰 뒤에도 개선 없으면 예산을 축소해 ${best.media}로 이전하세요.`)}` });
      } else {
        out.push({ type:'neu', icon:'📡',
          text: `매체 ROAS — ${rm.map(m=>`<strong>${m.media}</strong> ${fmt('roas',m.roas)}`).join(' / ')}<br>${this.a('매체 간 효율이 유사합니다. 전환 타입(앱/웹) 및 디바이스별로 세분화해 각 매체의 강점 지면·오디언스에 맞는 소재 전략을 구사해 보세요.')}` });
      }
    }

    // ⑤ 노선별 효율 + 확장/축소 제안
    const rr = Store.byRoute().filter(r=>r.cost>0);
    if (rr.length >= 2) {
      rr.sort((a,b)=>b.roas-a.roas);
      const top=rr[0], bot=rr[rr.length-1];
      out.push({ type:'neu', icon:'🗺️',
        text: `노선 ROAS 최고 <strong>${top.route}</strong> ${fmt('roas',top.roas)} / 최저 <strong>${bot.route}</strong> ${fmt('roas',bot.roas>0?bot.roas:0)}<br>${this.a(`${top.route}은 입찰가 상향 또는 예산 추가 배분을 검토하세요. ${bot.route}은 전환 데이터가 30건 이상이면 키워드 정리·CPC 하향을 진행하고, 미만이면 관찰 기간을 연장한 후 판단하세요.`)}` });
    }

    // ⑥ 디바이스 CPA 격차
    const devAgg = {};
    Store.filtered.forEach(r => {
      if (!devAgg[r.device]) devAgg[r.device] = {cost:0,conv:0,clicks:0,revenue:0};
      const d=devAgg[r.device]; d.cost+=r.cost; d.conv+=r.conv; d.clicks+=r.clicks; d.revenue+=r.revenue;
    });
    const mob=devAgg['Mobile'], pc=devAgg['PC'];
    if (mob&&pc&&mob.conv>0&&pc.conv>0) {
      const mCpa=mob.cost/mob.conv, pCpa=pc.cost/pc.conv;
      const ratio=Math.max(mCpa,pCpa)/Math.min(mCpa,pCpa);
      if (ratio>1.4) {
        const better=mCpa<pCpa?'Mobile':'PC', worse=better==='Mobile'?'PC':'Mobile';
        const bCpa=better==='Mobile'?mCpa:pCpa, wCpa=better==='Mobile'?pCpa:mCpa;
        out.push({ type:'neu', icon:'📱',
          text: `디바이스 CPA — Mobile ${fmt('cpa',mCpa)} / PC ${fmt('cpa',pCpa)}<br>${this.a(`${better}(CPA ${fmt('cpa',bCpa)})이 더 효율적입니다. 구글 광고의 디바이스 입찰 조정에서 ${better} 가중치를 +20~30% 높이고, ${worse}(CPA ${fmt('cpa',wCpa)})은 랜딩 페이지 최적화를 우선 검토하세요.`)}` });
      }
    }

    // ⑦ CPA 연속 상승 경보
    if (bd.length>=3) {
      const t=bd.slice(-3).map(r=>r.cpa);
      if (t[0]>0&&t[0]<t[1]&&t[1]<t[2]) {
        out.push({ type:'neg', icon:'⚠️',
          text: `CPA 3일 연속 상승 (${fmt('cpa',t[0])} → ${fmt('cpa',t[1])} → ${fmt('cpa',t[2])})<br>${this.a('즉시 점검 순서: ① 전환 태그 정상 작동 확인 → ② 저효율 키워드(전환 0, 클릭 多) 일시 중단 → ③ 경쟁사 신규 입찰 진입 여부 모니터링 → ④ 랜딩 페이지 이상 없으면 입찰 전략을 타겟 CPA 자동으로 전환 검토.')}` });
      }
    }

    // ⑧ 7일 ROAS 레벨 진단
    if (L7.roas > 0) {
      if (L7.roas < 1) {
        out.push({ type:'neg', icon:'🚨',
          text: `최근 7일 ROAS <strong>${L7.roas.toFixed(2)}</strong> — 광고비 대비 전환 매출 적자 상태입니다.<br>${this.a('즉시 ROAS 하위 20% 캠페인 예산 삭감 후 상위 캠페인에 재배분하세요. 전환 매출 데이터가 충분하면 타겟 ROAS 자동 입찰로 전환하고, 목표 ROAS를 현실적인 수준(150~200%)에서 시작하세요.')}` });
      } else if (L7.roas < 2) {
        out.push({ type:'warn', icon:'📊',
          text: `최근 7일 ROAS <strong>${L7.roas.toFixed(2)}</strong> — 광고비 회수는 되나 수익 마진이 낮습니다.<br>${this.a('고단가 노선(일본·동남아·대양주) 키워드 강화, 경쟁이 적은 롱테일 키워드(출발지+도착지+날짜) 발굴로 CPC를 낮추고 ROAS를 개선하세요.')}` });
      } else if (L7.roas >= 3) {
        out.push({ type:'pos', icon:'✨',
          text: `최근 7일 ROAS <strong>${L7.roas.toFixed(2)}</strong> — 광고 효율이 우수합니다.<br>${this.a('효율이 좋을 때 예산을 적극 확대해 점유율을 높이세요. ROAS 상위 캠페인·노선 키워드의 노출 순위를 1~2위로 올리는 입찰 조정을 검토하세요.')}` });
      }
    }

    // ⑨ 단일 매체 예산 집중 리스크
    const mediaCosts = {};
    Store.filtered.forEach(r => { mediaCosts[r.media]=(mediaCosts[r.media]||0)+r.cost; });
    const totalCost = Object.values(mediaCosts).reduce((s,v)=>s+v,0);
    const topM = Object.entries(mediaCosts).sort((a,b)=>b[1]-a[1])[0];
    if (topM && totalCost>0 && topM[1]/totalCost > 0.8) {
      out.push({ type:'warn', icon:'⚠️',
        text: `<strong>${topM[0]}</strong>에 전체 광고비의 <strong>${(topM[1]/totalCost*100).toFixed(0)}%</strong>가 집중되어 있습니다.<br>${this.a('단일 매체 의존도가 높으면 매체 정책 변경·알고리즘 업데이트 시 성과가 급락할 수 있습니다. 전체 예산의 10~15%를 다른 매체 테스트 예산으로 분리해 리스크를 분산하세요.')}` });
    }

    // ⑩ 이상치 자동 감지 (7일 이동평균 대비 ±35% 이상)
    if (bd.length >= 7) {
      const anomalyMetrics = [['cost','광고비'],['conv','전환수'],['roas','ROAS'],['ctr','CTR']];
      anomalyMetrics.forEach(([m, label]) => {
        const window = bd.slice(-8, -1); // 직전 7일
        const avg = window.reduce((s,r)=>s+(r[m]||0),0) / window.length;
        if (avg === 0) return;
        const todayVal = last[m] || 0;
        const dev = (todayVal - avg) / avg * 100;
        if (Math.abs(dev) < 35) return;
        const lb = LOWER_BETTER.has(m);
        const isGood = lb ? dev < 0 : dev > 0;
        const tag = dev > 0
          ? `<span class="anomaly-tag anomaly-up">+${dev.toFixed(0)}%</span>`
          : `<span class="anomaly-tag anomaly-dn">${dev.toFixed(0)}%</span>`;
        out.push({
          type: isGood ? 'pos' : 'neg', icon: '🔍',
          text: `이상치 감지 — <strong>${label}</strong> ${tag} 7일 평균(${fmt(m,avg)}) 대비 오늘(${last.date}) <strong>${fmt(m,todayVal)}</strong><br>${this.a(isGood ? `${label} 급등 원인(프로모션·시즌 등)을 파악하고, 동일 조건을 유지하거나 성공 요인을 다른 매체·노선에 적용하세요.` : `${label} 급락 원인을 긴급 점검하세요. 광고 소재 피로도, 예산 소진, 경쟁 강도 변화 여부를 확인하세요.`)}`,
        });
      });
    }

    if (!out.length) out.push({ type:'neu', icon:'✅', text:'현재 주요 지표가 안정적으로 유지되고 있습니다. 지속 모니터링하세요.' });
    return out.slice(0, 10);
  },
};

// ── UI ────────────────────────────────────────────────────────────────────────
const UI = {
  activeDevices: [],
  activeMedias: [],
  activeRoutes: [],

  render() {
    document.getElementById('empty').classList.add('hidden');
    document.getElementById('main').classList.remove('hidden');
    this.renderSidebar();
    this.renderKPIs();
    this.renderPacing();
    this.renderWeekCompare();
    this.renderMonthCompare();
    this.loadTargets();
    this.renderTabs();
    CH.renderAll();
    this.renderInsights();
    this.renderTable();
    this.updateDataRange();
    Notes.initEditor();
  },

  renderSidebar() {
    const dates = Store.raw.map(r=>r.date).sort();
    const minD = dates[0]||'', maxD = dates[dates.length-1]||'';

    // 날짜 피커 (기본값: 26년 4월 28~29일, 데이터 범위 내일 때만)
    const defFrom = '2026-04-28' >= minD && '2026-04-28' <= maxD ? '2026-04-28' : minD;
    const defTo   = '2026-04-29' >= minD && '2026-04-29' <= maxD ? '2026-04-29' : maxD;
    DP.create('dp-campaign', {
      minDate: minD, maxDate: maxD, from: defFrom, to: defTo,
      onChange: () => this.applyFilter(),
    });

    // 드롭다운 필터
    MS.create('ms-c-device', { label:'디바이스', options: Store.devices, dots: DEVICE_COLORS, onChange: () => this.applyFilter() });
    MS.create('ms-c-media',  { label:'매체',     options: Store.medias,  dots: MEDIA_COLORS,  onChange: () => this.applyFilter() });
    MS.create('ms-c-route',  { label:'대노선',   options: Store.routes,  dots: ROUTE_COLORS,  onChange: () => this.applyFilter() });
  },

  applyFilter() {
    const { from, to } = DP.getRange('dp-campaign');
    Store.filter({ from, to, devices: MS.getSelected('ms-c-device'), medias: MS.getSelected('ms-c-media'), routes: MS.getSelected('ms-c-route') });
    this.renderKPIs();
    this.renderPacing();
    this.renderWeekCompare();
    this.renderMonthCompare();
    this.renderInsights();
    CH.renderAll();
    this.tableShowCount = 30;
    delete DP.instances['dp-table-wrap'];
    this.renderTable();
    this.updateDataRange();
  },

  updateDataRange() {
    const bd = Store.byDate();
    if (!bd.length) return;
    document.getElementById('data-range').textContent = `${bd[0].date} ~ ${bd[bd.length-1].date} (${bd.length}일)`;
    document.getElementById('row-count').textContent = `${bd.length}일 집계`;
  },

  compareMode: false,

  toggleCompare(btn) {
    this.compareMode = !this.compareMode;
    btn.classList.toggle('on', this.compareMode);
    this.renderKPIs();
  },

  renderKPIs() {
    const bd = Store.byDate();
    const last = bd[bd.length-1]||{}, prev = bd[bd.length-2]||{};
    const keys = ['cost','impr','clicks','ctr','cpc','conv','cpa','revenue','roas','gaConv','appInstall'];

    let cmpAgg = null;
    if (this.compareMode) {
      const { from, to } = DP.getRange('dp-campaign');
      if (from && to) {
        const ms = d => new Date(d + 'T00:00:00').getTime();
        const days = Math.round((ms(to) - ms(from)) / 86400000) + 1;
        const prevTo   = new Date(ms(from) - 86400000).toISOString().slice(0,10);
        const prevFrom = new Date(ms(from) - days * 86400000).toISOString().slice(0,10);
        const d = MS.getSelected('ms-c-device'), me = MS.getSelected('ms-c-media'), r = MS.getSelected('ms-c-route');
        const curr = Store.getAggForPeriod(from, to, d, me, r);
        cmpAgg = { curr, prev: Store.getAggForPeriod(prevFrom, prevTo, d, me, r), prevFrom, prevTo };
      }
    }

    document.getElementById('kpi-grid').innerHTML = keys.map((m,i) => {
      const c = cmpAgg ? (cmpAgg.curr[m]||0) : (last[m]||0);
      const p = cmpAgg ? (cmpAgg.prev[m]||0) : (prev[m]||0);
      const pct = p>0?(c-p)/p*100:0;
      const lb=LOWER_BETTER.has(m), good=lb?pct<=0:pct>=0;
      const arrow=pct>0.05?'▲':pct<-0.05?'▼':'─';
      const cls=pct===0?'':(good?'pos':'neg');
      const compareRow = cmpAgg
        ? `<div class="kpi-prev">이전 <span>${fmt(m,p)}</span> &nbsp;<span class="${cls}">${arrow}${Math.abs(pct).toFixed(1)}%</span></div>`
        : `<div class="kpi-change ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}% 전일대비</div>`;
      return `<div class="kpi${i===0?' active':''}${cmpAgg?' compare':''}" onclick="UI.selectKPI('${m}',this)">
        <div class="kpi-label">${METRICS[m]?.label||m}</div>
        <div class="kpi-value">${fmt(m,c)}</div>
        ${compareRow}
      </div>`;
    }).join('');
  },

  saveTargets() {
    const parse = id => parseInt((document.getElementById(id)?.value||'').replace(/[^0-9]/g,''))||0;
    const t = { cost: parse('target-cost'), conv: parse('target-conv'), rev: parse('target-rev') };
    localStorage.setItem('jb_targets', JSON.stringify(t));
    this.renderPacing();
  },

  loadTargets() {
    try {
      const t = JSON.parse(localStorage.getItem('jb_targets')||'{}');
      const fmt = v => v ? v.toLocaleString() : '';
      if (t.cost) document.getElementById('target-cost').value = fmt(t.cost);
      if (t.conv) document.getElementById('target-conv').value = fmt(t.conv);
      if (t.rev)  document.getElementById('target-rev').value  = fmt(t.rev);
    } catch(e) {}
  },

  renderPacing() {
    let t;
    try { t = JSON.parse(localStorage.getItem('jb_targets')||'{}'); } catch(e) { t = {}; }
    if (!t.cost && !t.conv && !t.rev) { document.getElementById('card-pacing').classList.add('hidden'); return; }

    // 가장 최근 월 데이터만 사용 (사이드바 필터 무관)
    const allDates = Store.raw.map(r=>r.date).sort();
    if (!allDates.length) return;
    const ym = allDates[allDates.length-1].slice(0,7);
    const [y, mo] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const monthRows = Store.raw.filter(r=>r.date.startsWith(ym));
    const activeDays = new Set(monthRows.map(r=>r.date)).size;
    const tot = monthRows.reduce((a,r)=>{ a.cost+=r.cost; a.conv+=r.conv; a.rev+=r.revenue; return a; }, {cost:0,conv:0,rev:0});
    const proj = {
      cost: activeDays ? tot.cost/activeDays*daysInMonth : 0,
      conv: activeDays ? tot.conv/activeDays*daysInMonth : 0,
      rev:  activeDays ? tot.rev /activeDays*daysInMonth : 0,
    };

    const items = [
      { icon:'💰', label:'광고비',   actual:tot.cost, target:t.cost, projected:proj.cost, unit:'₩' },
      { icon:'🎯', label:'전환수',   actual:tot.conv, target:t.conv, projected:proj.conv, unit:''  },
      { icon:'📈', label:'전환매출', actual:tot.rev,  target:t.rev,  projected:proj.rev,  unit:'₩' },
    ].filter(x=>x.target>0);

    const fmtV = (v, unit) => {
      const n = Math.round(v);
      if (unit==='₩') {
        if (n>=100000000) return '₩'+(n/100000000).toFixed(1)+'억';
        if (n>=10000000)  return '₩'+(n/10000000).toFixed(1)+'천만';
        if (n>=10000)     return '₩'+(n/10000).toFixed(0)+'만';
        return '₩'+n.toLocaleString();
      }
      return n.toLocaleString()+'건';
    };

    const arcColor = p => p>=100?'#2ecc71':p>=70?'#4c9eff':'#f39c12';
    const statusLabel = p => p>=100?'🎉 목표 달성':p>=70?'순항 중 👍':'주의 필요 ⚠️';
    const arc = (p, c) => {
      const d = Math.min(p,100).toFixed(1), gap=(100-Math.min(p,100)).toFixed(1);
      return `<svg viewBox="0 0 36 36" width="90" height="90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="${c}" stroke-width="3"
          stroke-dasharray="${d} ${gap}" stroke-linecap="round" transform="rotate(-90 18 18)"
          style="transition:stroke-dasharray .8s ease;"/>
      </svg>`;
    };

    const monthLabel = `${y}년 ${mo}월`;
    document.getElementById('pacing-title').innerHTML =
      `📊 월별 KPI 달성 현황 <span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:4px;">${monthLabel}</span>`;

    document.getElementById('card-pacing').classList.remove('hidden');
    document.getElementById('pacing-body').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(${items.length},1fr);gap:14px;padding:6px 2px;">
        ${items.map(x=>{
          const p = x.target>0 ? x.actual/x.target*100 : 0;
          const projP = x.target>0 ? Math.round(x.projected/x.target*100) : 0;
          const c = arcColor(p);
          return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:18px 14px;text-align:center;">
            <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:14px;">${x.icon} ${x.label}</div>
            <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;">
              ${arc(p,c)}
              <div style="position:absolute;display:flex;flex-direction:column;align-items:center;">
                <span style="font-size:18px;font-weight:800;color:${c};line-height:1;">${Math.round(p)}%</span>
              </div>
            </div>
            <div style="font-size:11px;font-weight:600;color:${c};margin-bottom:8px;">${statusLabel(p)}</div>
            <div class="pacing-detail" style="font-size:11px;color:var(--muted);">달성 &nbsp;<strong style="color:var(--text);">${fmtV(x.actual,x.unit)}</strong></div>
            <div class="pacing-detail" style="font-size:10px;color:var(--muted);margin-top:3px;">월말 예상 &nbsp;<strong style="color:${c};">${fmtV(x.projected,x.unit)}</strong> &nbsp;(${projP}%)</div>
          </div>`;
        }).join('')}
      </div>
      <div class="pacing-detail" style="font-size:10px;color:var(--muted);text-align:right;margin-top:4px;">* ${activeDays}일 기준 예상 / ${monthLabel} 전체 ${daysInMonth}일</div>`;
  },

  _aggRange(from, to) {
    const rows = Store.raw.filter(r => r.date >= from && r.date <= to);
    const a = { cost:0, conv:0, revenue:0, impr:0, clicks:0 };
    rows.forEach(r => { a.cost+=r.cost; a.conv+=r.conv; a.revenue+=r.revenue; a.impr+=r.impr; a.clicks+=r.clicks; });
    a.roas = a.cost>0 ? a.revenue/a.cost : 0;
    a.ctr  = a.impr>0 ? a.clicks/a.impr*100 : 0;
    a.cpa  = a.conv>0 ? a.cost/a.conv : 0;
    a.days = new Set(rows.map(r=>r.date)).size;
    return a;
  },

  _renderCmpBody(id, curr, prev, prevLabel) {
    const fv = (k, v) => {
      const n = Math.round(v);
      if (k==='roas') return v.toFixed(2)+'x';
      if (k==='ctr')  return v.toFixed(2)+'%';
      if (['cost','cpa','revenue'].includes(k)) {
        if (n>=100000000) return '₩'+(n/100000000).toFixed(1)+'억';
        if (n>=10000000)  return '₩'+(n/10000000).toFixed(1)+'천만';
        if (n>=10000)     return '₩'+(n/10000).toFixed(0)+'만';
        return '₩'+n.toLocaleString();
      }
      return n.toLocaleString();
    };
    const METS = [
      {k:'cost',    lb:false, label:'광고비'},
      {k:'impr',    lb:false, label:'노출수'},
      {k:'clicks',  lb:false, label:'클릭수'},
      {k:'conv',    lb:false, label:'전환수'},
      {k:'revenue', lb:false, label:'전환매출'},
      {k:'roas',    lb:false, label:'ROAS'},
      {k:'ctr',     lb:false, label:'CTR'},
      {k:'cpa',     lb:true,  label:'CPA'},
    ];
    document.getElementById(id).innerHTML = `<div class="cmp-grid">${METS.map(m=>{
      const c=curr[m.k]||0, p=prev[m.k]||0;
      const pct = p>0 ? (c-p)/p*100 : 0;
      const good = m.lb ? pct<=0 : pct>=0;
      const cls = Math.abs(pct)<0.5 ? 'neu' : good ? 'pos' : 'neg';
      const arrow = pct>0.5?'▲':pct<-0.5?'▼':'─';
      const barW = Math.min(Math.abs(pct), 100);
      const barColor = cls==='pos'?'var(--green)':cls==='neg'?'var(--red)':'var(--muted)';
      return `<div class="cmp-card ${cls}-card">
        <div class="cmp-label">${m.label}</div>
        <div class="cmp-curr">${fv(m.k,c)}</div>
        <div class="cmp-prev">${prevLabel} ${fv(m.k,p)}</div>
        <div class="cmp-change ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</div>
        <div class="cmp-bar"><div class="cmp-bar-fill" style="width:${barW}%;background:${barColor};"></div></div>
      </div>`;
    }).join('')}</div>`;
  },

  renderWeekCompare() {
    const dates = [...new Set(Store.raw.map(r=>r.date))].sort();
    if (dates.length < 7) { document.getElementById('card-week-cmp').classList.add('hidden'); return; }
    const max = dates[dates.length-1];
    const d = new Date(max+'T00:00:00');
    const dow = d.getDay();
    const toMon = dow===0 ? -6 : 1-dow;
    const thisMon = new Date(d); thisMon.setDate(d.getDate()+toMon);
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate()-7);
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate()-1);
    const fmt = x => x.toISOString().slice(0,10);
    const fmtD = s => s.slice(5).replace('-','.');
    const [tm, ls, lm] = [fmt(thisMon), fmt(lastSun), fmt(lastMon)];
    const curr = this._aggRange(tm, max);
    const prev = this._aggRange(lm, ls);
    if (!prev.cost && !prev.conv) { document.getElementById('card-week-cmp').classList.add('hidden'); return; }
    document.getElementById('week-cmp-title').innerHTML =
      `📅 주차별 성과 비교 <span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:4px;">이번 주 ${fmtD(tm)}~${fmtD(max)} vs 지난 주 ${fmtD(lm)}~${fmtD(ls)}</span>`;
    this._renderCmpBody('week-cmp-body', curr, prev, '지난 주');
    document.getElementById('card-week-cmp').classList.remove('hidden');
  },

  renderMonthCompare() {
    const dates = [...new Set(Store.raw.map(r=>r.date))].sort();
    if (!dates.length) return;
    const thisYM = dates[dates.length-1].slice(0,7);
    const [y, mo] = thisYM.split('-').map(Number);
    const pm = mo===1?12:mo-1, py = mo===1?y-1:y;
    const prevYM = `${py}-${String(pm).padStart(2,'0')}`;
    const curr = this._aggRange(thisYM+'-01', thisYM+'-31');
    const prev = this._aggRange(prevYM+'-01', prevYM+'-31');
    if (!prev.cost && !prev.conv) { document.getElementById('card-month-cmp').classList.add('hidden'); return; }
    document.getElementById('month-cmp-title').innerHTML =
      `📆 전월 비교 <span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:4px;">${mo}월 (${curr.days}일) vs ${pm}월 (${prev.days}일)</span>`;
    this._renderCmpBody('month-cmp-body', curr, prev, `${pm}월`);
    document.getElementById('card-month-cmp').classList.remove('hidden');
  },

  selectKPI(m, el) {
    document.querySelectorAll('.kpi').forEach(k=>k.classList.remove('active'));
    el.classList.add('active');
    CH.trendMetric = m;
    CH.dodMetric = m;
    const bd = Store.byDate();
    CH.renderTrend(bd);
    CH.renderDoD(bd);
    this.setTabActive('trend-tabs', m);
    this.setTabActive('dod-tabs', m);
  },

  renderTabs() {
    const mainMetrics = ['cost','impr','clicks','conv','revenue','ctr','cpc','cpa','roas'];
    const tabHtml = (id, active, handler) =>
      mainMetrics.map(m => `<span class="mtab${m===active?' on':''}" onclick="${handler}('${m}',this)">${METRICS[m]?.label||m}</span>`).join('');
    document.getElementById('trend-tabs').innerHTML  = tabHtml('trend-tabs','cost','UI.setTrendMetric');
    document.getElementById('media-tabs').innerHTML  = tabHtml('media-tabs','cost','UI.setMediaMetric');
    document.getElementById('route-tabs').innerHTML  = tabHtml('route-tabs','cost','UI.setRouteMetric');
    document.getElementById('dod-tabs').innerHTML    = tabHtml('dod-tabs','cost','UI.setDodMetric');
  },

  setTabActive(tabsId, m) {
    document.querySelectorAll(`#${tabsId} .mtab`).forEach(t => t.classList.toggle('on', t.textContent===METRICS[m]?.label));
  },

  setTrendMetric(m,el) { CH.trendMetric=m; CH.renderTrend(Store.byDate()); document.querySelectorAll('#trend-tabs .mtab').forEach(t=>t.classList.toggle('on',t===el)); },
  setMediaMetric(m,el) { CH.mediaMetric=m; CH.renderMedia(); document.querySelectorAll('#media-tabs .mtab').forEach(t=>t.classList.toggle('on',t===el)); },
  setRouteMetric(m,el) { CH.routeMetric=m; CH.renderRoute(); document.querySelectorAll('#route-tabs .mtab').forEach(t=>t.classList.toggle('on',t===el)); },
  setDodMetric(m,el)   { CH.dodMetric=m;   CH.renderDoD(Store.byDate()); document.querySelectorAll('#dod-tabs .mtab').forEach(t=>t.classList.toggle('on',t===el)); },

  renderInsights() {
    document.getElementById('ins-list').innerHTML = Ins.gen().map(i =>
      `<div class="ins ${i.type}"><span class="ins-icon">${i.icon}</span><span>${i.text}</span></div>`).join('');
  },

  tableShowCount: 30,

  initTableDP() {
    const allBd = Store.byDate();
    if (!allBd.length) return;
    const dates = allBd.map(r => r.date).sort();
    const minD = dates[0], maxD = dates[dates.length - 1];
    // 기본값: 최근 30일
    const defToDate = new Date(maxD + 'T00:00:00');
    const defFromDate = new Date(defToDate);
    defFromDate.setDate(defFromDate.getDate() - 29);
    const defFrom = defFromDate.toISOString().slice(0, 10) < minD ? minD : defFromDate.toISOString().slice(0, 10);
    DP.create('dp-table-wrap', {
      minDate: minD, maxDate: maxD, from: defFrom, to: maxD,
      onChange: () => { this.tableShowCount = 30; this.renderTable(); },
    });
  },

  expandTable() {
    this.tableShowCount += 30;
    this.renderTable();
  },

  collapseTable() {
    this.tableShowCount = 30;
    this.renderTable();
    document.getElementById('card-table')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  renderTable() {
    // 테이블 전용 달력이 없으면 먼저 생성
    if (!DP.instances['dp-table-wrap']) this.initTableDP();

    const allBd = [...Store.byDate()].reverse(); // 최신순
    const { from: tf, to: tt } = DP.getRange('dp-table-wrap');
    const bd = allBd.filter(r =>
      (!tf || r.date >= tf) && (!tt || r.date <= tt)
    );
    const total = bd.length;
    const visible = bd.slice(0, this.tableShowCount);
    const hasMore = total > this.tableShowCount;

    document.getElementById('row-count').textContent = `${visible.length} / ${total}일`;
    const expandWrap = document.getElementById('table-expand-wrap');
    const canCollapse = this.tableShowCount > 30;
    if (expandWrap) {
      expandWrap.style.display = (hasMore || canCollapse) ? 'flex' : 'none';
      const remaining = Math.min(30, total - this.tableShowCount);
      const expandBtn = document.getElementById('table-expand-btn');
      const collapseBtn = document.getElementById('table-collapse-btn');
      if (expandBtn) { expandBtn.textContent = `+ ${remaining}일 더 보기`; expandBtn.style.display = hasMore ? '' : 'none'; }
      if (collapseBtn) collapseBtn.style.display = canCollapse ? '' : 'none';
    }

    const cols = [
      {k:'date',label:'날짜'},{k:'impr',label:'노출수'},{k:'clicks',label:'클릭수'},
      {k:'ctr',label:'CTR'},{k:'cost',label:'광고비'},{k:'cpc',label:'CPC'},
      {k:'conv',label:'전환수'},{k:'cpa',label:'CPA'},{k:'revenue',label:'전환매출'},
      {k:'roas',label:'ROAS'},{k:'gaConv',label:'GA전환'},{k:'gaRev',label:'GA매출'},
      {k:'appInstall',label:'앱설치'},
    ];
    document.getElementById('t-head').innerHTML =
      `<tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}</tr>`;
    const dailyNotes = Notes.getAllDaily();
    document.getElementById('t-body').innerHTML = visible.map((row,i)=>{
      const prev = visible[i+1];
      const hasNote = !!dailyNotes[row.date];
      const noteTitle = hasNote ? dailyNotes[row.date].replace(/"/g,'&quot;') : '메모 추가';
      return `<tr>${cols.map(c=>{
        if (c.k==='date') return `<td>${row.date}<button class="memo-btn admin-btn${hasNote?' has-note':''}" onclick="Notes.openModal('${row.date}')" title="${noteTitle}">📝</button></td>`;
        const v=row[c.k]||0, p=prev?.[c.k]||0;
        let badge='';
        if (prev&&p>0) {
          const pct=(v-p)/p*100;
          badge=`<span class="badge ${pct>=0?'up':'dn'}">${pct>0?'+':''}${pct.toFixed(1)}%</span>`;
        }
        return `<td>${fmt(c.k,v)}${badge}</td>`;
      }).join('')}</tr>`;
    }).join('');
  },

  toggleCard(id) {
    const card = document.getElementById(id);
    const collapsed = card.classList.toggle('collapsed');
    card.querySelector('.collapse-btn').textContent = collapsed ? '+' : '−';
  },

  showUpload() { document.getElementById('m-upload').classList.remove('hidden'); },
  hideUpload() { document.getElementById('m-upload').classList.add('hidden'); document.getElementById('f-file').value=''; },
  showLoading(msg) { document.getElementById('loading-text').textContent=msg||''; document.getElementById('loading').classList.remove('hidden'); },
  hideLoading() { document.getElementById('loading').classList.add('hidden'); },
};

// tab method is on UI object — make callable from inline onclick
function UI_setTrendMetric(m,el) { UI.setTrendMetric(m,el); }

// ── DRAG & DROP ───────────────────────────────────────────────────────────────
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) Parser.load(f);
});

document.getElementById('m-upload').addEventListener('click', e => {
  if (e.target === e.currentTarget) UI.hideUpload();
});
document.getElementById('kw-m-upload').addEventListener('click', e => {
  if (e.target === e.currentTarget) KWUI.hideUpload();
});
const kwDz = document.getElementById('kw-drop-zone');
kwDz.addEventListener('dragover', e => { e.preventDefault(); kwDz.style.borderColor='#3a7fd4'; });
kwDz.addEventListener('dragleave', () => { kwDz.style.borderColor='#e2e6f0'; });
kwDz.addEventListener('drop', e => {
  e.preventDefault(); kwDz.style.borderColor='#e2e6f0';
  if (e.dataTransfer.files[0]) KWParser.load(e.dataTransfer.files[0]);
});

// ── 캘린더 날짜 피커 ──────────────────────────────────────────────────────────
const DP = {
  instances: {},

  create(wrapperId, { minDate, maxDate, from, to, onChange, label }) {
    const inst = { wrapperId, minDate, maxDate, from, to, onChange, label,
      viewYear: (from||minDate||new Date().toISOString().slice(0,10)).slice(0,4)|0,
      viewMonth: ((from||minDate||new Date().toISOString().slice(0,10)).slice(5,7)|0) - 1,
      picking: null };
    this.instances[wrapperId] = inst;
    this._renderBtn(inst);
  },

  _renderBtn(inst) {
    const w = document.getElementById(inst.wrapperId);
    if (!w) return;
    const label = inst.from && inst.to
      ? `${inst.from} ~ ${inst.to}`
      : inst.from ? `${inst.from} ~` : '날짜 선택';
    w.innerHTML = `<button class="dp-btn" onclick="DP.open('${inst.wrapperId}')">
      <span class="dp-btn-icon">📅</span>
      <span style="flex:1;">${label}</span>
      <span style="font-size:10px;color:var(--muted);">▾</span>
    </button>`;
  },

  open(id) {
    document.querySelectorAll('.dp-popup').forEach(p=>p.remove());
    const inst = this.instances[id];
    if (!inst) return;
    inst.picking = null;
    const popup = document.createElement('div');
    popup.className = 'dp-popup';
    popup.id = 'dp-popup-' + id;
    const btn = document.getElementById(id).querySelector('.dp-btn');
    const rect = btn.getBoundingClientRect();
    popup.style.cssText = `top:${rect.bottom+6}px;left:${rect.left}px;`;
    if (rect.left + 292 > window.innerWidth) popup.style.left = (rect.right - 292) + 'px';
    document.body.appendChild(popup);
    this._renderCalendar(id);
    setTimeout(() => document.addEventListener('click', this._outsideClick.bind(this, id), {once:true}), 10);
  },

  _outsideClick(id, e) {
    const popup = document.getElementById('dp-popup-' + id);
    if (!popup) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(popup) && !path.includes(document.getElementById(id))) {
      popup.remove();
    } else {
      setTimeout(() => document.addEventListener('click', this._outsideClick.bind(this, id), {once:true}), 10);
    }
  },

  _renderCalendar(id) {
    const inst = this.instances[id];
    const popup = document.getElementById('dp-popup-' + id);
    if (!popup || !inst) return;
    const { viewYear: y, viewMonth: m } = inst;
    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const days = ['일','월','화','수','목','금','토'];
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();

    let cells = '';
    for (let i=0; i<firstDay; i++) {
      const d = daysInPrev - firstDay + i + 1;
      cells += `<div class="dp-day dp-om dp-dis">${d}</div>`;
    }
    for (let d=1; d<=daysInMonth; d++) {
      const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dis = (inst.minDate && ds < inst.minDate) || (inst.maxDate && ds > inst.maxDate);
      let cls = 'dp-day';
      if (dis) { cls += ' dp-dis'; }
      else {
        const s = inst.picking||inst.from, e = inst.to;
        if (s && e && ds > s && ds < e) cls += ' dp-in';
        if (s && ds === s) cls += ' dp-s';
        if (e && ds === e) cls += ' dp-e';
        if (!dis) cls += ' dp-sel';
      }
      cells += `<div class="${cls}" onclick="DP.pick('${id}','${ds}')">${d}</div>`;
    }
    const remaining = 42 - firstDay - daysInMonth;
    for (let i=1; i<=remaining; i++) cells += `<div class="dp-day dp-om dp-dis">${i}</div>`;

    const rangeText = inst.picking ? `${inst.picking} 선택됨, 종료일을 클릭하세요`
      : inst.from && inst.to ? `${inst.from} ~ ${inst.to}` : '';

    popup.innerHTML = `
      <div class="dp-nav">
        <button class="dp-nav-btn" onclick="DP.prevMonth('${id}')">◀</button>
        <span class="dp-month-lbl">${y}년 ${months[m]}</span>
        <button class="dp-nav-btn" onclick="DP.nextMonth('${id}')">▶</button>
      </div>
      <div class="dp-range-display">${rangeText}</div>
      <div class="dp-grid">${days.map(d=>`<div class="dp-dh">${d}</div>`).join('')}${cells}</div>
      <div class="dp-presets">
        <span class="dp-pre" onclick="DP.preset('${id}','7')">최근 7일</span>
        <span class="dp-pre" onclick="DP.preset('${id}','14')">최근 14일</span>
        <span class="dp-pre" onclick="DP.preset('${id}','30')">최근 30일</span>
        <span class="dp-pre" onclick="DP.preset('${id}','month')">이번 달</span>
        <span class="dp-pre" onclick="DP.preset('${id}','all')">전체</span>
      </div>
      <div class="dp-footer">
        <button class="dp-cancel" onclick="document.getElementById('dp-popup-${id}').remove()">취소</button>
        <button class="dp-apply" onclick="DP.apply('${id}')">적용</button>
      </div>`;
  },

  pick(id, date) {
    const inst = this.instances[id];
    if (!inst.picking) {
      inst.picking = date; inst.from = date; inst.to = null;
    } else {
      if (date < inst.picking) { inst.from = date; inst.to = inst.picking; }
      else { inst.from = inst.picking; inst.to = date; }
      inst.picking = null;
    }
    this._renderCalendar(id);
  },

  prevMonth(id) {
    const inst = this.instances[id];
    if (inst.viewMonth === 0) { inst.viewMonth = 11; inst.viewYear--; }
    else inst.viewMonth--;
    this._renderCalendar(id);
  },

  nextMonth(id) {
    const inst = this.instances[id];
    if (inst.viewMonth === 11) { inst.viewMonth = 0; inst.viewYear++; }
    else inst.viewMonth++;
    this._renderCalendar(id);
  },

  preset(id, type) {
    const inst = this.instances[id];
    const max = inst.maxDate || new Date().toISOString().slice(0,10);
    const d = new Date(max);
    if (type === 'all') { inst.from = inst.minDate; inst.to = inst.maxDate; }
    else if (type === 'month') {
      inst.from = max.slice(0,7) + '-01'; inst.to = max;
    } else {
      const days = parseInt(type);
      const f = new Date(d); f.setDate(f.getDate() - days + 1);
      inst.from = f.toISOString().slice(0,10); inst.to = max;
    }
    inst.picking = null;
    this._renderCalendar(id);
  },

  apply(id) {
    const inst = this.instances[id];
    if (!inst.from) return;
    if (!inst.to) inst.to = inst.from;
    document.getElementById('dp-popup-' + id).remove();
    this._renderBtn(inst);
    if (inst.onChange) inst.onChange(inst.from, inst.to);
  },

  getRange(id) {
    const inst = this.instances[id];
    return inst ? { from: inst.from, to: inst.to } : { from: null, to: null };
  },

  setMinMax(id, minDate, maxDate) {
    const inst = this.instances[id];
    if (!inst) return;
    inst.minDate = minDate; inst.maxDate = maxDate;
    if (!inst.from) { inst.from = minDate; inst.to = maxDate; }
    this._renderBtn(inst);
  },
};

// ── 멀티셀렉트 드롭다운 ──────────────────────────────────────────────────────
const MS = {
  instances: {},

  create(wrapperId, { options, selected, label, dots, onChange }) {
    const inst = { wrapperId, options, selected: selected ? [...selected] : [...options],
      label, dots: dots||{}, onChange };
    this.instances[wrapperId] = inst;
    this._render(inst);
  },

  _render(inst) {
    const w = document.getElementById(inst.wrapperId);
    if (!w) return;
    const prevPanel = document.getElementById('ms-panel-' + inst.wrapperId);
    const wasOpen = prevPanel && !prevPanel.classList.contains('closed');
    const total = inst.options.length, sel = inst.selected.length;
    const badgeHtml = sel < total ? `<span class="ms-badge">${sel}</span>` : '';
    const all = sel === total;
    w.innerHTML = `
      <button class="ms-btn${wasOpen?' open':''}" onclick="MS.toggle('${inst.wrapperId}')">
        <span class="ms-lbl">${inst.label}${badgeHtml}</span>
        <span class="ms-arr">▾</span>
      </button>
      <div class="ms-panel${wasOpen?'':' closed'}" id="ms-panel-${inst.wrapperId}">
        <div class="ms-list">
          <div class="ms-all-row" onclick="MS.toggleAll('${inst.wrapperId}')">
            <input type="checkbox" class="ms-cb" ${all?'checked':''} onclick="event.stopPropagation();MS.toggleAll('${inst.wrapperId}')"> 전체 선택
          </div>
          ${inst.options.map(opt => {
            const checked = inst.selected.includes(opt);
            const dot = inst.dots[opt] ? `<span class="ms-dot" style="background:${inst.dots[opt]}"></span>` : '';
            return `<div class="ms-row" onclick="MS.pick('${inst.wrapperId}','${opt.replace(/'/g,"\\'")}')">
              <input type="checkbox" class="ms-cb" ${checked?'checked':''} onclick="event.stopPropagation();MS.pick('${inst.wrapperId}','${opt.replace(/'/g,"\\'")}')">
              ${dot}<span>${opt}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="ms-footer">
          <button class="ms-apply-btn" onclick="MS.apply('${inst.wrapperId}')">확인</button>
        </div>
      </div>`;
  },

  toggle(id) {
    const panel = document.getElementById('ms-panel-' + id);
    if (!panel) return;
    const isOpen = !panel.classList.contains('closed');
    document.querySelectorAll('.ms-panel').forEach(p => p.classList.add('closed'));
    document.querySelectorAll('.ms-btn.open').forEach(b => b.classList.remove('open'));
    if (!isOpen) {
      panel.classList.remove('closed');
      document.querySelector(`#${id} .ms-btn`)?.classList.add('open');
      setTimeout(() => document.addEventListener('click', MS._outside.bind(MS, id), {once:true}), 10);
    }
  },

  _outside(id, e) {
    const w = document.getElementById(id);
    const path = e.composedPath ? e.composedPath() : [];
    if (w && !path.includes(w)) {
      document.getElementById('ms-panel-'+id)?.classList.add('closed');
      document.querySelector(`#${id} .ms-btn`)?.classList.remove('open');
    } else {
      setTimeout(() => document.addEventListener('click', MS._outside.bind(MS, id), {once:true}), 10);
    }
  },

  pick(id, val) {
    const inst = this.instances[id];
    if (!inst) return;
    const idx = inst.selected.indexOf(val);
    if (idx >= 0) inst.selected.splice(idx, 1); else inst.selected.push(val);
    this._render(inst);
  },

  toggleAll(id) {
    const inst = this.instances[id];
    if (!inst) return;
    inst.selected = inst.selected.length === inst.options.length ? [] : [...inst.options];
    this._render(inst);
  },

  apply(id) {
    const inst = this.instances[id];
    if (!inst) return;
    document.getElementById('ms-panel-'+id)?.classList.add('closed');
    document.querySelector(`#${id} .ms-btn`)?.classList.remove('open');
    if (inst.onChange) inst.onChange([...inst.selected]);
  },

  getSelected(id) {
    return this.instances[id]?.selected || [];
  },

  update(id, options, selected) {
    const inst = this.instances[id];
    if (!inst) return;
    inst.options = options;
    inst.selected = selected ? [...selected] : [...options];
    this._render(inst);
  },
};

// ── 탭 전환 ────────────────────────────────────────────────────────────────────
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('hidden')) return;
  // 접혀있으면 먼저 펼치기
  if (el.classList.contains('collapsed')) {
    el.classList.remove('collapsed');
    const btn = el.querySelector('.collapse-btn');
    if (btn) btn.textContent = '−';
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // 스크롤 후 깜빡 효과
  setTimeout(() => {
    el.classList.remove('nav-flash');
    void el.offsetWidth; // reflow
    el.classList.add('nav-flash');
    setTimeout(() => el.classList.remove('nav-flash'), 1800);
  }, 450);
}

function switchTab(tab) {
  const cur  = document.querySelector('.tab-page:not(.hidden)');
  const next = document.getElementById('page-' + tab);
  if (cur === next) return;

  cur.classList.add('fading');
  document.getElementById('hdr-campaign').classList.toggle('hidden', tab === 'keyword');
  document.getElementById('hdr-keyword').classList.toggle('hidden',  tab === 'campaign');
  document.getElementById('tab-campaign').classList.toggle('active', tab === 'campaign');
  document.getElementById('tab-keyword').classList.toggle('active',  tab === 'keyword');

  setTimeout(() => {
    cur.classList.add('hidden');
    cur.classList.remove('fading');
    document.body.classList.toggle('kw-mode', tab === 'keyword');
    next.classList.remove('hidden');
    next.style.opacity = '0';
    requestAnimationFrame(() => {
      next.style.transition = 'opacity 0.35s ease';
      next.style.opacity = '1';
      setTimeout(() => { next.style.transition = ''; }, 360);
    });
  }, 320);
}

// ── KW STORE ───────────────────────────────────────────────────────────────────
const KWStore = {
  // raw: { keyword, media, route, device, daily: {'YYYY-MM-DD': {impr,clicks,cost,conv,revenue}} }
  raw: [], filtered: [],
  medias: [], routes: [], devices: [], allDates: [],
  activeMedias: [], activeRoutes: [], activeDevices: [],
  dateFrom: null, dateTo: null,
  sortKey: 'cost', sortDir: -1,
  search: '', page: 1, perPage: 50,

  load(rawMap) {
    this.raw = Object.values(rawMap);
    const dateSet = new Set();
    this.raw.forEach(r => Object.keys(r.daily||{}).forEach(d => dateSet.add(d)));
    this.allDates  = [...dateSet].sort();
    this.dateFrom  = this.allDates[0] || null;
    this.dateTo    = this.allDates[this.allDates.length-1] || null;
    this.medias    = [...new Set(this.raw.map(r=>r.media))].sort();
    this.routes    = [...new Set(this.raw.map(r=>r.route).filter(Boolean))].sort();
    this.devices   = [...new Set(this.raw.map(r=>r.device).filter(Boolean))].sort();
    this.activeMedias  = [...this.medias];
    this.activeRoutes  = [...this.routes];
    this.activeDevices = [...this.devices];
    this.applyFilter();
  },

  // 배포된 데이터(이미 집계된 rows 배열) 로드
  loadAggregated(rows, dateFrom, dateTo) {
    this._isAggregated = true;
    this.raw = rows;
    this.filtered = [...rows];
    this.allDates = [];
    this.dateFrom = dateFrom || null;
    this.dateTo   = dateTo   || null;
    this.medias  = [...new Set(rows.map(r=>r.media))].sort();
    this.routes  = [...new Set(rows.map(r=>r.route).filter(Boolean))].sort();
    this.devices = [...new Set(rows.map(r=>r.device).filter(Boolean))].sort();
    this.activeMedias  = [...this.medias];
    this.activeRoutes  = [...this.routes];
    this.activeDevices = [...this.devices];
    this.applyFilter();
  },

  _agg(r) {
    const tot = {impr:0, clicks:0, cost:0, conv:0, revenue:0};
    Object.entries(r.daily||{}).forEach(([d,v]) => {
      if ((!this.dateFrom || d >= this.dateFrom) && (!this.dateTo || d <= this.dateTo)) {
        tot.impr+=v.impr; tot.clicks+=v.clicks; tot.cost+=v.cost; tot.conv+=v.conv; tot.revenue+=v.revenue;
      }
    });
    tot.ctr  = tot.impr>0   ? tot.clicks/tot.impr*100 : 0;
    tot.cpc  = tot.clicks>0 ? tot.cost/tot.clicks     : 0;
    tot.cpa  = tot.conv>0   ? tot.cost/tot.conv        : 0;
    tot.roas = tot.cost>0   ? tot.revenue/tot.cost     : 0;
    return { keyword:r.keyword, media:r.media, route:r.route, device:r.device, ...tot };
  },

  applyFilter() {
    const q = this.search.toLowerCase();
    this.filtered = this.raw
      .filter(r =>
        this.activeMedias.includes(r.media) &&
        (this.activeRoutes.includes(r.route) || !r.route) &&
        this.activeDevices.includes(r.device) &&
        (!q || r.keyword.toLowerCase().includes(q))
      )
      .map(r => this._isAggregated ? r : this._agg(r))
      .filter(r => r.impr > 0 || r.cost > 0);
    this.filtered.sort((a,b) => {
      const av = a[this.sortKey]||0, bv = b[this.sortKey]||0;
      return (av > bv ? 1 : -1) * this.sortDir;
    });
    this.page = 1;
  },

  grade(r) {
    if (r.cost === 0) return 'none';
    if (r.conv === 0) return 'review';
    if (r.roas >= 3) return 'scale';
    if (r.roas >= 1) return 'watch';
    return 'review';
  },

  exportCSV() {
    const cols = ['키워드','매체','노선','디바이스','노출','클릭','CTR(%)','광고비','CPC','전환','CPA','전환매출','ROAS','등급'];
    const gradeLabel = { scale:'확장', watch:'유지', review:'점검', none:'-' };
    const rows = this.filtered.map(r => [
      r.keyword, r.media, r.route, r.device,
      r.impr, r.clicks, r.ctr.toFixed(2), Math.round(r.cost),
      Math.round(r.cpc), r.conv, Math.round(r.cpa), Math.round(r.revenue),
      r.roas.toFixed(2), gradeLabel[this.grade(r)]
    ]);
    const csv = '﻿' + [cols, ...rows].map(r=>r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
      download: 'keyword_report.csv',
    });
    a.click();
  },
};

// ── KW PARSER ──────────────────────────────────────────────────────────────────
const KWParser = {
  SHEET_MEDIA: { 'N_통합':'네이버', 'G_통합':'구글', 'K_통합':'카카오', 'D_통합':'당근' },

  load(file) {
    if (!file) return;
    KWUI.hideUpload();
    UI.showLoading('키워드 데이터 파싱 중... (대용량 파일, 잠시 기다려 주세요)');
    const reader = new FileReader();
    reader.onload = e => {
      setTimeout(() => {
        try {
          const wb = XLSX.read(e.target.result, { type:'array', cellDates:false });
          // key: `keyword__media__route__device`, value: { ..., daily: { date: {impr,clicks,cost,conv,revenue} } }
          const kwMap = {};
          const pn = v => (typeof v === 'number' ? v : parseFloat(String(v||'').replace(/,/g,''))||0);

          for (const [sheetName, mediaLabel] of Object.entries(this.SHEET_MEDIA)) {
            const ws = wb.Sheets[sheetName];
            if (!ws) continue;
            const all = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
            if (all.length < 2) continue;
            const header = all[0] || [];
            const col = {};
            header.forEach((n,i) => { col[String(n||'').trim()] = i; });
            if (col['키워드'] === undefined) continue;

            for (let i = 1; i < all.length; i++) {
              const r = all[i] || [];
              const kw = String(r[col['키워드']] || '').trim();
              if (!kw || kw === '합계' || kw === '필터구간') continue;
              const route  = String(r[col['노선명']]  || '').trim();
              const device = String(r[col['디바이스']] || '').trim();
              const dateRaw = r[col['일자']];
              const date = parseDate(dateRaw);
              const key = `${kw}__${mediaLabel}__${route}__${device}`;
              if (!kwMap[key]) kwMap[key] = { keyword:kw, media:mediaLabel, route, device, daily:{} };
              if (date) {
                if (!kwMap[key].daily[date]) kwMap[key].daily[date] = {impr:0,clicks:0,cost:0,conv:0,revenue:0};
                const d = kwMap[key].daily[date];
                d.impr    += pn(r[col['노출']]);
                d.clicks  += pn(r[col['클릭']]);
                d.cost    += pn(r[col['광고비']]);
                d.conv    += pn(r[col['총 전환']]);
                d.revenue += pn(r[col['총 전환매출']]);
              }
            }
          }

          if (!Object.keys(kwMap).length) { UI.hideLoading(); alert('키워드 데이터를 찾을 수 없습니다.'); return; }
          KWStore.load(kwMap);
          UI.hideLoading();
          KWUI.render();
          JBStorage.saveKeyword(file.name, kwMap);
          document.getElementById('btn-deploy').classList.remove('hidden');
          document.getElementById('btn-deploy-kw').classList.remove('hidden');
          document.getElementById('btn-reset-kw').classList.remove('hidden');
        } catch(err) {
          UI.hideLoading();
          alert('파싱 오류: ' + err.message);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
  },
};

// ── KW CHARTS ──────────────────────────────────────────────────────────────────
const KWCh = {
  c1: null, c2: null,
  c1Metric: 'cost', c2Metric: 'roas',
  MEDIA_BG: { '네이버':'#03c75a', '구글':'#4285f4', '카카오':'#f7c600', '당근':'#ff6f00' },

  kwOpts(xLabel) {
    return {
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins: { legend:{display:false}, tooltip:{intersect:false} },
      scales: {
        x: { ticks:{color:'#6b7280',font:{size:10}}, grid:{color:'#f3f4f6'} },
        y: { ticks:{color:'#374151',font:{size:10}}, grid:{display:false} },
      },
    };
  },

  renderAll() { this.renderTop(); this.renderRoas(); },

  renderTop() {
    const m = this.c1Metric;
    const top20 = [...KWStore.filtered].sort((a,b)=>(b[m]||0)-(a[m]||0)).slice(0,20);
    const labels = top20.map(r=>r.keyword.length>16?r.keyword.slice(0,16)+'…':r.keyword);
    const data   = top20.map(r=>r[m]||0);
    const bgs    = top20.map(r=>this.MEDIA_BG[r.media]||'#888');
    if (this.c1) this.c1.destroy();
    this.c1 = new Chart(document.getElementById('kw-c1'), {
      type:'bar',
      data:{ labels, datasets:[{ data, backgroundColor:bgs.map(c=>c+'bb'), borderColor:bgs, borderWidth:1, borderRadius:3 }] },
      options: this.kwOpts(),
    });
  },

  renderRoas() {
    const top20 = [...KWStore.filtered].filter(r=>r.roas>0&&r.conv>0).sort((a,b)=>b.roas-a.roas).slice(0,20);
    const labels = top20.map(r=>r.keyword.length>16?r.keyword.slice(0,16)+'…':r.keyword);
    const data   = top20.map(r=>parseFloat(r.roas.toFixed(2)));
    const bgs    = top20.map(r=>this.MEDIA_BG[r.media]||'#888');
    if (this.c2) this.c2.destroy();
    this.c2 = new Chart(document.getElementById('kw-c2'), {
      type:'bar',
      data:{ labels, datasets:[{ data, backgroundColor:bgs.map(c=>c+'bb'), borderColor:bgs, borderWidth:1, borderRadius:3 }] },
      options: this.kwOpts(),
    });
  },
};

// ── KW UI ──────────────────────────────────────────────────────────────────────
const KWUI = {
  render() {
    document.getElementById('kw-empty').classList.add('hidden');
    document.getElementById('kw-main').classList.remove('hidden');
    this.renderFilters();
    this.renderKPIs();
    this.renderConvKeywords();
    this.renderGrade();
    KWCh.renderAll();
    this.renderTable();
  },

  renderFilters() {
    const dates = KWStore.allDates || [];
    const minD = dates[0]||'', maxD = dates[dates.length-1]||'';
    const refresh = () => {
      const { from, to } = DP.getRange('dp-keyword');
      KWStore.dateFrom = from; KWStore.dateTo = to;
      KWStore.activeMedias  = MS.getSelected('ms-kw-media');
      KWStore.activeRoutes  = MS.getSelected('ms-kw-route');
      KWStore.activeDevices = MS.getSelected('ms-kw-device');
      KWStore.applyFilter();
      this._convShowCount = {};
      this.renderKPIs(); this.renderConvKeywords(); this.renderGrade(); KWCh.renderAll(); this.renderTable();
    };
    const MDOTS = { '네이버':'#03c75a','구글':'#4285f4','카카오':'#f7c600','당근':'#ff6f00' };
    const defFrom = '2026-04-28' >= minD && '2026-04-28' <= maxD ? '2026-04-28' : minD;
    const defTo   = '2026-04-29' >= minD && '2026-04-29' <= maxD ? '2026-04-29' : maxD;
    DP.create('dp-keyword', { minDate: minD, maxDate: maxD, from: defFrom, to: defTo, onChange: refresh });
    MS.create('ms-kw-media',  { label:'매체',   options: KWStore.medias,  dots: MDOTS,          onChange: refresh });
    MS.create('ms-kw-route',  { label:'노선',   options: KWStore.routes,                         onChange: refresh });
    MS.create('ms-kw-device', { label:'디바이스', options: KWStore.devices,                       onChange: refresh });

    // 초기 렌더 시 기본 날짜 범위를 즉시 필터에 반영
    KWStore.dateFrom = defFrom;
    KWStore.dateTo   = defTo;
    KWStore.activeMedias  = [...KWStore.medias];
    KWStore.activeRoutes  = [...KWStore.routes];
    KWStore.activeDevices = [...KWStore.devices];
    KWStore.applyFilter();
  },

  fmtW(v)  { return '₩' + Math.round(v).toLocaleString(); },
  fmtN(v)  { return Math.round(v).toLocaleString(); },
  fmtP(v)  { return v.toFixed(2) + '%'; },
  fmtR(v)  { return v.toFixed(2) + 'x'; },

  renderKPIs() {
    const rows = KWStore.filtered;
    const tot = rows.reduce((a,r)=>{ a.impr+=r.impr; a.clicks+=r.clicks; a.cost+=r.cost; a.conv+=r.conv; a.revenue+=r.revenue; return a; }, {impr:0,clicks:0,cost:0,conv:0,revenue:0});
    tot.ctr  = tot.impr   > 0 ? tot.clicks/tot.impr*100 : 0;
    tot.cpc  = tot.clicks > 0 ? tot.cost/tot.clicks : 0;
    tot.cpa  = tot.conv   > 0 ? tot.cost/tot.conv : 0;
    tot.roas = tot.cost   > 0 ? tot.revenue/tot.cost : 0;
    const active = rows.filter(r=>r.cost>0).length;
    const kpis = [
      { label:'총 키워드', value: this.fmtN(rows.length), sub:'개' },
      { label:'활성 키워드', value: this.fmtN(active), sub:'광고비 발생' },
      { label:'총 광고비', value: this.fmtW(tot.cost), sub:'' },
      { label:'총 클릭', value: this.fmtN(tot.clicks), sub:'CTR ' + this.fmtP(tot.ctr) },
      { label:'평균 CPC', value: this.fmtW(tot.cpc), sub:'' },
      { label:'총 전환', value: this.fmtN(tot.conv), sub:'CPA ' + this.fmtW(tot.cpa) },
      { label:'전환 매출', value: this.fmtW(tot.revenue), sub:'' },
      { label:'ROAS', value: this.fmtR(tot.roas), sub:'' },
    ];
    document.getElementById('kw-kpi-grid').innerHTML = kpis.map(k=>
      `<div class="kw-kpi"><div class="kw-kpi-label">${k.label}</div><div class="kw-kpi-value">${k.value}</div><div class="kw-kpi-sub">${k.sub}</div></div>`
    ).join('');
  },

  renderGrade() {
    const counts = { scale:0, watch:0, review:0 };
    KWStore.filtered.filter(r=>r.cost>0).forEach(r => { const g=KWStore.grade(r); if(counts[g]!==undefined) counts[g]++; });
    document.getElementById('kw-grade-bar').innerHTML = `
      <div class="grade-card scale"><div class="grade-num">${this.fmtN(counts.scale)}</div><div class="grade-label">🟢 확장 (ROAS ≥ 3)</div></div>
      <div class="grade-card watch"><div class="grade-num">${this.fmtN(counts.watch)}</div><div class="grade-label">🟡 유지 (ROAS 1~3)</div></div>
      <div class="grade-card review"><div class="grade-num">${this.fmtN(counts.review)}</div><div class="grade-label">🔴 점검 (전환 0 or ROAS &lt; 1)</div></div>
    `;
  },

  renderTable() {
    const s = KWStore.page, e = s * KWStore.perPage, rows = KWStore.filtered;
    const paged = rows.slice((s-1)*KWStore.perPage, e);
    const gradeInfo = { scale:['#16a34a','확장'], watch:['#d97706','유지'], review:['#dc2626','점검'], none:['#9ca3af','-'] };
    const mediaCls  = { '네이버':'naver','구글':'google','카카오':'kakao','당근':'daangn' };
    const cols = [
      { key:'keyword',label:'키워드',sort:false },
      { key:'media',  label:'매체',  sort:false },
      { key:'route',  label:'노선',  sort:false },
      { key:'impr',   label:'노출수' },
      { key:'clicks', label:'클릭' },
      { key:'ctr',    label:'CTR(%)' },
      { key:'cost',   label:'광고비' },
      { key:'cpc',    label:'CPC' },
      { key:'conv',   label:'전환' },
      { key:'cpa',    label:'CPA' },
      { key:'revenue',label:'전환매출' },
      { key:'roas',   label:'ROAS' },
      { key:'grade',  label:'등급', sort:false },
    ];

    document.getElementById('kw-thead').innerHTML = `<tr>${cols.map(c=>{
      const arrow = c.sort===false?'':KWStore.sortKey===c.key?(KWStore.sortDir===-1?' ↓':' ↑'):'';
      const onclick = c.sort===false?'':` onclick="KWUI.sort('${c.key}')" style="cursor:pointer;"`;
      return `<th${onclick}>${c.label}${arrow}</th>`;
    }).join('')}</tr>`;

    document.getElementById('kw-tbody').innerHTML = paged.map(r => {
      const g = KWStore.grade(r);
      const [gc, gl] = gradeInfo[g] || gradeInfo.none;
      const kw=r.keyword.replace(/'/g,"\\'"), rt=(r.route||'').replace(/'/g,"\\'");
      return `<tr class="kw-row-click" onclick="KWUI.showTrend('${kw}','${r.media}','${rt}','${r.device}')">
        <td>${r.keyword}</td>
        <td><span class="kw-media-tag ${mediaCls[r.media]||''}">${r.media}</span></td>
        <td>${r.route||'-'}</td>
        <td>${this.fmtN(r.impr)}</td>
        <td>${this.fmtN(r.clicks)}</td>
        <td>${this.fmtP(r.ctr)}</td>
        <td>${this.fmtW(r.cost)}</td>
        <td>${this.fmtW(r.cpc)}</td>
        <td>${this.fmtN(r.conv)}</td>
        <td>${r.conv>0?this.fmtW(r.cpa):'-'}</td>
        <td>${r.revenue>0?this.fmtW(r.revenue):'-'}</td>
        <td>${r.roas>0?this.fmtR(r.roas):'-'}</td>
        <td><span class="grade-dot" style="background:${gc}"></span>${gl}</td>
      </tr>`;
    }).join('');

    document.getElementById('kw-total-count').textContent = `총 ${this.fmtN(rows.length)}개`;

    // 페이지네이션
    const totalPages = Math.ceil(rows.length / KWStore.perPage);
    const cur = KWStore.page;
    let pages = [];
    if (totalPages <= 7) { for(let i=1;i<=totalPages;i++) pages.push(i); }
    else {
      pages = [1];
      if (cur > 3) pages.push('…');
      for (let i=Math.max(2,cur-1); i<=Math.min(totalPages-1,cur+1); i++) pages.push(i);
      if (cur < totalPages-2) pages.push('…');
      pages.push(totalPages);
    }
    document.getElementById('kw-pagination').innerHTML = pages.map(p=>
      p==='…' ? `<span style="padding:5px 4px;color:#9ca3af;">…</span>`
              : `<button class="pg-btn${p===cur?' active':''}" onclick="KWUI.goPage(${p})">${p}</button>`
    ).join('');
  },

  sort(key) {
    if (KWStore.sortKey === key) KWStore.sortDir *= -1;
    else { KWStore.sortKey = key; KWStore.sortDir = -1; }
    KWStore.applyFilter();
    this.renderTable();
  },

  goPage(p) { KWStore.page = p; this.renderTable(); document.getElementById('kw-main').scrollIntoView({behavior:'smooth'}); },

  search(q) { KWStore.search = q; KWStore.applyFilter(); this.renderKPIs(); this.renderGrade(); KWCh.renderAll(); this.renderTable(); },

  _convShowCount: {},
  _convAllRows: {},

  renderConvKeywords() {
    const card = document.getElementById('kw-conv-card');
    if (KWStore._isAggregated || !KWStore.allDates.length) { card.classList.add('hidden'); return; }

    const maxDate  = KWStore.allDates[KWStore.allDates.length - 1];
    const prevDate = KWStore.allDates.length >= 2 ? KWStore.allDates[KWStore.allDates.length - 2] : null;

    // 전일 데이터 맵
    const prevMap = {};
    if (prevDate) {
      KWStore.raw.forEach(r => {
        const d = r.daily?.[prevDate];
        if (!d) return;
        const key = `${r.keyword}__${r.media}__${r.route}__${r.device}`;
        prevMap[key] = {
          conv: d.conv,
          cpa:  d.conv>0 ? d.cost/d.conv    : 0,
          roas: d.cost>0 ? d.revenue/d.cost : 0,
        };
      });
    }
    this._convPrevMap  = prevMap;
    this._convPrevDate = prevDate;

    const allRows = [];
    KWStore.raw.forEach(r => {
      const d = r.daily?.[maxDate];
      if (!d || d.conv <= 0) return;
      allRows.push({
        keyword: r.keyword, media: r.media, route: r.route, device: r.device,
        impr: d.impr, clicks: d.clicks, cost: d.cost, conv: d.conv, revenue: d.revenue,
        ctr:  d.impr>0 ? d.clicks/d.impr*100 : 0,
        cpa:  d.conv>0 ? d.cost/d.conv       : 0,
        roas: d.cost>0 ? d.revenue/d.cost    : 0,
      });
    });
    allRows.sort((a, b) => b.conv - a.conv);
    if (!allRows.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');

    // 매체별 분류 (네이버/구글 우선, 나머지 추가)
    const MEDIA_ORDER = ['네이버','구글','카카오','당근'];
    const mediaGroups = {};
    allRows.forEach(r => {
      if (!mediaGroups[r.media]) mediaGroups[r.media] = [];
      mediaGroups[r.media].push(r);
    });
    const activeMedia = MEDIA_ORDER.filter(m => mediaGroups[m]?.length);
    this._convAllRows = mediaGroups;

    // showCount 초기화 (없는 매체만)
    activeMedia.forEach(m => { if (!this._convShowCount[m]) this._convShowCount[m] = 10; });

    // 요약 KPI
    const tot = allRows.reduce((a,r)=>({ conv:a.conv+r.conv, cost:a.cost+r.cost, revenue:a.revenue+r.revenue }), {conv:0,cost:0,revenue:0});
    const fw = (v, unit) => {
      const n = Math.round(v);
      if (unit==='₩') {
        if(n>=10000000) return '₩'+(n/10000000).toFixed(1)+'천만';
        if(n>=10000)    return '₩'+(n/10000).toFixed(0)+'만';
        return '₩'+n.toLocaleString();
      }
      if (unit==='x') return v.toFixed(2)+'x';
      return n.toLocaleString();
    };
    // 전일 서머리 계산
    const prevAllRows = [];
    if (prevDate) {
      KWStore.raw.forEach(r => {
        const d = r.daily?.[prevDate];
        if (!d || d.conv <= 0) return;
        prevAllRows.push({ cost: d.cost, conv: d.conv, revenue: d.revenue });
      });
    }
    const ptot = prevAllRows.reduce((a,r)=>({ conv:a.conv+r.conv, cost:a.cost+r.cost, revenue:a.revenue+r.revenue }), {conv:0,cost:0,revenue:0});

    const badge = (curr, prev, lowerBetter=false, useAbs=false) => {
      if (!prevDate || prev === 0) return '';
      const delta = curr - prev;
      if (Math.abs(delta/Math.max(prev,1)) < 0.005) return `<span class="mini-chg neu" style="display:block;margin-top:3px;">─ 변화없음</span>`;
      const good = lowerBetter ? delta < 0 : delta > 0;
      const cls = good ? 'pos' : 'neg';
      const arrow = delta > 0 ? '▲' : '▼';
      const display = useAbs
        ? Math.abs(Math.round(delta)).toLocaleString()
        : Math.abs(delta/prev*100).toFixed(1) + '%';
      return `<span class="mini-chg ${cls}" style="display:block;margin-top:3px;">${arrow} ${display}</span>`;
    };

    const avgCpa  = tot.conv>0  ? tot.cost/tot.conv    : 0;
    const avgRoas = tot.cost>0  ? tot.revenue/tot.cost : 0;
    const pAvgCpa  = ptot.conv>0  ? ptot.cost/ptot.conv    : 0;
    const pAvgRoas = ptot.cost>0  ? ptot.revenue/ptot.cost : 0;

    document.getElementById('kw-conv-title').innerHTML =
      `⚡ 전일 전환 키워드 <span style="font-size:11px;color:#9ca3af;font-weight:400;margin-left:6px;">${maxDate} 기준${prevDate?' (vs '+prevDate.slice(5)+')':''}</span>`;
    document.getElementById('kw-conv-count').textContent = `총 ${allRows.length}개 키워드`;
    document.getElementById('kw-conv-summary').innerHTML = [
      { label:'전환 키워드 수', value: allRows.length+'개',   b: badge(allRows.length, prevAllRows.length, false, true) },
      { label:'총 전환수',      value: fw(tot.conv,''),       b: badge(tot.conv, ptot.conv, false, true) },
      { label:'평균 CPA',       value: fw(avgCpa,'₩'),        b: badge(avgCpa, pAvgCpa, true) },
      { label:'평균 ROAS',      value: fw(avgRoas,'x'),       b: badge(avgRoas, pAvgRoas) },
    ].map(k=>`<div class="conv-kpi">
      <div class="conv-kpi-label">${k.label}</div>
      <div class="conv-kpi-value">${k.value}</div>
      ${k.b}
    </div>`).join('');

    // 매체별 컬럼 렌더
    const cols = Math.min(activeMedia.length, 2);
    document.getElementById('kw-conv-media-grid').style.gridTemplateColumns = `repeat(${cols},1fr)`;
    document.getElementById('kw-conv-media-grid').innerHTML = activeMedia.map(media =>
      this._renderConvMediaCol(media, mediaGroups[media])
    ).join('');
  },

  _renderConvMediaCol(media, rows) {
    const MEDIA_COLOR = { '네이버':'#03c75a','구글':'#4285f4','카카오':'#f7c600','당근':'#ff6f00' };
    const mediaCls   = { '네이버':'naver','구글':'google','카카오':'kakao','당근':'daangn' };
    const count = this._convShowCount[media] || 10;
    const visible = rows.slice(0, count);
    const hasMore = rows.length > count;
    const color = MEDIA_COLOR[media] || '#888';

    const prevMap = this._convPrevMap || {};
    const chg = (curr, prev, lowerBetter=false) => {
      if (prev === undefined || prev === null) return '';
      const delta = curr - prev;
      if (Math.abs(delta) < 0.001) return `<span class="mini-chg neu">─</span>`;
      const good = lowerBetter ? delta < 0 : delta > 0;
      const cls = good ? 'pos' : 'neg';
      const sign = delta > 0 ? '+' : '';
      const display = Math.abs(curr) < 100
        ? `${sign}${delta.toFixed(2)}`
        : `${sign}${Math.round(delta).toLocaleString()}`;
      return `<span class="mini-chg ${cls}">${sign}${display.replace(sign,'')}</span>`;
    };

    const tableRows = visible.map(r => {
      const kw = r.keyword.replace(/'/g,"\\'"), rt = (r.route||'').replace(/'/g,"\\'");
      return `<tr class="kw-row-click" onclick="KWUI.showTrend('${kw}','${r.media}','${rt}','${r.device}')">
        <td style="font-weight:600;color:#1a1d2e;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.keyword}</td>
        <td>${r.route||'-'}</td>
        <td>${r.device}</td>
        <td style="font-weight:700;color:#16a34a;">${Math.round(r.conv)}</td>
        <td>${r.cpa>0?'₩'+Math.round(r.cpa).toLocaleString():'-'}</td>
        <td>${r.roas>0?r.roas.toFixed(2)+'x':'-'}</td>
      </tr>`;
    }).join('');

    return `<div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${color}20;">
        <span class="kw-media-tag ${mediaCls[media]||''}" style="font-size:12px;padding:2px 10px;">${media}</span>
        <span style="font-size:12px;font-weight:700;color:#374151;">${rows.length}개 키워드</span>
      </div>
      <div class="kw-table-wrap">
        <table class="kw-table">
          <thead><tr>
            <th style="text-align:left;">키워드</th>
            <th style="text-align:left;">노선</th>
            <th style="text-align:left;">디바이스</th>
            <th>전환</th><th>CPA</th><th>ROAS</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${(hasMore || count > 10) ? `<div style="display:flex;gap:6px;justify-content:center;padding:10px 0 2px;">
        ${hasMore ? `<button class="btn btn-secondary btn-sm" onclick="KWUI.expandConv('${media}')">+ ${Math.min(10, rows.length-count)}개 더 보기</button>` : ''}
        ${count > 10 ? `<button class="btn btn-secondary btn-sm" onclick="KWUI.collapseConv('${media}')">▲ 접기</button>` : ''}
      </div>` : ''}
    </div>`;
  },

  expandConv(media) {
    this._convShowCount[media] = (this._convShowCount[media] || 10) + 10;
    this._redrawConvGrid();
  },

  collapseConv(media) {
    this._convShowCount[media] = 10;
    this._redrawConvGrid();
  },

  _redrawConvGrid() {
    const MEDIA_ORDER = ['네이버','구글','카카오','당근'];
    const activeMedia = MEDIA_ORDER.filter(m => this._convAllRows[m]?.length);
    document.getElementById('kw-conv-media-grid').innerHTML =
      activeMedia.map(m => this._renderConvMediaCol(m, this._convAllRows[m])).join('');
  },

  exportCSV() { KWStore.exportCSV(); },
  showUpload() { document.getElementById('kw-m-upload').classList.remove('hidden'); },
  hideUpload() { document.getElementById('kw-m-upload').classList.add('hidden'); document.getElementById('kw-file').value=''; },

  _trendChart: null,
  _trendMetric: 'cost',

  showTrend(keyword, media, route, device) {
    const entry = KWStore.raw.find(r => r.keyword===keyword && r.media===media && r.route===route && r.device===device);
    const modal = document.getElementById('kw-trend-modal');
    const canvas = document.getElementById('kw-trend-canvas');
    const noData = document.getElementById('kw-trend-no-data');
    document.getElementById('kw-trend-title').textContent = `📈 ${keyword} · ${media} · ${device}${route?' · '+route:''}`;
    modal.classList.remove('hidden');

    if (!entry?.daily || Object.keys(entry.daily).length === 0) {
      canvas.classList.add('hidden'); noData.classList.remove('hidden'); return;
    }
    canvas.classList.remove('hidden'); noData.classList.add('hidden');

    this._trendEntry = entry;
    this._trendMetric = 'cost';
    this._renderTrendChart();

    const TMETS = [
      {k:'cost',l:'광고비'},{k:'clicks',l:'클릭수'},{k:'conv',l:'전환수'},{k:'roas',l:'ROAS'},{k:'ctr',l:'CTR'}
    ];
    document.getElementById('kw-trend-tabs').innerHTML = TMETS.map(t =>
      `<button class="kw-ttab${t.k==='cost'?' on':''}" onclick="KWUI._setTrendMetric('${t.k}',this)">${t.l}</button>`
    ).join('');
  },

  _setTrendMetric(m, btn) {
    this._trendMetric = m;
    document.querySelectorAll('#kw-trend-tabs .kw-ttab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    this._renderTrendChart();
  },

  _renderTrendChart() {
    const entry = this._trendEntry;
    if (!entry) return;
    const m = this._trendMetric;
    const dates = Object.keys(entry.daily).sort();
    const data = dates.map(d => {
      const v = entry.daily[d];
      if (m === 'roas') return v.cost > 0 ? parseFloat((v.revenue/v.cost).toFixed(2)) : 0;
      if (m === 'ctr')  return v.impr > 0  ? parseFloat((v.clicks/v.impr*100).toFixed(2)) : 0;
      return v[m] || 0;
    });
    const MLABELS = {cost:'광고비',clicks:'클릭수',conv:'전환수',roas:'ROAS',ctr:'CTR(%)'};
    if (this._trendChart) this._trendChart.destroy();
    this._trendChart = new Chart(document.getElementById('kw-trend-canvas'), {
      type: 'line',
      data: { labels: dates.map(d=>d.slice(5)), datasets: [{
        label: MLABELS[m]||m, data,
        borderColor: '#3a7fd4', backgroundColor: '#3a7fd418',
        tension: 0.3, fill: true, pointRadius: dates.length > 30 ? 0 : 3, borderWidth: 2,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode:'index', intersect:false } },
        scales: {
          x: { ticks: { color:'#6b7280', font:{size:10}, maxTicksLimit:16 }, grid: { color:'#f3f4f6' } },
          y: { ticks: { color:'#6b7280', font:{size:10} }, grid: { color:'#f3f4f6' } },
        },
      },
    });
  },

  closeTrend() {
    document.getElementById('kw-trend-modal').classList.add('hidden');
    if (this._trendChart) { this._trendChart.destroy(); this._trendChart = null; }
    this._trendEntry = null;
  },
};

// ── 로컬 저장소 (자동 저장 / 복원) ────────────────────────────────────────────
const JBStorage = {
  C_KEY: 'jb_v2_campaign',
  _db: null,

  // 캠페인: localStorage
  saveCampaign(fileName, rows) {
    try {
      localStorage.setItem(this.C_KEY, JSON.stringify({ fileName, savedAt: Date.now(), rows }));
      this._showSaved(fileName);
    } catch(e) {
      console.warn('캠페인 자동저장 실패 (용량 초과):', e.message);
    }
  },

  loadCampaign() {
    try { const s = localStorage.getItem(this.C_KEY); return s ? JSON.parse(s) : null; }
    catch(e) { return null; }
  },

  _showSaved(fileName) {
    const text = '● 자동저장됨';
    const el = document.getElementById('saved-info');
    if (el) el.textContent = text;
    const elKw = document.getElementById('kw-saved-info');
    if (elKw) elKw.textContent = text;
    document.getElementById('btn-reset')?.classList.remove('hidden');
  },

  // 키워드: IndexedDB (용량 크기 때문에)
  async _getDB() {
    if (this._db) return this._db;
    return new Promise(res => {
      const req = indexedDB.open('jemboard_kw', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('kw', { keyPath: 'id' });
      req.onsuccess = e => { this._db = e.target.result; res(this._db); };
      req.onerror = () => res(null);
    });
  },

  async saveKeyword(fileName, kwMap) {
    try {
      const db = await this._getDB();
      if (!db) return;
      const tx = db.transaction('kw', 'readwrite');
      const store = tx.objectStore('kw');
      store.clear();
      store.put({ id: '__meta__', fileName, savedAt: Date.now() });
      for (const [id, e] of Object.entries(kwMap)) {
        store.put({ id, keyword: e.keyword, media: e.media, route: e.route, device: e.device, daily: e.daily });
      }
      await new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
    } catch(e) { console.warn('키워드 자동저장 실패:', e.message); }
  },

  async loadKeyword() {
    try {
      const db = await this._getDB();
      if (!db) return null;
      const all = await new Promise(res => {
        const req = db.transaction('kw', 'readonly').objectStore('kw').getAll();
        req.onsuccess = e => res(e.target.result);
        req.onerror = () => res([]);
      });
      const meta = all.find(x => x.id === '__meta__');
      const kwMap = {};
      all.filter(x => x.id !== '__meta__').forEach(({ id, keyword, media, route, device, daily }) => {
        kwMap[id] = { keyword, media, route, device, daily };
      });
      return Object.keys(kwMap).length ? { fileName: meta?.fileName, kwMap } : null;
    } catch(e) { return null; }
  },

  async clearAll() {
    localStorage.removeItem(this.C_KEY);
    try {
      const db = await this._getDB();
      if (db) {
        const tx = db.transaction('kw', 'readwrite');
        tx.objectStore('kw').clear();
        await new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
      }
    } catch(e) {}
    location.reload();
  },

  async restoreAll() {
    const c = this.loadCampaign();
    if (c?.rows?.length) {
      Store.load(c.rows);
      document.getElementById('fname').textContent = ' — ' + c.fileName;
      UI.render();
      this._showSaved(c.fileName);
    }
    const k = await this.loadKeyword();
    if (k?.kwMap) {
      KWStore.load(k.kwMap);
      KWUI.render();
    }
  },
};

// ── 리포트 코멘트 ─────────────────────────────────────────────────────────────
const Notes = {
  KEY: 'jb_comments',
  _editDate: null,

  _load() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
    catch(e) { return {}; }
  },

  _save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },

  setReport(text) {
    const d = this._load();
    d.report = text;
    this._save(d);
  },

  setDaily(date, text) {
    const d = this._load();
    if (!d.daily) d.daily = {};
    if (text.trim()) d.daily[date] = text;
    else delete d.daily[date];
    this._save(d);
  },

  getReport()       { return this._load().report || ''; },
  getDaily(date)    { return (this._load().daily || {})[date] || ''; },
  getAllDaily()      { return this._load().daily || {}; },
  getData()         { return this._load(); },

  onReportInput(el) {
    this.setReport(el.value);
    const counter = document.getElementById('notes-char-count');
    if (counter) counter.textContent = el.value.length + '자';
  },

  initEditor() {
    const el = document.getElementById('notes-report-editor');
    if (!el) return;
    const text = this.getReport();
    el.value = text;
    const counter = document.getElementById('notes-char-count');
    if (counter) counter.textContent = text.length + '자';
    document.getElementById('card-notes')?.classList.remove('hidden');
  },

  openModal(date) {
    this._editDate = date;
    document.getElementById('note-modal-date').textContent = date;
    document.getElementById('note-modal-ta').value = this.getDaily(date);
    document.getElementById('m-note').classList.remove('hidden');
    setTimeout(() => document.getElementById('note-modal-ta').focus(), 80);
  },

  saveModal() {
    const text = document.getElementById('note-modal-ta').value;
    this.setDaily(this._editDate, text);
    document.getElementById('m-note').classList.add('hidden');
    UI.renderTable();
  },

  deleteModal() {
    this.setDaily(this._editDate, '');
    document.getElementById('m-note').classList.add('hidden');
    UI.renderTable();
  },

  closeModal() { document.getElementById('m-note').classList.add('hidden'); },

  exportText() {
    const d = this._load();
    const report = d.report?.trim() || '(작성된 총평 없음)';
    const daily = d.daily || {};
    let text = `=== 리포트 총평 ===\n${report}\n`;
    const entries = Object.entries(daily).sort(([a],[b]) => a > b ? 1 : -1);
    if (entries.length) {
      text += `\n=== 일별 메모 (${entries.length}건) ===\n`;
      entries.forEach(([date, note]) => { text += `[${date}] ${note}\n`; });
    }
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' })),
      download: `jemboard_notes_${new Date().toISOString().slice(0,10)}.txt`,
    });
    a.click();
  },
};

// ── GitHub 배포 ────────────────────────────────────────────────────────────────
const Deployer = {
  OWNER: 'jjjam6237',
  REPO:  'jemboard',
  PAT_KEY: 'jb_admin_pat',

  open() {
    const stored = localStorage.getItem(this.PAT_KEY);
    const input = document.getElementById('deploy-pat-input');
    if (stored) input.value = stored;
    document.getElementById('m-deploy').classList.remove('hidden');
    document.getElementById('deploy-progress').classList.add('hidden');
    document.getElementById('deploy-actions').classList.remove('hidden');
    document.getElementById('deploy-pat-section').classList.remove('hidden');
  },

  close() { document.getElementById('m-deploy').classList.add('hidden'); },

  async deploy() {
    const pat = document.getElementById('deploy-pat-input').value.trim();
    if (!pat) { alert('토큰을 입력해주세요.'); return; }
    if (document.getElementById('deploy-remember').checked) {
      localStorage.setItem(this.PAT_KEY, pat);
    }

    document.getElementById('deploy-actions').classList.add('hidden');
    document.getElementById('deploy-pat-section').classList.add('hidden');
    document.getElementById('deploy-progress').classList.remove('hidden');
    const setMsg = t => { document.getElementById('deploy-progress-text').textContent = t; };

    try {
      const files = [];

      // 캠페인 데이터
      if (Store.raw?.length) {
        setMsg('캠페인 데이터 준비 중...');
        const fname = document.getElementById('fname').textContent.replace(/^ — /, '').trim();
        files.push({
          path: 'data.json',
          content: JSON.stringify({ fileName: fname, updatedAt: new Date().toISOString(), rows: Store.raw, targets: JSON.parse(localStorage.getItem('jb_targets')||'{}'), notes: Notes.getData() })
        });
      }

      // 키워드 데이터 (현재 기간으로 집계)
      if (KWStore.raw?.length) {
        setMsg('키워드 데이터 준비 중...');
        const kwRows = KWStore.raw
          .map(r => KWStore._agg(r))
          .filter(r => r.impr > 0 || r.cost > 0);
        files.push({
          path: 'kw_data.json',
          content: JSON.stringify({ dateFrom: KWStore.dateFrom, dateTo: KWStore.dateTo, rows: kwRows })
        });
      }

      if (!files.length) { alert('배포할 데이터가 없습니다.'); this.close(); return; }

      setMsg('GitHub에 연결 중...');
      await this._gitPush(pat, files, setMsg);

      setMsg('배포 완료!');
      setTimeout(() => {
        this.close();
        alert('배포 완료! 1~2분 후 URL에 반영됩니다.\nhttps://' + this.OWNER + '.github.io/' + this.REPO + '/');
      }, 800);
    } catch(err) {
      document.getElementById('deploy-actions').classList.remove('hidden');
      document.getElementById('deploy-pat-section').classList.remove('hidden');
      document.getElementById('deploy-progress').classList.add('hidden');
      alert('배포 실패: ' + err.message + '\n토큰 권한(repo)을 확인해주세요.');
    }
  },

  async _gitPush(pat, files, setMsg) {
    const base = `https://api.github.com/repos/${this.OWNER}/${this.REPO}`;
    const h = { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };

    // 1. blob 생성
    setMsg('데이터 업로드 중...');
    const blobs = await Promise.all(files.map(async f => {
      const res = await fetch(`${base}/git/blobs`, { method:'POST', headers:h,
        body: JSON.stringify({ content: f.content, encoding: 'utf-8' }) });
      if (!res.ok) throw new Error('blob 생성 실패: ' + res.status);
      const d = await res.json();
      return { path: f.path, sha: d.sha, mode: '100644', type: 'blob' };
    }));

    // 2. 현재 커밋 SHA
    const refRes = await fetch(`${base}/git/refs/heads/main`, { headers: h });
    if (!refRes.ok) throw new Error('브랜치 정보 조회 실패: ' + refRes.status);
    const refData = await refRes.json();
    const commitSha = refData.object.sha;

    // 3. 트리 SHA
    const commitRes = await fetch(`${base}/git/commits/${commitSha}`, { headers: h });
    const commitData = await commitRes.json();

    // 4. 새 트리
    setMsg('커밋 생성 중...');
    const treeRes = await fetch(`${base}/git/trees`, { method:'POST', headers:h,
      body: JSON.stringify({ base_tree: commitData.tree.sha, tree: blobs }) });
    if (!treeRes.ok) throw new Error('트리 생성 실패: ' + treeRes.status);
    const treeData = await treeRes.json();

    // 5. 커밋
    const newCommitRes = await fetch(`${base}/git/commits`, { method:'POST', headers:h,
      body: JSON.stringify({ message: `데이터 업데이트: ${new Date().toLocaleString('ko-KR')}`, tree: treeData.sha, parents: [commitSha] }) });
    if (!newCommitRes.ok) throw new Error('커밋 생성 실패: ' + newCommitRes.status);
    const newCommitData = await newCommitRes.json();

    // 6. ref 업데이트
    const updateRes = await fetch(`${base}/git/refs/heads/main`, { method:'PATCH', headers:h,
      body: JSON.stringify({ sha: newCommitData.sha }) });
    if (!updateRes.ok) throw new Error('브랜치 업데이트 실패: ' + updateRes.status);
  },
};

// ── 초기 데이터 로드 (GitHub → localStorage 순) ────────────────────────────────
async function initDashboard() {
  const RAW = `https://raw.githubusercontent.com/${Deployer.OWNER}/${Deployer.REPO}/main`;
  let campaignLoaded = false, kwLoaded = false;

  // 1. GitHub에서 캠페인 데이터
  try {
    const res = await fetch(`${RAW}/data.json?t=${Date.now()}`);
    if (res.ok) {
      const { fileName, updatedAt, rows, targets, notes } = await res.json();
        if (targets && Object.keys(targets).length) {
          if (!localStorage.getItem('jb_targets')) {
            localStorage.setItem('jb_targets', JSON.stringify(targets));
          }
        }
        if (notes && !localStorage.getItem(Notes.KEY)) {
          localStorage.setItem(Notes.KEY, JSON.stringify(notes));
        }
      if (rows?.length) {
        Store.load(rows);
        document.getElementById('fname').textContent = ' — ' + fileName;
        const d = new Date(updatedAt);
        document.getElementById('data-range').textContent =
          `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} 배포`;
        UI.render();
        // 배포/초기화 버튼 활성화 (잠금 해제 시 보임)
        ['btn-deploy','btn-deploy-kw','btn-reset','btn-reset-kw'].forEach(id =>
          document.getElementById(id)?.classList.remove('hidden'));
        campaignLoaded = true;
      }
    }
  } catch(e) {}

  // 2. GitHub에서 키워드 데이터
  try {
    const res = await fetch(`${RAW}/kw_data.json?t=${Date.now()}`);
    if (res.ok) {
      const { dateFrom, dateTo, rows } = await res.json();
      if (rows?.length) {
        KWStore.loadAggregated(rows, dateFrom, dateTo);
        KWUI.render();
        kwLoaded = true;
      }
    }
  } catch(e) {}

  // 3. 없으면 localStorage 폴백 (관리자 로컬용)
  if (!campaignLoaded) {
    const c = JBStorage.loadCampaign();
    if (c?.rows?.length) {
      Store.load(c.rows);
      document.getElementById('fname').textContent = ' — ' + c.fileName;
      UI.render();
      JBStorage._showSaved(c.fileName);
      document.getElementById('btn-deploy').classList.remove('hidden');
      document.getElementById('btn-deploy-kw').classList.remove('hidden');
      document.getElementById('btn-reset-kw').classList.remove('hidden');
      campaignLoaded = true;
    }
  }
  if (!kwLoaded) {
    const k = await JBStorage.loadKeyword();
    if (k?.kwMap) { KWStore.load(k.kwMap); KWUI.render(); }
  }
}

const SOURCE_LABELS = {
  wanted:   '원티드',
  saramin:  '사람인',
  jobkorea: '잡코리아',
  incruit:  '인크루트',
  linkedin: '링크드인',
  jumpit:   '점핏',
  remember: '리멤버',
  direct:   '직접 접속',
};

async function trackPageView() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref') || 'direct';
    const ns = 'jemboard-jjjam6237';

    const [totalRes] = await Promise.all([
      fetch(`https://api.counterapi.dev/v1/${ns}/visits/up`),
      fetch(`https://api.counterapi.dev/v1/${ns}-${ref}/visits/up`),
    ]);
    if (!totalRes.ok) return;
    const { count } = await totalRes.json();
    const textEl = document.getElementById('view-count-text');
    if (textEl && count) textEl.textContent = '👁 ' + Number(count).toLocaleString() + ' views';

    const vcEl = document.getElementById('view-count');
    if (vcEl) {
      vcEl.style.cursor = 'pointer';
      vcEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = document.getElementById('view-stats-popup');
        if (!popup) return;
        const isOpen = popup.style.display !== 'none';
        popup.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) fetchSourceStats();
      });
      document.addEventListener('click', () => {
        const popup = document.getElementById('view-stats-popup');
        if (popup) popup.style.display = 'none';
      });
    }
  } catch(e) { /* silent fail */ }
}

async function fetchSourceStats() {
  const listEl = document.getElementById('view-stats-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:var(--muted);font-size:11px;">불러오는 중...</div>';

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/jjjam6237/jemboard/main/visitor_stats.json?t=${Date.now()}`
    );
    if (!res.ok) throw new Error();
    const stats = await res.json();

    const rows = Object.keys(SOURCE_LABELS)
      .map(src => ({ src, count: stats[src] || 0 }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count);

    if (!rows.length) {
      listEl.innerHTML = '<div style="color:var(--muted);font-size:11px;">아직 출처별 데이터 없음</div>';
      return;
    }
    listEl.innerHTML = rows.map(r =>
      `<div style="display:flex;justify-content:space-between;gap:24px;font-size:12px;padding:2px 0;color:var(--text);">
        <span>${SOURCE_LABELS[r.src] || r.src}</span>
        <span style="color:var(--accent);font-weight:600;">${Number(r.count).toLocaleString()}</span>
      </div>`
    ).join('');
  } catch(e) {
    listEl.innerHTML = '<div style="color:var(--muted);font-size:11px;">통계를 불러올 수 없음</div>';
  }
}

initDashboard();
trackPageView();
