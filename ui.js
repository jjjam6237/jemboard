// ── 차원 상태 ──────────────────────────────────────────────────────────────────
const _dimIcons  = { media:'📡', device:'📱', route:'🗺️', campaign:'🏷️', weekday:'📅', routeDetail:'🔖' };
const _dimLabels = { media:'매체', device:'디바이스', route:'분류', campaign:'캠페인', weekday:'요일', routeDetail:'분류상세' };

const DimState = {
  available: [],
  active: [],
  _metrics: {},

  detect() {
    const preferred = ['media', 'device', 'route', 'campaign', 'weekday', 'routeDetail'];
    this.available = preferred.filter(f => (Store.dims[f]?.length || 0) >= 1);
    // 새 파일 로드 시 사라진 차원 제거
    this.active = this.active.filter(f => this.available.includes(f));
    if (!this.active.length) {
      const defaults = ['media', 'device', 'route'].filter(f => this.available.includes(f));
      this.active = defaults.length ? defaults : this.available.slice(0, 3);
      this.active.forEach(f => { if (!this._metrics[f]) this._metrics[f] = 'cost'; });
    }
  },

  add(field) {
    if (!this.active.includes(field)) {
      this.active.push(field);
      if (!this._metrics[field]) this._metrics[field] = 'cost';
    }
    UI._renderDimFilters();
    CH.renderDims();
  },

  remove(field) {
    this.active = this.active.filter(f => f !== field);
    UI._renderDimFilters();
    UI.applyFilter();
  },

  getMsId(field)   { return `ms-dim-${field}`; },
  getCardId(field) { return `card-dim-${field}`; },
  getTabsId(field) { return `dim-tabs-${field}`; },
  getLabel(field)  { return _dimLabels[field] || field; },

  getFilters() {
    const out = {};
    this.active.forEach(f => {
      const sel = MS.getSelected(this.getMsId(f));
      if (sel?.length) out[f] = sel;
    });
    return out;
  },

  getMetric(field)    { return this._metrics[field] || 'cost'; },
  setMetric(field, m) {
    this._metrics[field] = m;
    document.querySelectorAll(`#${this.getTabsId(field)} .mtab`).forEach(t => {
      t.classList.toggle('on', t.textContent === (METRICS[m]?.label || m));
    });
    CH.renderDim(field);
  },
};

// ── CHARTS ────────────────────────────────────────────────────────────────────
const CH = {
  trend: null, dod: null, dimCharts: {},
  trendMetric: 'cost', dodMetric: 'cost',

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

  // 운영 일지 메모가 있는 날짜에 세로 점선 마커를 그리는 afterDraw 플러그인.
  // dateArr는 이 차트가 실제로 쓰는 날짜 배열(x축 인덱스와 1:1 대응)이어야 함 —
  // c-dod는 bd.slice(-15)만 쓰므로 bd 전체를 넘기면 인덱스가 어긋난다.
  noteMarkerPlugin(dateArr) {
    return {
      id: 'noteMarkers',
      afterDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales } = chart;
        dateArr.forEach((r, idx) => {
          if (!Notes.getDaily(r.date).text) return;
          const px = scales.x.getPixelForValue(idx);
          ctx.save();
          ctx.strokeStyle = '#f39c1290';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#f39c12';
          ctx.beginPath(); ctx.arc(px, top + 4, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
      },
    };
  },

  // 메모/태그를 Chart.js 기본 tooltip.callbacks.afterBody에 그대로 꽂는 헬퍼.
  noteTooltipAfterBody(dateArr) {
    return (items) => {
      const r = dateArr[items[0]?.dataIndex];
      const note = r && Notes.getDaily(r.date);
      if (!note?.text) return [];
      return [`📝 ${note.tag ? '[' + note.tag + '] ' : ''}${note.text}`];
    };
  },

  renderAll() {
    const bd = Store.byDate();
    this.renderTrend(bd);
    this.renderDims();
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
      plugins: [this.noteMarkerPlugin(bd)],
      options: this.co({ plugins: {
        legend: { labels: { color: '#8b90a0', font:{size:11}, boxWidth:10 } },
        tooltip: { mode:'index', intersect:false, callbacks: { afterBody: this.noteTooltipAfterBody(bd) } },
      } }),
    });
  },

  renderDims() {
    const container = document.getElementById('dim-charts');
    const navEl = document.getElementById('dim-nav');
    if (!container) return;
    if (navEl) {
      navEl.innerHTML = DimState.active.map(f =>
        `<div class="nav-item" onclick="scrollToSection('${DimState.getCardId(f)}')"><span class="nav-dot"></span>${DimState.getLabel(f)}별 성과</div>`
      ).join('');
    }
    Object.values(this.dimCharts).forEach(c => c?.destroy());
    this.dimCharts = {};
    const mainMetrics = ['cost','impr','clicks','conv','revenue','ctr','cpc','cpa','roas'];
    const tabHtml = (field) => mainMetrics.map(m =>
      `<span class="mtab${m===DimState.getMetric(field)?' on':''}" onclick="DimState.setMetric('${field}','${m}')">${METRICS[m]?.label||m}</span>`
    ).join('');
    container.innerHTML = DimState.active.map(f => {
      const nVals = Store.dims[f]?.length || 0;
      return `<div class="chart-card collapsible" id="${DimState.getCardId(f)}">
        <div class="card-title-row">
          <div class="title-left">${_dimIcons[f]||'📊'} ${DimState.getLabel(f)}별 성과</div>
          <div class="title-right">
            <div class="metric-tabs" id="${DimState.getTabsId(f)}">${tabHtml(f)}</div>
            <button class="collapse-btn" onclick="UI.toggleCard('${DimState.getCardId(f)}')">−</button>
          </div>
        </div>
        <div class="chart-body"><div class="chart-box${nVals<=6?' tall':''}"><canvas id="c-dim-${f}"></canvas></div></div>
      </div>`;
    }).join('');
    DimState.active.forEach(f => this.renderDim(f));
  },

  renderDim(field) {
    const m = DimState.getMetric(field);
    const vals = Store.dims[field] || [];
    const canvasEl = document.getElementById(`c-dim-${field}`);
    if (!canvasEl) return;
    if (this.dimCharts[field]) { this.dimCharts[field].destroy(); delete this.dimCharts[field]; }
    if (vals.length <= 6) {
      const all = Store.byDateDim(field);
      const dates = [...new Set(all.map(r => r.date))].sort().slice(-14);
      const byKey = {};
      all.forEach(r => { byKey[`${r.date}__${r[field]}`] = r; });
      const datasets = vals.map(v => ({
        label: v,
        data: dates.map(d => byKey[`${d}__${v}`]?.[m] || 0),
        backgroundColor: getDimColor(v) + 'aa',
        borderColor: getDimColor(v),
        borderWidth: 1, borderRadius: 3,
      }));
      this.dimCharts[field] = new Chart(canvasEl, {
        type: 'bar',
        data: { labels: dates.map(d => d.slice(5)), datasets },
        options: this.co({ plugins: { legend:{labels:{color:'#8b90a0',font:{size:10},boxWidth:10}}, tooltip:{mode:'index',intersect:false} } }),
      });
    } else {
      const agg = Store.byDim(field).sort((a,b) => (b[m]||0)-(a[m]||0));
      const labels = agg.map(r => r[field]);
      const data   = agg.map(r => r[m] || 0);
      this.dimCharts[field] = new Chart(canvasEl, {
        type: 'bar',
        data: { labels, datasets: [{ label: METRICS[m]?.label||m, data, backgroundColor: labels.map(l => getDimColor(l)+'cc'), borderWidth:0, borderRadius:4 }] },
        options: this.co({
          indexAxis: 'y',
          plugins: { legend:{display:false}, tooltip:{intersect:false} },
          scales: {
            x: { ticks:{color:'#8b90a0',font:{size:10}}, grid:{color:'#2a2d3e'} },
            y: { ticks:{color:'#8b90a0',font:{size:10}}, grid:{display:false} },
          },
        }),
      });
    }
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
    // 위 루프가 i=1부터 시작해 recent[0]을 건너뛰므로, x축 인덱스는 recent가 아니라 recent.slice(1)과 대응한다.
    const plotDates = recent.slice(1);
    if (this.dod) this.dod.destroy();
    this.dod = new Chart(document.getElementById('c-dod'), {
      type: 'bar',
      data: { labels, datasets:[{ label:'변화율(%)', data:changes,
        backgroundColor:changes.map(v=>v>=0?'#2ecc7188':'#e74c3c88'),
        borderColor:changes.map(v=>v>=0?'#2ecc71':'#e74c3c'),
        borderWidth:1, borderRadius:3 }] },
      plugins: [this.noteMarkerPlugin(plotDates)],
      options: this.co({
        plugins:{legend:{display:false},tooltip:{callbacks:{
          label:ctx=>ctx.parsed.y.toFixed(1)+'%',
          afterBody:this.noteTooltipAfterBody(plotDates),
        }}},
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
        roas_dn:  '매출 효율이 낮은 키워드·캠페인을 점검하고, 고효율 영역에 예산을 집중하세요.',
        cpa_up:   '① 저성과 키워드 입찰가 하향 → ② 전환율 낮은 소재 교체 → ③ 경쟁사 광고 집행 현황 확인 순으로 대응하세요.',
        ctr_dn:   '광고 소재에 핵심 혜택을 직접 명시하고, 키워드 매칭 타입을 확장→구문→일치 순으로 좁혀 광고 노출 품질을 높이세요.',
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
          text: `최근 7일 평균 CTR <strong>${L7.ctr.toFixed(2)}%</strong> — 검색광고 평균(2~3%) 대비 낮습니다.<br>${this.a('광고 소재에 핵심 혜택을 직접 명시하고, 키워드 매칭 타입을 확장→구문→일치 순으로 좁혀 광고 노출 품질을 높이세요. 낮은 CTR 키워드는 QS(품질지수) 하락으로 CPC 상승을 유발합니다.')}` });
      } else if (L7.ctr >= 4) {
        out.push({ type:'pos', icon:'🎯',
          text: `최근 7일 평균 CTR <strong>${L7.ctr.toFixed(2)}%</strong> — 높은 클릭률을 기록 중입니다.<br>${this.a('CTR이 높을 때 CVR(전환율)도 함께 확인하세요. CTR 대비 CVR이 낮다면 랜딩 페이지와 키워드 의도가 불일치할 수 있습니다.')}` });
      }
    }

    // ③ CVR(전환율) 진단
    if (L7.cvr > 0 && L7.cvr < 1.5) {
      out.push({ type:'warn', icon:'🔄',
        text: `최근 7일 평균 CVR <strong>${L7.cvr.toFixed(2)}%</strong> — 클릭 대비 전환 효율이 낮습니다.<br>${this.a('① 랜딩 페이지 로딩 속도(3초 초과 시 이탈률 급증) → ② CTA 버튼 가시성 → ③ 검색 키워드와 랜딩 페이지 내용 일치 여부를 순서대로 점검하세요. 모바일 CVR이 특히 낮다면 모바일 UX 최적화가 시급합니다.')}` });
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

    // ⑤ 세그먼트별 효율 — 데이터에 있는 첫 번째 카테고리 차원 사용
    const segField = ['route', 'campaign', 'routeDetail', 'weekday'].find(f => (Store.dims[f]?.length || 0) >= 2);
    if (segField) {
      const rr = Store.byDim(segField).filter(r => r.cost > 0);
      if (rr.length >= 2) {
        rr.sort((a,b) => b.roas - a.roas);
        const top=rr[0], bot=rr[rr.length-1];
        const segLabel = FIELD_SCHEMA[segField]?.label || segField;
        out.push({ type:'neu', icon:'🗺️',
          text: `${segLabel} ROAS 최고 <strong>${top[segField]}</strong> ${fmt('roas',top.roas)} / 최저 <strong>${bot[segField]}</strong> ${fmt('roas',bot.roas>0?bot.roas:0)}<br>${this.a(`${top[segField]}에 입찰가 상향 또는 예산 추가 배분을 검토하세요. ${bot[segField]}은 전환 데이터가 충분하면 키워드 정리·CPC 하향을 진행하고, 미만이면 관찰 기간을 연장한 후 판단하세요.`)}` });
      }
    }

    // ⑥ 디바이스 CPA 격차 — 데이터에 있는 모든 디바이스 비교
    if ((Store.dims.device?.length || 0) >= 2) {
      const devAgg = {};
      Store.filtered.forEach(r => {
        if (!r.device) return;
        if (!devAgg[r.device]) devAgg[r.device] = {cost:0,conv:0};
        devAgg[r.device].cost += r.cost; devAgg[r.device].conv += r.conv;
      });
      const devs = Object.entries(devAgg)
        .filter(([,v]) => v.conv > 0)
        .map(([name, v]) => ({ name, cpa: v.cost/v.conv }))
        .sort((a,b) => a.cpa - b.cpa);
      if (devs.length >= 2) {
        const best=devs[0], worst=devs[devs.length-1];
        if (worst.cpa/best.cpa > 1.4) {
          out.push({ type:'neu', icon:'📱',
            text: `디바이스 CPA — ${devs.map(d=>`<strong>${d.name}</strong> ${fmt('cpa',d.cpa)}`).join(' / ')}<br>${this.a(`${best.name}(CPA ${fmt('cpa',best.cpa)})이 더 효율적입니다. 디바이스 입찰 조정에서 ${best.name} 가중치를 높이고, ${worst.name}(CPA ${fmt('cpa',worst.cpa)})은 랜딩 페이지 최적화를 우선 검토하세요.`)}` });
        }
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
          text: `최근 7일 ROAS <strong>${L7.roas.toFixed(2)}</strong> — 광고비 회수는 되나 수익 마진이 낮습니다.<br>${this.a('고효율 키워드·캠페인에 예산을 집중하고, 경쟁이 적은 롱테일 키워드 발굴로 CPC를 낮추고 ROAS를 개선하세요.')}` });
      } else if (L7.roas >= 3) {
        out.push({ type:'pos', icon:'✨',
          text: `최근 7일 ROAS <strong>${L7.roas.toFixed(2)}</strong> — 광고 효율이 우수합니다.<br>${this.a('효율이 좋을 때 예산을 적극 확대해 점유율을 높이세요. ROAS 상위 캠페인·키워드의 노출 순위를 1~2위로 올리는 입찰 조정을 검토하세요.')}` });
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
          text: `이상치 감지 — <strong>${label}</strong> ${tag} 7일 평균(${fmt(m,avg)}) 대비 오늘(${last.date}) <strong>${fmt(m,todayVal)}</strong><br>${this.a(isGood ? `${label} 급등 원인(프로모션·시즌 등)을 파악하고, 동일 조건을 유지하거나 성공 요인을 다른 매체·캠페인에 적용하세요.` : `${label} 급락 원인을 긴급 점검하세요. 광고 소재 피로도, 예산 소진, 경쟁 강도 변화 여부를 확인하세요.`)}`,
        });
      });
    }

    if (!out.length) out.push({ type:'neu', icon:'✅', text:'현재 주요 지표가 안정적으로 유지되고 있습니다. 지속 모니터링하세요.' });
    return out.slice(0, 10);
  },
};

