const STATE = {
  config: null,
  segments: [],
  links: []
};

async function loadConfig() {
  const res = await fetch('/api/config');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  STATE.config = json.config;
  renderGlobal();
  renderSegments();
  renderLinks();
  recalc();
}

function renderGlobal() {
  const c = STATE.config;
  document.getElementById('design_endpoint_assumption').value = c.design_endpoint_assumption ?? 0;
  document.getElementById('notice').value = c.notice ?? '';
  const t = c.thresholds || {};
  document.getElementById('warning_utilization_percent').value = t.warning_utilization_percent ?? 70;
  document.getElementById('critical_utilization_percent').value = t.critical_utilization_percent ?? 85;
  document.getElementById('target_utilization_percent').value = t.target_utilization_percent ?? 70;
  document.getElementById('headroom_factor').value = t.headroom_factor ?? 1.25;
}

function bindGlobal() {
  const ids = ['design_endpoint_assumption','notice','warning_utilization_percent','critical_utilization_percent','target_utilization_percent','headroom_factor'];
  for (const id of ids) {
    document.getElementById(id).addEventListener('input', () => {
      if (id === 'design_endpoint_assumption') STATE.config.design_endpoint_assumption = parseInt(document.getElementById(id).value) || 0;
      if (id === 'notice') STATE.config.notice = document.getElementById(id).value;
      if (id.includes('_utilization_percent') || id === 'headroom_factor') {
        const t = STATE.config.thresholds || (STATE.config.thresholds = {});
        if (id === 'warning_utilization_percent') t.warning_utilization_percent = parseFloat(document.getElementById(id).value) || 0;
        if (id === 'critical_utilization_percent') t.critical_utilization_percent = parseFloat(document.getElementById(id).value) || 0;
        if (id === 'target_utilization_percent') t.target_utilization_percent = parseFloat(document.getElementById(id).value) || 0;
        if (id === 'headroom_factor') t.headroom_factor = parseFloat(document.getElementById(id).value) || 1;
      }
      recalc();
    });
  }
}

function renderSegments() {
  const tbody = document.querySelector('#segmentsTable tbody');
  tbody.innerHTML = '';
  const tpl = document.getElementById('segmentRowTpl').content;
  for (let i=0; i<STATE.config.segments.length; i++) {
    const s = STATE.config.segments[i];
    const tr = tpl.cloneNode(true);
    tr.querySelector('.key').textContent = s.key || '';
    tr.querySelector('.name').value = s.name || '';
    tr.querySelector('.vlan').value = s.vlan ?? '';
    tr.querySelector('.endpoints').value = s.endpoints ?? 0;
    tr.querySelector('.active').value = s.active_fraction ?? 0;
    tr.querySelector('.active-num').value = s.active_fraction ?? 0;
    tr.querySelector('.avg').value = s.avg_mbps_per_active_endpoint ?? 0;
    tr.querySelector('.ext').value = s.external_fraction ?? 0;
    tr.querySelector('.ext-num').value = s.external_fraction ?? 0;
    tr.querySelector('.offered').textContent = (s.endpoints*(s.active_fraction||0)*(s.avg_mbps_per_active_endpoint||0)).toFixed(2);
    tr.querySelector('.external').textContent = ((s.endpoints*(s.active_fraction||0)*(s.avg_mbps_per_active_endpoint||0))*(s.external_fraction||0)).toFixed(2);

    tr.querySelector('.name').addEventListener('input', e => { s.name = e.target.value; });
    tr.querySelector('.vlan').addEventListener('input', e => { s.vlan = parseInt(e.target.value)||0; });
    tr.querySelector('.endpoints').addEventListener('input', e => { s.endpoints = parseInt(e.target.value)||0; updateRow(tr,s); recalc(); });
    tr.querySelector('.active').addEventListener('input', e => { s.active_fraction = parseFloat(e.target.value); tr.querySelector('.active-num').value = s.active_fraction; updateRow(tr,s); recalc(); });
    tr.querySelector('.active-num').addEventListener('input', e => { s.active_fraction = Math.max(0,Math.min(1,parseFloat(e.target.value)||0)); tr.querySelector('.active').value = s.active_fraction; updateRow(tr,s); recalc(); });
    tr.querySelector('.avg').addEventListener('input', e => { s.avg_mbps_per_active_endpoint = parseFloat(e.target.value)||0; updateRow(tr,s); recalc(); });
    tr.querySelector('.ext').addEventListener('input', e => { s.external_fraction = parseFloat(e.target.value); tr.querySelector('.ext-num').value = s.external_fraction; updateRow(tr,s); recalc(); });
    tr.querySelector('.ext-num').addEventListener('input', e => { s.external_fraction = Math.max(0,Math.min(1,parseFloat(e.target.value)||0)); tr.querySelector('.ext').value = s.external_fraction; updateRow(tr,s); recalc(); });

    tbody.appendChild(tr);
  }
}

function updateRow(tr,s) {
  const offered = (s.endpoints||0)*(s.active_fraction||0)*(s.avg_mbps_per_active_endpoint||0);
  const ext = offered*(s.external_fraction||0);
  tr.querySelector('.offered').textContent = offered.toFixed(2);
  tr.querySelector('.external').textContent = ext.toFixed(2);
}

function renderLinks() {
  const tbody = document.querySelector('#linksTable tbody');
  tbody.innerHTML = '';
  const tpl = document.getElementById('linkRowTpl').content;
  for (let i=0; i<STATE.config.links.length; i++) {
    const l = STATE.config.links[i];
    const tr = tpl.cloneNode(true);
    tr.querySelector('.link-name').textContent = l.name || '';
    tr.querySelector('.cap').value = l.capacity_mbps ?? 0;
    tr.querySelector('.mode').textContent = l.mode || '';
    tr.querySelector('.segkeys').textContent = (l.segment_keys||[]).join(', ');
    tr.querySelector('.note').value = l.notes || '';

    tr.querySelector('.cap').addEventListener('input', e => { l.capacity_mbps = parseFloat(e.target.value)||0; recalc(); });
    tr.querySelector('.note').addEventListener('input', e => { l.notes = e.target.value; });

    tbody.appendChild(tr);
  }
}

let recalcTimer = null;
let recalcSeq = 0;

function recalc() {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(runCalc, 200);
}

function showError(message) {
  const el = document.getElementById('errorBanner');
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  document.getElementById('errorBanner').hidden = true;
}

async function runCalc() {
  const seq = ++recalcSeq;
  updateSums();
  try {
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(STATE.config)
    });
    const json = await res.json();
    if (seq !== recalcSeq) return;
    if (!json.ok) throw new Error(json.error);
    clearError();
    STATE.segments = json.segments;
    STATE.links = json.links;
    renderResults();
    renderBars();
    updateLinkTable();
  } catch (e) {
    if (seq !== recalcSeq) return;
    showError(e.message);
  }
}

function updateSums() {
  let total = 0, off = 0, ext = 0;
  for (const s of STATE.config.segments) {
    total += parseInt(s.endpoints)||0;
    const o = (parseInt(s.endpoints)||0)*(parseFloat(s.active_fraction)||0)*(parseFloat(s.avg_mbps_per_active_endpoint)||0);
    off += o;
    ext += o*(parseFloat(s.external_fraction)||0);
  }
  document.getElementById('totalEndpoints').textContent = total;
  document.getElementById('totalOffered').textContent = off.toFixed(2)+' Mbps';
  document.getElementById('totalExternal').textContent = ext.toFixed(2)+' Mbps';
  const exp = parseInt(STATE.config.design_endpoint_assumption)||0;
  const pill = document.getElementById('sumStatus');
  if (exp === total) { pill.className='pill ok'; pill.textContent='Match (sum='+total+')'; }
  else { pill.className='pill warn'; pill.textContent='Mismatch: sum '+total+' vs design '+exp; }
}