// ── 클립보드 복사 유틸 (Briefing/Report 공용) ─────────────────────────────────
const Clipboard = {
  copyWithFeedback(text, btn) {
    const feedback = ok => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = ok ? '✅ 복사됨' : '❌ 실패';
      setTimeout(() => { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => feedback(true)).catch(() => { this._fallback(text); feedback(true); });
    } else {
      this._fallback(text);
      feedback(true);
    }
  },

  // 클립보드 API 미지원 환경(구형 브라우저 등)을 위한 폴백
  _fallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  },
};

// ── 오늘의 브리핑 (데일리 다이제스트) ───────────────────────────────────────────
const Briefing = {
  gen() {
    const bd = Store.byDate();
    if (bd.length < 2) {
      return {
        html: `<div class="briefing-empty">데이터가 부족합니다 (최소 2일치 데이터 필요)</div>`,
        plain: '오늘의 브리핑: 데이터가 부족합니다 (최소 2일치 데이터 필요).',
      };
    }

    const y = bd[bd.length-1], d2 = bd[bd.length-2];
    const last7 = bd.slice(-7);
    const avg = k => last7.reduce((s,r)=>s+(r[k]||0),0) / last7.length;

    // ① 어제 vs 그제 / 최근 7일 평균 변화 (분모 0 가드)
    const pctChange = (c,p) => p>0 ? (c-p)/p*100 : 0;
    const arrow = p => p>0.05?'▲':p<-0.05?'▼':'─';
    const metricLabel = { cost:'광고비', conv:'전환수', roas:'ROAS' };
    const changeParts = ['cost','conv','roas'].map(k => {
      const vsD2 = pctChange(y[k], d2[k]);
      const vsAvg = pctChange(y[k], avg(k));
      const val = k==='conv' ? Math.round(y[k]).toLocaleString()+'건' : fmt(k, y[k]);
      return `${metricLabel[k]} ${val}(그제 대비 ${arrow(vsD2)}${Math.abs(vsD2).toFixed(1)}%, 7일평균 대비 ${arrow(vsAvg)}${Math.abs(vsAvg).toFixed(1)}%)`;
    });
    const changeText = `📅 어제(${y.date}) 실적 — ${changeParts.join(' · ')}`;

    // ② 이상탐지 요약 — 최근 3일 내 발생한 것만 (기존 AnUI._detectAnomalies 재사용, win=7일 sigma=2)
    const recentDates = bd.slice(-3).map(r=>r.date);
    const anomalies = ['cost','conv','roas'].flatMap(k =>
      AnUI._detectAnomalies(k, 7, 2).filter(a=>recentDates.includes(a.date)).map(a=>({...a, k}))
    ).sort((a,b)=>Math.abs(b.zScore)-Math.abs(a.zScore));
    const anomalyText = anomalies.length
      ? `⚠️ 최근 3일 내 이상 징후 ${anomalies.length}건 — 가장 두드러진 건: ${anomalies[0].date} ${metricLabel[anomalies[0].k]}가 평소 대비 ${anomalies[0].zScore>0?'급등':'급락'}(z=${anomalies[0].zScore.toFixed(1)})했습니다.`
      : '🟢 최근 3일간 뚜렷한 이상 징후는 감지되지 않았습니다.';

    // ③ 목표 페이싱 경고 — STEP1 renderPacing()이 캐싱한 UI.pacingStatus 재사용
    const statuses = UI.pacingStatus || [];
    const worst = statuses.length ? statuses.reduce((a,b)=>a.projPace<b.projPace?a:b) : null;
    const pacingText = !worst
      ? 'ℹ️ 목표 KPI가 설정되어 있지 않습니다. 사이드바 "월 목표 설정"에서 입력하면 페이싱 경고를 볼 수 있습니다.'
      : worst.projPace >= 100
        ? `🟢 현재 페이스로는 설정된 목표를 모두 달성할 전망입니다 (${worst.label} 기준 예상 ${worst.projPace}%).`
        : `⚠️ 이 페이스라면 ${worst.label} 목표의 월말 예상 달성률은 ${worst.projPace}%에 그칠 전망입니다.`;

    // ④ 최우선 액션 — 이상탐지 > 페이싱 경고 > 안정 순 우선순위
    let action;
    if (anomalies[0] && Math.abs(anomalies[0].zScore) >= 2.5) {
      action = `${anomalies[0].date} ${metricLabel[anomalies[0].k]}에 이례적 변화가 감지됐습니다. 원인을 확인하세요.`;
    } else if (worst && worst.projPace < 90) {
      action = `이 페이스면 ${worst.label} 목표의 ${worst.projPace}%만 달성할 전망입니다. 예산/전략 조정을 검토하세요.`;
    } else {
      action = '특이사항 없음 — 현재 전략을 유지하며 모니터링하세요.';
    }
    const actionText = `💡 최우선 액션: ${action}`;

    const lines = [changeText, anomalyText, pacingText, actionText];
    const html = lines.map(l => `<div class="briefing-line">${l}</div>`).join('');
    const plain = ['📰 오늘의 브리핑', ...lines].join('\n');
    return { html, plain };
  },

  copy(event) {
    Clipboard.copyWithFeedback(UI._briefingPlain || '', event?.currentTarget);
  },
};

// HTML 문자열에서 태그만 제거한 순수 텍스트 추출 (인사이트/액션 텍스트를 리포트 평문에 쓰기 위함)
function stripHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// ── 리포트 생성 (원클릭 클립보드/xlsx) ────────────────────────────────────────
const Report = {
  mode: 'week', // week | month | custom

  open()  { document.getElementById('m-report').classList.remove('hidden'); },
  close() { document.getElementById('m-report').classList.add('hidden'); },

  onPeriodChange() {
    this.mode = document.querySelector('input[name="report-period"]:checked').value;
    const wrap = document.getElementById('report-custom-range');
    if (this.mode !== 'custom') { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    if (!DP.instances['report-custom-range']) {
      const dates = Store.raw.map(r=>r.date).sort();
      const minD = dates[0]||'', maxD = dates[dates.length-1]||'';
      DP.create('report-custom-range', { minDate: minD, maxDate: maxD, from: minD, to: maxD, onChange: () => {} });
    }
  },

  _periodLabel() { return { week:'주간', month:'월간', custom:'사용자 지정' }[this.mode] || ''; },

  // 선택된 모드에 따른 {from,to}. 주간/월간은 Briefing과 동일하게 데이터의 최신일 기준(오늘 날짜 아님)
  _range() {
    if (this.mode === 'custom') return DP.getRange('report-custom-range');
    const dates = Store.raw.map(r=>r.date).sort();
    const latest = dates[dates.length-1];
    if (!latest) return { from: null, to: null };
    if (this.mode === 'month') return { from: latest.slice(0,7)+'-01', to: latest };
    const from = new Date(new Date(latest+'T00:00:00').getTime() - 6*86400000).toISOString().slice(0,10);
    return { from, to: latest };
  },

  // renderKPIs()의 기간비교 공식(ui.js _renderDimFilters 인근 기간비교 로직)과 동일 — 선택 기간과 같은 일수만큼 바로 이전 구간
  _prevRange(from, to) {
    const ms = d => new Date(d + 'T00:00:00').getTime();
    const days = Math.round((ms(to) - ms(from)) / 86400000) + 1;
    const prevTo   = new Date(ms(from) - 86400000).toISOString().slice(0,10);
    const prevFrom = new Date(ms(from) - days * 86400000).toISOString().slice(0,10);
    return { prevFrom, prevTo };
  },

  buildData() {
    const { from, to } = this._range();
    if (!from || !to) return null;
    const { prevFrom, prevTo } = this._prevRange(from, to);

    const summary     = Store.getAggForPeriod(from, to);
    const prevSummary = Store.getAggForPeriod(prevFrom, prevTo);
    const byMedia = Store.byDimForPeriod('media', from, to).sort((a,b)=>b.cost-a.cost);
    const byDate  = Store.byDate().filter(r => r.date>=from && r.date<=to);

    // Ins.gen()은 Store.filtered 기준 — 리포트 기간으로 잠깐 바꿔서 호출 후 원복 (동기 실행이라 화면엔 영향 없음)
    const savedFiltered = Store.filtered;
    Store.filtered = Store.raw.filter(r => r.date>=from && r.date<=to);
    const insights = Ins.gen().slice(0,3);
    Store.filtered = savedFiltered;

    // 인사이트의 "반영 제안"(Ins.a()가 심어둔 <span class="ins-action">) 부분만 추출, 없으면 본문 전체 사용
    const actionRe = /<span class="ins-action">(.*?)<\/span>/;
    const actions = insights.map(i => {
      const m = i.text.match(actionRe);
      return stripHTML(m ? m[1] : i.text);
    });

    return { from, to, prevFrom, prevTo, summary, prevSummary, byMedia, byDate, insights, actions };
  },

  copyText(event) {
    const d = this.buildData();
    if (!d) { Clipboard.copyWithFeedback('데이터가 없습니다.', event?.currentTarget); return; }

    const pct = (c,p) => p>0 ? (c-p)/p*100 : 0; // 분모 0 가드
    const arrow = p => p>0.05?'▲':p<-0.05?'▼':'─';
    const s = d.summary, p = d.prevSummary;

    const summaryLine = `총광고비 ${fmt('cost',s.cost)} · 전환수 ${Math.round(s.conv).toLocaleString()}건 · 전환매출 ${fmt('revenue',s.revenue)} · ROAS ${fmt('roas',s.roas)} · CPA ${fmt('cpa',s.cpa)}`;

    const changeLine = ['cost','conv','roas','cpa'].map(k => {
      const v = pct(s[k], p[k]);
      return `${METRICS[k].label} ${arrow(v)}${Math.abs(v).toFixed(1)}%`;
    }).join(' · ');

    const mediaHeader = ['매체','광고비','전환','ROAS','CPA'].join('\t');
    const mediaRows = d.byMedia.map(m =>
      [m.media||'(미지정)', fmt('cost',m.cost), Math.round(m.conv), fmt('roas',m.roas), fmt('cpa',m.cpa)].join('\t'));

    const insightsBlock = d.insights.length
      ? d.insights.map((i,idx)=>`${idx+1}. ${stripHTML(i.text)}`).join('\n')
      : '데이터가 부족합니다.';
    const actionsBlock = d.actions.length
      ? d.actions.map((a,idx)=>`${idx+1}. ${a}`).join('\n')
      : '특이사항 없음.';

    const text = [
      `📊 ${this._periodLabel()} 성과 리포트 (${d.from} ~ ${d.to})`, '',
      '■ 핵심 요약', summaryLine, '',
      `■ 전기간 대비 증감 (vs ${d.prevFrom}~${d.prevTo})`, changeLine, '',
      '■ 매체별 성과', mediaHeader, ...mediaRows, '',
      '■ 인사이트 Top 3', insightsBlock, '',
      '■ 액션 플랜', actionsBlock,
    ].join('\n');

    Clipboard.copyWithFeedback(text, event?.currentTarget);
  },

  async downloadXlsx() {
    const d = this.buildData();
    if (!d) return;
    const wb = new ExcelJS.Workbook();
    ReportLayout.standard(wb, d, this._periodLabel());
    const buffer = await wb.xlsx.writeBuffer();
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
      download: `report_${d.from}_${d.to}.xlsx`,
    });
    a.click();
  },
};

// xlsx 시트 레이아웃 — Report와 분리해두면 실무 양식 파일이 오는 대로 이 함수만 교체/추가하면 됨
const ReportLayout = {
  standard(wb, d, periodLabel) {
    const pct = (c,p) => p>0 ? (c-p)/p*100 : 0; // 분모 0 가드

    // 1. 요약 시트
    const ws1 = wb.addWorksheet('요약');
    ws1.columns = [{width:14},{width:18},{width:18}];
    ws1.addRow([`${periodLabel} 성과 리포트`, `${d.from} ~ ${d.to}`]);
    ws1.addRow([]);
    ws1.addRow(['지표','값','전기간 대비 증감']);
    [['cost','광고비','"₩"#,##0'],['conv','전환수','#,##0'],['revenue','전환매출','"₩"#,##0'],
     ['roas','ROAS','0.00"x"'],['cpa','CPA','"₩"#,##0']].forEach(([key,label,numFmt]) => {
      const row = ws1.addRow([label, d.summary[key], pct(d.summary[key], d.prevSummary[key])/100]);
      row.getCell(2).numFmt = numFmt;
      row.getCell(3).numFmt = '0.0%';
    });
    ws1.getRow(1).font = { bold: true };
    ws1.getRow(3).font = { bold: true };

    // 2. 매체별 시트
    const ws2 = wb.addWorksheet('매체별');
    ws2.columns = [
      { header:'매체', key:'media', width:14 }, { header:'노출수', key:'impr', width:12 },
      { header:'클릭수', key:'clicks', width:12 }, { header:'CTR', key:'ctr', width:10 },
      { header:'광고비', key:'cost', width:14 }, { header:'CPC', key:'cpc', width:12 },
      { header:'전환수', key:'conv', width:10 }, { header:'CPA', key:'cpa', width:14 },
      { header:'전환매출', key:'revenue', width:14 }, { header:'ROAS', key:'roas', width:10 },
    ];
    d.byMedia.forEach(m => ws2.addRow({ media:m.media||'(미지정)', impr:m.impr, clicks:m.clicks,
      ctr:m.ctr/100, cost:m.cost, cpc:m.cpc, conv:m.conv, cpa:m.cpa, revenue:m.revenue, roas:m.roas }));
    ws2.getColumn('ctr').numFmt = '0.00%';
    ['cost','cpc','cpa','revenue'].forEach(k => ws2.getColumn(k).numFmt = '"₩"#,##0');
    ws2.getColumn('roas').numFmt = '0.00"x"';
    ws2.getRow(1).font = { bold: true };

    // 3. 일별 시트 — Store.exportCSV()와 동일 컬럼셋
    const ws3 = wb.addWorksheet('일별');
    ws3.columns = [
      { header:'날짜', key:'date', width:12 }, { header:'노출수', key:'impr', width:12 },
      { header:'클릭수', key:'clicks', width:12 }, { header:'CTR', key:'ctr', width:10 },
      { header:'광고비', key:'cost', width:14 }, { header:'CPC', key:'cpc', width:12 },
      { header:'전환수', key:'conv', width:10 }, { header:'CPA', key:'cpa', width:14 },
      { header:'전환매출', key:'revenue', width:14 }, { header:'ROAS', key:'roas', width:10 },
      { header:'GA전환', key:'gaConv', width:10 }, { header:'GA매출', key:'gaRev', width:14 },
      { header:'앱설치', key:'appInstall', width:10 },
    ];
    d.byDate.forEach(r => ws3.addRow({ ...r, ctr:r.ctr/100 }));
    ws3.getColumn('ctr').numFmt = '0.00%';
    ['cost','cpc','cpa','revenue','gaRev'].forEach(k => ws3.getColumn(k).numFmt = '"₩"#,##0');
    ws3.getColumn('roas').numFmt = '0.00"x"';
    ws3.getRow(1).font = { bold: true };
  },
};

// 목표 달성률 → 신호등. lowerBetter=true(예: CPA)면 target/actual로 역산해 "낮을수록 좋음"을 반영.
// target이 0/미입력이면 null 반환 → 호출부에서 신호등 숨김 처리.
function targetLight(actual, target, lowerBetter = false) {
  if (!target) return null;
  const pct = lowerBetter ? (target / (actual || Infinity)) * 100 : (actual / target) * 100;
  const icon = pct >= 100 ? '🟢' : pct >= 90 ? '🟡' : '🔴';
  return { pct, icon };
}