function renderResults() {
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';
  let totOff = 0, totExt = 0;
  for (const s of STATE.segments) { totOff += s.estimated_offered_mbps||0; totExt += s.estimated_external_mbps||0; }
  const cards = [
    {label:'Total offered', value: totOff.toFixed(2)+' Mbps'},
    {label:'Total external', value: totExt.toFixed(2)+' Mbps'},
    {label:'Links computed', value: STATE.links.length},
    {label:'Critical links', value: STATE.links.filter(l=>l.status==='CRITICAL').length}
  ];
  for (const c of cards) {
    const el = document.createElement('div');
    el.className='result-card';
    el.innerHTML = `<div class="label">${c.label}</div><div class="value">${c.value}</div>`;
    grid.appendChild(el);
  }
}

function renderBars() {
  const bars = document.getElementById('segmentBars');
  bars.innerHTML = '';
  let max = 0;
  for (const s of STATE.segments) if ((s.estimated_offered_mbps||0)>max) max=s.estimated_offered_mbps;
  if (max===0) max=1;
  for (const s of STATE.segments) {
    const row = document.createElement('div');
    row.className='bar-row';
    const w = Math.max(2, (s.estimated_offered_mbps||0)/max*100);
    row.innerHTML = `<div class="bar-label">${s.name} (v${s.vlan})</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="bar-value">${s.estimated_offered_mbps.toFixed(1)} Mbps</div>`;
    bars.appendChild(row);
  }
}

function updateLinkTable() {
  const tbody = document.querySelector('#linksTable tbody');
  for (let i=0; i<tbody.children.length; i++) {
    const tr = tbody.children[i];
    const lcfg = STATE.config.links[i];
    const lres = STATE.links[i];
    if (!lres) continue;
    // update demand/util
    tr.querySelector('.demand').textContent = lres.estimated_demand_mbps.toFixed(2);
    const util = lres.estimated_utilization_percent;
    const bar = tr.querySelector('.util-bar');
    const t = tr.querySelector('.util-text');
    t.textContent = util.toFixed(1)+'%';
    bar.style.width = Math.min(100, util)+'%';
    bar.classList.remove('warn','crit');
    if (util>= (STATE.config.thresholds?.critical_utilization_percent||85)) bar.classList.add('crit');
    else if (util>= (STATE.config.thresholds?.warning_utilization_percent||70)) bar.classList.add('warn');
    const pill = tr.querySelector('.pill');
    pill.textContent = lres.status;
    pill.className='pill';
    if (lres.status==='CRITICAL') pill.classList.add('crit');
    else if (lres.status==='WARNING') pill.classList.add('warn');
    else pill.classList.add('ok');
    tr.querySelector('.sugg').textContent = lres.next_standard_capacity_mbps+' Mbps';
    // don't clobber a field the user is currently typing in
    const cap = tr.querySelector('.cap');
    const note = tr.querySelector('.note');
    if (document.activeElement !== cap) cap.value = lcfg.capacity_mbps ?? 0;
    if (document.activeElement !== note) note.value = lcfg.notes ?? '';
  }
}

document.getElementById('resetToDefault').addEventListener('click', async () => {
  // reload from server config
  await loadConfig();
});

document.getElementById('saveConfig').addEventListener('click', async () => {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(STATE.config)
  });
  const json = await res.json();
  alert(json.ok ? 'Config saved to smart_campus_assumptions.json' : 'Save failed: '+json.error);
});

document.getElementById('exportLinks').addEventListener('click', () => {
  window.location = '/api/export/csv/links';
});
document.getElementById('exportSegments').addEventListener('click', () => {
  window.location = '/api/export/csv/segments';
});

bindGlobal();
loadConfig().catch(e => alert('Load failed: '+e.message));