// ── UI ────────────────────────────────────────────────────────────────────────
const UI = {
  render() {
    document.getElementById('empty').classList.add('hidden');
    document.getElementById('main').classList.remove('hidden');
    this.renderSidebar();
    this.renderPacing();
    this.renderBriefing();
    this.renderKPIs();
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

  renderBriefing() {
    const b = Briefing.gen();
    document.getElementById('briefing-body').innerHTML = b.html;
    this._briefingPlain = b.plain;
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

    // 차원 필터
    if (!DimState.active.length) DimState.detect();
    this._renderDimFilters();
  },

  applyFilter() {
    const { from, to } = DP.getRange('dp-campaign');
    Store.filter({ from, to, dimFilters: DimState.getFilters() });
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
    let targets;
    try { targets = JSON.parse(localStorage.getItem('jb_targets')||'{}'); } catch(e) { targets = {}; }

    let cmpAgg = null;
    if (this.compareMode) {
      const { from, to } = DP.getRange('dp-campaign');
      if (from && to) {
        const ms = d => new Date(d + 'T00:00:00').getTime();
        const days = Math.round((ms(to) - ms(from)) / 86400000) + 1;
        const prevTo   = new Date(ms(from) - 86400000).toISOString().slice(0,10);
        const prevFrom = new Date(ms(from) - days * 86400000).toISOString().slice(0,10);
        const dimFilters = DimState.getFilters();
        const curr = Store.getAggForPeriod(from, to, dimFilters);
        cmpAgg = { curr, prev: Store.getAggForPeriod(prevFrom, prevTo, dimFilters), prevFrom, prevTo };
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

      let targetRow = '';
      if (m === 'roas') {
        const tl = targetLight(c, targets.roas, false);
        if (tl) targetRow = `<div class="kpi-target">${tl.icon} 목표대비 ${tl.pct.toFixed(0)}%</div>`;
      } else if (m === 'cpa') {
        const tl = targetLight(c, targets.cpa, true);
        if (tl) targetRow = `<div class="kpi-target">${tl.icon} 목표대비 ${tl.pct.toFixed(0)}%</div>`;
      } else if (m === 'cost' && targets.cost && this.pacingPct?.cost != null) {
        const p2 = this.pacingPct.cost;
        const icon = p2>=100?'🟢':p2>=90?'🟡':'🔴';
        targetRow = `<div class="kpi-target">${icon} 월예산 ${p2.toFixed(0)}%</div>`;
      }

      return `<div class="kpi${i===0?' active':''}${cmpAgg?' compare':''}" onclick="UI.selectKPI('${m}',this)">
        <div class="kpi-label">${METRICS[m]?.label||m}</div>
        <div class="kpi-value">${fmt(m,c)}</div>
        ${compareRow}
        ${targetRow}
      </div>`;
    }).join('');
  },

  saveTargets() {
    const parseInt_ = id => parseInt((document.getElementById(id)?.value||'').replace(/[^0-9]/g,''))||0;
    const parseFloat_ = id => parseFloat((document.getElementById(id)?.value||'').replace(/[^0-9.]/g,''))||0;
    const t = {
      cost: parseInt_('target-cost'), conv: parseInt_('target-conv'), rev: parseInt_('target-rev'),
      roas: parseFloat_('target-roas'), cpa: parseInt_('target-cpa'),
    };
    localStorage.setItem('jb_targets', JSON.stringify(t));
    this.renderPacing();
    this.renderBriefing();
    this.renderKPIs();
    this.renderTable();
  },

  loadTargets() {
    try {
      const t = JSON.parse(localStorage.getItem('jb_targets')||'{}');
      const fmt = v => v ? v.toLocaleString() : '';
      if (t.cost) document.getElementById('target-cost').value = fmt(t.cost);
      if (t.conv) document.getElementById('target-conv').value = fmt(t.conv);
      if (t.rev)  document.getElementById('target-rev').value  = fmt(t.rev);
      if (t.roas) document.getElementById('target-roas').value = t.roas;
      if (t.cpa)  document.getElementById('target-cpa').value  = fmt(t.cpa);
    } catch(e) {}
  },

  renderPacing() {
    let t;
    try { t = JSON.parse(localStorage.getItem('jb_targets')||'{}'); } catch(e) { t = {}; }
    if (!t.cost && !t.conv && !t.rev) { document.getElementById('card-pacing').classList.add('hidden'); this.pacingPct = null; this.pacingStatus = []; return; }

    // 가장 최근 월 데이터만 사용 (사이드바 필터 무관)
    const allDates = Store.raw.map(r=>r.date).sort();
    if (!allDates.length) return;
    const ym = allDates[allDates.length-1].slice(0,7);
    const [y, mo] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const monthRows = Store.raw.filter(r=>r.date.startsWith(ym));
    const activeDays = new Set(monthRows.map(r=>r.date)).size;
    const tot = monthRows.reduce((a,r)=>{ a.cost+=r.cost; a.conv+=r.conv; a.rev+=r.revenue; return a; }, {cost:0,conv:0,rev:0});
    // KPI 카드의 월예산 신호등에서 재사용할 수 있도록 월 누적 페이싱 %를 캐싱
    this.pacingPct = { cost: t.cost>0 ? tot.cost/t.cost*100 : null };
    const proj = {
      cost: activeDays ? tot.cost/activeDays*daysInMonth : 0,
      conv: activeDays ? tot.conv/activeDays*daysInMonth : 0,
      rev:  activeDays ? tot.rev /activeDays*daysInMonth : 0,
    };

    const items = [
      { key:'cost', icon:'💰', label:'광고비',   actual:tot.cost, target:t.cost, projected:proj.cost, unit:'₩' },
      { key:'conv', icon:'🎯', label:'전환수',   actual:tot.conv, target:t.conv, projected:proj.conv, unit:''  },
      { key:'rev',  icon:'📈', label:'전환매출', actual:tot.rev,  target:t.rev,  projected:proj.rev,  unit:'₩' },
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

    // 오늘의 브리핑(Briefing.gen)의 목표 페이싱 경고에서 재사용할 수 있도록 항목별 페이싱/예상달성률 캐싱
    const statuses = [];
    document.getElementById('card-pacing').classList.remove('hidden');
    document.getElementById('pacing-body').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(${items.length},1fr);gap:14px;padding:6px 2px;">
        ${items.map(x=>{
          const p = x.target>0 ? x.actual/x.target*100 : 0;
          const projP = x.target>0 ? Math.round(x.projected/x.target*100) : 0;
          const c = arcColor(p);
          statuses.push({ key:x.key, label:x.label, actual:x.actual, target:x.target, pace:p, projPace:projP });
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
    this.pacingStatus = statuses;
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
    const tabHtml = (active, handler) =>
      mainMetrics.map(m => `<span class="mtab${m===active?' on':''}" onclick="${handler}('${m}',this)">${METRICS[m]?.label||m}</span>`).join('');
    document.getElementById('trend-tabs').innerHTML = tabHtml('cost', 'UI.setTrendMetric');
    document.getElementById('dod-tabs').innerHTML   = tabHtml('cost', 'UI.setDodMetric');
  },

  setTabActive(tabsId, m) {
    document.querySelectorAll(`#${tabsId} .mtab`).forEach(t => t.classList.toggle('on', t.textContent===METRICS[m]?.label));
  },

  setTrendMetric(m,el) { CH.trendMetric=m; CH.renderTrend(Store.byDate()); document.querySelectorAll('#trend-tabs .mtab').forEach(t=>t.classList.toggle('on',t===el)); },
  setDodMetric(m,el)   { CH.dodMetric=m;   CH.renderDoD(Store.byDate()); document.querySelectorAll('#dod-tabs .mtab').forEach(t=>t.classList.toggle('on',t===el)); },

  _renderDimFilters() {
    const container = document.getElementById('dim-filters');
    if (!container) return;
    const makeDots = vals => Object.fromEntries(vals.map(v => [v, getDimColor(v)]));
    container.innerHTML = DimState.active.map(f =>
      `<div id="${DimState.getMsId(f)}" class="ms-wrap"></div>`
    ).join('');
    DimState.active.forEach(f => {
      const vals = Store.dims[f] || [];
      MS.create(DimState.getMsId(f), {
        label: DimState.getLabel(f),
        options: vals,
        dots: makeDots(vals),
        onChange: () => UI.applyFilter(),
      });
    });
    const unused = DimState.available.filter(f => !DimState.active.includes(f));
    if (unused.length) {
      const btns = unused.map(f =>
        `<button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 8px;" onclick="DimState.add('${f}')">${DimState.getLabel(f)} +</button>`
      ).join('');
      container.insertAdjacentHTML('beforeend', `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">${btns}</div>`);
    }
  },

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
    let targets;
    try { targets = JSON.parse(localStorage.getItem('jb_targets')||'{}'); } catch(e) { targets = {}; }
    document.getElementById('t-body').innerHTML = visible.map((row,i)=>{
      const prev = visible[i+1];
      const note = dailyNotes[row.date];
      const hasNote = !!note?.text;
      const noteTitle = hasNote ? note.text.replace(/"/g,'&quot;') : '메모 추가';
      const tagPill = hasNote && note.tag ? `<span class="note-tag">${note.tag.replace(/"/g,'&quot;')}</span>` : '';
      return `<tr>${cols.map(c=>{
        if (c.k==='date') return `<td>${row.date}<button class="memo-btn admin-btn${hasNote?' has-note':''}" onclick="Notes.openModal('${row.date}')" title="${noteTitle}">📝</button>${tagPill}</td>`;
        const v=row[c.k]||0, p=prev?.[c.k]||0;
        let badge='';
        if (prev&&p>0) {
          const pct=(v-p)/p*100;
          badge=`<span class="badge ${pct>=0?'up':'dn'}">${pct>0?'+':''}${pct.toFixed(1)}%</span>`;
        }
        let tgtBadge = '';
        if (c.k==='roas') {
          const tl = targetLight(v, targets.roas, false);
          if (tl) tgtBadge = `<span class="tgt-badge" title="목표 ${targets.roas}x 대비 ${tl.pct.toFixed(0)}%">${tl.icon}</span>`;
        } else if (c.k==='cpa') {
          const tl = targetLight(v, targets.cpa, true);
          if (tl) tgtBadge = `<span class="tgt-badge" title="목표 ₩${targets.cpa.toLocaleString()} 대비 ${tl.pct.toFixed(0)}%">${tl.icon}</span>`;
        }
        return `<td>${fmt(c.k,v)}${badge}${tgtBadge}</td>`;
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
  ['campaign','keyword','analysis'].forEach(t => {
    document.getElementById('hdr-' + t)?.classList.toggle('hidden', t !== tab);
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
  });

  setTimeout(() => {
    cur.classList.add('hidden');
    cur.classList.remove('fading');
    document.body.classList.toggle('kw-mode', tab === 'keyword');
    next.classList.remove('hidden');
    if (tab === 'analysis') AnUI.render();
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
  // raw: { key, keyword, media, [...dimDefs.key]: value, daily: {'YYYY-MM-DD': {impr,clicks,cost,conv,revenue}} }
  raw: [], filtered: [],
  dims: {}, dimFilters: {}, allDates: [],
  dimDefs: [{key:'route',label:'노선'},{key:'device',label:'디바이스'}],
  dateFrom: null, dateTo: null,
  sortKey: 'cost', sortDir: -1,
  search: '', page: 1, perPage: 50,
  _isAggregated: false, actionQueue: null,

  GRADE_META: {
    scale:  { label:'확장', color:'#16a34a' },
    watch:  { label:'유지', color:'#d97706' },
    review: { label:'점검', color:'#dc2626' },
    none:   { label:'-',    color:'#9ca3af' },
  },
  gradeCfg() {
    try { return { scaleRoas:3, watchRoas:1, ...JSON.parse(localStorage.getItem('jb_kw_grade')||'{}') }; }
    catch(e) { return { scaleRoas:3, watchRoas:1 }; }
  },

  _detectDims(rows) {
    const dimFields = ['media', ...this.dimDefs.map(d => d.key)];
    this.dims = {};
    dimFields.forEach(f => {
      const vals = [...new Set(rows.map(r => r[f]).filter(Boolean))].sort();
      if (vals.length >= 1) this.dims[f] = vals;
    });
    this.dimFilters = {};
  },

  load(rawMap, dims) {
    this._isAggregated = false;
    this.dimDefs = dims !== undefined ? dims : [{key:'route',label:'노선'},{key:'device',label:'디바이스'}];
    this.raw = Object.entries(rawMap).map(([key, r]) => ({ ...r, key }));
    const dateSet = new Set();
    this.raw.forEach(r => Object.keys(r.daily||{}).forEach(d => dateSet.add(d)));
    this.allDates = [...dateSet].sort();
    this.dateFrom = this.allDates[0] || null;
    this.dateTo   = this.allDates[this.allDates.length-1] || null;
    this._detectDims(this.raw);
    this.applyFilter();
  },

  // 배포된 데이터(이미 집계된 rows 배열) 로드
  loadAggregated(rows, dateFrom, dateTo, dims, actionQueue) {
    this._isAggregated = true;
    this.dimDefs = dims !== undefined ? dims : [{key:'route',label:'노선'},{key:'device',label:'디바이스'}];
    // 구버전 kw_data.json(리팩터 이전 배포분)은 rows에 key가 없음 — 렌더링/식별 안 깨지게 즉석 생성.
    this.raw = rows.map(r => r.key ? r : { ...r, key: [r.keyword, r.media, ...this.dimDefs.map(d=>r[d.key])].join('__') });
    this.filtered = [...this.raw];
    this.allDates = [];
    this.dateFrom = dateFrom || null;
    this.dateTo   = dateTo   || null;
    this.actionQueue = actionQueue || null;
    this._detectDims(this.raw);
    this.applyFilter();
  },

  _agg(r) {
    const tot = sumDaily(r.daily, this.dateFrom, this.dateTo);
    const dimVals = {};
    this.dimDefs.forEach(d => { dimVals[d.key] = r[d.key]; });
    return { key:r.key, keyword:r.keyword, media:r.media, ...dimVals, ...tot };
  },

  applyFilter() {
    const q = this.search.toLowerCase();
    this.filtered = this.raw
      .filter(r => {
        for (const [field, vals] of Object.entries(this.dimFilters)) {
          if (!vals?.length) continue;
          const rv = r[field] || '';
          if (rv && !vals.includes(rv)) return false;
        }
        return !q || r.keyword.toLowerCase().includes(q);
      })
      .map(r => this._isAggregated ? r : this._agg(r))
      .filter(r => r.impr > 0 || r.cost > 0);
    this.filtered.sort((a,b) => {
      const av = a[this.sortKey]||0, bv = b[this.sortKey]||0;
      return (av > bv ? 1 : -1) * this.sortDir;
    });
    this.page = 1;
  },

  grade(r) {
    const cfg = this.gradeCfg();
    if (r.cost === 0) return 'none';
    if (r.conv === 0) return 'review';
    if (r.roas >= cfg.scaleRoas) return 'scale';
    if (r.roas >= cfg.watchRoas) return 'watch';
    return 'review';
  },

  exportCSV() {
    const cols = ['키워드','매체', ...this.dimDefs.map(d=>d.label), '노출','클릭','CTR(%)','광고비','CPC','전환','CPA','전환매출','ROAS','등급'];
    const rows = this.filtered.map(r => [
      r.keyword, r.media, ...this.dimDefs.map(d=>r[d.key]||''),
      r.impr, r.clicks, r.ctr.toFixed(2), Math.round(r.cost),
      Math.round(r.cpc), r.conv, Math.round(r.cpa), Math.round(r.revenue),
      r.roas.toFixed(2), this.GRADE_META[this.grade(r)].label
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
// 임의 광고주 포맷 지원: 워크북의 모든 시트를 순회하되 '키워드' 후보 컬럼이 있는
// 시트만 파싱 대상으로 삼는다. 컬럼 자동 감지가 실패하면 KWMappingUI로 수동 매핑을
// 받고(그 결과는 헤더 시그니처별로 localStorage에 캐시), 매핑 후 나머지 텍스트
// 컬럼은 전부 동적 차원(dims)으로 취급한다.
const KWParser = {
  load(file) {
    if (!file) return;
    KWUI.hideUpload();
    UI.showLoading('키워드 데이터 파싱 중... (대용량 파일, 잠시 기다려 주세요)');
    const reader = new FileReader();
    reader.onload = e => {
      setTimeout(() => {
        try {
          const wb = XLSX.read(e.target.result, { type:'array', cellDates:false });
          this._parseWorkbook(wb, file.name);
        } catch(err) {
          UI.hideLoading();
          alert('파싱 오류: ' + err.message);
        }
      }, 50);
    };
    reader.readAsArrayBuffer(file);
  },

  _parseWorkbook(wb, fileName) {
    try {
      const keywordAliases = KW_FIELD_SCHEMA.keyword.aliases;
      const sheets = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const all = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
        if (all.length < 2) return null;
        const header = (all[0] || []).map(h => String(h||'').trim());
        const hasKeyword = header.some(h => keywordAliases.some(a => a.toLowerCase() === h.toLowerCase()));
        return hasKeyword ? { name, header, all } : null;
      }).filter(Boolean);

      if (!sheets.length) { UI.hideLoading(); alert('키워드 데이터를 찾을 수 없습니다. (키워드 컬럼이 있는 시트가 없음)'); return; }

      // 컬럼 매핑: 첫 매칭 시트 헤더를 기준으로 캐시 확인 → 자동감지 → 부족하면 수동 매핑 모달
      const canonicalHeaders = sheets[0].header;
      const cached = KWSchemaMap.loadCached(canonicalHeaders);
      if (cached) {
        KWSchemaMap.mapping = { ...cached.mapping };
        KWSchemaMap.headers = canonicalHeaders;
      } else {
        KWSchemaMap.autoMap(canonicalHeaders);
      }

      if (KWSchemaMap.hasCriticalMissing()) {
        UI.hideLoading();
        KWMappingUI.open(canonicalHeaders, () => {
          UI.showLoading('키워드 데이터 파싱 중...');
          setTimeout(() => this._finishParse(fileName, sheets, canonicalHeaders), 30);
        });
        return;
      }
      this._finishParse(fileName, sheets, canonicalHeaders);
    } catch(err) {
      UI.hideLoading();
      alert('파싱 오류: ' + err.message);
    }
  },

  _finishParse(fileName, sheets, canonicalHeaders) {
    try {
      const pn = v => (typeof v === 'number' ? v : parseFloat(String(v||'').replace(/,/g,''))||0);
      const keywordCol = KWSchemaMap.get('keyword'), dateCol = KWSchemaMap.get('date');
      const imprCol = KWSchemaMap.get('impr'), clicksCol = KWSchemaMap.get('clicks'), costCol = KWSchemaMap.get('cost');
      const convCol = KWSchemaMap.get('conv'), revCol = KWSchemaMap.get('revenue');

      // 나머지 텍스트 컬럼 = 동적 차원. 파일 내 모든 시트가 동일 템플릿이라고 가정하고 첫 시트 기준으로 결정.
      const dimHeaderNames = KWSchemaMap.dimHeaders(canonicalHeaders, sheets[0].all.slice(1));
      const dims = dimHeaderNames.map(kwDimDef);

      const kwMap = {};
      sheets.forEach(({ name, header, all }) => {
        const mediaLabel = KW_SHEET_MEDIA_ALIAS[name] || name;
        const idx = colName => header.findIndex(h => h.toLowerCase() === String(colName||'').toLowerCase());
        const iKw = idx(keywordCol), iDate = idx(dateCol), iImpr = idx(imprCol), iClicks = idx(clicksCol), iCost = idx(costCol);
        const iConv = convCol ? idx(convCol) : -1, iRev = revCol ? idx(revCol) : -1;
        const dimIdx = dimHeaderNames.map(h => idx(h));

        for (let i = 1; i < all.length; i++) {
          const r = all[i] || [];
          const kw = String(r[iKw] || '').trim();
          if (!kw || kw === '합계' || kw === '필터구간') continue;
          const dimVals = dims.map((d, di) => String(r[dimIdx[di]] || '').trim());
          const date = parseDate(r[iDate]);
          const key = [kw, mediaLabel, ...dimVals].join('__');
          if (!kwMap[key]) {
            kwMap[key] = { keyword:kw, media:mediaLabel, daily:{} };
            dims.forEach((d, di) => { kwMap[key][d.key] = dimVals[di]; });
          }
          if (date) {
            if (!kwMap[key].daily[date]) kwMap[key].daily[date] = {impr:0,clicks:0,cost:0,conv:0,revenue:0};
            const d = kwMap[key].daily[date];
            d.impr    += pn(r[iImpr]);
            d.clicks  += pn(r[iClicks]);
            d.cost    += pn(r[iCost]);
            d.conv    += iConv>=0 ? pn(r[iConv]) : 0;
            d.revenue += iRev>=0 ? pn(r[iRev]) : 0;
          }
        }
      });

      if (!Object.keys(kwMap).length) { UI.hideLoading(); alert('키워드 데이터를 찾을 수 없습니다.'); return; }

      KWSchemaMap.saveCached(canonicalHeaders, dims);
      KWStore.load(kwMap, dims);
      UI.hideLoading();
      KWUI.render();
      JBStorage.saveKeyword(fileName, kwMap, dims);
      document.getElementById('btn-reset-kw').classList.remove('hidden');
      Deployer.autoDeploy();
    } catch(err) {
      UI.hideLoading();
      alert('파싱 오류: ' + err.message);
    }
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
    this.loadGradeCfg();
    this.renderFilters();
    this.renderKPIs();
    this.renderConvKeywords();
    this.renderGrade();
    KWCh.renderAll();
    this.renderTable();
    ActionQueueUI.render();
  },

  renderFilters() {
    const dates = KWStore.allDates || [];
    const minD = dates[0]||'', maxD = dates[dates.length-1]||'';
    const KW_DIM_LABELS = { media:'매체' };
    KWStore.dimDefs.forEach(d => { KW_DIM_LABELS[d.key] = d.label; });
    const MEDIA_DOTS = { '네이버':'#03c75a','구글':'#4285f4','카카오':'#f7c600','당근':'#ff6f00' };
    const refresh = () => {
      const { from, to } = DP.getRange('dp-keyword');
      KWStore.dateFrom = from; KWStore.dateTo = to;
      Object.keys(KWStore.dims).forEach(f => {
        KWStore.dimFilters[f] = MS.getSelected(`ms-kw-${f}`);
      });
      KWStore.applyFilter();
      this._convShowCount = {};
      this.renderKPIs(); this.renderConvKeywords(); this.renderGrade(); KWCh.renderAll(); this.renderTable();
    };
    const defFrom = '2026-04-28' >= minD && '2026-04-28' <= maxD ? '2026-04-28' : minD;
    const defTo   = '2026-04-29' >= minD && '2026-04-29' <= maxD ? '2026-04-29' : maxD;
    DP.create('dp-keyword', { minDate: minD, maxDate: maxD, from: defFrom, to: defTo, onChange: refresh });

    const container = document.getElementById('kw-dim-filters');
    if (container) {
      container.innerHTML = Object.keys(KWStore.dims).map(f => `<div id="ms-kw-${f}" class="ms-wrap"></div>`).join('');
      Object.entries(KWStore.dims).forEach(([f, vals]) => {
        MS.create(`ms-kw-${f}`, {
          label: KW_DIM_LABELS[f] || f,
          options: vals,
          dots: f === 'media' ? MEDIA_DOTS : {},
          onChange: refresh,
        });
      });
    }

    // 초기 날짜 범위 반영
    KWStore.dateFrom = defFrom;
    KWStore.dateTo   = defTo;
    KWStore.dimFilters = {};
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
    const cfg = KWStore.gradeCfg();
    const M = KWStore.GRADE_META;
    const counts = { scale:0, watch:0, review:0 };
    KWStore.filtered.filter(r=>r.cost>0).forEach(r => { const g=KWStore.grade(r); if(counts[g]!==undefined) counts[g]++; });
    document.getElementById('kw-grade-bar').innerHTML = `
      <div class="grade-card scale"><div class="grade-num">${this.fmtN(counts.scale)}</div><div class="grade-label">🟢 ${M.scale.label} (ROAS ≥ ${cfg.scaleRoas})</div></div>
      <div class="grade-card watch"><div class="grade-num">${this.fmtN(counts.watch)}</div><div class="grade-label">🟡 ${M.watch.label} (ROAS ${cfg.watchRoas}~${cfg.scaleRoas})</div></div>
      <div class="grade-card review"><div class="grade-num">${this.fmtN(counts.review)}</div><div class="grade-label">🔴 ${M.review.label} (전환 0 or ROAS &lt; ${cfg.watchRoas})</div></div>
    `;
    const caption = document.getElementById('kw-grade-caption');
    if (caption) caption.innerHTML = `🟢 ${M.scale.label}: ROAS ≥ ${cfg.scaleRoas} &nbsp;|&nbsp; 🟡 ${M.watch.label}: ROAS ${cfg.watchRoas}~${cfg.scaleRoas} 또는 전환 없음 &nbsp;|&nbsp; 🔴 ${M.review.label}: 광고비 소진 + 전환 0 또는 ROAS &lt; ${cfg.watchRoas}`;
  },

  saveGradeCfg() {
    const v = id => parseFloat(document.getElementById(id)?.value) || 0;
    const cfg = { scaleRoas: v('kw-grade-scale') || 3, watchRoas: v('kw-grade-watch') || 1 };
    localStorage.setItem('jb_kw_grade', JSON.stringify(cfg));
    this.renderGrade();
    this.renderTable();
    ActionQueueUI.render();
  },

  loadGradeCfg() {
    const cfg = KWStore.gradeCfg();
    const scaleEl = document.getElementById('kw-grade-scale'), watchEl = document.getElementById('kw-grade-watch');
    if (scaleEl) scaleEl.value = cfg.scaleRoas;
    if (watchEl) watchEl.value = cfg.watchRoas;
  },

  renderTable() {
    const s = KWStore.page, e = s * KWStore.perPage, rows = KWStore.filtered;
    const paged = rows.slice((s-1)*KWStore.perPage, e);
    const mediaCls  = { '네이버':'naver','구글':'google','카카오':'kakao','당근':'daangn' };
    const dimCols = KWStore.dimDefs.map(d => ({ key:d.key, label:d.label, sort:false }));
    const cols = [
      { key:'keyword',label:'키워드',sort:false },
      { key:'media',  label:'매체',  sort:false },
      ...dimCols,
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
      const M = KWStore.GRADE_META[g] || KWStore.GRADE_META.none;
      const keyEsc = String(r.key||'').replace(/'/g,"\\'");
      return `<tr class="kw-row-click" onclick="KWUI.showTrend('${keyEsc}')">
        <td>${r.keyword}</td>
        <td><span class="kw-media-tag ${mediaCls[r.media]||''}">${r.media}</span></td>
        ${dimCols.map(d => `<td>${r[d.key]||'-'}</td>`).join('')}
        <td>${this.fmtN(r.impr)}</td>
        <td>${this.fmtN(r.clicks)}</td>
        <td>${this.fmtP(r.ctr)}</td>
        <td>${this.fmtW(r.cost)}</td>
        <td>${this.fmtW(r.cpc)}</td>
        <td>${this.fmtN(r.conv)}</td>
        <td>${r.conv>0?this.fmtW(r.cpa):'-'}</td>
        <td>${r.revenue>0?this.fmtW(r.revenue):'-'}</td>
        <td>${r.roas>0?this.fmtR(r.roas):'-'}</td>
        <td><span class="grade-dot" style="background:${M.color}"></span>${M.label}</td>
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
        const key = r.key;
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
        key: r.key, keyword: r.keyword, media: r.media, route: r.route, device: r.device,
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
      const keyEsc = String(r.key||'').replace(/'/g,"\\'");
      return `<tr class="kw-row-click" onclick="KWUI.showTrend('${keyEsc}')">
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

  showTrend(key) {
    const entry = KWStore.raw.find(r => r.key === key);
    const modal = document.getElementById('kw-trend-modal');
    const canvas = document.getElementById('kw-trend-canvas');
    const noData = document.getElementById('kw-trend-no-data');
    const dimLabel = entry ? KWStore.dimDefs.map(d => entry[d.key]).filter(Boolean).join(' · ') : '';
    document.getElementById('kw-trend-title').textContent = `📈 ${entry?.keyword||''} · ${entry?.media||''}${dimLabel?' · '+dimLabel:''}`;
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

// ── 키워드 액션 큐 UI ────────────────────────────────────────────────────────────
// 로컬/업로드 모드(KWStore._isAggregated===false)에서는 KWStore.raw(daily 있음)로 매번 새로 계산.
// 뷰어 모드(집계 데이터만 배포됨)에서는 배포 시점에 계산되어 실려온 KWStore.actionQueue를 그대로 렌더링.
// 완료 상태는 두 모드 모두 localStorage(jb_action_done)의 로컬 오버라이드를 병합해서 최종 결정한다.
const ActionQueueUI = {
  CFG_KEY: 'jb_action_cfg',
  DONE_KEY: 'jb_action_done',

  cfg() {
    try { return { excludeDays:14, minClicks:10, marginPct:80, ...JSON.parse(localStorage.getItem(this.CFG_KEY)||'{}') }; }
    catch(e) { return { excludeDays:14, minClicks:10, marginPct:80 }; }
  },
  doneMap() {
    try { return JSON.parse(localStorage.getItem(this.DONE_KEY) || '{}'); }
    catch(e) { return {}; }
  },

  saveCfg() {
    const cfg = {
      excludeDays: parseInt(document.getElementById('aq-days')?.value) || 14,
      minClicks:   parseInt((document.getElementById('aq-minclicks')?.value||'').replace(/[^0-9]/g,'')) || 10,
      marginPct:   parseInt(document.getElementById('aq-margin')?.value) || 80,
    };
    localStorage.setItem(this.CFG_KEY, JSON.stringify(cfg));
    this.render();
  },

  loadCfgInputs() {
    const cfg = this.cfg();
    const daysEl = document.getElementById('aq-days'), clicksEl = document.getElementById('aq-minclicks'), marginEl = document.getElementById('aq-margin');
    if (daysEl) daysEl.value = cfg.excludeDays;
    if (clicksEl) clicksEl.value = cfg.minClicks;
    if (marginEl) marginEl.value = cfg.marginPct;
    const daysVal = document.getElementById('aq-days-val'), marginVal = document.getElementById('aq-margin-val');
    if (daysVal) daysVal.textContent = cfg.excludeDays;
    if (marginVal) marginVal.textContent = cfg.marginPct;
  },

  _buildLocal() {
    const cfg = this.cfg();
    let targets; try { targets = JSON.parse(localStorage.getItem('jb_targets')||'{}'); } catch(e) { targets = {}; }
    const exclude = ActionQueue.detectExclusion(KWStore.raw, KWStore.allDates, cfg);
    const scaleUp = ActionQueue.detectScaleUp(KWStore.raw, targets.cpa||0, cfg, r => KWStore.grade(r));
    return { exclude, scaleUp, hasTargetCpa: !!targets.cpa };
  },

  _current() {
    if (!KWStore._isAggregated) return this._buildLocal();
    const aq = KWStore.actionQueue;
    return { exclude: aq?.exclude || [], scaleUp: aq?.scaleUp || [], hasTargetCpa: aq?.hasTargetCpa ?? true };
  },

  render() {
    const card = document.getElementById('kw-card-actionqueue');
    if (!card) return;
    this.loadCfgInputs();
    const { exclude, scaleUp, hasTargetCpa } = this._current();
    const done = this.doneMap();
    const hideDone = document.getElementById('aq-hide-done')?.checked;

    // 로컬 오버라이드(jb_action_done)가 있으면 그 값이 우선 — 배포된 done을 껐다 켰다 둘 다 가능해야 함.
    const withDone = (list, type) => list.map(item => {
      const k = type + '__' + item.key;
      const overridden = Object.prototype.hasOwnProperty.call(done, k);
      return { ...item, type, done: overridden ? !!done[k] : !!item.done };
    });
    const sortList = list => [...list].sort((a,b) => (a.done===b.done) ? 0 : (a.done ? 1 : -1));

    const renderCol = (list, type, emptyMsg) => {
      let items = withDone(list, type);
      if (hideDone) items = items.filter(i => !i.done);
      items = sortList(items);
      if (!items.length) return `<div class="aq-empty">${emptyMsg}</div>`;
      return items.map(i => `
        <label class="aq-item${i.done?' done':''}">
          <input type="checkbox" ${i.done?'checked':''} onchange="ActionQueueUI.toggleDone('${type}','${i.key.replace(/'/g,"\\'")}', this.checked)">
          <span class="aq-item-body">
            <span class="aq-item-title">${i.keyword} <span class="aq-item-media">(${i.media})</span></span>
            <span class="aq-item-reason">${i.reason}</span>
          </span>
        </label>`).join('');
    };

    card.querySelector('#aq-exclude-list').innerHTML = renderCol(exclude, 'exclude', '현재 조건에서 후보 없음');
    card.querySelector('#aq-scaleup-list').innerHTML = renderCol(scaleUp, 'scaleUp', '현재 조건에서 후보 없음');
    const hint = card.querySelector('#aq-scaleup-hint');
    if (hint) hint.classList.toggle('hidden', hasTargetCpa);

    this._plainExclude = exclude;
    this._plainScaleUp = scaleUp;
  },

  toggleDone(type, key, checked) {
    const done = this.doneMap();
    done[type+'__'+key] = checked;
    localStorage.setItem(this.DONE_KEY, JSON.stringify(done));
    this.render();
    // 뷰어 모드(집계 데이터만 있음, PAT 없음)는 자동배포 대상이 아님 — 로컬 오버라이드로만 반영.
    if (!KWStore._isAggregated) Deployer.autoDeploy();
  },

  copy(event) {
    const lines = [];
    (this._plainExclude||[]).forEach(i => lines.push(`[제외] ${i.keyword} (${i.media}) — ${i.reason}`));
    (this._plainScaleUp||[]).forEach(i => lines.push(`[확장] ${i.keyword} (${i.media}) — ${i.reason}`));
    const text = lines.length ? lines.join('\n') : '(현재 조건에서 후보 없음)';
    Clipboard.copyWithFeedback(text, event?.currentTarget);
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

  async saveKeyword(fileName, kwMap, dims) {
    try {
      const db = await this._getDB();
      if (!db) return;
      const tx = db.transaction('kw', 'readwrite');
      const store = tx.objectStore('kw');
      store.clear();
      store.put({ id: '__meta__', fileName, savedAt: Date.now(), dims });
      for (const [id, e] of Object.entries(kwMap)) {
        store.put({ id, ...e });
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
      // 구버전(dims 메타 없음) IndexedDB 레코드는 노선/디바이스 2차원 포맷으로 정규화 — Notes._normalizeNote와 동일한 read-시점 마이그레이션 원칙.
      const dims = meta?.dims !== undefined ? meta.dims : [{key:'route',label:'노선'},{key:'device',label:'디바이스'}];
      const kwMap = {};
      all.filter(x => x.id !== '__meta__').forEach(({ id, ...rest }) => { kwMap[id] = rest; });
      return Object.keys(kwMap).length ? { fileName: meta?.fileName, kwMap, dims } : null;
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
      KWStore.load(k.kwMap, k.dims);
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

  setDaily(date, text, tag = '') {
    const d = this._load();
    if (!d.daily) d.daily = {};
    if (text.trim()) d.daily[date] = { text, tag, updatedAt: Date.now() };
    else delete d.daily[date];
    this._save(d);
  },

  // 과거 문자열 형태(`d.daily[date]`가 string)로 저장된 메모를 읽을 때 즉시 객체로 변환.
  // 배치 마이그레이션 없이 read 시점에만 처리 — 저장 형식은 저장할 때만 갱신됨.
  _normalizeNote(raw) {
    if (!raw) return { text: '', tag: '', updatedAt: null };
    if (typeof raw === 'string') return { text: raw, tag: '', updatedAt: null };
    return { text: raw.text || '', tag: raw.tag || '', updatedAt: raw.updatedAt ?? null };
  },

  getReport()       { return this._load().report || ''; },
  getDaily(date)    { return this._normalizeNote((this._load().daily || {})[date]); },
  getAllDaily() {
    const daily = this._load().daily || {};
    const out = {};
    Object.entries(daily).forEach(([date, raw]) => { out[date] = this._normalizeNote(raw); });
    return out;
  },
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
    const note = this.getDaily(date);
    document.getElementById('note-modal-date').textContent = date;
    document.getElementById('note-modal-tag').value = note.tag;
    document.getElementById('note-modal-ta').value = note.text;
    document.getElementById('m-note').classList.remove('hidden');
    setTimeout(() => document.getElementById('note-modal-ta').focus(), 80);
  },

  saveModal() {
    const text = document.getElementById('note-modal-ta').value;
    const tag = document.getElementById('note-modal-tag').value.trim();
    this.setDaily(this._editDate, text, tag);
    document.getElementById('m-note').classList.add('hidden');
    UI.renderTable();
    CH.renderTrend(Store.byDate());
    CH.renderDoD(Store.byDate());
    Deployer.autoDeploy();
  },

  deleteModal() {
    this.setDaily(this._editDate, '');
    document.getElementById('m-note').classList.add('hidden');
    UI.renderTable();
    CH.renderTrend(Store.byDate());
    CH.renderDoD(Store.byDate());
    Deployer.autoDeploy();
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
      entries.forEach(([date, raw]) => {
        const note = this._normalizeNote(raw);
        text += `[${date}] ${note.tag ? '(' + note.tag + ') ' : ''}${note.text}\n`;
      });
    }
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' })),
      download: `jemboard_notes_${new Date().toISOString().slice(0,10)}.txt`,
    });
    a.click();
  },
};

// ── 컬럼 매핑 UI ───────────────────────────────────────────────────────────────
const MappingUI = {
  open() {
    document.getElementById('m-schema').classList.remove('hidden');
    this._render();
  },

  close() {
    document.getElementById('m-schema').classList.add('hidden');
  },

  _render() {
    const opts0 = `<option value="">— 매핑 없음 —</option>` +
      SchemaMap.headers.map(h => `<option value="${h}">${h}</option>`).join('');
    const rows = Object.entries(FIELD_SCHEMA).map(([field, cfg]) => {
      const cur = SchemaMap.get(field) || '';
      const opts = `<option value="">— 매핑 없음 —</option>` +
        SchemaMap.headers.map(h => `<option value="${h}"${h===cur?' selected':''}>${h}</option>`).join('');
      const ok = !!cur;
      const icon = ok ? '✓' : (cfg.required ? '⚠' : '○');
      const clr = ok ? 'var(--green)' : (cfg.required ? 'var(--orange)' : 'var(--muted)');
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="color:${clr};font-weight:700;padding:6px 8px;width:20px;">${icon}</td>
        <td style="font-size:12px;padding:6px 4px;white-space:nowrap;">
          ${cfg.label}${cfg.required ? '<span style="color:var(--red)">*</span>' : ''}
        </td>
        <td style="padding:4px 0 4px 8px;">
          <select class="f-input schema-sel" data-field="${field}"
            style="width:100%;font-size:12px;padding:4px 8px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">
            ${opts}
          </select>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('schema-table-body').innerHTML = rows;
  },

  save() {
    document.querySelectorAll('.schema-sel').forEach(sel => {
      SchemaMap.set(sel.dataset.field, sel.value || null);
    });
    const rows = SchemaMap.reExtract();
    if (!rows.length) { alert('매핑 결과 데이터가 없습니다. 날짜·광고비 컬럼을 확인하세요.'); return; }
    Store.load(rows);
    UI.render();
    this.updateBadge();
    this.close();
    Deployer.autoDeploy();
  },

  updateBadge() {
    const total = Object.keys(FIELD_SCHEMA).length;
    const mapped = SchemaMap.getMappedCount();
    const warn = SchemaMap.hasCriticalMissing();
    const badge = document.getElementById('schema-badge');
    if (!badge) return;
    badge.textContent = `${warn ? '⚠' : '✓'} 매핑 ${mapped}/${total}`;
    badge.style.borderColor = warn ? 'var(--orange)' : 'var(--green)';
    badge.style.color = warn ? 'var(--orange)' : 'var(--green)';
    badge.classList.remove('hidden');
  },
};

// ── 키워드 컬럼 매핑 UI (MappingUI와 동일 패턴, 키워드 탭 전용) ──────────────────
const KWMappingUI = {
  _resume: null, _headers: [],

  open(headers, resume) {
    this._headers = headers;
    this._resume = resume;
    document.getElementById('m-kw-schema').classList.remove('hidden');
    this._render();
  },

  close() { document.getElementById('m-kw-schema').classList.add('hidden'); },

  _render() {
    const rows = Object.entries(KW_FIELD_SCHEMA).map(([field, cfg]) => {
      const cur = KWSchemaMap.get(field) || '';
      const opts = `<option value="">— 매핑 없음 —</option>` +
        this._headers.map(h => `<option value="${h}"${h===cur?' selected':''}>${h}</option>`).join('');
      const ok = !!cur;
      const icon = ok ? '✓' : (cfg.required ? '⚠' : '○');
      const clr = ok ? 'var(--green)' : (cfg.required ? 'var(--orange)' : 'var(--muted)');
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="color:${clr};font-weight:700;padding:6px 8px;width:20px;">${icon}</td>
        <td style="font-size:12px;padding:6px 4px;white-space:nowrap;">
          ${cfg.label}${cfg.required ? '<span style="color:var(--red)">*</span>' : ''}
        </td>
        <td style="padding:4px 0 4px 8px;">
          <select class="f-input kw-schema-sel" data-field="${field}"
            style="width:100%;font-size:12px;padding:4px 8px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">
            ${opts}
          </select>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('kw-schema-table-body').innerHTML = rows;
  },

  save() {
    document.querySelectorAll('.kw-schema-sel').forEach(sel => {
      KWSchemaMap.set(sel.dataset.field, sel.value || null);
    });
    if (KWSchemaMap.hasCriticalMissing()) {
      alert('필수 컬럼(*)을 모두 매핑해야 합니다.');
      return;
    }
    this.close();
    const resume = this._resume;
    this._resume = null;
    resume?.();
  },
};

// ── GitHub 배포 ────────────────────────────────────────────────────────────────
const Deployer = {
  REPO_KEY: 'jb_repo_settings',
  PAT_KEY:  'jb_admin_pat',

  get OWNER() { return this._cfg().owner || 'jjjam6237'; },
  get REPO()  { return this._cfg().repo  || 'jemboard'; },
  _cfg() { try { return JSON.parse(localStorage.getItem(this.REPO_KEY) || '{}'); } catch(e) { return {}; } },

  open() {
    const stored = localStorage.getItem(this.PAT_KEY);
    if (stored) document.getElementById('deploy-pat-input').value = stored;
    document.getElementById('deploy-owner-input').value = this.OWNER;
    document.getElementById('deploy-repo-input').value  = this.REPO;
    document.getElementById('m-deploy').classList.remove('hidden');
    document.getElementById('deploy-progress').classList.add('hidden');
    document.getElementById('deploy-actions').classList.remove('hidden');
    document.getElementById('deploy-pat-section').classList.remove('hidden');
  },

  close() { document.getElementById('m-deploy').classList.add('hidden'); },

  _setStatus(msg, color) {
    const el = document.getElementById('deploy-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || 'var(--green)';
    el.style.display = msg ? '' : 'none';
  },

  _buildFiles() {
    const files = [];
    if (Store.raw?.length) {
      const fname = document.getElementById('fname').textContent.replace(/^ — /, '').trim();
      files.push({ path: 'data.json', content: JSON.stringify({
        fileName: fname, updatedAt: new Date().toISOString(),
        rows: Store.raw,
        targets: JSON.parse(localStorage.getItem('jb_targets') || '{}'),
        notes: Notes.getData()
      })});
    }
    if (KWStore.raw?.length) {
      const kwRows = KWStore.raw.map(r => KWStore._agg(r)).filter(r => r.impr > 0 || r.cost > 0);
      let targets; try { targets = JSON.parse(localStorage.getItem('jb_targets') || '{}'); } catch(e) { targets = {}; }
      const cfg = ActionQueueUI.cfg();
      const done = ActionQueueUI.doneMap();
      const exclude = ActionQueue.detectExclusion(KWStore.raw, KWStore.allDates, cfg)
        .map(i => ({ ...i, done: !!done['exclude__'+i.key] }));
      const scaleUp = ActionQueue.detectScaleUp(KWStore.raw, targets.cpa || 0, cfg, r => KWStore.grade(r))
        .map(i => ({ ...i, done: !!done['scaleUp__'+i.key] }));
      files.push({ path: 'kw_data.json', content: JSON.stringify({
        dateFrom: KWStore.dateFrom, dateTo: KWStore.dateTo, rows: kwRows, dims: KWStore.dimDefs,
        actionQueue: { generatedAt: new Date().toISOString(), cfg, hasTargetCpa: !!targets.cpa, exclude, scaleUp },
      })});
    }
    return files;
  },

  // 업로드 완료 후 자동 호출 — PAT 없으면 설정 모달, 있으면 조용히 push
  async autoDeploy() {
    const pat = localStorage.getItem(this.PAT_KEY);
    if (!pat) { this.open(); return; }
    const files = this._buildFiles();
    if (!files.length) return;
    this._setStatus('⏳ 배포 중...');
    try {
      await this._gitPush(pat, files, () => {});
      this._setStatus('☁ 배포 완료');
      setTimeout(() => this._setStatus(''), 5000);
    } catch(err) {
      this._setStatus('⚠ 배포 실패 — 설정을 확인하세요', 'var(--orange)');
      setTimeout(() => this._setStatus(''), 10000);
    }
  },

  async deploy() {
    const pat   = document.getElementById('deploy-pat-input').value.trim();
    const owner = document.getElementById('deploy-owner-input').value.trim();
    const repo  = document.getElementById('deploy-repo-input').value.trim();
    if (!owner || !repo) { alert('Owner와 Repository를 입력해주세요.'); return; }
    if (!pat) { alert('GitHub 토큰을 입력해주세요.'); return; }
    localStorage.setItem(this.REPO_KEY, JSON.stringify({ owner, repo }));
    if (document.getElementById('deploy-remember').checked) {
      localStorage.setItem(this.PAT_KEY, pat);
    }

    document.getElementById('deploy-actions').classList.add('hidden');
    document.getElementById('deploy-pat-section').classList.add('hidden');
    document.getElementById('deploy-progress').classList.remove('hidden');
    const setMsg = t => { document.getElementById('deploy-progress-text').textContent = t; };

    try {
      const files = this._buildFiles();
      if (!files.length) { alert('배포할 데이터가 없습니다.'); this.close(); return; }
      setMsg('GitHub에 연결 중...');
      await this._gitPush(pat, files, setMsg);
      setMsg('배포 완료!');
      this._setStatus('☁ 배포 완료');
      setTimeout(() => { this.close(); setTimeout(() => this._setStatus(''), 5000); }, 800);
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

// ── 분석 탭 ───────────────────────────────────────────────────────────────────
const AnCh = { funnelSeg: null, contribBubble: null };

const AnUI = {
  render() {
    const hasData = Store.raw?.length > 0;
    document.getElementById('an-empty').classList.toggle('hidden', hasData);
    document.getElementById('an-content').classList.toggle('hidden', !hasData);
    if (!hasData) return;
    this._populateDimSelect('an-funnel-dim', '');
    this.renderFunnel();
    const defaultDim = Object.keys(Store.dims)[0] || '';
    this._populateDimSelect('an-contrib-dim', defaultDim);
    this.renderContrib();
    this.renderAnomaly();
  },

  _populateDimSelect(id, defaultVal) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value || defaultVal || '';
    const extraOpt = id === 'an-funnel-dim' ? '<option value="">전체 (세그먼트 없음)</option>' : '<option value="">— 차원 선택 —</option>';
    sel.innerHTML = extraOpt +
      Object.keys(Store.dims).map(f =>
        `<option value="${f}"${f===cur?' selected':''}>${_dimLabels[f]||f}</option>`
      ).join('');
  },

  onFunnelDimChange()  { this.renderFunnel(); },
  onContribDimChange() { this.renderContrib(); },

  renderContrib() {
    const field = document.getElementById('an-contrib-dim')?.value;
    if (!field) return;
    this._renderContribBubble(field);
    this._renderContribTable(field);
  },

  _renderContribBubble(field) {
    const segs = Store.byDim(field);
    if (!segs.length) return;

    // 전체 집계 (분모 0 가드)
    const totalCost    = segs.reduce((s, r) => s + r.cost, 0);
    const totalRevenue = segs.reduce((s, r) => s + r.revenue, 0);
    // 전체 ROAS: Y축 기준선
    const overallRoas  = totalCost > 0 ? totalRevenue / totalCost : 0;
    // X축 기준선: 균등 배분 시 각 세그먼트 비중
    const avgShare     = segs.length > 0 ? 100 / segs.length : 50;
    // 버블 반지름: sqrt(전환/최대전환) × maxR (면적이 전환수에 비례)
    const maxConv = Math.max(...segs.map(s => s.conv || 0), 1);
    const maxR = 38;

    const datasets = segs.map(s => {
      const costShare = totalCost > 0 ? s.cost / totalCost * 100 : 0;
      const r = Math.max(5, Math.sqrt((s.conv || 0) / maxConv) * maxR);
      return {
        label: s[field] || '(없음)',
        data: [{ x: costShare, y: s.roas || 0, r, conv: s.conv || 0, cost: s.cost || 0 }],
        backgroundColor: getDimColor(s[field]) + 'aa',
        borderColor:     getDimColor(s[field]),
        borderWidth: 1.5,
      };
    });

    // 4분면 기준선을 afterDraw 플러그인으로 그리기
    const quadPlugin = {
      id: 'quadrant',
      afterDraw(chart) {
        const { ctx, chartArea: { left, right, top, bottom }, scales } = chart;
        const px = scales.x.getPixelForValue(avgShare);
        const py = scales.y.getPixelForValue(overallRoas);
        ctx.save();
        ctx.strokeStyle = '#8b90a050';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(px, top);    ctx.lineTo(px, bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(left, py);   ctx.lineTo(right, py);  ctx.stroke();
        // 4분면 레이블
        ctx.font = '10px system-ui';
        ctx.fillStyle = '#8b90a060';
        ctx.fillText('효율↑·규모↑', px + 5, top + 14);
        ctx.fillText('효율↑·규모↓', left + 4, top + 14);
        ctx.fillText('효율↓·규모↑', px + 5, bottom - 6);
        ctx.fillText('효율↓·규모↓', left + 4, bottom - 6);
        ctx.restore();
      },
    };

    if (AnCh.contribBubble) { AnCh.contribBubble.destroy(); AnCh.contribBubble = null; }
    AnCh.contribBubble = new Chart(document.getElementById('c-an-contrib-bubble'), {
      type: 'bubble',
      data: { datasets },
      plugins: [quadPlugin],
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8b90a0', font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label(ctx) {
                const d = ctx.raw;
                return `${ctx.dataset.label} | 비용비중 ${d.x.toFixed(1)}% | ROAS ${d.y.toFixed(2)}x | 전환 ${d.conv.toLocaleString()}건`;
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: '비용 비중 (%)', color: '#8b90a0', font: { size: 10 } },
               ticks: { color: '#8b90a0', font: { size: 9 }, callback: v => v.toFixed(0) + '%' }, grid: { color: '#2a2d3e' } },
          y: { title: { display: true, text: 'ROAS', color: '#8b90a0', font: { size: 10 } },
               ticks: { color: '#8b90a0', font: { size: 9 }, callback: v => v.toFixed(1) + 'x' }, grid: { color: '#2a2d3e' } },
        },
      },
    });
  },

  onAnomalyChange() { this.renderAnomaly(); },

  renderAnomaly() {
    const metric = document.getElementById('an-anom-metric')?.value || 'cost';
    const win    = parseInt(document.getElementById('an-anom-window')?.value || '7', 10);
    const sigma  = parseFloat(document.getElementById('an-anom-sigma')?.value || '2');
    const anomalies = this._detectAnomalies(metric, win, sigma);

    const emptyEl = document.getElementById('an-anom-empty');
    const tableEl = document.getElementById('an-anom-table-wrap');
    if (!emptyEl || !tableEl) return;

    if (!anomalies.length) {
      emptyEl.classList.remove('hidden');
      tableEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');

    const metricLabel = { cost:'비용', conv:'전환수', cpa:'CPA', roas:'ROAS' };
    const fmt = (v, m) => {
      if (m === 'cost') return '₩' + Math.round(v).toLocaleString();
      if (m === 'conv') return Math.round(v).toLocaleString() + '건';
      if (m === 'cpa')  return '₩' + Math.round(v).toLocaleString();
      return v.toFixed(2) + 'x';
    };

    tableEl.innerHTML = `
      <table class="an-anom-tbl">
        <thead><tr>
          <th>날짜</th><th>지표</th><th>실제값</th><th>기대 범위</th><th>편차</th><th>방향</th>
        </tr></thead>
        <tbody>${anomalies.map(a => `<tr>
          <td class="td-date">${a.date}</td>
          <td>${metricLabel[metric] || metric}</td>
          <td class="td-val">${fmt(a.actual, metric)}</td>
          <td class="td-range">${fmt(a.lower, metric)} ~ ${fmt(a.upper, metric)}</td>
          <td class="${a.zScore > 0 ? 'td-pos' : 'td-neg'}">${a.zScore > 0 ? '+' : ''}${a.zScore.toFixed(2)}σ</td>
          <td class="td-dir">${a.zScore > 0 ? '↑ 급등' : '↓ 급락'}</td>
        </tr>`).join('')}
        </tbody>
      </table>
      <div class="an-anom-hint">이동평균 ±${sigma}σ 기준 · 윈도우 ${win}일 · ${anomalies.length}건 탐지</div>`;
  },

  // 이동평균 Z-score 이상탐지
  // 각 날짜 t에 대해 직전 win일의 평균(μ)·표준편차(σ)를 구해,
  // |actual - μ| > sigma × σ 이면 이상치로 판정
  _detectAnomalies(metric, win, sigma) {
    // byDate()는 내부적으로 derived()를 호출하므로 cpa/roas가 이미 계산돼 있음
    const byDate = Store.byDate();
    if (byDate.length < win + 1) return [];

    const getValue = r => {
      if (metric === 'cpa')  return r.cost > 0 && r.conv > 0 ? r.cost / r.conv : null;
      if (metric === 'roas') return r.cost > 0 ? r.revenue / r.cost : null;
      return r[metric] ?? null;
    };

    const anomalies = [];
    for (let i = win; i < byDate.length; i++) {
      const window = byDate.slice(i - win, i);
      const vals = window.map(r => getValue(r)).filter(v => v !== null);
      if (vals.length < 2) continue;                     // 분산 계산 불가

      const mu  = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mu) ** 2, 0) / vals.length;
      const sd  = Math.sqrt(variance);
      if (sd === 0) continue;                            // 모든 값이 동일 → 이상치 없음

      const actual = getValue(byDate[i]);
      if (actual === null) continue;

      const z = (actual - mu) / sd;
      if (Math.abs(z) >= sigma) {
        anomalies.push({
          date:   byDate[i].date,
          actual,
          lower:  mu - sigma * sd,
          upper:  mu + sigma * sd,
          zScore: z,
        });
      }
    }
    // 편차(|z|) 내림차순
    return anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  },

  _renderContribTable(field) {
    const segs = Store.byDim(field);
    if (!segs.length) return;

    const totalCost    = segs.reduce((s, r) => s + r.cost, 0);
    const totalRevenue = segs.reduce((s, r) => s + r.revenue, 0);
    const totalConv    = segs.reduce((s, r) => s + r.conv, 0);
    // 전체 ROAS (분모 0 가드)
    const overallRoas  = totalCost > 0 ? totalRevenue / totalCost : 0;

    const sorted = [...segs].sort((a, b) => (b.roas || 0) - (a.roas || 0));
    const pct = (v, tot) => tot > 0 ? (v / tot * 100).toFixed(1) + '%' : '—';

    document.getElementById('an-contrib-table-wrap').innerHTML = `
      <table class="an-contrib-tbl">
        <thead><tr>
          <th>#</th><th>${_dimLabels[field] || field}</th>
          <th>비용비중</th><th>매출비중</th><th>전환비중</th><th>ROAS</th>
        </tr></thead>
        <tbody>${sorted.map((s, i) => `<tr>
          <td class="td-rank">${i + 1}</td>
          <td><span class="an-dot" style="background:${getDimColor(s[field]||'')}"></span>${s[field] || '(없음)'}</td>
          <td>${pct(s.cost, totalCost)}</td>
          <td>${pct(s.revenue, totalRevenue)}</td>
          <td>${pct(s.conv, totalConv)}</td>
          <td class="${(s.roas||0) >= overallRoas ? 'td-pos' : 'td-neg'}">${(s.roas||0).toFixed(2)}x</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td></td><td class="td-sum">합계</td>
          <td>100.0%</td><td>100.0%</td><td>100.0%</td>
          <td class="td-sum">${overallRoas.toFixed(2)}x</td>
        </tr></tfoot>
      </table>`;
  },

  renderFunnel() {
    // Store.filtered 전체 집계
    const tot = { impr:0, clicks:0, cost:0, conv:0, revenue:0 };
    Store.filtered.forEach(r => {
      tot.impr    += r.impr;
      tot.clicks  += r.clicks;
      tot.cost    += r.cost;
      tot.conv    += r.conv;
      tot.revenue += r.revenue;
    });
    derived(tot);
    this._renderOverallFunnel(tot);

    const field = document.getElementById('an-funnel-dim')?.value;
    const segEl = document.getElementById('an-funnel-segment');
    if (field && Store.dims[field]) {
      segEl.classList.remove('hidden');
      this._renderSegmentFunnel(field);
    } else {
      segEl.classList.add('hidden');
      if (AnCh.funnelSeg) { AnCh.funnelSeg.destroy(); AnCh.funnelSeg = null; }
    }
  },

  _renderOverallFunnel(tot) {
    const el = document.getElementById('an-funnel-overall');
    if (!el) return;
    if (tot.impr === 0) {
      el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px 0;">데이터 없음</p>';
      return;
    }
    // log10 스케일 너비: 분모 0 가드, 최소 10% 확보
    const logMax = Math.log10(Math.max(tot.impr, 1));
    const logW = v => v > 0 ? Math.max(10, Math.log10(v) / logMax * 100).toFixed(1) : 0;
    // CVR = conv / clicks (클릭 0 가드)
    const cvr = tot.clicks > 0 ? tot.conv / tot.clicks * 100 : 0;

    const stages = [
      { label:'노출', icon:'👁', val:tot.impr,    fmtV: v => v.toLocaleString()+'회', color:'#4c9eff' },
      { label:'클릭', icon:'🖱', val:tot.clicks,  fmtV: v => v.toLocaleString()+'회', color:'#2ecc71',
        rate:{ label:'CTR', val:tot.ctr,  fmtR: v => v.toFixed(2)+'%' },
        drop: tot.impr   > 0 ? (1 - tot.clicks / tot.impr)   * 100 : 0 },
      { label:'전환', icon:'🎯', val:tot.conv,    fmtV: v => v.toLocaleString()+'건', color:'#f39c12',
        rate:{ label:'CVR', val:cvr,      fmtR: v => v.toFixed(2)+'%' },
        drop: tot.clicks > 0 ? (1 - tot.conv   / tot.clicks) * 100 : 0 },
      { label:'매출', icon:'💰', val:tot.revenue, fmtV: v => '₩'+Math.round(v).toLocaleString(), color:'#9b59b6',
        rate:{ label:'ROAS', val:tot.roas, fmtR: v => v.toFixed(2)+'x' } },
    ];

    el.innerHTML = '<div class="funnel-wrap">' + stages.map((s, i) => {
      const w = logW(s.val);
      const connector = i > 0 ? `<div class="funnel-connector">
        ${s.rate ? `<span class="funnel-badge" style="color:${s.color}">${s.rate.label} <strong>${s.rate.fmtR(s.rate.val)}</strong></span>` : ''}
        ${s.drop != null ? `<span class="funnel-drop">이탈 ${s.drop.toFixed(1)}%</span>` : ''}
      </div>` : '';
      return `${connector}<div class="funnel-row">
        <div class="funnel-lbl">${s.icon} ${s.label}</div>
        <div class="funnel-track">
          <div class="funnel-fill" style="width:${w}%;background:${s.color};">
            <span class="funnel-val">${s.fmtV(s.val)}</span>
          </div>
        </div>
      </div>`;
    }).join('') + '</div>';
  },

  _renderSegmentFunnel(field) {
    // 비용 내림차순 상위 8 세그먼트
    const segs = Store.byDim(field).sort((a,b) => (b.cost||0) - (a.cost||0)).slice(0, 8);
    const labels = segs.map(s => s[field] || '(없음)');
    // CVR = conv/clicks (클릭 0 가드)
    const ctrData  = segs.map(s => s.ctr  || 0);
    const cvrData  = segs.map(s => s.clicks > 0 ? s.conv / s.clicks * 100 : 0);
    const roasData = segs.map(s => s.roas || 0);

    if (AnCh.funnelSeg) { AnCh.funnelSeg.destroy(); AnCh.funnelSeg = null; }
    AnCh.funnelSeg = new Chart(document.getElementById('c-an-funnel-seg'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'CTR (%)',  data:ctrData,  backgroundColor:'#4c9eff88', borderColor:'#4c9eff', borderWidth:1, borderRadius:3, yAxisID:'y' },
          { label:'CVR (%)',  data:cvrData,  backgroundColor:'#2ecc7188', borderColor:'#2ecc71', borderWidth:1, borderRadius:3, yAxisID:'y' },
          { label:'ROAS (x)', data:roasData, backgroundColor:'#9b59b688', borderColor:'#9b59b6', borderWidth:1, borderRadius:3, yAxisID:'y2' },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{labels:{color:'#8b90a0',font:{size:11},boxWidth:10}}, tooltip:{mode:'index',intersect:false} },
        scales:{
          x:  { ticks:{color:'#8b90a0',font:{size:10}}, grid:{color:'#2a2d3e'} },
          y:  { position:'left',  ticks:{color:'#8b90a0',font:{size:10},callback:v=>v.toFixed(1)+'%'}, grid:{color:'#2a2d3e'},
                title:{display:true,text:'CTR / CVR (%)',color:'#8b90a0',font:{size:10}} },
          y2: { position:'right', ticks:{color:'#9b59b6',font:{size:10},callback:v=>v.toFixed(1)+'x'}, grid:{display:false},
                title:{display:true,text:'ROAS',color:'#9b59b6',font:{size:10}} },
        },
      },
    });
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
        // 초기화 버튼 활성화 (잠금 해제 시 보임)
        ['btn-reset','btn-reset-kw'].forEach(id =>
          document.getElementById(id)?.classList.remove('hidden'));
        campaignLoaded = true;
      }
    }
  } catch(e) {}

  // 2. GitHub에서 키워드 데이터
  try {
    const res = await fetch(`${RAW}/kw_data.json?t=${Date.now()}`);
    if (res.ok) {
      const { dateFrom, dateTo, rows, dims, actionQueue } = await res.json();
      if (rows?.length) {
        KWStore.loadAggregated(rows, dateFrom, dateTo, dims, actionQueue);
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
