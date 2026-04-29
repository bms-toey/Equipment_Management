﻿﻿﻿/* ════════════════════════════════
   CUSTOM POPUP SYSTEM
════════════════════════════════ */
let _popupResolve = null;
let _popupType = 'alert';

const POPUP_ICONS = {
  info:    '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  confirm: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  danger:  '<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  prompt:  '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'
};

function showPopup({title, message, type='alert', defaultVal='', okLabel='ตกลง', cancelLabel='ยกเลิก', iconType='info', inputType='text'}) {
  return new Promise(resolve => {
    _popupResolve = resolve;
    _popupType = type;

    document.getElementById('popup-title').textContent = title || '';
    document.getElementById('popup-msg').innerHTML = message || '';
    document.getElementById('popup-ok').textContent = okLabel;

    const cancelBtn = document.getElementById('popup-cancel');
    cancelBtn.textContent = cancelLabel;
    cancelBtn.style.display = type === 'alert' ? 'none' : 'inline-flex';

    const inputWrap = document.getElementById('popup-input-wrap');
    const input = document.getElementById('popup-input');
    if (type === 'prompt') {
      inputWrap.style.display = 'block';
      input.type = inputType;
      input.value = defaultVal;
      input.placeholder = '';
      setTimeout(() => input.focus(), 120);
      input.onkeydown = e => {
        if (e.key === 'Enter') popupResolve(true);
        if (e.key === 'Escape') popupResolve(false);
      };
    } else {
      inputWrap.style.display = 'none';
      input.onkeydown = null;
    }

    const iconWrap = document.getElementById('popup-icon-wrap');
    iconWrap.className = 'popup-icon ' + iconType;
    document.getElementById('popup-icon-svg').innerHTML = POPUP_ICONS[iconType] || POPUP_ICONS.info;

    document.getElementById('popup-overlay').classList.add('open');
  });
}

function popupResolve(confirmed) {
  document.getElementById('popup-overlay').classList.remove('open');
  document.getElementById('popup-input').onkeydown = null;
  if (!_popupResolve) return;
  const resolve = _popupResolve;
  _popupResolve = null;
  resolve(_popupType === 'prompt' ? (confirmed ? document.getElementById('popup-input').value : null) : confirmed);
}

function popAlert(message, title = 'แจ้งเตือน') {
  return showPopup({ title, message, type: 'alert', iconType: 'info', okLabel: 'ตกลง' });
}
function popConfirm(message, title = 'ยืนยัน', danger = false) {
  return showPopup({ title, message, type: 'confirm', iconType: danger ? 'danger' : 'confirm', okLabel: 'ยืนยัน', cancelLabel: 'ยกเลิก' });
}
function popPrompt(message, defaultVal = '', title = 'กรอกข้อมูล', inputType = 'text') {
  return showPopup({ title, message, type: 'prompt', defaultVal, iconType: 'prompt', okLabel: 'ตกลง', cancelLabel: 'ยกเลิก', inputType });
}

/* ════════════════════════════════
   STATE
════════════════════════════════ */
let editingDeviceId = null;
let selectedDeviceId = null;
let chkCount = 0;
const TOTAL_CHK = 9;
let currentLoanFilter = 'all';
let currentDrawer = null;
let dctSelectedDeviceIds = [];

let currentUser = null;

/* ════════════════════════════════
   ITEM 1 — localStorage PERSISTENCE (ISO 13485 §4.2.4)
════════════════════════════════ */
const DB_KEY = 'medtrack_db_v1';
function saveDB() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch(e) { console.warn('DB save:', e); }
}
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    ['assets','loans','auditLog','pmList','repairs','incidents','qmsDocs','trainingRecords',
     'users','settings','safetyTests','spareParts','serviceContracts','fsca','incomingQC','spareTransactions']
      .forEach(k => { if (saved[k] !== undefined) DB[k] = saved[k]; });
    DB.loans.forEach(l => { if (l.dueTs) l.dueTs = new Date(l.dueTs); });
  } catch(e) { console.warn('DB load:', e); }
}

/* ════════════════════════════════
   ITEM 2 — SESSION TIMEOUT (21 CFR Part 11 §11.10(e))
════════════════════════════════ */
let _sessionTimer = null;
let _sessionWarnTimer = null;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_WARN_MS   = 25 * 60 * 1000;

function resetSessionTimer() {
  if (!currentUser) return;
  clearTimeout(_sessionTimer); clearTimeout(_sessionWarnTimer);
  _sessionWarnTimer = setTimeout(() => {
    if (currentUser) toast('เซสชันจะหมดอายุใน 5 นาที กรุณาดำเนินการต่อ','amber','ต่ออายุ', resetSessionTimer);
  }, SESSION_WARN_MS);
  _sessionTimer = setTimeout(() => {
    if (currentUser) {
      addAuditLog('AUTH', currentUserName(), 'ออกจากระบบอัตโนมัติ', 'Session timeout 30 นาที');
      doLogout();
      popAlert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'หมดเวลาเซสชัน');
    }
  }, SESSION_TIMEOUT_MS);
}
['click','keydown','mousemove','touchstart'].forEach(evt =>
  document.addEventListener(evt, () => { if (currentUser) resetSessionTimer(); }, {passive:true})
);

/* ════════════════════════════════
   ITEM 10 — LOGIN LOCKOUT (21 CFR Part 11 §11.10(d))
════════════════════════════════ */
const _failedLogins = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
function checkLoginLockout(username) {
  const rec = _failedLogins.get(username.toLowerCase());
  if (!rec || !rec.lockedUntil) return null;
  if (Date.now() < rec.lockedUntil) {
    const secsLeft = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
    return `บัญชีถูกล็อกชั่วคราว — ลองอีกครั้งใน ${secsLeft} วินาที`;
  }
  return null;
}
function recordFailedLogin(username) {
  const key = username.toLowerCase();
  const rec = _failedLogins.get(key) || {count:0, lockedUntil:null};
  rec.count++;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    rec.count = 0;
    addAuditLog('AUTH','ระบบ','บัญชีถูกล็อก','เข้าสู่ระบบผิดพลาด '+LOGIN_MAX_ATTEMPTS+' ครั้ง: '+username);
    saveDB();
  }
  _failedLogins.set(key, rec);
}
function clearFailedLogin(username) { _failedLogins.delete(username.toLowerCase()); }

const ROLE_PERMISSIONS = {
  admin:   ['dashboard','assets','loans','pm','repair','incident','audit','reports','settings','qms','safety','spare','contracts','fsca'],
  bmed:    ['dashboard','assets','loans','pm','repair','incident','audit','reports','settings','qms','safety','spare','contracts','fsca'],
  nurse:   ['dashboard','loans','incident'],
  manager: ['dashboard','assets','loans','pm','repair','incident','audit','reports','contracts','fsca'],
};

function currentUserName() { return currentUser ? currentUser.name : 'ระบบ'; }
function canAccess(perm) { return !!(currentUser && (ROLE_PERMISSIONS[currentUser.role]||[]).includes(perm)); }

/* ════════════════════════════════
   PAGE NAV
════════════════════════════════ */
const PAGE_META = {
  dashboard:   {title:'Dashboard',                        breadcrumb:'medtrack / overview'},
  assets:      {title:'รายการอุปกรณ์',                    breadcrumb:'medtrack / assets'},
  loanregistry:{title:'ยืม - คืน',                        breadcrumb:'medtrack / loan-registry'},
  newloan:     {title:'บันทึกยืมใหม่',                    breadcrumb:'medtrack / new-loan'},
  qms:         {title:'ตรวจสอบ & QMS',                   breadcrumb:'medtrack / qms'},
  pm:          {title:'Preventive Maintenance',           breadcrumb:'medtrack / preventive-maint'},
  repair:      {title:'แจ้งซ่อม (CM)',                    breadcrumb:'medtrack / repair'},
  incident:    {title:'Incident & CAPA',                  breadcrumb:'medtrack / incident'},
  audit:       {title:'Audit Trail',                      breadcrumb:'medtrack / audit'},
  reports:     {title:'รายงาน & KPI',                    breadcrumb:'medtrack / reports'},
  settings:    {title:'ตั้งค่า',                          breadcrumb:'medtrack / settings'},
  safety:      {title:'ทดสอบความปลอดภัยไฟฟ้า (IEC 62353)',breadcrumb:'medtrack / safety-test'},
  spare:       {title:'คลังอะไหล่ (Spare Parts)',         breadcrumb:'medtrack / spare-parts'},
  contracts:   {title:'สัญญาบริการ (Service Contract)',   breadcrumb:'medtrack / service-contract'},
  fsca:        {title:'FSCA / Recall Management',         breadcrumb:'medtrack / fsca-recall'},
};

function goto(p, el) {
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(x=>x.classList.remove('active'));
  const pg = document.getElementById('page-'+p);
  if(!pg) return;
  pg.classList.add('active');
  if(el) el.classList.add('active');
  const m = PAGE_META[p]||{title:p,breadcrumb:'medtrack/'+p};
  document.getElementById('page-title').textContent = m.title;
  document.getElementById('page-breadcrumb').textContent = m.breadcrumb;
  if(p==='newloan') resetNewLoanForm();
  if(p==='assets') renderAssetsTable();
  if(p==='loanregistry') renderLoanRegistry();
  if(p==='pm') { renderPMTable(); renderPMCalendar(); updatePMPanelText(); }
  if(p==='repair') { populateRepairDevices(); renderRepairTable(); }
  if(p==='incident') renderIncidentTable();
  if(p==='audit') renderAuditLog();
  if(p==='reports') { setTimeout(initReportCharts,100); setTimeout(refreshReportsKPIDynamic,150); }
  if(p==='qms') { renderQMS(); renderIncomingQC(); }
  if(p==='dashboard') { refreshDashboard(); initDashboardCharts(); }
  if(p==='settings') renderSettings();
  if(p==='safety')    { renderSafetyTable(); renderSafetyKPI(); }
  if(p==='spare')     { renderSpareTable(); renderSpareKPI(); }
  if(p==='contracts') { renderContractsTable(); renderContractsKPI(); }
  if(p==='fsca')      { renderFSCATable(); updateFSCANavBadge(); }
}

function gotoAs(p, el, title, breadcrumb) {
  goto(p, el);
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-breadcrumb').textContent = breadcrumb;
}

let activePMKind = 'pm';
let assetsViewMode = 'active';

function gotoActiveAssets(el) {
  assetsViewMode = 'active';
  goto('assets', el);
}

function gotoDecommission(el) {
  assetsViewMode = 'decommission';
  goto('assets', el);
  document.getElementById('page-title').textContent = 'ปลดประจำการ';
  document.getElementById('page-breadcrumb').textContent = 'medtrack / decommission';
}

function updatePMPanelText() {
  const titleEl = document.getElementById('pm-panel-title');
  const subEl = document.getElementById('pm-panel-subtitle');
  if (!titleEl) return;
  if (activePMKind === 'cal') {
    titleEl.textContent = 'แผนสอบเทียบเครื่องมือแพทย์ (Calibration)';
    subEl.textContent = 'ติดตามและบันทึกผลการสอบเทียบตามมาตรฐาน NIMT / ISO 17025';
  } else {
    titleEl.textContent = 'แผนบำรุงรักษาเชิงป้องกัน (Preventive Maintenance)';
    subEl.textContent = 'จัดการแผนงาน PM ประจำปีและบันทึกผลการตรวจสอบ';
  }
}

function gotoFilteredPM(kind, el) {
  activePMKind = kind;
  goto('pm', el);
  if (kind === 'cal') {
    document.getElementById('page-title').textContent = 'สอบเทียบเครื่องมือ';
    document.getElementById('page-breadcrumb').textContent = 'medtrack / calibration';
  }
}

/* ════════════════════════════════
   PROGRESSIVE DISCLOSURE
════════════════════════════════ */
function toggleSection(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('collapsed');
}

/* ════════════════════════════════
   ANTICIPATORY DESIGN — TODAY'S TASKS
════════════════════════════════ */
let _todayTasks = [];

function renderTodayTasks() {
  const el = document.getElementById('today-tasks');
  if(!el) return;
  _todayTasks = [];

  DB.loans.filter(l=>l.status==='overdue'||l.status==='calexp').forEach(l=>{
    _todayTasks.push({
      type:'urgent',
      icon:'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      title: l.items[0].name+(l.items.length>1?' (+'+(l.items.length-1)+')':''),
      sub: (l.status==='overdue'?'เกินกำหนดคืน':'Cal. หมดอายุ')+' · กำหนด '+l.due,
      page:'loanregistry', navId:'nav-loanregistry', drawerId:l.id, drawerFn:'loan'
    });
  });

  DB.loans.filter(l=>l.status==='pending').forEach(l=>{
    _todayTasks.push({
      type:'warn',
      icon:'<circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/>',
      title:'รอตรวจสอบก่อนส่งมอบ: '+l.id,
      sub: l.borrower+' · '+l.dept,
      page:'loanregistry', navId:'nav-loanregistry', drawerId:l.id, drawerFn:'loan'
    });
  });

  DB.pmList.filter(p=>p.status==='รอดำเนินการ').slice(0,3).forEach(p=>{
    _todayTasks.push({
      type:'info',
      icon:'<circle cx="8" cy="8" r="6"/><path d="M8 5v3l2.5 1.5"/>',
      title:p.type+': '+p.device,
      sub:'กำหนด: '+p.due+' · '+p.resp,
      page:'pm', navId:'nav-pm', drawerId:p.id, drawerFn:'pm'
    });
  });

  const badge = document.getElementById('task-count-badge');
  if(badge) { badge.textContent = _todayTasks.length; badge.style.display = _todayTasks.length ? 'inline-flex' : 'none'; }

  if(!_todayTasks.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">✓ ไม่มีงานค้างดำเนินการ</div>';
    return;
  }

  el.innerHTML = _todayTasks.slice(0,6).map((t,i)=>`
    <div class="qa-card ${t.type}" onclick="handleTodayTask(${i})">
      <div class="qa-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg></div>
      <div style="flex:1;min-width:0">
        <div class="qa-title">${t.title}</div>
        <div class="qa-sub">${t.sub}</div>
      </div>
      <div class="qa-arrow">›</div>
    </div>`).join('');
}

function handleTodayTask(i) {
  const t = _todayTasks[i];
  if(!t) return;
  goto(t.page, document.getElementById(t.navId));
  if(t.drawerId) setTimeout(()=>{
    if(t.drawerFn==='loan') openLoanDrawer(t.drawerId);
    else if(t.drawerFn==='pm') openPMManageDrawer(t.drawerId);
  }, 250);
}

/* ════════════════════════════════
   DASHBOARD
════════════════════════════════ */
function refreshDashboard() {
  const active = DB.loans.filter(l=>l.status!=='returned');
  const overdue = DB.loans.filter(l=>l.status==='overdue'||l.status==='calexp');
  const total = DB.assets.length;
  const ready = DB.assets.filter(a=>a.status==='พร้อมใช้').length;
  
  document.getElementById('kpi-total').textContent = total;
  document.getElementById('kpi-total-meta').textContent = ready+' พร้อมใช้ · '+active.length+' ยืมออก';
  document.getElementById('kpi-total-bar').style.width = Math.round(ready/total*100)+'%';
  document.getElementById('kpi-overdue').textContent = overdue.length;
  document.getElementById('kpi-overdue-meta').textContent = active.length+' รายการยืมออกอยู่';
  document.getElementById('kpi-overdue-bar').style.width = Math.min(overdue.length/active.length*100,100)+'%';
  
  // Loan table
  const tb = document.getElementById('dash-loan-tbody');
  const show = DB.loans.filter(l=>l.status!=='returned').slice(0,5);
  tb.innerHTML = show.map(l=>`<tr class="${l.status==='overdue'||l.status==='calexp'?'overdue':''}" onclick="openLoanDrawer('${l.id}')"><td class="mid">${l.items.map(i=>i.allocId).join(', ')}</td><td class="fw">${l.items.length>1?l.items[0].name+' (+'+(l.items.length-1)+')':l.items[0].name}</td><td>${l.dept}<br><span style="font-size:11px;color:var(--text3)">${l.borrower}</span></td><td style="font-size:12px;${l.status==='overdue'?'color:var(--red);font-weight:700':''}">${l.due}</td><td>${loanStatusBadge(l.status)}</td></tr>`).join('');
  
  renderAlertFeed();
  renderActivityFeed();
  renderTodayTasks();
  document.getElementById('nb-loan').textContent = overdue.length;
  const pmPending = DB.pmList.filter(p => p.kind === 'pm' && p.status === 'รอดำเนินการ').length;
  const calPending = DB.pmList.filter(p => p.kind === 'cal' && p.status === 'รอดำเนินการ').length;
  const nbPm = document.getElementById('nb-pm');
  const nbCal = document.getElementById('nb-cal');
  if (nbPm) { nbPm.textContent = pmPending; nbPm.style.display = pmPending ? '' : 'none'; }
  if (nbCal) { nbCal.textContent = calPending; nbCal.style.display = calPending ? '' : 'none'; }
  document.getElementById('notif-pip').style.display = 'block';
  document.getElementById('alert-count-badge').textContent = ALERTS_DATA.length;
}

function loanStatusBadge(s) {
  if(s==='pending') return '<span class="badge blue">รอตรวจสอบก่อนส่งมอบ</span>';
  if(s==='pending_return') return '<span class="badge amber">รอตรวจสอบรับเข้าคลัง</span>';
  if(s==='overdue') return '<span class="badge red">เกินกำหนด</span>';
  if(s==='calexp') return '<span class="badge red">Cal. หมดอายุ</span>';
  if(s==='loaned') return '<span class="badge amber">ยืมออก</span>';
  if(s==='returned') return '<span class="badge green">คืนแล้ว</span>';
  return '<span class="badge gray">'+s+'</span>';
}

function renderAlertFeed() {
  const f = document.getElementById('alert-feed');
  if(!f) return;
  f.innerHTML = ALERTS_DATA.map(a=>`
    <div class="alert-item" onclick="openNotifDrawer()">
      <div class="alert-icon ${a.type}"><svg viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round">${a.icon}</svg></div>
      <div>
        <div class="alert-title">${a.title}</div>
        <div class="alert-sub">${a.sub}</div>
        <div class="alert-time">${a.time}</div>
      </div>
    </div>`).join('');
  const nb = document.getElementById('drawer-notif-body');
  if(nb) nb.innerHTML = f.innerHTML;
}

function renderActivityFeed() {
  const items = [
    {done:true,title:'PM Ventilator ME-0001 เสร็จสิ้น',time:'08:30 · วิชัย สุขดี'},
    {done:true,title:'รับคืน Defibrillator ME-0033 — ผ่าน',time:'09:15 · Post-inspect OK'},
    {done:true,title:'ยืม ECG 12-lead → ห้องฉุกเฉิน',time:'10:42 · นพ.ประสงค์ อนุมัติ'},
    {done:false,warn:true,title:'Cal. Infusion Pump x3 (รอ)',time:'13:00 · นัด NIMT'},
    {done:false,title:'INC-031 รอ CAPA ดำเนินการ',time:'รอดำเนินการ'},
  ];
  const f = document.getElementById('activity-feed');
  if(!f) return;
  f.innerHTML = items.map(it=>`
    <div class="tl-item">
      <div class="tl-dot ${it.done?'done':it.warn?'warn':''}">
        <svg viewBox="0 0 10 8"><path d="${it.done?'M1 4l3 3 5-6':it.warn?'M5 2v3M5 6v1':'M1 5h8'}"/></svg>
      </div>
      <div class="tl-body">
        <div class="tl-title">${it.title}</div>
        <div class="tl-time">${it.time}</div>
      </div>
    </div>`).join('');
}

/* ════════════════════════════════
   LOAN REGISTRY
════════════════════════════════ */
function renderLoanRegistry() {
  let data = DB.loans;
  if(currentLoanFilter==='pending') data = data.filter(l=>l.status==='pending'||l.status==='pending_return');
  if(currentLoanFilter==='overdue') data = data.filter(l=>l.status==='overdue'||l.status==='calexp');
  else if(currentLoanFilter==='loaned') data = data.filter(l=>l.status==='loaned');
  else if(currentLoanFilter==='returned') data = data.filter(l=>l.status==='returned');
  
  const tb = document.getElementById('loan-registry-tbody');
  if(!tb) return;
  tb.innerHTML = data.map((l,i)=>`
    <tr class="${l.status==='overdue'||l.status==='calexp'?'overdue':''}" onclick="openLoanDrawer('${l.id}')">
      <td class="mid">${l.id}</td>
      <td class="mid" style="max-width:120px;white-space:normal">${l.items.map(i=>i.allocId).join(', ')}</td>
      <td class="fw">${l.items.length>1?l.items[0].name+' (+'+(l.items.length-1)+')':l.items[0].name}</td>
      <td>${l.borrower}</td>
      <td>${l.dept}</td>
      <td style="font-size:12px">${l.loanDate}</td>
      <td style="font-size:12px;${l.status==='overdue'?'color:var(--red);font-weight:700':l.status==='calexp'?'color:var(--red)':''}">${l.due}</td>
      <td>${l.status==='pending'?'<span class="badge gray">—</span>':l.items.every(i=>i.inspect)?'<span class="badge teal">✓ ผ่าน</span>':'<span class="badge amber">รอตรวจ</span>'}</td>
      <td>${loanStatusBadge(l.status)}</td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end;align-items:center">
          ${l.status==='loaned'||l.status==='overdue'||l.status==='calexp' ? `<button class="btn btn-sm btn-amber qa-hover-btn" onclick="event.stopPropagation();requestReturnDevice('${l.id}')" title="แจ้งส่งคืนทันที">↩ คืน</button>` : ''}
          ${l.status==='pending' ? `<button class="btn btn-sm btn-teal qa-hover-btn" onclick="event.stopPropagation();openPreInspectDrawer('${l.id}',0)" title="ตรวจสอบและอนุมัติ">✓ ตรวจสอบ</button>` : ''}
          <button class="btn btn-sm" onclick="event.stopPropagation();openLoanDrawer('${l.id}')">จัดการ</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterLoans(f, btn) {
  currentLoanFilter = f;
  document.querySelectorAll('#loan-filters .btn').forEach(b=>b.classList.remove('active-filter'));
  btn.classList.add('active-filter');
  renderLoanRegistry();
}

function exportLoansExcel() {
  toast('กำลังเตรียมไฟล์ Export (Excel / CSV)...', 'teal');
  let csv = 'รหัสการยืม,รหัสเครื่อง,ชื่ออุปกรณ์,ผู้ยืม,แผนก,HN,สิทธิ์การรักษา,โรค,วันยืม,กำหนดคืน,สถานะ\n';
  DB.loans.forEach(l => {
    csv += `${l.id},"${l.items.map(i=>i.allocId).join(', ')}","${l.items.map(i=>i.name).join(', ')}",${l.borrower},${l.dept},${l.hn||'-'},${l.rights||'-'},${l.dx||'-'},${l.loanDate},${l.due},${l.status}\n`;
  });
  const blob = new Blob(["\ufeff", csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "medtrack_loans_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ════════════════════════════════
   LOAN DRAWER
════════════════════════════════ */
function openLoanDrawer(loanId) {
  const loan = DB.loans.find(l=>l.id===loanId);
  if(!loan) return;
  
  document.getElementById('drawer-loan-title').textContent = loan.id+' — คำขอยืมอุปกรณ์';
  document.getElementById('drawer-loan-sub').textContent = loan.items.map(i=>i.allocId).join(', ')+' · '+loan.dept;
  
  const body = document.getElementById('drawer-loan-body');
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>${loanStatusBadge(loan.status)}</div>
      <div style="background:#fff;padding:8px;border:1px solid var(--border);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.05)" id="loan-qrcode" title="QR Code ใบยืม"></div>
    </div>
    
    <!-- ── Borrower card ── -->
    <div style="background:var(--teal-ll);border:1px solid var(--teal-d);border-radius:var(--r2);padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--teal);display:grid;place-items:center;flex-shrink:0">
          <svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><circle cx="10" cy="6" r="4"/><path d="M2 18c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.2">${loan.borrower}</div>
          <div style="font-size:12px;color:var(--teal);margin-top:1px">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="11" height="11" style="vertical-align:middle;margin-right:2px"><rect x="1" y="3" width="12" height="9" rx="2"/><path d="M4 3V2M10 3V2M1 7h12"/></svg>
            แผนก ${loan.dept}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:#fff;border-radius:8px;padding:9px 12px;border:1px solid rgba(13,148,136,.2)">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">วันที่ยืม</div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">
            <svg viewBox="0 0 14 14" fill="none" stroke="var(--teal)" stroke-width="1.5" stroke-linecap="round" width="12" height="12" style="vertical-align:middle;margin-right:3px"><rect x="1" y="2" width="12" height="11" rx="2"/><path d="M1 6h12M4 1v2M10 1v2"/></svg>
            ${loan.loanDate}
          </div>
        </div>
        <div style="background:${loan.status==='overdue'?'#fef2f2':'#fff'};border-radius:8px;padding:9px 12px;border:1px solid ${loan.status==='overdue'?'#fca5a5':'rgba(13,148,136,.2)'}">
          <div style="font-size:10px;font-weight:700;color:${loan.status==='overdue'?'var(--red)':'var(--text3)'};text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">กำหนดคืน</div>
          <div style="font-size:13px;font-weight:600;color:${loan.status==='overdue'?'var(--red)':'var(--text)'}">
            <svg viewBox="0 0 14 14" fill="none" stroke="${loan.status==='overdue'?'var(--red)':'var(--teal)'}" stroke-width="1.5" stroke-linecap="round" width="12" height="12" style="vertical-align:middle;margin-right:3px"><circle cx="7" cy="7" r="6"/><path d="M7 4v3.5l2.5 1.5"/></svg>
            ${loan.due}${loan.status==='overdue'?' <span style="font-size:11px;background:var(--red);color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px">เกินกำหนด</span>':''}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Purpose + Note ── -->
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r2);padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;gap:9px;align-items:flex-start">
        <svg viewBox="0 0 16 16" fill="none" stroke="var(--text3)" stroke-width="1.5" stroke-linecap="round" width="15" height="15" style="margin-top:1px;flex-shrink:0"><path d="M2 4h12M2 8h8M2 12h5"/></svg>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">วัตถุประสงค์</div>
          <div style="font-size:13px;color:var(--text);line-height:1.5">${loan.reason}</div>
        </div>
      </div>
      ${loan.note?`
      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;display:flex;gap:9px;align-items:flex-start">
        <svg viewBox="0 0 16 16" fill="none" stroke="var(--amber)" stroke-width="1.5" stroke-linecap="round" width="15" height="15" style="margin-top:1px;flex-shrink:0"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11v.4"/></svg>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">หมายเหตุ</div>
          <div style="font-size:13px;color:var(--text);line-height:1.5">${loan.note}</div>
        </div>
      </div>`:''}
    </div>

    ${loan.hn?`
    <!-- ── Patient info ── -->
    <div style="background:var(--blue-l);border:1px solid #bfdbfe;border-radius:var(--r2);padding:12px 14px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
        <svg viewBox="0 0 16 16" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linecap="round" width="13" height="13" style="vertical-align:middle;margin-right:4px"><path d="M8 2v12M2 8h12"/></svg>
        ข้อมูลผู้ป่วย
      </div>
      <div style="display:grid;grid-template-columns:80px 1fr;row-gap:5px;column-gap:10px">
        <div style="font-size:11px;font-weight:600;color:var(--text3);align-self:center">HN</div>
        <div style="font-size:13px;font-weight:700;color:var(--text);font-family:var(--m)">${loan.hn}</div>
        <div style="font-size:11px;font-weight:600;color:var(--text3);align-self:center">สิทธิ์การรักษา</div>
        <div style="font-size:13px;color:var(--text)">${loan.rights||'-'}</div>
        <div style="font-size:11px;font-weight:600;color:var(--text3);align-self:center">Diagnosis</div>
        <div style="font-size:13px;color:var(--text)">${loan.dx||'-'}</div>
      </div>
    </div>`:''}

    <div style="font-size:11px;font-weight:700;color:var(--text3);margin:4px 0 8px;letter-spacing:.05em;text-transform:uppercase">รายการอุปกรณ์ (${loan.items.length} รายการ)</div>
    <div style="display:flex;flex-direction:column;gap:8px">
    ${loan.items.map((item, idx) => {
        const a = DB.assets.find(x => x.id === item.allocId) || DB.assets.find(x => x.id === item.reqId) || {name:item.name, id:item.reqId};
        let btnHtml = '';
        if(loan.status === 'pending' && !item.inspect) {
            btnHtml = `<button class="btn btn-sm btn-teal" onclick="openPreInspectDrawer('${loan.id}', ${idx})">จัดสรร & ตรวจสอบ</button>`;
        } else if(loan.status === 'pending_return' && !item.postInspect) {
            btnHtml = `<button class="btn btn-sm btn-amber" onclick="openPostInspectDrawer('${loan.id}', ${idx})">รับคืน & ตรวจสอบ</button>`;
        } else if (item.inspect && loan.status === 'pending') {
            btnHtml = `<span class="badge teal">ตรวจแล้ว</span>`;
        } else if (item.postInspect && loan.status === 'pending_return') {
            btnHtml = `<span class="badge teal">รับเข้าแล้ว</span>`;
        } else if (loan.status === 'loaned' || loan.status === 'overdue' || loan.status === 'calexp') {
            btnHtml = `<span class="badge amber">กำลังใช้งาน</span>`;
        } else if (loan.status === 'returned') {
            btnHtml = `<span class="badge green">คืนแล้ว</span>`;
        }
        return `
        <div class="device-info-box" style="padding:10px 12px;gap:10px;align-items:center;margin:0">
          <div class="device-info-icon" style="width:32px;height:32px;border-radius:8px"><svg viewBox="0 0 22 22" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="18" height="13" rx="3"/></svg></div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">${a.name}</div>
            <div style="font-size:11px;color:var(--text3);font-family:var(--m)">${item.reqId} ${item.allocId !== item.reqId ? '<span style="color:var(--teal);font-weight:700">→ ถูกเปลี่ยนเป็น '+item.allocId+'</span>' : ''}</div>
          </div>
          <div>${btnHtml}</div>
        </div>
        `;
    }).join('')}
    </div>

    
    ${loan.status==='overdue'||loan.status==='calexp'?`
    <div style="background:var(--red-l);border:1px solid #fca5a5;border-radius:var(--r);padding:12px 14px;margin-top:14px">
      <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:4px">⚠ ต้องดำเนินการ</div>
      <div style="font-size:12px;color:var(--red)">${loan.status==='overdue'?'อุปกรณ์เกินกำหนดคืน — โปรดติดตามผู้ยืมทันที':'Cal. หมดอายุระหว่างยืม — ต้องนำกลับก่อนใช้งาน'}</div>
    </div>`:''}`;
  
  const foot = document.getElementById('drawer-loan-foot');
  let actions = `<button class="btn" onclick="closeDrawer()">ปิดหน้าต่าง</button>`;
  actions += `<button class="btn" onclick="printLoanForm('${loan.id}')">🖨 พิมพ์ใบยืม-คืน</button>`;
  if (loan.status === 'returned') {
    // None
  } else if (loan.status === 'pending') {
    actions += `<button class="btn btn-red" style="margin-left:auto" onclick="cancelReservation('${loan.id}')">ยกเลิกคิว / ไม่อนุมัติ</button>`;
  } else if (loan.status === 'pending_return') {
  } else if (loan.status === 'loaned' || loan.status === 'overdue' || loan.status === 'calexp') {
    actions += `<div style="margin-left:auto;display:flex;gap:8px">`;
    actions += `<button class="btn" onclick="extendLoan('${loan.id}')">ยืมต่อ</button>`;
    actions += `<button class="btn" onclick="transferLoan('${loan.id}')">โอนแผนก</button>`;
    actions += `<button class="btn btn-amber" onclick="requestReturnDevice('${loan.id}')">ส่งเครื่องคืน (ผู้ยืม)</button></div>`;
  }
  foot.innerHTML = actions;
  openDrawer('drawer-loan');

  // Generate QR Code
  setTimeout(() => {
    const qrEl = document.getElementById('loan-qrcode');
    if(qrEl) {
      new QRCode(qrEl, {
        text: loan.id,
        width: 64,
        height: 64,
        colorDark : "#1e293b",
        colorLight : "#ffffff"
      });
    }
  }, 50);
}

// --- PRE-LOAN INSPECT (BMED ACTION) ---
let activePreInspectLoanId = null;
let activePreInspectItemIdx = null;
function openPreInspectDrawer(loanId, itemIdx) {
  const loan = DB.loans.find(l=>l.id===loanId);
  if(!loan) return;
  activePreInspectLoanId = loanId;
  activePreInspectItemIdx = itemIdx;
  const item = loan.items[itemIdx];
  const reqAsset = DB.assets.find(a=>a.id===item.reqId) || {name:item.name, category:''};
  
  document.getElementById('pi-sub').textContent = `${loan.id} · ${reqAsset.name} (${item.reqId})`;
  
  // Smart Allocation Logic
  let alternatives = DB.assets.filter(a => a.category === reqAsset.category && (a.status === 'พร้อมใช้' || a.id === item.reqId));
  alternatives.sort((a,b) => a.id.localeCompare(b.id)); // จำลอง FIFO ด้วยรหัส
  let opts = '';
  alternatives.forEach((a, i) => {
    let label = `${a.name} (${a.id})`;
    if(a.id === item.reqId) label += ' [ที่ผู้ใช้ระบุมา]';
    else if(i === 0 || a.id !== item.reqId) label += ' ⭐ แนะนำ (พร้อมสุด/พักนานสุด)';
    opts += `<option value="${a.id}" ${a.id === item.allocId ? 'selected' : ''}>${label}</option>`;
  });
  document.getElementById('pi-alloc-id').innerHTML = opts;
  
  document.querySelectorAll('#pi-checklist .chk-item.checked').forEach(el=>el.classList.remove('checked'));
  chkCount = 0; updatePiChkProgress();
  document.getElementById('pi-pin').value = '';
  openDrawer('drawer-pre-inspect');
}

function togglePiChk(el) {
  el.classList.toggle('checked');
  chkCount = document.querySelectorAll('#pi-checklist .chk-item.checked').length;
  updatePiChkProgress();
}

function updatePiChkProgress() {
  const pct = Math.round(chkCount/TOTAL_CHK*100);
  const p = document.getElementById('pi-chk-progress');
  const ct = document.getElementById('pi-chk-count-text');
  const s = document.getElementById('btn-submit-pi');
  if(p) p.style.width = pct+'%';
  if(ct) ct.textContent = chkCount+' / '+TOTAL_CHK+' รายการ';
  if(s) s.disabled = chkCount<TOTAL_CHK;
}

function submitPreInspect() {
  if(chkCount < TOTAL_CHK) { toast('กรุณาตรวจสอบให้ครบทุกข้อ', 'amber'); return; }
  const pin = document.getElementById('pi-pin').value;
  if(!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature 4 หลัก', 'amber'); return; }
  
  const loan = DB.loans.find(l=>l.id===activePreInspectLoanId);
  const item = loan.items[activePreInspectItemIdx];
  
  const allocId = document.getElementById('pi-alloc-id').value;
  if (item.reqId !== allocId) {
      const reqA = DB.assets.find(a=>a.id===item.reqId);
      if(reqA) reqA.status = 'พร้อมใช้';
  }
  item.allocId = allocId;
  item.inspect = true;
  const allocA = DB.assets.find(a=>a.id===item.allocId);
  if(allocA) allocA.status = 'ยืมออก';

  if (loan.items.every(i => i.inspect)) {
      loan.status = 'loaned';
      addAuditLog('INSPECT', currentUserName(), 'อนุมัติยืมสำเร็จ '+loan.id, `ตรวจสอบและจัดสรรครบ ${loan.items.length} รายการ`);
      toast('อนุมัติส่งมอบครบทุกรายการ เปลี่ยนสถานะเป็นยืมออกแล้ว', 'teal');
      closeDrawer();
  } else {
      toast(`ตรวจสอบแล้ว 1 รายการ เหลืออีก ${loan.items.filter(i=>!i.inspect).length} รายการ`, 'teal');
      openLoanDrawer(loan.id); // Re-render the buttons
  }
  renderLoanRegistry(); renderAssetsTable();
}

// --- REQUEST RETURN (BORROWER ACTION) ---
function requestReturnDevice(loanId) {
  const loan = DB.loans.find(l=>l.id===loanId);
  if(!loan) return;
  loan.status = 'pending_return';
  loan.items.forEach(item => {
     const asset = DB.assets.find(a=>a.id===item.allocId);
     if(asset) asset.status = 'รอตรวจสอบ';
  });
  
  addAuditLog('LOAN', 'พยาบาลผู้ยืม', 'แจ้งความประสงค์ส่งคืน', `${loan.id} · รอศูนย์ฯ (BMED) ทำการรับเข้า`);
  closeDrawer();
  toast('แจ้งส่งคืนเครื่องทั้งหมดแล้ว กรุณานำเครื่องไปตรวจสอบที่ศูนย์ฯ', 'teal');
  refreshDashboard();
  renderLoanRegistry();
}

// --- POST-RETURN INSPECT ---
let activePostInspectLoanId = null;
let activePostInspectItemIdx = null;
function openPostInspectDrawer(loanId, itemIdx) {
  const loan = DB.loans.find(l=>l.id===loanId);
  if(!loan) return;
  activePostInspectLoanId = loanId;
  activePostInspectItemIdx = itemIdx;
  const item = loan.items[itemIdx];
  document.getElementById('dpi-sub').textContent = `${loan.id} · อุปกรณ์ ${item.allocId}`;
  document.getElementById('dpi_clean_pass').checked = true;
  document.getElementById('dpi_phys_pass').checked = true;
  document.getElementById('dpi_acc_pass').checked = true;
  document.getElementById('dpi_status_ready').checked = true;
  document.getElementById('dpi-note').value = '';
  document.getElementById('dpi-pin').value = '';
  openDrawer('drawer-post-inspect');
}

function checkDpiIssues() {
  const cleanFail = document.getElementById('dpi_clean_fail').checked;
  const physFail = document.getElementById('dpi_phys_fail').checked;
  const accFail = document.getElementById('dpi_acc_fail').checked;
  if (cleanFail || physFail || accFail) document.getElementById('dpi_status_repair').checked = true;
  else document.getElementById('dpi_status_ready').checked = true;
}

function submitPostInspect() {
  const pin = document.getElementById('dpi-pin').value;
  if(!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature 4 หลัก', 'amber'); return; }
  const loan = DB.loans.find(l=>l.id===activePostInspectLoanId);
  if(!loan) return;
  
  const item = loan.items[activePostInspectItemIdx];
  item.postInspect = true;
  const assetStatus = document.querySelector('input[name="dpi_status"]:checked').value;
  const allocA = DB.assets.find(a=>a.id===item.allocId);
  if(allocA) allocA.status = assetStatus;
  
  let issues = [];
  if(document.getElementById('dpi_clean_fail').checked) issues.push('ยังไม่ทำความสะอาด');
  if(document.getElementById('dpi_phys_fail').checked) issues.push('ชำรุด/แตกหัก');
  if(document.getElementById('dpi_acc_fail').checked) issues.push('อุปกรณ์เสริมไม่ครบ');
  
  let finalNote = 'ตรวจสอบ Post-Inspect ครบถ้วน';
  if(issues.length > 0) finalNote += ' (พบปัญหา: ' + issues.join(', ') + ')';
  const userNote = document.getElementById('dpi-note').value.trim();
  if(userNote) finalNote += ' - ' + userNote;

  if (loan.items.every(i => i.postInspect)) {
      loan.status = 'returned';
      loan.note = finalNote;
      addAuditLog('INSPECT', currentUserName(), 'รับคืนเข้าคลังสำเร็จ '+loan.id, `รับเข้าครบ ${loan.items.length} รายการ`);
      toast('ตรวจสอบรับคืนครบทุกรายการ นำเข้าคลังสำเร็จ', 'teal');
      closeDrawer();
  } else {
      toast(`รับคืนแล้ว 1 รายการ เหลืออีก ${loan.items.filter(i=>!i.postInspect).length} รายการ`, 'teal');
      openLoanDrawer(loan.id); // Re-render buttons
  }
  renderLoanRegistry(); renderAssetsTable();
}

// --- LOAN EXTENSION & TRANSFER ACTIONS ---
async function cancelReservation(id) {
  const ok = await popConfirm('ยืนยันการยกเลิกคิวจอง / ไม่อนุมัติการยืมนี้?', 'ยกเลิกคิวจอง', true);
  if(!ok) return;
  const loan = DB.loans.find(l=>l.id===id);
  if(loan) {
    loan.items.forEach(item => {
      const asset = DB.assets.find(a=>a.id===item.allocId);
      if(asset) asset.status = 'พร้อมใช้';
    });
  }
  const idx = DB.loans.findIndex(l=>l.id===id);
  DB.loans.splice(idx, 1);
  toast('ยกเลิกคิวจอง/ไม่อนุมัติ เรียบร้อย', 'teal'); closeDrawer(); renderLoanRegistry(); renderAssetsTable(); refreshDashboard();
}
function approveReservation(id) {
  const loan = DB.loans.find(l=>l.id===id);
  loan.status = 'loaned';
  const today = new Date();
  loan.loanDate = today.getDate()+' เม.ย. '+(today.getFullYear()+543-2500+2567);
  loan.due = (today.getDate()+3)+' เม.ย. '+(today.getFullYear()+543-2500+2567);
  const asset = DB.assets.find(a=>a.id===loan.devId);
  if(asset) asset.status = 'ยืมออก';
  toast('อนุมัติจัดสรรเครื่องเรียบร้อย', 'teal'); closeDrawer(); renderLoanRegistry(); renderAssetsTable();
}
async function extendLoan(id) {
  const days = await popPrompt('ต้องการยืมต่ออีกกี่วัน?', '7', 'ยืมต่อออนไลน์');
  if(days && days.trim()) { toast('ต่ออายุการยืม LN-'+id+' อีก '+days+' วันเรียบร้อย', 'teal'); closeDrawer(); renderLoanRegistry(); }
}
async function transferLoan(id) {
  const loan = DB.loans.find(l=>l.id===id);
  const dept = await popPrompt('ระบุแผนกที่ต้องการโอนย้ายไป:', 'ICU', 'โอนย้ายอุปกรณ์');
  if(dept && dept.trim()) { loan.dept = dept.trim(); toast('โอนย้าย LN-'+id+' ไปยังแผนก '+dept+' สำเร็จ', 'teal'); closeDrawer(); renderLoanRegistry(); }
}
function changeCircuit(id) {
  const loan = DB.loans.find(l=>l.id===id);
  loan.lastCircuit = 'วันนี้ (อัปเดตล่าสุด)';
  toast('บันทึกสถิติการเปลี่ยน Circuit เรียบร้อย', 'teal'); closeDrawer(); openLoanDrawer(id);
}

/* ════════════════════════════════
   ASSET TABLE
════════════════════════════════ */
function renderAssetsTable() {
  const isDecomm = assetsViewMode === 'decommission';
  const sf = document.getElementById('asset-status-filter')?.value||'';
  const df = document.getElementById('asset-dept-filter')?.value||'';
  const cf = document.getElementById('asset-category-filter')?.value||'';
  let data = DB.assets;

  if (isDecomm) {
    data = data.filter(a => a.status === 'จำหน่าย/แทงจำหน่าย');
    document.getElementById('asset-panel-title').textContent = 'ทะเบียนอุปกรณ์ที่ปลดประจำการ (Decommissioned)';
  } else {
    data = data.filter(a => a.status !== 'จำหน่าย/แทงจำหน่าย');
    document.getElementById('asset-panel-title').textContent = 'รายการอุปกรณ์ (Active)';
    if(sf) data = data.filter(a=>a.status===sf);
  }
  if(df) data = data.filter(a=>a.dept===df);
  if(cf) data = data.filter(a=>a.category===cf);

  document.getElementById('asset-count-sub').textContent = data.length+' รายการ · คลิกแถวเพื่อดูรายละเอียด';
  const currentYear = 2567; // สมมติปีปัจจุบัน
  
  const statusBadge = s=>{
    if(s==='พร้อมใช้') return '<span class="badge green">พร้อมใช้</span>';
    if(s==='ยืมออก') return '<span class="badge amber">ยืมออก</span>';
    if(s==='ซ่อม') return '<span class="badge blue">ส่งซ่อม</span>';
    if(s==='รอ Cal.') return '<span class="badge red">รอ Cal.</span>';
    if(s==='รอตรวจสอบ') return '<span class="badge amber">รอตรวจสอบ</span>';
    return '<span class="badge gray">'+s+'</span>';
  };
  const riskBadge = r=>{
    if(r==='สูง') return '<span class="badge red">สูง</span>';
    if(r==='กลาง') return '<span class="badge amber">กลาง</span>';
    return '<span class="badge teal">ต่ำ</span>';
  };
  
  const addBtn = document.getElementById('asset-add-btn');
  const statusFilter = document.getElementById('asset-status-filter');
  if (addBtn) addBtn.style.display = isDecomm ? 'none' : '';
  if (statusFilter) statusFilter.style.display = isDecomm ? 'none' : '';

  const tb = document.getElementById('asset-tbody');
  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">${isDecomm ? 'ยังไม่มีอุปกรณ์ที่ปลดประจำการ' : 'ไม่มีรายการ'}</td></tr>`;
    return;
  }
  tb.innerHTML = data.map(a=>{
    const age = currentYear - a.year;
    let depClass = isDecomm ? '' : (age >= a.depYears ? 'dep-alert' : age >= a.depYears - 1 ? 'dep-warn' : '');

    const lastCol = isDecomm
      ? `<td style="font-size:11px"><div style="color:var(--red);font-weight:600">${a.decommDate||'—'}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${a.decommReason||'—'}</div></td>`
      : `<td style="font-size:11px"><div style="display:flex;gap:4px;flex-direction:column"><div>PM: ${a.pm}</div><div style="${a.cal&&a.cal.includes('เม.ย.')?'color:var(--red);font-weight:600':''}">Cal: ${a.cal}</div></div></td>`;

    const actionCol = isDecomm ? '<td></td>' : `<td style="width:80px">
      <div style="display:flex;gap:4px;justify-content:flex-end">
        ${a.status==='พร้อมใช้'?`<button class="btn btn-sm btn-teal qa-hover-btn" onclick="event.stopPropagation();goto('newloan',null);setTimeout(()=>selectDevice('${a.id}'),120)" title="บันทึกยืม">+ ยืม</button>`:''}
        ${a.status==='พร้อมใช้'?`<button class="btn btn-sm qa-hover-btn" onclick="event.stopPropagation();populateRepairDevices();document.getElementById('repair-device').value='${a.id}';openDrawer('drawer-repair')" title="แจ้งซ่อม">🔧</button>`:''}
      </div>
    </td>`;

    return `
    <tr class="${depClass}" onclick="openAssetDrawer('${a.id}')">
      <td><div class="fw">${a.id}</div><div style="font-family:var(--m);font-size:10px;color:var(--text3);margin-top:2px">|||||| ||||| ||||</div></td>
      <td><div class="fw">${a.name}</div><div style="font-size:11px;color:var(--text3)">${a.category}</div></td>
      <td style="font-size:12px">${a.mfr} / ${a.model||'—'}</td>
      <td>${a.dept}</td>
      <td style="font-size:12px"><span style="${depClass==='dep-alert'?'color:var(--red);font-weight:700':depClass==='dep-warn'?'color:var(--amber);font-weight:700':''}">${age} ปี</span><br><span style="font-size:10px;color:var(--text3)">(อายุเสื่อม ${a.depYears} ปี)</span></td>
      <td>${statusBadge(a.status)}</td>
      ${lastCol}
      ${actionCol}
    </tr>`;
  }).join('');
}

function exportAssetsExcel() {
  toast('กำลังเตรียมไฟล์ Export (Excel / CSV)...', 'teal');
  let csv = 'รหัสเครื่อง,ชื่ออุปกรณ์,ชนิดครุภัณฑ์,ยี่ห้อ,รุ่น,หน่วยงาน,รหัส สนย.,สถานะ,อายุเครื่อง(ปี)\n';
  DB.assets.forEach(a => {
    csv += `${a.id},${a.name},${a.category},${a.mfr},${a.model},${a.dept},${a.sny||'-'},${a.status},${2567-a.year}\n`;
  });
  const blob = new Blob(["\ufeff", csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "medtrack_assets_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ════════════════════════════════
   ASSET DRAWER
════════════════════════════════ */
function openAssetDrawer(id) {
  const a = DB.assets.find(x=>x.id===id);
  if(!a) return;
  document.getElementById('drawer-asset-title').textContent = a.name;
  document.getElementById('drawer-asset-sub').textContent = a.id+' · '+a.serial;
  
  const loanHistory = DB.loans.filter(l=>l.items.some(i=>i.allocId===id || i.reqId===id)).slice(0,5);
  const repairHistory = DB.repairs.filter(r=>r.devId===id);
  
  document.getElementById('drawer-asset-body').innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;background:var(--surface2);padding:12px;border-radius:var(--r2);border:1px solid var(--border);align-items:center">
      <div style="width:70px;height:70px;background:var(--surface);border:1px dashed var(--border2);border-radius:var(--r);display:grid;place-items:center;color:var(--text3);font-size:11px">No Image</div>
      <div>
        <div style="font-family:var(--m);font-size:18px;letter-spacing:2px;font-weight:700">||||||| ||||| |||||</div>
        <div style="font-family:var(--m);font-size:11px;color:var(--text3)">${a.id}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${a.status==='พร้อมใช้'?'<span class="badge green">พร้อมใช้งาน</span>':a.status==='ยืมออก'?'<span class="badge amber">ยืมออก</span>':'<span class="badge blue">ส่งซ่อม</span>'}
      <span class="badge ${a.risk==='สูง'?'red':a.risk==='กลาง'?'amber':'teal'}">Risk: ${a.risk}</span>
      <span class="badge gray">${a.category}</span>
    </div>
    
    <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">ข้อมูลอุปกรณ์</div>
    <div class="detail-row"><div class="detail-key">ผู้ผลิต / รุ่น</div><div class="detail-val">${a.mfr} ${a.model||''}</div></div>
    <div class="detail-row"><div class="detail-key">Serial Number</div><div class="detail-val mid">${a.serial||'—'}</div></div>
    <div class="detail-row"><div class="detail-key">แผนก</div><div class="detail-val">${a.dept}</div></div>
    <div class="detail-row"><div class="detail-key">รหัส สนย.</div><div class="detail-val mid">${a.sny||'—'}</div></div>
    <div class="detail-row"><div class="detail-key">ที่มาการจัดซื้อ</div><div class="detail-val">${a.procurement||'—'}</div></div>
    <div class="detail-row"><div class="detail-key">ผู้จัดจำหน่าย</div><div class="detail-val">${a.vendor||'—'}</div></div>
    <div class="detail-row"><div class="detail-key">ราคาจัดซื้อ</div><div class="detail-val">${a.price?a.price.toLocaleString()+' ฿':'—'}</div></div>
    <div class="detail-row"><div class="detail-key">ปีที่จัดซื้อ</div><div class="detail-val">${a.year?'พ.ศ. '+a.year+' (คำนวณอายุเสื่อม '+a.depYears+' ปี)':'—'}</div></div>
    
    ${a.accessories && a.accessories.length ? `
    <div style="font-size:11px;font-weight:700;color:var(--text3);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">อุปกรณ์เสริม (Accessories)</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${a.accessories.map(ac=>`<span class="tag">${ac}</span>`).join('')}</div>
    `:''}

    <div style="font-size:11px;font-weight:700;color:var(--text3);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">สถานะบำรุงรักษาและรอบการทำงาน</div>
    <div class="detail-row"><div class="detail-key">รอบ PM (IPM)</div><div class="detail-val">${a.pmFreq?a.pmFreq+' เดือน':'—'}</div></div>
    <div class="detail-row"><div class="detail-key">รอบ Calibrate</div><div class="detail-val">${a.calFreq?a.calFreq+' เดือน':'—'}</div></div>
    <div class="detail-row"><div class="detail-key">รอบเปลี่ยนอะไหล่</div><div class="detail-val">${a.partsFreq||'—'}</div></div>
    <div class="detail-row"><div class="detail-key">Cal. หมดอายุ</div><div class="detail-val" style="${a.cal.includes('เม.ย.')?'color:var(--red);font-weight:600':''}">${a.cal}</div></div>
    <div class="detail-row"><div class="detail-key">PM ถัดไป</div><div class="detail-val">${a.pm}</div></div>
    
    ${loanHistory.length?`
    <div style="font-size:11px;font-weight:700;color:var(--text3);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">ประวัติการยืม</div>
    ${loanHistory.map(l=>`
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div><div style="font-weight:600;color:var(--text)">${l.borrower}</div><div style="color:var(--text3)">${l.dept} · ${l.loanDate}</div></div>
        ${loanStatusBadge(l.status)}
      </div>`).join('')}`:''}`;
      
  if(repairHistory.length) {
    document.getElementById('drawer-asset-body').innerHTML += `
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">ประวัติการซ่อม (Repair History)</div>
      ${repairHistory.map(r=>`
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div style="display:flex;justify-content:space-between"><span class="fw">${r.id}</span> <span>${r.date}</span></div>
          <div style="color:var(--text2);margin-top:2px">อาการ: ${r.sym}</div>
          <div style="color:var(--text3);font-size:11px;margin-top:2px">สถานะ: ${r.status} | Downtime: ${r.downtime}</div>
        </div>`).join('')}`;
  }
  
  const isDecommissioned = a.status === 'จำหน่าย/แทงจำหน่าย';
  if (isDecommissioned) {
    document.getElementById('drawer-asset-body').innerHTML += `
      <div style="font-size:11px;font-weight:700;color:var(--red);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">บันทึกการปลดประจำการ</div>
      <div class="detail-row"><div class="detail-key">วันที่ปลดประจำการ</div><div class="detail-val" style="color:var(--red);font-weight:600">${a.decommDate||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">เหตุผล</div><div class="detail-val">${a.decommReason||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">วิธีการจำหน่าย</div><div class="detail-val">${a.decommMethod||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">เลขที่คำสั่ง / เอกสาร</div><div class="detail-val mid">${a.decommDocRef||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">ผู้อนุมัติ</div><div class="detail-val">${a.decommApprover||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">มูลค่าซาก</div><div class="detail-val">${a.decommSalvage ? a.decommSalvage.toLocaleString()+' ฿' : '—'}</div></div>
      ${a.decommNote ? `<div class="detail-row"><div class="detail-key">หมายเหตุ</div><div class="detail-val">${a.decommNote}</div></div>` : ''}
    `;
  }

  // ISO 14971 risk score section
  const riskScoreHtml = a.riskScore ? (() => {
    const ri = riskInfo ? riskInfo(a.riskScore) : {level:a.riskLevel14971||'',color:'#64748b',bg:'#f8fafc'};
    return `<div style="font-size:11px;font-weight:700;color:var(--text3);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">ISO 14971 Risk Assessment</div>
      <div style="display:flex;gap:12px;align-items:center;background:${ri.bg};border:1px solid ${ri.color}40;border-radius:8px;padding:10px 14px">
        <div style="text-align:center;min-width:60px">
          <div style="font-size:30px;font-weight:800;color:${ri.color}">${a.riskScore}</div>
          <div style="font-size:10px;color:${ri.color};font-weight:700">P=${a.riskP} x S=${a.riskS}</div>
        </div>
        <div><div style="font-weight:700;color:${ri.color}">${ri.level}</div>
          <div style="font-size:11px;color:var(--text2)">${a.riskRationale||'ยังไม่มีหมายเหตุ'}</div>
          <div style="font-size:10px;color:var(--text3)">ประเมินล่าสุด: ${a.riskDate||'—'}</div>
        </div>
      </div>`;
  })() : '';

  // Cal Certs section
  const calCertsHtml = (a.calCerts && a.calCerts.length) ? `
    <div style="font-size:11px;font-weight:700;color:var(--text3);margin:16px 0 8px;letter-spacing:.05em;text-transform:uppercase">ประวัติ Cal Certificate</div>
    ${a.calCerts.slice().reverse().slice(0,3).map(c=>`
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div><span class="mono" style="font-weight:700">${c.certNo}</span> <span style="color:var(--text3)">(${c.pmId})</span></div>
        <div style="color:var(--text3)">${c.date}</div>
      </div>`).join('')}
  ` : '';

  if (riskScoreHtml || calCertsHtml) {
    document.getElementById('drawer-asset-body').innerHTML += riskScoreHtml + calCertsHtml;
  }

  document.getElementById('drawer-asset-foot').innerHTML = `
    <button class="btn" onclick="closeDrawer()">ปิด</button>
    ${!isDecommissioned ? `<button class="btn" style="border-color:var(--amber);color:var(--amber)" onclick="openRiskModal('${a.id}')">Risk Assessment</button>` : ''}
    ${!isDecommissioned ? `<button class="btn btn-red" style="background:transparent;border-color:var(--red);color:var(--red)" onclick="decommissionAsset('${a.id}')">ปลดประจำการ</button>` : '<span class="badge red" style="align-self:center">ปลดประจำการแล้ว</span>'}
    ${!isDecommissioned ? `<button class="btn btn-teal" style="margin-left:auto" onclick="openEditDeviceModal('${a.id}')">แก้ไขข้อมูล</button>` : ''}
    ${a.status==='พร้อมใช้'?`<button class="btn btn-teal" onclick="closeDrawer();goto('newloan',document.getElementById('nav-newloan'))">+ บันทึกยืม</button>`:''}
  `;
  openDrawer('drawer-asset');
}

/* ════════════════════════════════
   ADD DEVICE (MODAL)
════════════════════════════════ */
function calcNextDate(type) {
  const lastDate = document.getElementById('add-'+type+'-last').value;
  const freq = parseInt(document.getElementById('add-'+type+'-freq').value);
  const nextInput = document.getElementById('add-'+type+'-next');
  if(lastDate && freq) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + freq);
    nextInput.value = d.toISOString().split('T')[0];
  } else {
    nextInput.value = '';
  }
}

function formatDateThai(dateStr) {
  if(!dateStr) return '—';
  const d = new Date(dateStr);
  if(isNaN(d.getTime())) return '—';
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543).toString().substring(2);
}

function openAddDeviceModal() {
  editingDeviceId = null;
  document.getElementById('modal-device-title').textContent = 'เพิ่มอุปกรณ์ใหม่';
  document.getElementById('modal-device-sub').textContent = 'กรอกข้อมูลและขึ้นทะเบียนในระบบ';
  document.getElementById('btn-submit-device').innerHTML = '✓ บันทึกและขึ้นทะเบียน';
  document.getElementById('add-id').disabled = false;
  
  ['add-name','add-fda','add-category','add-sny','add-brand','add-model','add-serial',
   'add-dept','add-risk','add-date','add-procurement','add-vendor','add-pm-freq','add-pm-last',
   'add-pm-next','add-cal-freq','add-cal-last','add-cal-next','add-accessories','add-parts-freq'].forEach(id => {
     const el = document.getElementById(id); if(el) el.value = '';
  });
  const idEl = document.getElementById('add-id');
  if (idEl) { idEl.value = previewDocId('asset'); idEl.style.color = 'var(--teal)'; }
  document.getElementById('add-depyears').value = 5;

  switchAddDeviceTab(1);
  document.getElementById('modal-add-device').classList.add('open');
}

function closeAddDeviceModal() {
  document.getElementById('modal-add-device').classList.remove('open');
}

function switchAddDeviceTab(n) {
  for(let i=1; i<=3; i++) {
    document.getElementById('add-tab-btn-'+i).classList.toggle('active', i===n);
    document.getElementById('add-tab-'+i).classList.toggle('active', i===n);
  }
}

function openEditDeviceModal(id) {
  const a = DB.assets.find(x=>x.id===id);
  if(!a) return;
  editingDeviceId = id;
  
  document.getElementById('modal-device-title').textContent = 'แก้ไขข้อมูลอุปกรณ์';
  document.getElementById('modal-device-sub').textContent = a.id + ' · ' + a.name;
  document.getElementById('btn-submit-device').innerHTML = '✓ บันทึกการแก้ไข';
  document.getElementById('add-id').disabled = true; // ไม่อนุญาตให้แก้รหัสหลัก
  
  const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };

  safeSet('add-name', a.name || '');
  safeSet('add-id', a.id || '');
  safeSet('add-fda', a.fda || '');
  safeSet('add-category', a.category || '');
  safeSet('add-sny', a.sny || '');
  safeSet('add-brand', a.mfr || '');
  safeSet('add-model', a.model || '');
  safeSet('add-serial', a.serial || '');
  safeSet('add-dept', a.dept || '');
  safeSet('add-risk', a.risk || '');
  safeSet('add-date', a.buyDate || '');
  safeSet('add-depyears', a.depYears || 5);
  safeSet('add-procurement', a.procurement || '');
  safeSet('add-vendor', a.vendor || '');
  safeSet('add-pm-type', a.pmType || 'โดยหน่วยงานภายใน');
  safeSet('add-pm-freq', a.pmFreq || '');
  safeSet('add-pm-last', a.pmLast || '');
  safeSet('add-pm-next', a.pmDateRaw || '');
  safeSet('add-cal-type', a.calType || 'IC โดยหน่วยงานภายใน');
  safeSet('add-cal-freq', a.calFreq || '');
  safeSet('add-cal-last', a.calLast || '');
  safeSet('add-cal-next', a.calDateRaw || '');
  safeSet('add-accessories', (a.accessories || []).join(', '));
  safeSet('add-parts-freq', a.partsFreq || '');

  switchAddDeviceTab(1);
  document.getElementById('modal-add-device').classList.add('open');
  closeDrawer();
}

function submitDevice() {
  const name = document.getElementById('add-name').value.trim();
  let id = document.getElementById('add-id').value.trim();
  if (!id) id = nextDocId('asset'); else if (!editingDeviceId) {
    const cfg = DB.settings.docNumbering.asset;
    const auto = cfg.prefix + '-' + String(cfg.seq + 1).padStart(cfg.digits, '0');
    if (id === auto) nextDocId('asset'); // consume the seq if using the auto-suggested id
  }
  const fda = document.getElementById('add-fda').value.trim();
  if(!name||!id) { toast('กรุณากรอกชื่ออุปกรณ์','red'); return; }
  if(!fda && !editingDeviceId) { toast('กรุณากรอกเลขทะเบียน อย. สำหรับอุปกรณ์ใหม่','red'); return; }
  
  if(!editingDeviceId && DB.assets.find(a=>a.id===id)) { toast('รหัส '+id+' มีในระบบแล้ว','red'); return; }
  
  const pmNextRaw = document.getElementById('add-pm-next').value;
  const calNextRaw = document.getElementById('add-cal-next').value;
  const buyDate = document.getElementById('add-date').value;

  const data = {
    id, name, serial:document.getElementById('add-serial').value,
    category:document.getElementById('add-category').value,
    mfr:document.getElementById('add-brand').value,
    model:document.getElementById('add-model').value,
    dept:document.getElementById('add-dept').value,
    risk:document.getElementById('add-risk').value,
    sny:document.getElementById('add-sny').value,
    fda:fda,
    procurement:document.getElementById('add-procurement').value,
    vendor:document.getElementById('add-vendor').value,
    pmType:document.getElementById('add-pm-type').value,
    pmFreq:document.getElementById('add-pm-freq').value,
    pmLast:document.getElementById('add-pm-last').value,
    pmDateRaw:pmNextRaw,
    pm:pmNextRaw ? formatDateThai(pmNextRaw) : '—',
    calType:document.getElementById('add-cal-type').value,
    calFreq:document.getElementById('add-cal-freq').value,
    calLast:document.getElementById('add-cal-last').value,
    calDateRaw:calNextRaw,
    cal:calNextRaw ? formatDateThai(calNextRaw) : '—',
    partsFreq:document.getElementById('add-parts-freq').value,
    depYears:parseInt(document.getElementById('add-depyears').value)||5,
    buyDate:buyDate,
    year:buyDate ? new Date(buyDate).getFullYear()+543 : (new Date().getFullYear()+543),
    accessories: document.getElementById('add-accessories').value ? 
                 document.getElementById('add-accessories').value.split(',').map(s=>s.trim()).filter(s=>s) : 
                 []
  };

  if (editingDeviceId) {
    const idx = DB.assets.findIndex(a=>a.id===editingDeviceId);
    if(idx > -1) {
       data.status = DB.assets[idx].status; // คงสถานะเดิมไว้
       DB.assets[idx] = { ...DB.assets[idx], ...data };
       addAuditLog('ASSET',currentUserName(),'แก้ไขข้อมูลอุปกรณ์',id+' '+name);
       toast('อัปเดตข้อมูลอุปกรณ์ '+name+' สำเร็จ','teal');
    }
  } else {
    data.status = 'พร้อมใช้';
    DB.assets.push(data);
    addAuditLog('ASSET',currentUserName(),'ขึ้นทะเบียนอุปกรณ์ใหม่',id+' '+name+' (FDA: '+fda+')');
    toast('เพิ่มอุปกรณ์ '+name+' ('+id+') แล้ว','teal');
  }
  
  closeAddDeviceModal();
  renderAssetsTable();
  if(editingDeviceId) setTimeout(()=>openAssetDrawer(id), 100);
}

/* ════════════════════════════════
   DECOMMISSION ASSET
════════════════════════════════ */
let _decommAssetId = null;

function decommissionAsset(id) {
  const asset = DB.assets.find(a=>a.id===id);
  if(!asset) return;
  _decommAssetId = id;

  document.getElementById('decomm-modal-sub').textContent = `${asset.id} · ${asset.name}`;
  document.getElementById('decomm-reason-type').value = '';
  document.getElementById('decomm-reason-other').value = '';
  document.getElementById('decomm-reason-other-wrap').style.display = 'none';
  document.getElementById('decomm-method').value = '';
  document.getElementById('decomm-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('decomm-docref').value = '';
  document.getElementById('decomm-approver').value = '';
  document.getElementById('decomm-salvage').value = '';
  document.getElementById('decomm-note').value = '';
  document.getElementById('decomm-pin').value = '';

  document.getElementById('modal-decommission').classList.add('open');
}

function closeDecommModal() {
  document.getElementById('modal-decommission').classList.remove('open');
  _decommAssetId = null;
}

function toggleDecommReasonOther() {
  const val = document.getElementById('decomm-reason-type').value;
  document.getElementById('decomm-reason-other-wrap').style.display = val === 'อื่นๆ' ? '' : 'none';
}

function submitDecommission() {
  const reasonType = document.getElementById('decomm-reason-type').value;
  const reasonOther = document.getElementById('decomm-reason-other').value.trim();
  const method = document.getElementById('decomm-method').value;
  const date = document.getElementById('decomm-date').value;
  const approver = document.getElementById('decomm-approver').value.trim();
  const pin = document.getElementById('decomm-pin').value;

  if(!reasonType) { toast('กรุณาเลือกเหตุผลการปลดประจำการ','red'); return; }
  if(reasonType === 'อื่นๆ' && !reasonOther) { toast('กรุณาระบุเหตุผลเพิ่มเติม','red'); return; }
  if(!method) { toast('กรุณาเลือกวิธีการจำหน่าย','red'); return; }
  if(!date) { toast('กรุณาระบุวันที่ปลดประจำการ','red'); return; }
  if(!approver) { toast('กรุณาระบุผู้อนุมัติ','red'); return; }
  if(!pin || pin.length < 4) { toast('PIN ต้องมีอย่างน้อย 4 หลัก','red'); return; }

  const asset = DB.assets.find(a=>a.id===_decommAssetId);
  if(!asset) return;

  const reasonFinal = reasonType === 'อื่นๆ' ? reasonOther : reasonType;
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const d = new Date(date);
  const dateThai = `${d.getDate()} ${months[d.getMonth()]} ${(d.getFullYear()+543).toString().slice(-2)}`;

  asset.status = 'จำหน่าย/แทงจำหน่าย';
  asset.decommDate = dateThai;
  asset.decommReason = reasonFinal;
  asset.decommMethod = method;
  asset.decommDocRef = document.getElementById('decomm-docref').value.trim() || '—';
  asset.decommApprover = approver;
  asset.decommSalvage = parseFloat(document.getElementById('decomm-salvage').value)||0;
  asset.decommNote = document.getElementById('decomm-note').value.trim();

  addAuditLog('ASSET',currentUserName(),'ปลดประจำการอุปกรณ์ (Decommissioned)',
    `${asset.id} · ${asset.name} · วิธี: ${method} · เหตุผล: ${reasonFinal} · อนุมัติโดย: ${approver}`);

  closeDecommModal();
  closeDrawer();
  assetsViewMode = 'decommission';
  renderAssetsTable();
  refreshDashboard();
  toast(`ปลดประจำการ ${asset.id} เรียบร้อย — ${method}`, 'teal');
}

/* ════════════════════════════════
   REPAIR
════════════════════════════════ */
function openRepairDrawer() {
  populateRepairDevices();
  document.getElementById('repair-cmid').value = previewDocId('repair');
  openDrawer('drawer-repair');
}

function populateRepairDevices() {
  const sel = document.getElementById('repair-device');
  if(!sel) return;
  sel.innerHTML = '<option value="">-- เลือก --</option>'+DB.assets.map(a=>`<option value="${a.id}">${a.name} (${a.id})</option>`).join('');
}

function submitRepair() {
  const cmId = nextDocId('repair');
  const dev = document.getElementById('repair-device').value;
  const sym = document.getElementById('repair-symptom').value.trim();
  const loc = document.getElementById('repair-location').value;
  if(!dev||!sym) { toast('กรุณาเลือกอุปกรณ์และระบุอาการ','red'); return; }
  const asset = DB.assets.find(a=>a.id===dev);
  if(asset) asset.status = 'ซ่อม';
  
  const today = new Date();
  const thaiDate = today.getDate()+' เม.ย.';
  
  DB.repairs.unshift({
    id: cmId, devId: dev, device: asset?asset.name:'Unknown',
    sym: sym, reporter: 'ผู้ใช้งานระบบ', date: thaiDate, days: 0,
    tech: '', status: 'รอรับงาน', location: loc, ext: false, cost: 0, cause: '', parts: ''
  });
  
  addAuditLog('CM',currentUserName(),'เปิดแจ้งซ่อม '+cmId,dev+' · '+sym.substring(0,50));
  closeDrawer();
  renderAssetsTable();
  renderRepairTable();
  toast('แจ้งซ่อม '+dev+' แล้ว — สร้าง '+cmId,'teal');
}

let activeRepairId = null;
let _cmPartsTemp = [];
let _cmCoTechsTemp = [];

function renderCMPartsList() {
  const list = document.getElementById('drm-parts-list');
  if(!list) return;
  if(!_cmPartsTemp.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:4px 2px">ยังไม่มีรายการอะไหล่</div>';
    return;
  }
  list.innerHTML = _cmPartsTemp.map((p,i) => {
    const sp = DB.spareParts.find(x=>x.id===p.spId);
    const stock = sp ? sp.qty : '?';
    const overStock = sp && p.qty > sp.qty;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:${overStock?'rgba(239,68,68,.06)':'var(--surface2)'};border-radius:6px;font-size:12px">
      <span style="flex:1;font-weight:500">${p.name}</span>
      <span style="color:var(--text3);font-size:11px">${p.unit||'ชิ้น'}</span>
      <input type="number" value="${p.qty}" min="1" style="width:60px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px" onchange="_cmPartsTemp[${i}].qty=Math.max(1,parseInt(this.value)||1);renderCMPartsList()" title="คลังเหลือ ${stock} ${p.unit||'ชิ้น'}">
      <span style="font-size:10px;color:${overStock?'var(--red)':'var(--text3)'}">คลัง:${stock}</span>
      <button onclick="removeCMPart(${i})" type="button" style="border:none;background:none;cursor:pointer;color:var(--text3);padding:2px 4px;font-size:14px;line-height:1" title="นำออก">×</button>
    </div>`;
  }).join('');
}

function addCMPart() {
  const sel = document.getElementById('drm-parts-sel');
  const qtyEl = document.getElementById('drm-parts-qty');
  if(!sel.value) { toast('กรุณาเลือกอะไหล่จากคลัง','amber'); return; }
  const qty = Math.max(1, parseInt(qtyEl.value)||1);
  const sp = DB.spareParts.find(x=>x.id===sel.value);
  if(!sp) return;
  const existing = _cmPartsTemp.find(p=>p.spId===sp.id);
  if(existing) { existing.qty += qty; }
  else { _cmPartsTemp.push({spId:sp.id, name:sp.name, qty, unit:sp.unit, unitCost:sp.unitCost}); }
  qtyEl.value = 1;
  sel.value = '';
  renderCMPartsList();
}

function removeCMPart(idx) {
  _cmPartsTemp.splice(idx, 1);
  renderCMPartsList();
}

function renderCMCoTechsList() {
  const list = document.getElementById('drm-cotechs-list');
  if(!list) return;
  if(!_cmCoTechsTemp.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:2px 0">ยังไม่มีช่างร่วม</div>';
    return;
  }
  list.innerHTML = _cmCoTechsTemp.map(name =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:rgba(5,178,122,.1);border:1px solid rgba(5,178,122,.3);border-radius:99px;font-size:12px;color:var(--teal)">
      ${name}
      <button onclick="removeCMCoTech('${name.replace(/'/g,"\\'")}')" type="button" style="border:none;background:none;cursor:pointer;color:var(--teal);padding:0 0 0 2px;font-size:13px;line-height:1">×</button>
    </span>`
  ).join('');
}

function addCMCoTech() {
  const sel = document.getElementById('drm-cotech-sel');
  if(!sel.value) { toast('กรุณาเลือกช่าง','amber'); return; }
  if(_cmCoTechsTemp.includes(sel.value)) { toast('เพิ่มช่างท่านนี้แล้ว','amber'); return; }
  const mainTech = document.getElementById('drm-tech').value;
  if(sel.value === mainTech) { toast('ช่างท่านนี้เป็นผู้รับผิดชอบหลักอยู่แล้ว','amber'); return; }
  _cmCoTechsTemp.push(sel.value);
  sel.value = '';
  renderCMCoTechsList();
}

function removeCMCoTech(name) {
  _cmCoTechsTemp = _cmCoTechsTemp.filter(n=>n!==name);
  renderCMCoTechsList();
}

function openRepairManageDrawer(cmId) {
  const r = DB.repairs.find(x=>x.id===cmId);
  if(!r) return;
  activeRepairId = cmId;
  document.getElementById('drm-title').textContent = `จัดการงานซ่อม ${r.id}`;
  document.getElementById('drm-sub').textContent = `${r.device} (${r.devId}) · แจ้งเมื่อ ${r.date}`;

  document.getElementById('drm-tech').value = r.tech || '';
  document.getElementById('drm-status').value = r.status || 'รอรับงาน';
  document.getElementById('drm-cause').value = r.cause || '';
  document.getElementById('drm-cost').value = r.cost || '';
  document.getElementById('drm-progress').value = '';
  document.getElementById('drm-escalation').value = '';
  document.getElementById('drm-pin').value = '';

  // Init parts list (support old string format for backward compat)
  _cmPartsTemp = Array.isArray(r.partsUsed) ? r.partsUsed.map(p=>({...p})) : [];

  // Init co-techs
  _cmCoTechsTemp = Array.isArray(r.coTechs) ? [...r.coTechs] : [];

  // Populate parts select from inventory
  const partsSel = document.getElementById('drm-parts-sel');
  if(partsSel) {
    partsSel.innerHTML = '<option value="">-- เลือกอะไหล่จากคลัง --</option>'
      + DB.spareParts.map(p =>
          `<option value="${p.id}"${p.qty===0?' disabled':''}>
            ${p.name} (${p.partNo}) — คลัง: ${p.qty} ${p.unit}${p.qty===0?' [หมด]':''}
          </option>`
        ).join('');
  }

  // Populate co-tech select
  const ctSel = document.getElementById('drm-cotech-sel');
  if(ctSel) {
    ctSel.innerHTML = '<option value="">-- เลือกช่างร่วมซ่อม --</option>'
      + DB.settings.technician.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  renderCMPartsList();
  renderCMCoTechsList();
  openDrawer('drawer-repair-manage');
}

function updateRepairTicket() {
  const pin = document.getElementById('drm-pin').value;
  if(!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature ด้วย PIN 4 หลัก', 'amber'); return; }
  const user = DB.users.find(u=>u.pin===pin && u.active);
  if(!user) { toast('PIN ไม่ถูกต้อง','red'); return; }

  const r = DB.repairs.find(x=>x.id===activeRepairId);
  if(!r) return;

  // Check stock before deducting
  for(const p of _cmPartsTemp) {
    const sp = DB.spareParts.find(x=>x.id===p.spId);
    if(sp && p.qty > sp.qty) {
      toast(`อะไหล่ "${p.name}" ในคลังมีเพียง ${sp.qty} ${sp.unit} — กรุณาปรับจำนวน`,'red');
      return;
    }
  }

  r.tech      = document.getElementById('drm-tech').value;
  r.status    = document.getElementById('drm-status').value;
  r.cause     = document.getElementById('drm-cause').value;
  r.cost      = parseFloat(document.getElementById('drm-cost').value) || 0;
  r.partsUsed = _cmPartsTemp.map(p=>({...p}));
  r.coTechs   = [..._cmCoTechsTemp];
  r.parts     = _cmPartsTemp.map(p=>`${p.name} x${p.qty}`).join(', ');
  const escalation = document.getElementById('drm-escalation').value;

  // Deduct spare parts stock and record transactions
  _cmPartsTemp.forEach(pt => {
    const sp = DB.spareParts.find(x=>x.id===pt.spId);
    if(sp) {
      const balBefore = sp.qty;
      sp.qty = Math.max(0, sp.qty - pt.qty);
      sp.lastUpdated = new Date().toLocaleDateString('th-TH');
      addSpareTransaction(
        sp.id, 'จ่ายออก', -pt.qty, balBefore, sp.qty,
        r.id,
        `ซ่อม ${r.device} (${r.devId})`,
        user.name
      );
    }
  });

  if(r.status === 'ส่งซ่อมภายนอก') r.ext = true;
  if(r.status === 'ซ่อมเสร็จ') {
    const asset = DB.assets.find(a=>a.id===r.devId);
    if(asset) asset.status = 'พร้อมใช้';
    renderAssetsTable();
  }

  const allTechs = [r.tech, ..._cmCoTechsTemp].filter(Boolean).join(', ');
  addAuditLog('CM', user.name,
    'บันทึกงานซ่อม '+r.id+' (e-Signed)',
    `สถานะ: ${r.status} | ช่าง: ${allTechs}${r.parts?' | อะไหล่: '+r.parts:''}${escalation?' | Escalate: '+escalation:''}`
  );
  saveDB();
  closeDrawer();
  renderRepairTable();
  if(typeof renderSpareTable==='function') renderSpareTable();
  toast('อัปเดตงานซ่อม '+r.id+' สำเร็จ ('+user.name+')','teal');
}

/* ════════════════════════════════
   PM CREATE
════════════════════════════════ */
function onPMCreateDeviceChange() {
  const devId = document.getElementById('pm-create-device').value;
  const asset = DB.assets.find(a=>a.id===devId);
  const typeRow = document.getElementById('pm-caltype-row');
  const caltypeInput = document.getElementById('pm-create-caltype');
  const typeSel = document.getElementById('pm-create-type');
  if(asset && asset.calType) {
    caltypeInput.value = asset.calType;
    typeSel.value = 'สอบเทียบ (Calibration)';
    if(typeRow) typeRow.style.display = 'block';
  } else {
    if(caltypeInput) caltypeInput.value = '';
    if(typeRow && typeSel.value !== 'สอบเทียบ (Calibration)') typeRow.style.display = 'none';
  }
}

function onPMCreateTypeChange() {
  const typeSel = document.getElementById('pm-create-type');
  const typeRow = document.getElementById('pm-caltype-row');
  const caltypeInput = document.getElementById('pm-create-caltype');
  if(!typeRow) return;
  if(typeSel.value === 'สอบเทียบ (Calibration)') {
    typeRow.style.display = 'block';
    if(!caltypeInput.value) {
      const devId = document.getElementById('pm-create-device').value;
      const asset = DB.assets.find(a=>a.id===devId);
      if(asset && asset.calType) caltypeInput.value = asset.calType;
    }
  } else {
    typeRow.style.display = 'none';
  }
}

function openPMCreateDrawer() {
  _pmEditId = null;
  resetPMCreateDrawer();

  const devSel = document.getElementById('pm-create-device');
  if(devSel) devSel.innerHTML = '<option value="">-- เลือกอุปกรณ์ --</option>'+DB.assets.map(a=>`<option value="${a.id}">${a.name} (${a.id})</option>`).join('');

  const respSel = document.getElementById('pm-create-resp');
  if(respSel) respSel.innerHTML = '<option value="">-- ระบุช่างหรือหน่วยงาน --</option>'+DB.settings.technician.map(t=>`<option value="${t}">${t}</option>`).join('') + '<option value="NIMT">NIMT</option><option value="หน่วยงานภายนอก">หน่วยงานภายนอก</option>';

  document.getElementById('pm-create-type').value = 'PM (IPM)';
  document.getElementById('pm-create-due').value = '';
  const ct = document.getElementById('pm-create-caltype');
  if(ct) ct.value = '';
  const tr = document.getElementById('pm-caltype-row');
  if(tr) tr.style.display = 'none';
  openDrawer('drawer-pm-create');
}

function submitPMPlan() {
  const devId   = document.getElementById('pm-create-device').value;
  const type    = document.getElementById('pm-create-type').value;
  const dueRaw  = document.getElementById('pm-create-due').value;
  const resp    = document.getElementById('pm-create-resp').value;
  const calType = (document.getElementById('pm-create-caltype')||{}).value||'';

  if(!devId || !dueRaw) { toast('กรุณาเลือกอุปกรณ์และกำหนดการ', 'red'); return; }

  const asset = DB.assets.find(a=>a.id===devId);
  const woId = nextDocId('pm');
  const dueThai = formatDateThai(dueRaw);
  const kind = type.includes('สอบเทียบ') ? 'cal' : 'pm';

  DB.pmList.unshift({
    id: woId, devId: asset.id, device: asset.name,
    type: type, calType: calType||undefined,
    kind, due: dueThai, resp: resp || 'รอดำเนินการ',
    status: 'รอดำเนินการ', result: '', cost: 0
  });

  addAuditLog('PM', currentUserName(), 'สร้างแผนงานใหม่ ' + woId, `${type} สำหรับ ${asset.id} กำหนด: ${dueThai}`);
  
  closeDrawer();
  renderPMTable();
  renderPMCalendar();
  toast('สร้างแผนงาน '+woId+' สำเร็จ', 'teal');
}

function thaiDateToISO(thaiDate) {
  if(!thaiDate || thaiDate === '—') return '';
  const months = {'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12};
  const parts = thaiDate.trim().split(/\s+/);
  if(parts.length < 3) return '';
  const day = parseInt(parts[0]);
  const mon = months[parts[1]];
  const yr  = parseInt(parts[2]) + (parseInt(parts[2]) < 100 ? 2500 : 0) - 543;
  if(!day || !mon || isNaN(yr)) return '';
  return `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

let _pmEditId = null;
function openPMEditPlanDrawer(pmId) {
  const p = DB.pmList.find(x=>x.id===pmId);
  if(!p) return;
  _pmEditId = pmId;

  // Populate selects
  const devSel = document.getElementById('pm-create-device');
  devSel.innerHTML = '<option value="">-- เลือกอุปกรณ์ --</option>'+DB.assets.map(a=>`<option value="${a.id}"${a.id===p.devId?' selected':''}>${a.name} (${a.id})</option>`).join('');

  const respSel = document.getElementById('pm-create-resp');
  respSel.innerHTML = '<option value="">-- ระบุช่างหรือหน่วยงาน --</option>'+DB.settings.technician.map(t=>`<option value="${t}"${t===p.resp?' selected':''}>${t}</option>`).join('')+'<option value="NIMT"'+(p.resp==='NIMT'?' selected':'')+'>NIMT</option><option value="หน่วยงานภายนอก"'+(p.resp==='หน่วยงานภายนอก'?' selected':'')+'>หน่วยงานภายนอก</option>';

  document.getElementById('pm-create-type').value = p.type || 'PM (IPM)';
  document.getElementById('pm-create-due').value  = thaiDateToISO(p.due);
  const caltypeInp = document.getElementById('pm-create-caltype');
  const caltypeRow = document.getElementById('pm-caltype-row');
  if(caltypeInp) caltypeInp.value = p.calType || '';
  if(caltypeRow) caltypeRow.style.display = (p.type||'').includes('สอบเทียบ') ? 'block' : 'none';

  // Switch drawer to edit mode
  document.querySelector('#drawer-pm-create .drawer-title').textContent = 'แก้ไขแผนบำรุงรักษา/สอบเทียบ';
  document.querySelector('#drawer-pm-create .drawer-sub').textContent   = `${p.id} · ${p.device} (${p.devId})`;
  const footBtns = document.querySelector('#drawer-pm-create .drawer-foot');
  footBtns.innerHTML = `<button class="btn" onclick="closeDrawer();_pmEditId=null;resetPMCreateDrawer()">ยกเลิก</button>
    <button class="btn btn-teal" onclick="updatePMPlan()">บันทึกการแก้ไข</button>`;

  openDrawer('drawer-pm-create');
}

function resetPMCreateDrawer() {
  document.querySelector('#drawer-pm-create .drawer-title').textContent = 'สร้างแผนบำรุงรักษา/สอบเทียบ';
  document.querySelector('#drawer-pm-create .drawer-sub').textContent   = 'สร้าง Work Order ใหม่';
  const footBtns = document.querySelector('#drawer-pm-create .drawer-foot');
  footBtns.innerHTML = `<button class="btn" onclick="closeDrawer()">ยกเลิก</button>
    <button class="btn btn-teal" onclick="submitPMPlan()">สร้างแผนงาน</button>`;
}

function updatePMPlan() {
  const devId   = document.getElementById('pm-create-device').value;
  const type    = document.getElementById('pm-create-type').value;
  const dueRaw  = document.getElementById('pm-create-due').value;
  const resp    = document.getElementById('pm-create-resp').value;
  const calType = (document.getElementById('pm-create-caltype')||{}).value||'';

  if(!devId || !dueRaw) { toast('กรุณาเลือกอุปกรณ์และกำหนดการ','red'); return; }

  const p = DB.pmList.find(x=>x.id===_pmEditId);
  if(!p) return;
  const asset = DB.assets.find(a=>a.id===devId);
  const dueThai = formatDateThai(dueRaw);

  const changed = [];
  if(p.devId    !== devId)   changed.push(`อุปกรณ์: ${p.devId}→${devId}`);
  if(p.type     !== type)    changed.push(`ประเภทงาน: ${p.type}→${type}`);
  if(p.due      !== dueThai) changed.push(`กำหนดการ: ${p.due}→${dueThai}`);
  if(p.resp     !== resp)    changed.push(`ผู้รับผิดชอบ: ${p.resp}→${resp}`);
  if((p.calType||'') !== calType) changed.push(`ประเภทสอบเทียบ: ${p.calType||'—'}→${calType||'—'}`);

  p.devId   = asset.id;
  p.device  = asset.name;
  p.type    = type;
  p.calType = calType || undefined;
  p.due     = dueThai;
  p.resp    = resp || p.resp;
  p.kind    = type.includes('สอบเทียบ') ? 'cal' : 'pm';

  addAuditLog('PM', currentUserName(), `แก้ไขแผนงาน ${p.id}`, changed.join(' | ') || 'ไม่มีการเปลี่ยนแปลง');

  _pmEditId = null;
  resetPMCreateDrawer();
  closeDrawer();
  renderPMTable();
  renderPMCalendar();
  toast(`อัปเดตแผนงาน ${p.id} สำเร็จ`, 'teal');
}

/* ════════════════════════════════
   PM CHECKLIST RENDERER
════════════════════════════════ */
function renderPMChecklist(category) {
  const container = document.getElementById('dpm-checklist-section');
  if (!container) return;
  const groups = PM_CHECKLISTS[category] || PM_CHECKLISTS['_default'];
  let total = 0;
  let html = '<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px">รายการตรวจสอบ PM Checklist</div>';
  html += '<div style="background:var(--surface2);border-radius:8px;padding:4px 10px;margin-bottom:10px;display:flex;align-items:center;gap:8px">';
  html += '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div id="dpm-chk-bar" style="height:100%;width:0%;background:var(--teal);transition:width .3s"></div></div>';
  html += '<span id="dpm-chk-txt" style="font-size:12px;color:var(--text2);white-space:nowrap">0 / 0</span></div>';
  groups.forEach(g => {
    html += `<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:var(--teal);margin-bottom:6px">${g.cat}</div>`;
    g.items.forEach(item => {
      total++;
      if (item.type === 'check') {
        html += `<div class="chk-row" onclick="toggleDpmChk(this)" data-id="${item.id}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:3px;background:var(--surface2)">`;
        html += `<div class="chk-box" style="width:18px;height:18px;min-width:18px;border:2px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;margin-top:1px"></div>`;
        html += `<span class="chk-label" style="font-size:12px;color:var(--text);line-height:1.4">${item.desc}</span></div>`;
      } else {
        html += `<div data-id="${item.id}" style="padding:6px 8px;border-radius:6px;margin-bottom:3px;background:var(--surface2)">`;
        html += `<div class="measure-label" style="font-size:12px;color:var(--text);margin-bottom:4px">${item.desc}</div>`;
        html += `<div style="display:flex;align-items:center;gap:6px">`;
        html += `<input type="number" step="any" placeholder="ค่าที่วัดได้" data-measure="${item.id}" oninput="updateDpmChkProgress()" style="width:110px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px">`;
        html += `<span style="font-size:11px;color:var(--text3)">${item.unit||''}</span>`;
        if (item.spec) html += `<span style="font-size:10px;color:var(--amber);background:rgba(245,158,11,.12);padding:2px 6px;border-radius:4px">Spec: ${item.spec}</span>`;
        html += `</div></div>`;
      }
    });
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  container.dataset.total = total;
  updateDpmChkProgress();
}

function toggleDpmChk(el) {
  el.classList.toggle('checked');
  const box = el.querySelector('.chk-box');
  if (box) {
    box.style.background = el.classList.contains('checked') ? 'var(--teal)' : '';
    box.style.borderColor = el.classList.contains('checked') ? 'var(--teal)' : 'var(--border)';
    box.textContent = el.classList.contains('checked') ? '✓' : '';
    box.style.color = 'white';
  }
  updateDpmChkProgress();
}

function updateDpmChkProgress() {
  const container = document.getElementById('dpm-checklist-section');
  if (!container) return;
  const total = parseInt(container.dataset.total) || 0;
  const checked = container.querySelectorAll('.chk-row.checked').length;
  const measures = container.querySelectorAll('input[data-measure]');
  let filledMeasures = 0;
  measures.forEach(inp => { if (inp.value.trim() !== '') filledMeasures++; });
  const done = checked + filledMeasures;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const bar = document.getElementById('dpm-chk-bar');
  const txt = document.getElementById('dpm-chk-txt');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = `${done} / ${total}`;
}

function collectPMChecklistData() {
  const container = document.getElementById('dpm-checklist-section');
  if (!container) return [];
  const results = [];
  container.querySelectorAll('.chk-row').forEach(row => {
    const lbl = row.querySelector('.chk-label');
    results.push({ id: row.dataset.id, label: lbl ? lbl.textContent : row.dataset.id, type: 'check', value: row.classList.contains('checked') ? 'pass' : 'fail' });
  });
  container.querySelectorAll('input[data-measure]').forEach(inp => {
    const parent = inp.closest('div[data-id]');
    const lbl = parent ? parent.querySelector('.measure-label') : null;
    results.push({ id: inp.dataset.measure, label: lbl ? lbl.textContent : inp.dataset.measure, type: 'measure', value: inp.value.trim() });
  });
  return results;
}

/* ════════════════════════════════
   PM & REPAIR TABLES
════════════════════════════════ */
function renderPMTable() {
  const tb = document.getElementById('pm-tbody');
  if(!tb) return;
  const rows = DB.pmList.filter(p => p.kind === activePMKind);
  if (rows.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">ไม่มีรายการ</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(p => {
    const isDone = p.status === 'เสร็จสิ้น';
    const certBtn = (p.kind === 'cal' && isDone && !p.certNo)
      ? `<button class="btn btn-sm" style="border-color:var(--blue);color:var(--blue);margin-left:4px" onclick="event.stopPropagation();linkCalCert('${p.id}')">ผูก Cert</button>`
      : (p.certNo ? `<span class="badge blue" style="margin-left:4px" title="Cert: ${p.certNo}">${p.certNo}</span>` : '');
    const signedInfo = isDone && p.signedBy
      ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">ลงนาม: ${p.signedBy}${p.lastEditedAt?' · '+p.lastEditedAt:''}</div>`
      : '';
    const actionBtn = isDone
      ? `<button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal)" onclick="event.stopPropagation();openPMManageDrawer('${p.id}')">ดูผล</button>`
      : `<button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)" onclick="event.stopPropagation();openPMEditPlanDrawer('${p.id}')">แก้ไขแผน</button>
         <button class="btn btn-sm btn-teal" style="margin-left:4px" onclick="event.stopPropagation();openPMManageDrawer('${p.id}')">บันทึกผล</button>`;
    return `<tr onclick="openPMManageDrawer('${p.id}')">
      <td class="mid">${p.id}</td>
      <td class="fw">${p.device} <span class="mid">${p.devId}</span></td>
      <td>${p.type}</td>
      <td style="${!isDone?'color:var(--amber);font-weight:600':''}">${p.due}</td>
      <td>${p.resp}${signedInfo}</td>
      <td>${isDone?'<span class="badge green">เสร็จสิ้น</span>':'<span class="badge amber">รอดำเนินการ</span>'}${certBtn}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

function togglePMView(view) {
  document.getElementById('pm-view-list').classList.toggle('active-filter', view==='list');
  document.getElementById('pm-view-cal').classList.toggle('active-filter', view==='cal');
  document.getElementById('pm-view-list-container').style.display = view==='list' ? 'block' : 'none';
  document.getElementById('pm-view-cal-container').style.display = view==='cal' ? 'block' : 'none';
  if(view==='cal') renderPMCalendar();
}

function renderPMCalendar() {
  const container = document.getElementById('pm-view-cal-container');
  if(!container) return;
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  let html = '<div class="cal-grid">';
  
  months.forEach(m => {
    const items = DB.pmList.filter(p => p.kind === activePMKind && p.due.includes(m));
    html += `<div class="cal-month">
      <div class="cal-month-title"><span>${m} 2567</span> <span style="font-size:10px;color:var(--text3);font-weight:normal">${items.length} งาน</span></div>
      <div style="display:flex;flex-direction:column;gap:4px">
      ${items.map(p => `
        <div class="cal-item ${p.status==='เสร็จสิ้น'?'done':''}" onclick="openPMManageDrawer('${p.id}')">
          <div style="font-weight:600;color:var(--text)">${p.devId}</div>
          <div style="color:var(--text2);font-size:10px">${p.type}</div>
        </div>
      `).join('')}
      </div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

let activePMId = null;
function openPMManageDrawer(pmId) {
  const p = DB.pmList.find(x=>x.id===pmId);
  if(!p) return;
  activePMId = pmId;
  document.getElementById('dpm-title').textContent = `${p.id} — ${p.type}`;
  document.getElementById('dpm-sub').textContent   = `${p.device} (${p.devId}) · กำหนดการ: ${p.due}`;
  if(p.status === 'เสร็จสิ้น') {
    renderPMReadOnlyView(p);
  } else {
    renderPMEditForm(p);
  }
  openDrawer('drawer-pm-manage');
}

function renderPMHistoryHtml(p) {
  const history = DB.pmList.filter(x => x.devId === p.devId && x.id !== p.id && x.status === 'เสร็จสิ้น');
  let h = '<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">PM/Cal History</div>';
  if(history.length) {
    h += history.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><div style="display:flex;justify-content:space-between"><span class="fw">${x.type}</span><span>${x.due}</span></div><div style="color:var(--text2);margin-top:2px">ผล: ${x.result||'-'} | ${x.resp}</div></div>`).join('');
  } else {
    h += '<div style="font-size:12px;color:var(--text3)">ไม่มีประวัติ</div>';
  }
  return h;
}

function getPMChecklistLabel(id) {
  if (typeof PM_CHECKLISTS === 'undefined') return id;
  for (const cat in PM_CHECKLISTS) {
    for (const g of PM_CHECKLISTS[cat]) {
      const f = g.items.find(i => i.id === id);
      if (f) return f.desc;
    }
  }
  return id;
}

function renderPMChecklistReadOnly(checklistData) {
  if(!checklistData || !checklistData.length) return '<div style="font-size:12px;color:var(--text3)">ไม่มีข้อมูล Checklist</div>';
  const checks   = checklistData.filter(x=>x.type==='check');
  const measures = checklistData.filter(x=>x.type==='measure');
  let html = '';
  if(checks.length) {
    html += '<div style="display:grid;gap:4px">' + checks.map(x =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="width:18px;height:18px;border-radius:4px;background:${x.value==='pass'?'var(--teal)':'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${x.value==='pass'?'<svg viewBox="0 0 10 8" style="width:10px;stroke:#fff;fill:none;stroke-width:2"><path d="M1 4l3 3 5-6"/></svg>':''}
        </span>
            <span>${x.label || getPMChecklistLabel(x.id)}</span>
      </div>`).join('') + '</div>';
  }
  if(measures.length) {
    html += '<div style="margin-top:8px;display:grid;gap:4px">' + measures.map(x =>
      `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text2)">${x.label || getPMChecklistLabel(x.id)}</span>
        <span class="fw">${x.value||'—'}</span>
      </div>`).join('') + '</div>';
  }
  return html;
}

function renderPMReadOnlyView(p) {
  const corrCount = (p.corrections||[]).length;
  const drawerBody = document.querySelector('#drawer-pm-manage .drawer-body');
  const drawerFoot = document.querySelector('#drawer-pm-manage .drawer-foot');

  let corrHtml = '';
  if(corrCount) {
    corrHtml = `<div style="margin-top:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">Correction Notes (${corrCount})</div>
      ${(p.corrections||[]).map((c,i) => `
        <div style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span class="fw" style="color:var(--amber)">Correction #${i+1}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--text3)">${c.at} · ${c.by}</span>
              <button class="btn btn-sm" style="padding:2px 8px;font-size:10px;border-color:var(--border2);color:var(--text2)" onclick="printCorrectionNote('${p.id}', ${i})">🖨 พิมพ์</button>
            </div>
          </div>
          <div style="color:var(--text2);margin-bottom:6px"><strong>เหตุผล:</strong> ${c.reason}</div>
          ${c.changes.map(ch=>`<div style="font-size:11px;color:var(--text3);padding:2px 0">${ch.field}: <span style="text-decoration:line-through;color:var(--red)">${ch.from||'—'}</span> → <span style="color:var(--teal)">${ch.to||'—'}</span></div>`).join('')}
        </div>`).join('')}
    </div>`;
  }

  drawerBody.innerHTML = `
    <div style="background:rgba(5,178,122,.08);border:1px solid rgba(5,178,122,.3);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <svg viewBox="0 0 16 16" style="width:16px;height:16px;stroke:var(--teal);fill:none;stroke-width:2;flex-shrink:0"><circle cx="8" cy="8" r="7"/><path d="M8 11V8m0-3h.01"/></svg>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--teal)">บันทึกเสร็จสิ้น — ล็อกระเบียนแล้ว (ISO 13485 §4.2.4)</div>
        <div style="font-size:11px;color:var(--teal);margin-top:2px">ลงนามโดย ${p.signedBy||'—'} เมื่อ ${p.signedAt||p.due}${corrCount?' · แก้ไขแล้ว '+corrCount+' ครั้ง':''}</div>
      </div>
    </div>
    <div class="form-row col2" style="pointer-events:none;opacity:.85">
      <div class="ff"><label class="flabel">สถานะงาน</label><div class="finput" style="background:var(--surface2)">${p.status}</div></div>
      <div class="ff"><label class="flabel">ผลการตรวจสอบ</label><div class="finput" style="background:var(--surface2)">${p.result||'—'}</div></div>
      <div class="ff"><label class="flabel">ค่าก่อนปรับตั้ง (As Found)</label><div class="finput" style="background:var(--surface2)">${p.before||'—'}</div></div>
      <div class="ff"><label class="flabel">ค่าหลังปรับตั้ง (As Left)</label><div class="finput" style="background:var(--surface2)">${p.after||'—'}</div></div>
      <div class="ff span2"><label class="flabel">Traceability (NIMT)</label><div class="finput" style="background:var(--surface2)">${p.trace||'—'}</div></div>
      <div class="ff"><label class="flabel">ค่าใช้จ่าย (บาท)</label><div class="finput" style="background:var(--surface2)">${p.cost||'0'}</div></div>
      <div class="ff"><label class="flabel">ผู้ดำเนินการ</label><div class="finput" style="background:var(--surface2)">${p.resp||'—'}</div></div>
    </div>
    <div style="margin-top:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">Checklist</div>
      ${renderPMChecklistReadOnly(p.checklistData)}
    </div>
    ${corrHtml}
    <div style="margin-top:16px">${renderPMHistoryHtml(p)}</div>
  `;

  drawerFoot.innerHTML = `
    <button class="btn" onclick="closeDrawer()">ปิด</button>
    <button class="btn" style="border-color:var(--teal);color:var(--teal)" onclick="printPMWorkOrder('${p.id}')">🖨 พิมพ์${p.kind==='cal'?'ใบสอบเทียบ':'ใบงาน PM'}</button>
    <button class="btn" style="border-color:var(--amber);color:var(--amber)" onclick="openPMCorrectionForm('${p.id}')">
      <svg viewBox="0 0 16 16" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;margin-right:4px;vertical-align:middle"><path d="M10 2l4 4-8 8H2v-4z"/></svg>ขอแก้ไข (Correction Note)
    </button>
  `;
}

function renderPMEditForm(p) {
  const drawerBody = document.querySelector('#drawer-pm-manage .drawer-body');
  const drawerFoot = document.querySelector('#drawer-pm-manage .drawer-foot');

  drawerBody.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">แก้ไข / บันทึกผลการดำเนินงาน</div>
    <div class="form-row col2">
      <div class="ff"><label class="flabel">สถานะงาน</label><select class="finput" id="dpm-status" onchange="toggleDpmPinSection()"><option>รอดำเนินการ</option><option>เสร็จสิ้น</option><option>ยกเลิก</option></select></div>
      <div class="ff"><label class="flabel">ผลการตรวจสอบ (Result)</label><select class="finput" id="dpm-result"><option value="">-- เลือกผล --</option><option>ผ่านเกณฑ์มาตรฐาน (Pass)</option><option>ผ่านแบบมีเงื่อนไข/ปรับตั้ง (Adjusted)</option><option>ไม่ผ่าน (Fail) - ต้องส่งซ่อม</option></select></div>
      <div class="ff"><label class="flabel">ค่าก่อนปรับตั้ง (As Found)</label><input class="finput" id="dpm-before" placeholder="เช่น 98%"></div>
      <div class="ff"><label class="flabel">ค่าหลังปรับตั้ง (As Left)</label><input class="finput" id="dpm-after" placeholder="เช่น 100%"></div>
      <div class="ff span2"><label class="flabel">เครื่องมืออ้างอิง / Traceability (NIMT)</label><input class="finput" id="dpm-trace" placeholder="ระบุ S/N หรือรหัสใบรับรองของ Standard Analyzer"></div>
      <div class="ff"><label class="flabel">ค่าใช้จ่าย (บาท)</label><input class="finput" type="number" id="dpm-cost" placeholder="0"></div>
      <div class="ff"><label class="flabel">ผู้ดำเนินการ / บริษัทภายนอก</label><input class="finput" id="dpm-resp" placeholder="ชื่อผู้ตรวจสอบ"></div>
      <div class="ff span2"><label class="flabel">แนบไฟล์ผลสอบเทียบ (Certificate/Report)</label><input class="finput" type="file" id="dpm-file" accept=".pdf,.jpg,.jpeg,.png"></div>
    </div>
    <div id="dpm-checklist-section" style="margin-top:16px"></div>
    <div id="dpm-pin-section" style="background:var(--surface2);padding:12px;border-radius:var(--r);margin-top:16px;border:1px solid var(--border);display:none">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--teal)">21 CFR Part 11 — Electronic Signature</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">จำเป็นเฉพาะเมื่อตั้งสถานะ "เสร็จสิ้น" เพื่อล็อกระเบียน</div>
      <div style="display:flex;gap:8px"><input type="password" class="finput" id="dpm-pin" placeholder="กรอก PIN 4 หลักเพื่อลงนามยืนยัน" autocomplete="new-password"></div>
    </div>
    <div id="dpm-history" style="margin-top:20px;"></div>
  `;

  drawerFoot.innerHTML = `
    <button class="btn" onclick="closeDrawer()">ยกเลิก</button>
    <button class="btn btn-teal" onclick="updatePMTicket()">บันทึกข้อมูล</button>
  `;

  document.getElementById('dpm-status').value = p.status || 'รอดำเนินการ';
  document.getElementById('dpm-result').value = p.result || '';
  document.getElementById('dpm-cost').value   = p.cost   || '';
  document.getElementById('dpm-resp').value   = p.resp   || '';
  document.getElementById('dpm-before').value = p.before || '';
  document.getElementById('dpm-after').value  = p.after  || '';
  document.getElementById('dpm-trace').value  = p.trace  || '';
  document.getElementById('dpm-pin').value    = '';
  toggleDpmPinSection();

  const asset = DB.assets.find(a => a.id === p.devId);
  renderPMChecklist(asset ? asset.category : '_default');
  if(p.checklistData && p.checklistData.length) restorePMChecklistData(p.checklistData);

  let histHtml = '<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">ประวัติการบำรุงรักษา (PM/Cal History)</div>';
  const history = DB.pmList.filter(x => x.devId === p.devId && x.id !== p.id && x.status === 'เสร็จสิ้น');
  if(history.length) {
    histHtml += history.map(h => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><div style="display:flex;justify-content:space-between"><span class="fw">${h.type}</span><span>${h.due}</span></div><div style="color:var(--text2);margin-top:2px">ผล: ${h.result||'-'} | ผู้ดำเนินการ: ${h.resp}</div></div>`).join('');
  } else {
    histHtml += '<div style="font-size:12px;color:var(--text3)">ไม่มีประวัติย้อนหลัง</div>';
  }
  document.getElementById('dpm-history').innerHTML = histHtml;
}

function restorePMChecklistData(checklistData) {
  const container = document.getElementById('dpm-checklist-section');
  if(!container || !checklistData) return;
  checklistData.forEach(item => {
    if(item.type === 'check') {
      const row = container.querySelector(`.chk-row[data-id="${item.id}"]`);
      if(row && item.value === 'pass' && !row.classList.contains('checked')) toggleDpmChk(row);
    } else if(item.type === 'measure') {
      const inp = container.querySelector(`input[data-measure="${item.id}"]`);
      if(inp && item.value !== undefined) inp.value = item.value;
    }
  });
  updateDpmChkProgress();
}

function toggleDpmPinSection() {
  const sel = document.getElementById('dpm-status');
  const sec = document.getElementById('dpm-pin-section');
  if(!sel || !sec) return;
  sec.style.display = sel.value === 'เสร็จสิ้น' ? 'block' : 'none';
}

function updatePMTicket() {
  const newStatus = document.getElementById('dpm-status').value;
  const p = DB.pmList.find(x=>x.id===activePMId);
  if(!p) return;

  let signedUser = null;
  if(newStatus === 'เสร็จสิ้น') {
    const pin = document.getElementById('dpm-pin').value;
    if(!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature ด้วย PIN 4 หลักก่อนบันทึกเสร็จสิ้น','amber'); return; }
    signedUser = DB.users.find(u => u.pin === pin && u.active);
    if(!signedUser) { toast('PIN ไม่ถูกต้อง — ไม่สามารถลงนามได้','red'); return; }
  }

  p.status        = newStatus;
  p.result        = document.getElementById('dpm-result').value;
  p.cost          = parseFloat(document.getElementById('dpm-cost').value)||0;
  p.resp          = document.getElementById('dpm-resp').value;
  p.before        = document.getElementById('dpm-before').value.trim();
  p.after         = document.getElementById('dpm-after').value.trim();
  p.trace         = document.getElementById('dpm-trace').value.trim();
  p.lastEditedAt  = new Date().toLocaleString('th-TH');
  p.checklistData = collectPMChecklistData();

  if(signedUser) {
    p.signedBy = signedUser.name;
    p.signedAt = new Date().toLocaleString('th-TH');
    const detail = `ผล: ${p.result||'-'}`+(p.before||p.after?` · As Found: ${p.before||'—'} → As Left: ${p.after||'—'}`:'')+( p.trace?` · Ref: ${p.trace}`:'');
    addAuditLog(p.kind==='cal'?'CAL':'PM', signedUser.name, 'บันทึกผล '+p.id+' (e-Signed)', detail);
    closeDrawer();
    renderPMTable();
    renderPMCalendar();
    toast('บันทึกและล็อกระเบียน '+p.id+' สำเร็จ (ลงนามโดย '+signedUser.name+')','teal');
  } else {
    addAuditLog(p.kind==='cal'?'CAL':'PM', STATE.currentUser||'—', 'แก้ไขข้อมูล '+p.id+' (draft)', `สถานะ: ${p.status}`);
    closeDrawer();
    renderPMTable();
    renderPMCalendar();
    toast('บันทึกการแก้ไข '+p.id+' สำเร็จ','teal');
  }
}

function openPMCorrectionForm(pmId) {
  const p = DB.pmList.find(x=>x.id===pmId);
  if(!p) return;
  activePMId = pmId;
  const drawerBody = document.querySelector('#drawer-pm-manage .drawer-body');
  const drawerFoot = document.querySelector('#drawer-pm-manage .drawer-foot');

  drawerBody.innerHTML = `
    <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:10px 14px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:var(--amber)">Correction Note — ${p.id}</div>
      <div style="font-size:11px;color:var(--amber);margin-top:2px">ระเบียนต้นฉบับยังคงอยู่ ระบบจะบันทึก Correction Note แยกต่างหาก (21 CFR Part 11 §11.10(e))</div>
    </div>
    <div class="ff" style="margin-bottom:12px">
      <label class="flabel">เหตุผลในการแก้ไข <span class="req">*</span></label>
      <input class="finput" id="corr-reason" placeholder="ระบุเหตุผลที่ต้องแก้ไขข้อมูล (บังคับ)" autocomplete="off">
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase">ข้อมูลที่ต้องการแก้ไข (ระบุเฉพาะที่เปลี่ยนแปลง)</div>
    <div class="form-row col2">
      <div class="ff"><label class="flabel">ผลการตรวจสอบ</label><select class="finput" id="corr-result"><option value="">-- ไม่เปลี่ยน --</option><option>ผ่านเกณฑ์มาตรฐาน (Pass)</option><option>ผ่านแบบมีเงื่อนไข/ปรับตั้ง (Adjusted)</option><option>ไม่ผ่าน (Fail) - ต้องส่งซ่อม</option></select></div>
      <div class="ff"><label class="flabel">ผู้ดำเนินการ</label><input class="finput" id="corr-resp" placeholder="ไม่เปลี่ยน (เว้นว่าง)"></div>
      <div class="ff"><label class="flabel">ค่าก่อนปรับตั้ง (As Found)</label><input class="finput" id="corr-before" placeholder="ไม่เปลี่ยน (เว้นว่าง)"></div>
      <div class="ff"><label class="flabel">ค่าหลังปรับตั้ง (As Left)</label><input class="finput" id="corr-after" placeholder="ไม่เปลี่ยน (เว้นว่าง)"></div>
      <div class="ff span2"><label class="flabel">Traceability (NIMT)</label><input class="finput" id="corr-trace" placeholder="ไม่เปลี่ยน (เว้นว่าง)"></div>
      <div class="ff"><label class="flabel">ค่าใช้จ่าย (บาท)</label><input class="finput" type="number" id="corr-cost" placeholder="ไม่เปลี่ยน (เว้นว่าง)"></div>
    </div>
    <div id="dpm-checklist-section" style="margin-top:16px"></div>
    <div style="background:var(--surface2);padding:12px;border-radius:var(--r);margin-top:16px;border:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--teal)">21 CFR Part 11 — Electronic Signature</div>
      <div style="display:flex;gap:8px"><input type="password" class="finput" id="corr-pin" placeholder="กรอก PIN เพื่อยืนยัน Correction Note" autocomplete="new-password"></div>
    </div>
  `;

  drawerFoot.innerHTML = `
    <button class="btn" onclick="openPMManageDrawer('${p.id}')">← กลับ</button>
    <button class="btn" style="border-color:var(--amber);color:var(--amber)" onclick="savePMCorrection()">บันทึก Correction Note</button>
  `;

  const asset = DB.assets.find(a => a.id === p.devId);
  renderPMChecklist(asset ? asset.category : '_default');
  if (p.checklistData && p.checklistData.length) {
    restorePMChecklistData(p.checklistData);
  }
}

function printPMWorkOrder(pmId) {
  const p = DB.pmList.find(x => x.id === pmId);
  if (!p) { toast('ไม่พบข้อมูลแผนงาน', 'red'); return; }
  const asset = DB.assets.find(a => a.id === p.devId) || {};

  const today = new Date();
  const printDate = `${today.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][today.getMonth()]} ${today.getFullYear()+543}`;
  
  const isCal = p.kind === 'cal';
  const docTitle = isCal ? 'ใบรายงานผลการสอบเทียบเครื่องมือแพทย์ (Calibration Report)' : 'ใบรายงานผลการบำรุงรักษาเชิงป้องกัน (Preventive Maintenance Report)';

  let checklistHtml = '';
  if (p.checklistData && p.checklistData.length) {
    checklistHtml = `
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px">
        <thead>
          <tr>
            <th style="width:40px; text-align:center; background:#f8fafc; border:1px solid #cbd5e1; padding:8px">#</th>
            <th style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px; text-align:left">หัวข้อตรวจสอบ / สอบเทียบ</th>
            <th style="width:140px; background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px; text-align:center">เกณฑ์ (Spec)</th>
            <th style="width:140px; background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px; text-align:center">ผลลัพธ์</th>
          </tr>
        </thead>
        <tbody>
          ${p.checklistData.map((chk, i) => {
            const refItem = getPMChecklistItem(chk.id) || {};
            const label = chk.label || refItem.desc || chk.id;
            let specStr = refItem.spec ? `${refItem.spec} ${refItem.unit||''}` : '—';
            let valStr = chk.value || '—';
            let valColor = '#0f172a';
            let valFontWeight = 'normal';

            if (chk.type === 'check') {
              if (chk.value === 'pass') { valStr = '✓ ผ่าน'; valColor = '#0d9488'; valFontWeight = '700'; }
              else if (chk.value === 'fail') { valStr = '✗ ไม่ผ่าน'; valColor = '#dc2626'; valFontWeight = '700'; }
              specStr = 'ผ่านเกณฑ์';
            } else if (chk.type === 'measure') {
              valStr = `${chk.value} ${refItem.unit||''}`;
              valFontWeight = '700';
              valColor = '#0284c7'; // สีฟ้าสำหรับค่า Measurement
            }

            return `
              <tr>
                <td style="text-align:center; border:1px solid #cbd5e1; padding:8px">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:8px 12px">${label}</td>
                <td style="text-align:center; border:1px solid #cbd5e1; padding:8px 12px; color:#64748b; font-size:13px">${specStr}</td>
                <td style="text-align:center; border:1px solid #cbd5e1; padding:8px 12px; color:${valColor}; font-weight:${valFontWeight}">${valStr}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    checklistHtml = '<div style="color:#64748b; font-style:italic; margin-bottom:24px; text-align:center; padding:20px; border:1px dashed #cbd5e1; background:#f8fafc;">ไม่ได้บันทึกรายละเอียด Checklist / Measurement</div>';
  }

  const html = `
    <div class="doc-header">
      <div class="doc-logo">ศูนย์<br>เครื่องมือ<br>แพทย์</div>
      <div class="doc-org">
        <div class="doc-org-name">BMS HOSxP HOSPITAL — ศูนย์วิศวกรรมการแพทย์ (BMED)</div>
        <div class="doc-org-sub">BMS HOSxP HOSPITAL</div>
      </div>
    </div>

    <div class="doc-title-box">
      <h3 style="color:#0d9488;border-bottom-color:#0d9488">${docTitle}</h3>
    </div>

    <div class="doc-meta">
      <div class="doc-meta-item"><span class="lbl">Work Order:</span> <strong>${p.id}</strong></div>
      <div class="doc-meta-item"><span class="lbl">ประเภทงาน:</span> ${p.type} ${p.calType ? '('+p.calType+')' : ''}</div>
      <div class="doc-meta-item"><span class="lbl">สถานะ:</span> <span class="badge-status" style="background:#f0fdf4;color:#16a34a;border-color:#bbf7d0">${p.status}</span></div>
      <div class="doc-meta-item"><span class="lbl">วันที่พิมพ์:</span> ${printDate}</div>
    </div>

    <div class="section-title">ข้อมูลเครื่องมือแพทย์ (Equipment Information)</div>
    <div class="info-grid">
      <div class="info-row"><span class="lbl">รหัสครุภัณฑ์:</span><span style="font-weight:700">${p.devId}</span></div>
      <div class="info-row"><span class="lbl">ชื่ออุปกรณ์:</span><span>${asset.name || p.device}</span></div>
      <div class="info-row"><span class="lbl">ยี่ห้อ / รุ่น:</span><span>${asset.mfr||'—'} / ${asset.model||'—'}</span></div>
      <div class="info-row"><span class="lbl">Serial Number:</span><span>${asset.serial||'—'}</span></div>
      <div class="info-row"><span class="lbl">หน่วยงาน / แผนก:</span><span>${asset.dept||'—'}</span></div>
      <div class="info-row"><span class="lbl">ระดับความเสี่ยง:</span><span>${asset.risk||'—'}</span></div>
    </div>

    <div class="section-title">ผลการดำเนินงาน (Execution Results)</div>
    <div class="info-grid">
      <div class="info-row"><span class="lbl">ผลสรุป (Overall Result):</span><span style="font-weight:700;color:${p.result&&p.result.includes('ไม่ผ่าน')?'#dc2626':'#0d9488'}">${p.result || '—'}</span></div>
      <div class="info-row"><span class="lbl">ผู้ดำเนินการ:</span><span>${p.resp || '—'}</span></div>
      <div class="info-row"><span class="lbl">ค่าก่อนปรับ (As Found):</span><span>${p.before || '—'}</span></div>
      <div class="info-row"><span class="lbl">ค่าหลังปรับ (As Left):</span><span>${p.after || '—'}</span></div>
      <div class="info-row full"><span class="lbl">Traceability (เครื่องมืออ้างอิง):</span><span>${p.trace || '—'}</span></div>
    </div>

    <div class="section-title">${isCal ? 'ตารางบันทึกค่าการสอบเทียบ (Calibration Data)' : 'รายการตรวจสอบสภาพ (Checklist)'}</div>
    ${checklistHtml}

    <div class="sigs" style="margin-top:60px">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-role">( ${p.signedBy || '...........................................'} )</div>
        <div class="sig-date">ผู้ตรวจสอบ / สอบเทียบ (e-Signed)<br>วันที่: ${p.signedAt || '_____/_____/_____'}</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-role">( ........................................... )</div>
        <div class="sig-date">ผู้ทบทวน / อนุมัติผล (Reviewer)<br>วันที่: _____/_____/_____</div>
      </div>
    </div>
  `;

  printDocument(p.id + ' Report', html, p.id, 'portrait');
}

function printCorrectionNote(pmId, corrIndex) {
  const p = DB.pmList.find(x => x.id === pmId);
  if (!p || !p.corrections || !p.corrections[corrIndex]) { toast('ไม่พบข้อมูล Correction Note', 'red'); return; }
  const c = p.corrections[corrIndex];
  const asset = DB.assets.find(a => a.id === p.devId) || {};

  const html = `
    <div class="doc-header">
      <div class="doc-logo">ศูนย์<br>เครื่องมือ<br>แพทย์</div>
      <div class="doc-org">
        <div class="doc-org-name">BMS HOSxP HOSPITAL — ศูนย์วิศวกรรมการแพทย์ (BMED)</div>
        <div class="doc-org-sub">BMS HOSxP HOSPITAL</div>
      </div>
    </div>

    <div class="doc-title-box">
      <h3 style="color:#d97706;border-bottom-color:#d97706">บันทึกการแก้ไขข้อมูล (Correction Note)</h3>
      <div style="margin-top:6px;font-size:14px;color:#475569">อ้างอิงใบงาน: <strong>${p.id}</strong> (21 CFR Part 11 Compliance)</div>
    </div>

    <div class="section-title">ข้อมูลอุปกรณ์และใบงานต้นฉบับ</div>
    <div class="info-grid">
      <div class="info-row"><span class="lbl">ใบงาน (Work Order):</span><span style="font-weight:700">${p.id}</span></div>
      <div class="info-row"><span class="lbl">ประเภทงาน:</span><span>${p.type}</span></div>
      <div class="info-row"><span class="lbl">รหัสครุภัณฑ์:</span><span style="font-weight:700">${p.devId}</span></div>
      <div class="info-row"><span class="lbl">ชื่ออุปกรณ์:</span><span>${p.device}</span></div>
    </div>

    <div class="section-title" style="color:#d97706;border-bottom-color:#d97706">รายละเอียดการแก้ไข (Correction #${corrIndex + 1})</div>
    <div style="margin-bottom:16px">
      <strong>เหตุผลในการแก้ไข:</strong> ${c.reason}
    </div>

    <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px">
      <thead>
        <tr>
          <th style="text-align:left; background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px">หัวข้อที่ถูกแก้ไข</th>
          <th style="text-align:left; background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px">ข้อมูลเดิม (From)</th>
          <th style="text-align:left; background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px">ข้อมูลใหม่ (To)</th>
        </tr>
      </thead>
      <tbody>
        ${c.changes.map(ch => `
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px 12px">${ch.field}</td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; color:#dc2626; text-decoration:line-through">${ch.from || '—'}</td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px; color:#0d9488; font-weight:600">${ch.to || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="sigs" style="margin-top:60px; justify-content:center">
      <div class="sig-box" style="flex:none; width:300px">
        <div class="sig-line"></div>
        <div class="sig-role">( ${c.by} )</div>
        <div class="sig-date">ผู้บันทึกการแก้ไข (e-Signed)<br>วัน-เวลา: ${c.at}</div>
      </div>
    </div>
  `;

  printDocument('Correction Note ' + p.id, html, p.id, 'portrait');
}

function savePMCorrection() {
  const reason = (document.getElementById('corr-reason')||{}).value||'';
  if(!reason.trim()) { toast('กรุณาระบุเหตุผลในการแก้ไข','amber'); return; }
  const pin = (document.getElementById('corr-pin')||{}).value||'';
  if(!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature ด้วย PIN 4 หลัก','amber'); return; }
  const user = DB.users.find(u => u.pin === pin && u.active);
  if(!user) { toast('PIN ไม่ถูกต้อง','red'); return; }
  const p = DB.pmList.find(x=>x.id===activePMId);
  if(!p) return;

  const changes = [];
  const newResult  = document.getElementById('corr-result').value;
  const newResp    = document.getElementById('corr-resp').value.trim();
  const newBefore  = document.getElementById('corr-before').value.trim();
  const newAfter   = document.getElementById('corr-after').value.trim();
  const newTrace   = document.getElementById('corr-trace').value.trim();
  const newCostRaw = document.getElementById('corr-cost').value.trim();

  if(newResult)       { changes.push({field:'ผลการตรวจสอบ', from:p.result||'', to:newResult}); p.result=newResult; }
  if(newResp)         { changes.push({field:'ผู้ดำเนินการ',  from:p.resp||'',   to:newResp});   p.resp=newResp; }
  if(newBefore)       { changes.push({field:'As Found',      from:p.before||'', to:newBefore}); p.before=newBefore; }
  if(newAfter)        { changes.push({field:'As Left',       from:p.after||'',  to:newAfter});  p.after=newAfter; }
  if(newTrace)        { changes.push({field:'Traceability',  from:p.trace||'',  to:newTrace});  p.trace=newTrace; }
  if(newCostRaw!=='') {
    const newCost = parseFloat(newCostRaw)||0;
    changes.push({field:'ค่าใช้จ่าย', from:String(p.cost||0), to:String(newCost)});
    p.cost = newCost;
  }

  const newChecklistData = collectPMChecklistData();
  const oldChecklistStr = JSON.stringify(p.checklistData || []);
  const newChecklistStr = JSON.stringify(newChecklistData);
  if (newChecklistStr !== oldChecklistStr && newChecklistData.length > 0) {
    changes.push({field:'Checklist', from:'ข้อมูลเดิม', to:'แก้ไขข้อมูลใหม่'});
    p.checklistData = newChecklistData;
  }

  if(!changes.length) { toast('ไม่มีข้อมูลที่เปลี่ยนแปลง — ระบุค่าใหม่อย่างน้อย 1 รายการ','amber'); return; }

  if(!p.corrections) p.corrections = [];
  p.corrections.push({ at:new Date().toLocaleString('th-TH'), by:user.name, reason:reason.trim(), changes });
  p.lastEditedAt = new Date().toLocaleString('th-TH');

  addAuditLog(p.kind==='cal'?'CAL':'PM', user.name,
    `Correction Note #${p.corrections.length} — ${p.id}`,
    `เหตุผล: ${reason} | ${changes.map(c=>`${c.field}: ${c.from}→${c.to}`).join(', ')}`);

  closeDrawer();
  renderPMTable();
  renderPMCalendar();
  toast(`บันทึก Correction Note #${p.corrections.length} สำเร็จ (${user.name})`, 'teal');
}

function exportPMExcel() {
  toast('กำลังเตรียมไฟล์ Export (Excel / CSV)...', 'teal');
  let csv = 'Work Order,รหัสเครื่อง,ชื่ออุปกรณ์,ประเภทงาน,กำหนดการ,ผู้รับผิดชอบ,สถานะ,ผลการตรวจสอบ,ค่าใช้จ่าย(บาท)\n';
  DB.pmList.forEach(p => {
    csv += `${p.id},${p.devId},${p.device},${p.type},${p.due},${p.resp},${p.status},${p.result||'-'},${p.cost||0}\n`;
  });
  const blob = new Blob(["\ufeff", csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "medtrack_pm_plan_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderRepairTable() {
  const sf = document.getElementById('repair-status-filter')?.value||'';
  let data = DB.repairs;
  if(sf) data = data.filter(r=>r.status===sf);
  
  const tb = document.getElementById('repair-tbody');
  if(!tb) return;
  tb.innerHTML = data.map(r => {
    // Calculate SLA Classes
    let slaClass = 'sla-white';
    let slaText = `${r.days} วัน`;
    if(r.status !== 'ซ่อมเสร็จ' && r.status !== 'รอรับงาน') {
      if(r.ext) {
        if(r.days > 30) slaClass = 'sla-red';
        else if(r.days > 15) slaClass = 'sla-yellow';
      } else {
        if(r.days > 7) slaClass = 'sla-purple';
        else if(r.days > 3) slaClass = 'sla-yellow';
      }
    }
    if(r.status === 'ซ่อมเสร็จ') slaText = '<span style="color:var(--green)">สำเร็จ</span>';
    
    return `
    <tr class="${slaClass}" onclick="openRepairManageDrawer('${r.id}')">
      <td><div class="fw">${r.id}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${r.location}</div></td>
      <td><div class="fw">${r.device} <span class="mid">${r.devId}</span></div><div style="font-size:11px;color:var(--text2);margin-top:2px">อาการ: ${r.sym}</div></td>
      <td style="font-size:12px">${r.reporter}<br><span class="mid">${r.date}</span></td>
      <td style="font-size:12px;color:var(--teal);font-weight:600">${r.tech || 'รอจ่ายงาน'}</td>
      <td style="font-size:12px">${r.ext?'<span class="badge amber">ส่งศูนย์ภายนอก</span>':'<span class="badge teal">ซ่อมภายใน</span>'}<br><span style="font-size:10px;color:var(--text3);margin-top:4px;display:block">Downtime: ${slaText}</span></td>
      <td>${r.status==='ซ่อมเสร็จ'?'<span class="badge green">ซ่อมเสร็จ</span>':r.status==='ส่งซ่อมภายนอก'?'<span class="badge amber">ซ่อมภายนอก</span>':r.status==='รอรับงาน'?'<span class="badge gray">รอรับงาน</span>':'<span class="badge blue">'+r.status+'</span>'}</td>
    </tr>`}).join('');
}

function exportRepairsExcel() {
  toast('กำลังเตรียมไฟล์ Export (Excel / CSV)...', 'teal');
  let csv = 'ใบแจ้งซ่อม,รหัสเครื่อง,ชื่ออุปกรณ์,อาการ,สถานที่ซ่อม,ช่างรับผิดชอบ,สถานะ,Downtime(วัน),ค่าใช้จ่าย(บาท)\n';
  DB.repairs.forEach(r => {
    csv += `${r.id},${r.devId},${r.device},${r.sym},${r.location},${r.tech||'-'},${r.status},${r.days},${r.cost}\n`;
  });
  const blob = new Blob(["\ufeff", csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "medtrack_repairs_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ════════════════════════════════
   INCIDENT & CAPA
════════════════════════════════ */
function openIncidentCreateDrawer() {
  const devSel = document.getElementById('inc-create-device');
  if(devSel) devSel.innerHTML = '<option value="">-- เลือกอุปกรณ์ --</option>'+DB.assets.map(a=>`<option value="${a.id}">${a.name} (${a.id})</option>`).join('');

  document.getElementById('inc-create-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('inc-create-reporter').value = '';
  document.getElementById('inc-create-severity').value = 'Medium (บาดเจ็บเล็กน้อย/ทรัพย์สินเสียหาย)';
  document.getElementById('inc-create-event').value = '';
  
  openDrawer('drawer-incident-create');
}

function submitIncident() {
  const devId = document.getElementById('inc-create-device').value;
  const dateRaw = document.getElementById('inc-create-date').value;
  const reporter = document.getElementById('inc-create-reporter').value.trim() || 'ผู้ใช้งานระบบ';
  const severity = document.getElementById('inc-create-severity').value;
  const eventDesc = document.getElementById('inc-create-event').value.trim();

  if(!devId || !dateRaw || !eventDesc) { toast('กรุณาเลือกอุปกรณ์, วันที่ และระบุรายละเอียดเหตุการณ์', 'red'); return; }

  const asset = DB.assets.find(a=>a.id===devId);
  const incId = nextDocId('incident');
  const dateThai = formatDateThai(dateRaw);

  DB.incidents.unshift({
    id: incId, devId: asset.id, device: asset.name,
    event: eventDesc, severity: severity, status: 'รอดำเนินการ',
    date: dateThai, reporter: reporter, rca: '', ca: '', pa: ''
  });

  addAuditLog('INC', reporter, 'รายงานอุบัติการณ์ใหม่ ' + incId, `อุปกรณ์: ${asset.id} · ระดับ: ${severity.split(' ')[0]}`);
  
  closeDrawer();
  renderIncidentTable();
  refreshDashboard();
  toast('ส่งรายงานอุบัติการณ์ '+incId+' สำเร็จ', 'teal');
}

/* ════════════════════════════════
   SERVICE CONTRACT TRACKING (ISO 13485 §7.4)
════════════════════════════════ */
function _contractStatus(c) {
  const now = new Date();
  const end = new Date(c.endDateIso);
  const diffDays = Math.ceil((end - now) / 86400000);
  if (diffDays < 0) return 'Expired';
  if (diffDays <= 60) return 'Expiring';
  return 'Active';
}

function _daysLeft(c) {
  const diffDays = Math.ceil((new Date(c.endDateIso) - new Date()) / 86400000);
  return diffDays;
}

function renderContractsTable() {
  const tb = document.getElementById('contracts-tbody');
  if (!tb) return;
  const flt = document.getElementById('contract-status-filter')?.value || '';
  const rows = DB.serviceContracts.filter(c => !flt || _contractStatus(c) === flt ||
    (flt === 'Expiring' && _contractStatus(c) === 'Expiring'));
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">ไม่มีรายการ</td></tr>';
    updateContractNavBadge(); return;
  }
  tb.innerHTML = rows.map(c => {
    const st = _contractStatus(c);
    const days = _daysLeft(c);
    const stBadge = st === 'Active' ? 'green' : st === 'Expiring' ? 'amber' : 'red';
    const stLabel = st === 'Active' ? 'Active' : st === 'Expiring' ? `ใกล้หมด (${days} วัน)` : `หมดแล้ว ${Math.abs(days)} วัน`;
    const devices = c.coveredDevices.map(id => {
      const a = DB.assets.find(x => x.id === id);
      return a ? `<span class="badge gray" style="margin:1px">${id}</span>` : id;
    }).join('');
    const slaPerf = _calcSLAPerformance(c);
    return `<tr onclick="showContractSLA('${c.id}')" style="cursor:pointer">
      <td class="mid">${c.id}</td>
      <td><div class="fw">${c.title}</div><div style="font-size:11px;color:var(--text3)">${c.vendor} · ${c.contactPerson}</div></td>
      <td><span class="badge gray">${c.type}</span></td>
      <td style="font-size:11px">${devices}</td>
      <td style="font-size:12px">${c.startDate}<br><span style="color:var(--text3)">ถึง ${c.endDate}</span></td>
      <td style="font-family:var(--mono);font-size:13px">${(c.value||0).toLocaleString()}</td>
      <td class="mid">≤ ${c.slaResponseHr} ชม.</td>
      <td class="mid">${c.slaUptimePct}%
        ${slaPerf.n > 0 ? `<div style="font-size:10px;color:${slaPerf.compliant?'var(--teal)':'var(--red)'}">(จริง ${slaPerf.actualPct}%)</div>` : ''}
      </td>
      <td><span class="badge ${stBadge}">${stLabel}</span></td>
      <td>
        <button class="btn btn-sm" onclick="event.stopPropagation();openContractDrawer('${c.id}')" style="font-size:10px;padding:3px 8px">แก้ไข</button>
        <button class="btn btn-sm" onclick="event.stopPropagation();renewContract('${c.id}')" style="font-size:10px;padding:3px 8px;margin-left:2px" title="ต่ออายุสัญญา">ต่ออายุ</button>
      </td>
    </tr>`;
  }).join('');
  updateContractNavBadge();
}

function renderContractsKPI() {
  const container = document.getElementById('contracts-kpi-row');
  if (!container) return;
  const total = DB.serviceContracts.length;
  const active = DB.serviceContracts.filter(c => _contractStatus(c) === 'Active').length;
  const expiring = DB.serviceContracts.filter(c => _contractStatus(c) === 'Expiring').length;
  const expired = DB.serviceContracts.filter(c => _contractStatus(c) === 'Expired').length;
  const totalValue = DB.serviceContracts.filter(c => _contractStatus(c) !== 'Expired').reduce((s,c) => s+(c.value||0), 0);
  container.innerHTML = `
    <div class="kpi teal"><div class="kpi-label">สัญญาทั้งหมด</div><div class="kpi-value teal">${total}</div><div class="kpi-meta">รายการ</div></div>
    <div class="kpi teal"><div class="kpi-label">Active</div><div class="kpi-value teal">${active}</div><div class="kpi-meta">สัญญาที่ยังมีผล</div></div>
    <div class="kpi ${expiring?'amber':'teal'}"><div class="kpi-label">ใกล้หมดอายุ (≤60 วัน)</div><div class="kpi-value ${expiring?'amber':'teal'}">${expiring}</div><div class="kpi-meta">ต้องต่ออายุเร็ว ๆ นี้</div></div>
    <div class="kpi ${expired?'red':'teal'}"><div class="kpi-label">หมดอายุแล้ว</div><div class="kpi-value ${expired?'red':'teal'}">${expired}</div><div class="kpi-meta">ต้องดำเนินการด่วน</div></div>`;
}

function updateContractNavBadge() {
  const warn = DB.serviceContracts.filter(c => _contractStatus(c) !== 'Active').length;
  const el = document.getElementById('nb-contracts');
  if (el) { el.textContent = warn; el.style.display = warn ? '' : 'none'; }
}

function _calcSLAPerformance(contract) {
  const repairs = DB.repairs.filter(r => contract.coveredDevices.includes(r.devId) && r.status === 'ซ่อมเสร็จ');
  if (!repairs.length) return { n: 0, compliant: true, actualPct: 100 };
  const slaHours = contract.slaResponseHr || 24;
  const compliantCount = repairs.filter(r => (r.days || 0) * 24 <= slaHours * 2).length;
  const pct = Math.round(compliantCount / repairs.length * 100);
  return { n: repairs.length, compliant: pct >= (contract.slaUptimePct || 80), actualPct: pct };
}

function showContractSLA(contractId) {
  const c = DB.serviceContracts.find(x => x.id === contractId);
  if (!c) return;
  const title = document.getElementById('contracts-sla-title');
  const sub = document.getElementById('contracts-sla-sub');
  const body = document.getElementById('contracts-sla-body');
  if (!title || !body) return;
  const repairs = DB.repairs.filter(r => c.coveredDevices.includes(r.devId));
  const slaPerf = _calcSLAPerformance(c);
  const deviceRows = c.coveredDevices.map(id => {
    const a = DB.assets.find(x => x.id === id);
    const rCount = DB.repairs.filter(r => r.devId === id).length;
    return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${a?.name || id}</div><div style="font-size:11px;color:var(--text3)">${id} · ${a?.dept || ''}</div></div>
      <span class="badge gray">${rCount} งานซ่อม</span>
    </div>`;
  }).join('');
  const repairRows = repairs.length ? repairs.map(r =>
    `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between">
      <span>${r.id} — ${r.device} · ${r.sym?.substring(0,40)}</span>
      <span style="color:var(--text3)">${r.days || 0} วัน</span>
    </div>`).join('') : '<div style="color:var(--text3);font-size:12px">ยังไม่มีประวัติงานซ่อม</div>';
  title.textContent = `รายละเอียดสัญญา: ${c.id}`;
  if (sub) sub.textContent = `${c.title} (${c.vendor})`;
  body.innerHTML = `
    <div class="g3-1" style="grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="background:var(--surface2);border-radius:var(--r);padding:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Response SLA</div>
        <div style="font-size:18px;font-weight:700;color:var(--teal)">≤ ${c.slaResponseHr} ชม.</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r);padding:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Uptime Target</div>
        <div style="font-size:18px;font-weight:700;color:var(--teal)">${c.slaUptimePct}%</div>
      </div>
      <div style="background:${slaPerf.compliant?'rgba(20,184,166,.1)':'var(--red-l)'};border-radius:var(--r);padding:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">SLA Compliance (จริง)</div>
        <div style="font-size:18px;font-weight:700;color:${slaPerf.compliant?'var(--teal)':'var(--red)'}">${slaPerf.n > 0 ? slaPerf.actualPct+'%' : 'N/A'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div><div style="font-size:12px;font-weight:700;margin-bottom:8px">อุปกรณ์ที่ครอบคลุม</div>${deviceRows}</div>
      <div><div style="font-size:12px;font-weight:700;margin-bottom:8px">ประวัติงานซ่อม (${repairs.length} รายการ)</div>${repairRows}</div>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--text3)">เอกสารอ้างอิง: ${c.docRef || '—'} ${c.note ? '· '+c.note : ''}</div>`;
  const editBtn = document.getElementById('btn-edit-contract-from-sla');
  if (editBtn) {
      editBtn.onclick = () => { closeDrawer(); setTimeout(() => openContractDrawer(c.id), 200); };
  }
  openDrawer('drawer-contract-sla');
}

/* ── Contract Device Smart Search ── */
function dctDeviceSearch() {
  const q = (document.getElementById('dct-device-search')?.value || '').trim().toLowerCase();
  const dd = document.getElementById('dct-device-dropdown');
  if (!dd) return;
  const candidates = DB.assets.filter(a =>
    a.status !== 'จำหน่าย/แทงจำหน่าย' &&
    !dctSelectedDeviceIds.includes(a.id) &&
    (q === '' || a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
     (a.dept||'').toLowerCase().includes(q) || (a.brand||'').toLowerCase().includes(q) ||
     (a.model||'').toLowerCase().includes(q) || (a.category||'').toLowerCase().includes(q))
  ).slice(0, 10);

  if (candidates.length === 0) {
    dd.style.display = 'block';
    dd.innerHTML = `<div style="padding:14px 16px;color:var(--text3);font-size:12px;text-align:center">ไม่พบอุปกรณ์ที่ตรงกัน</div>`;
    return;
  }
  dd.style.display = 'block';
  dd.innerHTML = candidates.map(a => {
    const statusColor = a.status === 'พร้อมใช้' ? 'var(--green)' : a.status === 'ส่งซ่อม' ? 'var(--amber)' : 'var(--text3)';
    return `<div onclick="dctAddDevice('${a.id}')" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .08s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--teal-d);display:grid;place-items:center;flex-shrink:0">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${a.id} — ${a.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${a.dept} · ${a.brand||''} ${a.model||''} · <span style="color:${statusColor}">${a.status}</span></div>
      </div>
      <div style="font-size:11px;font-weight:600;color:var(--teal);background:var(--teal-d);padding:3px 10px;border-radius:6px;flex-shrink:0">+ เพิ่ม</div>
    </div>`;
  }).join('');
}

function dctAddDevice(assetId) {
  if (!dctSelectedDeviceIds.includes(assetId)) {
    dctSelectedDeviceIds.push(assetId);
    dctRenderSelectedChips();
  }
  const srch = document.getElementById('dct-device-search');
  if (srch) { srch.value = ''; srch.focus(); }
  const dd = document.getElementById('dct-device-dropdown');
  if (dd) dd.style.display = 'none';
  dctDeviceSearch(); // refresh dropdown to remove just-added item
}

function dctRemoveDevice(assetId) {
  dctSelectedDeviceIds = dctSelectedDeviceIds.filter(id => id !== assetId);
  dctRenderSelectedChips();
  const srch = document.getElementById('dct-device-search');
  if (srch && srch.value.length > 0) dctDeviceSearch();
}

function dctRenderSelectedChips() {
  const container = document.getElementById('dct-selected-devices');
  const countBadge = document.getElementById('dct-dev-count');
  if (!container) return;

  if (dctSelectedDeviceIds.length === 0) {
    if (countBadge) countBadge.style.display = 'none';
    container.style.cssText = 'min-height:56px;background:var(--surface2);border:1.5px dashed var(--border2);border-radius:var(--r);padding:12px;display:flex;align-items:center;justify-content:center';
    container.innerHTML = `<span style="color:var(--text3);font-size:12px;text-align:center">ยังไม่มีอุปกรณ์ที่เลือก — ค้นหาและเพิ่มได้จากช่องด้านบน</span>`;
    return;
  }

  if (countBadge) { countBadge.textContent = dctSelectedDeviceIds.length; countBadge.style.display = 'inline'; }
  container.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;max-height:320px;overflow-y:auto';

  const statusColor = {'พร้อมใช้':'var(--green)','ยืมออก':'var(--blue)','ส่งซ่อม':'var(--amber)','ซ่อม':'var(--amber)'};
  const riskBg     = {'สูง':'var(--red-l)','กลาง':'var(--amber-l)','ต่ำ':'var(--green-l)'};
  const riskFg     = {'สูง':'var(--red)','กลาง':'var(--amber)','ต่ำ':'var(--green)'};

  container.innerHTML = dctSelectedDeviceIds.map((id, idx) => {
    const a = DB.assets.find(x => x.id === id);
    if (!a) return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;${idx<dctSelectedDeviceIds.length-1?'border-bottom:1px solid var(--border);':''}font-size:12px;color:var(--text3)">
      <span>${id} (ไม่พบข้อมูล)</span>
      <button onclick="dctRemoveDevice('${id}')" style="border:none;background:none;cursor:pointer;color:var(--red);font-size:18px;line-height:1;padding:0 4px">×</button>
    </div>`;
    const sc = statusColor[a.status] || 'var(--text3)';
    const isLast = idx === dctSelectedDeviceIds.length - 1;
    return `<div style="display:flex;align-items:center;gap:12px;padding:11px 14px;${isLast?'':'border-bottom:1px solid var(--border);'}transition:background .08s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:36px;height:36px;border-radius:9px;background:var(--teal-d);display:grid;place-items:center;flex-shrink:0">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">
          <span style="font-family:var(--m);color:var(--teal);font-size:12px">${a.id}</span>
          <span style="color:var(--text3);font-weight:400;margin:0 5px">—</span>${a.name}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:3px">
          <span style="font-family:var(--m);font-size:11px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:1px 7px;color:var(--text2)">S/N: ${a.serial||'—'}</span>
          <span style="font-size:11px;color:var(--text2)">${[a.mfr,a.model].filter(Boolean).join(' ')}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
          <span style="font-size:11px;color:var(--text3)">📍 ${a.dept}</span>
          <span style="color:var(--border2)">·</span>
          <span style="font-size:11px;font-weight:600;color:${sc}">${a.status}</span>
          ${a.risk?`<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;background:${riskBg[a.risk]||'var(--surface2)'};color:${riskFg[a.risk]||'var(--text3)'}">ความเสี่ยง${a.risk}</span>`:''}
          ${a.sny?`<span style="color:var(--border2)">·</span><span style="font-size:10px;color:var(--text3)">สนย. <span style="font-family:var(--m);color:var(--text2)">${a.sny}</span></span>`:''}
          <span style="color:var(--border2)">·</span>
          <span style="font-size:10px;color:var(--text3)">PM <span style="color:var(--text2)">${a.pm||'—'}</span></span>
          <span style="color:var(--border2)">·</span>
          <span style="font-size:10px;color:var(--text3)">Cal <span style="color:var(--text2)">${a.cal||'—'}</span></span>
        </div>
      </div>
      <button onclick="dctRemoveDevice('${id}')" title="นำออกจากสัญญา" style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--border);border-radius:6px;background:transparent;cursor:pointer;display:grid;place-items:center;color:var(--text3);transition:all .12s" onmouseover="this.style.background='var(--red-l)';this.style.borderColor='#fca5a5';this.style.color='var(--red)'" onmouseout="this.style.background='transparent';this.style.borderColor='var(--border)';this.style.color='var(--text3)'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
  }).join('');
}

function openContractDrawer(id = null) {
  document.getElementById('dct-id').value = id || '';
  // Populate vendor dropdown
  const vendorSel = document.getElementById('dct-vendor');
  if (vendorSel) {
    vendorSel.innerHTML = DB.settings.vendor.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
  }
  // Init smart-search device picker
  dctSelectedDeviceIds = id ? (DB.serviceContracts.find(x => x.id === id)?.coveredDevices || []) : [];
  dctRenderSelectedChips();
  const srchEl = document.getElementById('dct-device-search');
  if (srchEl) srchEl.value = '';
  const dd = document.getElementById('dct-device-dropdown');
  if (dd) dd.style.display = 'none';
  if (id) {
    const c = DB.serviceContracts.find(x => x.id === id);
    if (!c) return;
    document.getElementById('dct-title-field').value = c.title;
    document.getElementById('dct-vendor').value = c.vendor;
    document.getElementById('dct-type').value = c.type;
    document.getElementById('dct-contact').value = c.contactPerson || '';
    document.getElementById('dct-tel').value = c.contactTel || '';
    document.getElementById('dct-start').value = c.endDateIso ? c.endDateIso.substring(0,7)+'-01' : '';
    document.getElementById('dct-end').value = c.endDateIso || '';
    document.getElementById('dct-value').value = c.value || '';
    document.getElementById('dct-docref').value = c.docRef || '';
    document.getElementById('dct-sla-resp').value = c.slaResponseHr || '';
    document.getElementById('dct-sla-up').value = c.slaUptimePct || '';
    document.getElementById('dct-note').value = c.note || '';
    document.getElementById('dct-title').textContent = 'แก้ไขสัญญา ' + id;
  } else {
    ['dct-title-field','dct-contact','dct-tel','dct-start','dct-end','dct-value','dct-docref','dct-sla-resp','dct-sla-up','dct-note'].forEach(i => {
      const e = document.getElementById(i); if (e) e.value = '';
    });
    document.getElementById('dct-title').textContent = 'เพิ่มสัญญาบริการ';
  }
  previewContractExpiry();
  openDrawer('drawer-contract-edit');
}

function previewContractExpiry() {
  const endVal = document.getElementById('dct-end')?.value;
  const el = document.getElementById('dct-expiry-preview');
  if (!el || !endVal) { if(el) el.textContent=''; return; }
  const days = Math.ceil((new Date(endVal) - new Date()) / 86400000);
  let msg = '', color = 'var(--teal)';
  if (days < 0) { msg = `หมดอายุแล้ว ${Math.abs(days)} วัน`; color = 'var(--red)'; }
  else if (days <= 60) { msg = `⚠️ เหลืออีก ${days} วัน (ใกล้หมด)`; color = 'var(--amber)'; }
  else { msg = `เหลืออีก ${days} วัน`; }
  el.innerHTML = `<span style="color:${color}">${msg}</span>`;
}

function saveContract() {
  const title = document.getElementById('dct-title-field')?.value.trim();
  const vendor = document.getElementById('dct-vendor')?.value;
  const endIso = document.getElementById('dct-end')?.value;
  if (!title || !vendor || !endIso) { toast('กรุณากรอกชื่อสัญญา บริษัท และวันสิ้นสุด', 'amber'); return; }
  const editId = document.getElementById('dct-id').value;
  const checkedDevices = [...dctSelectedDeviceIds];
  const endDate = new Date(endIso);
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const endDateTh = `${endDate.getDate()} ${thMonths[endDate.getMonth()]} ${endDate.getFullYear()+543}`;
  const startIso = document.getElementById('dct-start')?.value;
  const startDate = startIso ? new Date(startIso) : new Date();
  const startDateTh = `${startDate.getDate()} ${thMonths[startDate.getMonth()]} ${startDate.getFullYear()+543}`;
  const rec = {
    id: editId || nextDocId('contract'),
    title,
    vendor,
    contactPerson: document.getElementById('dct-contact').value,
    contactTel: document.getElementById('dct-tel').value,
    type: document.getElementById('dct-type').value,
    coveredDevices: checkedDevices,
    startDate: startDateTh,
    endDate: endDateTh,
    endDateIso: endIso,
    value: parseFloat(document.getElementById('dct-value').value) || 0,
    slaResponseHr: parseFloat(document.getElementById('dct-sla-resp').value) || 24,
    slaUptimePct: parseFloat(document.getElementById('dct-sla-up').value) || 80,
    docRef: document.getElementById('dct-docref').value,
    note: document.getElementById('dct-note').value,
  };
  if (editId) {
    const idx = DB.serviceContracts.findIndex(x => x.id === editId);
    if (idx >= 0) DB.serviceContracts[idx] = rec;
    toast('อัปเดตสัญญา ' + rec.id + ' สำเร็จ', 'teal');
  } else {
    DB.serviceContracts.push(rec);
    toast('เพิ่มสัญญา ' + rec.id + ' สำเร็จ', 'teal');
  }
  addAuditLog('CONTRACT', currentUserName(), (editId?'แก้ไข':'เพิ่ม')+'สัญญาบริการ', rec.id+' '+title+' ('+vendor+')');
  closeDrawer();
  renderContractsTable();
  renderContractsKPI();
  updateContractNavBadge();
}

async function renewContract(contractId) {
  const c = DB.serviceContracts.find(x => x.id === contractId);
  if (!c) return;
  const ok = await popConfirm(`ต่ออายุสัญญา "${c.title}" อีก 1 ปี?`, 'ต่ออายุสัญญา');
  if (!ok) return;
  const currentEnd = new Date(c.endDateIso);
  const newEnd = new Date(currentEnd);
  newEnd.setFullYear(newEnd.getFullYear() + 1);
  const newEndIso = newEnd.toISOString().split('T')[0];
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  c.endDateIso = newEndIso;
  c.endDate = `${newEnd.getDate()} ${thMonths[newEnd.getMonth()]} ${newEnd.getFullYear()+543}`;
  addAuditLog('CONTRACT', currentUserName(), 'ต่ออายุสัญญา', c.id+' '+c.title+' → หมด '+c.endDate);
  renderContractsTable();
  renderContractsKPI();
  updateContractNavBadge();
  toast('ต่ออายุสัญญา ' + c.id + ' ถึง ' + c.endDate + ' สำเร็จ', 'teal');
}

/* ════════════════════════════════
   PART 3 — ELECTRICAL SAFETY TEST (IEC 62353)
════════════════════════════════ */
function renderSafetyTable() {
  const tb = document.getElementById('safety-tbody');
  if (!tb) return;
  const flt = document.getElementById('safety-filter')?.value || '';
  const rows = DB.safetyTests.filter(t => !flt || t.result === flt);
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">ไม่มีรายการ</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(t => {
    const pass = t.result === 'ผ่าน (Pass)';
    return `<tr onclick="openSafetyDrawer('${t.id}')" style="cursor:pointer">
      <td class="mid">${t.id}</td>
      <td class="fw">${t.device} <span class="mid">${t.devId}</span></td>
      <td>${t.testDate}</td>
      <td><span class="badge gray">Class ${t.devClass}</span> <span class="badge blue">Type ${t.appType}</span></td>
      <td class="${t.earthPass?'':'fw'}" style="color:${t.earthPass?'inherit':'var(--red)'}">${t.earthRes ?? '—'} Ω</td>
      <td style="color:${t.eqLeakPass?'inherit':'var(--red)'}">${t.eqLeak ?? '—'} μA</td>
      <td style="color:${t.patLeakPass?'inherit':'var(--red)'}">${t.patLeak != null ? t.patLeak+' μA' : '—'}</td>
      <td><span class="badge ${pass?'green':'red'}">${t.result}</span></td>
      <td>${t.tech}</td>
    </tr>`;
  }).join('');
  updateSafetyNavBadge();
}

function renderSafetyKPI() {
  const container = document.getElementById('safety-kpi-row');
  if (!container) return;
  const total = DB.safetyTests.length;
  const pass = DB.safetyTests.filter(t => t.result === 'ผ่าน (Pass)').length;
  const fail = total - pass;
  const pct = total ? Math.round(pass/total*100) : 0;
  container.innerHTML = `
    <div class="kpi teal"><div class="kpi-label">ทดสอบทั้งหมด</div><div class="kpi-value teal">${total}</div><div class="kpi-meta">รายการ (IEC 62353)</div></div>
    <div class="kpi teal"><div class="kpi-label">ผ่านทดสอบ</div><div class="kpi-value teal">${pass}</div><div class="kpi-meta">Pass Rate ${pct}%</div><div class="kpi-bar"><div class="kpi-fill" style="width:${pct}%;background:var(--teal)"></div></div></div>
    <div class="kpi ${fail?'red':'teal'}"><div class="kpi-label">ไม่ผ่านทดสอบ</div><div class="kpi-value ${fail?'red':'teal'}">${fail}</div><div class="kpi-meta">Fail — ต้องดำเนินการแก้ไข</div></div>
    <div class="kpi blue"><div class="kpi-label">อุปกรณ์ที่ทดสอบแล้ว</div><div class="kpi-value blue">${new Set(DB.safetyTests.map(t=>t.devId)).size}</div><div class="kpi-meta">จากทั้งหมด ${DB.assets.filter(a=>a.status!=='จำหน่าย/แทงจำหน่าย').length} เครื่อง</div></div>`;
}

function updateSafetyNavBadge() {
  const fail = DB.safetyTests.filter(t => t.result !== 'ผ่าน (Pass)').length;
  const el = document.getElementById('nb-safety');
  if (el) { el.textContent = fail; el.style.display = fail ? '' : 'none'; }
}

function openSafetyDrawer(id = null) {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dst-id').value = id || '';
  if (id) {
    const t = DB.safetyTests.find(x => x.id === id);
    if (!t) return;
    document.getElementById('dst-device').value = t.devId;
    document.getElementById('dst-date').value = today;
    document.getElementById('dst-class').value = t.devClass || 'I';
    document.getElementById('dst-apptype').value = t.appType || 'BF';
    document.getElementById('dst-tester').value = t.tester || '';
    document.getElementById('dst-testerserial').value = t.testerSerial || '';
    document.getElementById('dst-testercal').value = t.testerCal || '';
    document.getElementById('dst-earth').value = t.earthRes ?? '';
    document.getElementById('dst-insres').value = t.insRes ?? '';
    document.getElementById('dst-eqleak').value = t.eqLeak ?? '';
    document.getElementById('dst-patleak').value = t.patLeak ?? '';
    document.getElementById('dst-appleak').value = t.appLeak ?? '';
    document.getElementById('dst-tech').value = t.tech || '';
    document.getElementById('dst-note').value = t.note || '';
    document.getElementById('dst-title').textContent = 'แก้ไขผลทดสอบ ' + id;
  } else {
    ['dst-earth','dst-insres','dst-eqleak','dst-patleak','dst-appleak','dst-tech','dst-note','dst-pin'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    document.getElementById('dst-date').value = today;
    document.getElementById('dst-class').value = 'I';
    document.getElementById('dst-apptype').value = 'BF';
    document.getElementById('dst-title').textContent = 'บันทึกผลทดสอบใหม่';
    // Pre-fill tech name
    const techEl = document.getElementById('dst-tech');
    if (techEl && currentUser) techEl.value = currentUser.name;
  }
  // Populate device dropdown
  const sel = document.getElementById('dst-device');
  if (sel) {
    sel.innerHTML = '<option value="">-- เลือกอุปกรณ์ --</option>' +
      DB.assets.filter(a => a.status !== 'จำหน่าย/แทงจำหน่าย').map(a =>
        `<option value="${a.id}" ${id && DB.safetyTests.find(x=>x.id===id)?.devId===a.id?'selected':''}>${a.id} — ${a.name} (${a.dept})</option>`
      ).join('');
  }
  updateSafetyLimits();
  openDrawer('drawer-safety-form');
}

function updateSafetyLimits() {
  const cls = document.getElementById('dst-class')?.value || 'I';
  const atype = document.getElementById('dst-apptype')?.value || 'BF';
  const eqLimit = IEC62353_LIMITS.eqLeak[cls] || 500;
  const patLimit = IEC62353_LIMITS.patLeak[atype] || 100;
  const appLimit = IEC62353_LIMITS.appLeak[atype] || 100;
  const eqEl = document.getElementById('dst-eqleak-spec');
  const patEl = document.getElementById('dst-patleak-spec');
  const appEl = document.getElementById('dst-appleak-spec');
  if (eqEl) eqEl.textContent = `spec: ≤${eqLimit} μA`;
  if (patEl) patEl.textContent = atype === '-' ? '(ไม่มี Applied Part)' : `spec: ≤${patLimit} μA`;
  if (appEl) appEl.textContent = atype === '-' ? '(ไม่มี Applied Part)' : `spec: ≤${appLimit} μA`;
  const info = document.getElementById('safety-limits-info');
  if (info) {
    info.innerHTML = `<strong>IEC 62353 Limits — Class ${cls}, Type ${atype}:</strong>&nbsp;&nbsp;
      Earth Res ≤0.2 Ω &nbsp;·&nbsp; Insulation ≥2 MΩ &nbsp;·&nbsp;
      Equip Leak ≤${eqLimit} μA &nbsp;·&nbsp;
      ${atype!=='-'?`Patient Leak ≤${patLimit} μA &nbsp;·&nbsp; Applied Part Leak ≤${appLimit} μA`:'ไม่มี Applied Part'}`;
  }
  evalSafetyLeakField();
}

function evalSafetyField(inputId, resultId, limit, mode) {
  const val = parseFloat(document.getElementById(inputId)?.value);
  const el = document.getElementById(resultId);
  if (!el) return;
  if (isNaN(val)) { el.textContent = ''; return; }
  const pass = mode === 'lte' ? val <= limit : val >= limit;
  el.innerHTML = pass
    ? `<span style="color:var(--teal)">✓ Pass (${val} ${mode==='lte'?'≤':'≥'} ${limit})</span>`
    : `<span style="color:var(--red)">✗ Fail (${val} ${mode==='lte'?'>':'<'} ${limit})</span>`;
  evalSafetyOverall();
}

function evalSafetyLeakField() {
  const cls = document.getElementById('dst-class')?.value || 'I';
  const atype = document.getElementById('dst-apptype')?.value || 'BF';
  const eqLimit = IEC62353_LIMITS.eqLeak[cls] || 500;
  const patLimit = IEC62353_LIMITS.patLeak[atype] || 100;
  const appLimit = IEC62353_LIMITS.appLeak[atype] || 100;
  const eqVal = parseFloat(document.getElementById('dst-eqleak')?.value);
  const patVal = parseFloat(document.getElementById('dst-patleak')?.value);
  const appVal = parseFloat(document.getElementById('dst-appleak')?.value);
  const eqEl = document.getElementById('dst-eqleak-pass');
  const patEl = document.getElementById('dst-patleak-pass');
  const appEl = document.getElementById('dst-appleak-pass');
  const fmtResult = (val, limit, el) => {
    if (!el) return;
    if (isNaN(val)) { el.textContent=''; return; }
    const p = val <= limit;
    el.innerHTML = p ? `<span style="color:var(--teal)">✓ Pass (${val} ≤ ${limit} μA)</span>`
                     : `<span style="color:var(--red)">✗ Fail (${val} > ${limit} μA)</span>`;
  };
  fmtResult(eqVal, eqLimit, eqEl);
  if (atype !== '-') { fmtResult(patVal, patLimit, patEl); fmtResult(appVal, appLimit, appEl); }
  else { if(patEl) patEl.textContent=''; if(appEl) appEl.textContent=''; }
  evalSafetyField('dst-earth','dst-earth-pass',0.2,'lte');
  evalSafetyField('dst-insres','dst-insres-pass',2,'gte');
}

function evalSafetyOverall() {
  const cls = document.getElementById('dst-class')?.value || 'I';
  const atype = document.getElementById('dst-apptype')?.value || 'BF';
  const earthVal = parseFloat(document.getElementById('dst-earth')?.value);
  const insVal = parseFloat(document.getElementById('dst-insres')?.value);
  const eqVal = parseFloat(document.getElementById('dst-eqleak')?.value);
  const patVal = parseFloat(document.getElementById('dst-patleak')?.value);
  const appVal = parseFloat(document.getElementById('dst-appleak')?.value);
  const eqLimit = IEC62353_LIMITS.eqLeak[cls]||500;
  const patLimit = IEC62353_LIMITS.patLeak[atype]||100;
  const appLimit = IEC62353_LIMITS.appLeak[atype]||100;
  const checks = [
    !isNaN(earthVal) && earthVal <= 0.2,
    !isNaN(insVal)   && insVal   >= 2,
    !isNaN(eqVal)    && eqVal    <= eqLimit,
  ];
  if (atype !== '-') {
    checks.push(!isNaN(patVal) && patVal <= patLimit);
    checks.push(!isNaN(appVal) && appVal <= appLimit);
  }
  const allFilled = checks.length >= 3 && !isNaN(earthVal) && !isNaN(eqVal);
  if (!allFilled) return;
  const allPass = checks.every(Boolean);
  const el = document.getElementById('dst-overall');
  if (el) {
    el.textContent = allPass ? '✓ ผลรวม: ผ่านทดสอบ (Pass)' : '✗ ผลรวม: ไม่ผ่านทดสอบ (Fail)';
    el.style.background = allPass ? 'rgba(20,184,166,.12)' : 'var(--red-l)';
    el.style.color = allPass ? 'var(--teal)' : 'var(--red)';
  }
}

function saveSafetyTest() {
  const pin = document.getElementById('dst-pin')?.value;
  if (!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature ด้วย PIN 4 หลัก', 'amber'); return; }
  const devId  = document.getElementById('dst-device').value;
  const device = DB.assets.find(a => a.id === devId)?.name || devId;
  if (!devId) { toast('กรุณาเลือกอุปกรณ์', 'amber'); return; }
  const cls    = document.getElementById('dst-class').value;
  const atype  = document.getElementById('dst-apptype').value;
  const eqLimit = IEC62353_LIMITS.eqLeak[cls]||500;
  const patLimit = IEC62353_LIMITS.patLeak[atype]||100;
  const appLimit = IEC62353_LIMITS.appLeak[atype]||100;
  const earthRes = parseFloat(document.getElementById('dst-earth').value) || 0;
  const insRes   = parseFloat(document.getElementById('dst-insres').value) || 999;
  const eqLeak   = parseFloat(document.getElementById('dst-eqleak').value) || 0;
  const patLeak  = atype !== '-' ? parseFloat(document.getElementById('dst-patleak').value) : null;
  const appLeak  = atype !== '-' ? parseFloat(document.getElementById('dst-appleak').value) : null;
  const earthPass  = earthRes <= 0.2;
  const insResPass = insRes >= 2;
  const eqLeakPass = eqLeak <= eqLimit;
  const patLeakPass = patLeak == null || patLeak <= patLimit;
  const appLeakPass = appLeak == null || appLeak <= appLimit;
  const allPass = earthPass && insResPass && eqLeakPass && patLeakPass && appLeakPass;
  const result = allPass ? 'ผ่าน (Pass)' : 'ไม่ผ่าน (Fail)';
  const editId = document.getElementById('dst-id').value;
  const rec = {
    id: editId || nextDocId('safety'),
    devId, device, testDate: new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}),
    tester: document.getElementById('dst-tester').value,
    testerSerial: document.getElementById('dst-testerserial').value,
    testerCal: document.getElementById('dst-testercal').value,
    devClass: cls, appType: atype,
    earthRes, insRes, eqLeak, patLeak, appLeak,
    earthPass, insResPass, eqLeakPass, patLeakPass, appLeakPass,
    result, tech: document.getElementById('dst-tech').value || currentUserName(),
    note: document.getElementById('dst-note').value,
  };
  if (editId) {
    const idx = DB.safetyTests.findIndex(x => x.id === editId);
    if (idx >= 0) DB.safetyTests[idx] = rec;
  } else {
    DB.safetyTests.unshift(rec);
  }
  addAuditLog('SAFETY', currentUserName(), `บันทึก Safety Test ${rec.id} (e-Signed)`,
    `${device} · ${result} · Earth:${earthRes}Ω · EqLeak:${eqLeak}μA`);
  closeDrawer();
  renderSafetyTable();
  renderSafetyKPI();
  updateSafetyNavBadge();
  refreshDashboard();
  toast(`บันทึกผลทดสอบ ${rec.id} — ${result}`, allPass ? 'teal' : 'amber');
}

/* ════════════════════════════════
   PART 4 — ANNUAL PM PLAN (AUTO-GENERATE WO)
════════════════════════════════ */
function openAnnualPMModal() {
  document.getElementById('apm-year').value = '2568';
  document.getElementById('apm-kind').value = 'both';
  previewAnnualPM();
  document.getElementById('modal-annual-pm').classList.add('open');
}

function closeAnnualPMModal() {
  document.getElementById('modal-annual-pm').classList.remove('open');
}

function _thMonths() {
  return ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
}

function _generateWOsForYear(year, kind) {
  const activeAssets = DB.assets.filter(a => a.status !== 'จำหน่าย/แทงจำหน่าย');
  const months = _thMonths();
  const wos = [];
  activeAssets.forEach(asset => {
    const freq = PM_FREQ_MAP[asset.category] || PM_FREQ_MAP['_default'];
    const startMonth = 0; // ม.ค. of fiscal year
    if (kind !== 'cal') {
      for (let m = startMonth; m < 12; m += freq.pmMonths) {
        wos.push({
          id: nextDocId('pm'),
          kind: 'pm', devId: asset.id, device: asset.name,
          type: `PM ${freq.pmMonths === 3 ? '3 เดือน' : freq.pmMonths === 6 ? '6 เดือน' : '1 ปี'}`,
          due: `${1+Math.floor(m/12*28)} ${months[m%12]} ${year}`,
          resp: currentUserName(), status: 'รอดำเนินการ', result: '', cost: 0,
        });
      }
    }
    if (kind !== 'pm' && freq.calMonths <= 12) {
      const calMonth = Math.min(5, 11);
      wos.push({
        id: nextDocId('cal'),
        kind: 'cal', devId: asset.id, device: asset.name,
        type: 'สอบเทียบมาตรฐานประจำปี',
        due: `30 ${months[calMonth]} ${year}`,
        resp: 'NIMT', status: 'รอดำเนินการ', result: '', cost: 0,
      });
    }
  });
  return wos;
}

function previewAnnualPM() {
  const year = document.getElementById('apm-year')?.value || '2568';
  const kind = document.getElementById('apm-kind')?.value || 'both';
  const wos = _generateWOsForYear(year, kind);
  const container = document.getElementById('apm-preview');
  if (!container) return;
  const byAsset = {};
  wos.forEach(w => { (byAsset[w.devId] = byAsset[w.devId]||[]).push(w); });
  const months = _thMonths();
  let html = `<div style="font-size:12px;color:var(--text2);margin-bottom:12px">จะสร้าง <strong style="color:var(--teal)">${wos.length} รายการ</strong> สำหรับ <strong>${Object.keys(byAsset).length} เครื่อง</strong> ในปี ${year}</div>`;
  html += `<table class="tbl"><thead><tr><th>รหัสเครื่อง</th><th>ชื่ออุปกรณ์</th><th>ประเภท</th><th>กำหนดการ</th><th>ความถี่</th></tr></thead><tbody>`;
  wos.slice(0, 50).forEach(w => {
    html += `<tr><td class="mid">${w.devId}</td><td class="fw">${w.device}</td><td><span class="badge ${w.kind==='pm'?'teal':'blue'}">${w.type}</span></td><td>${w.due}</td><td>${PM_FREQ_MAP[DB.assets.find(a=>a.id===w.devId)?.category||'']?.label||'—'}</td></tr>`;
  });
  if (wos.length > 50) html += `<tr><td colspan="5" style="text-align:center;color:var(--text3);font-size:12px">... และอีก ${wos.length-50} รายการ</td></tr>`;
  html += '</tbody></table>';
  container.innerHTML = html;
}

function generateAnnualPMPlan() {
  const year = document.getElementById('apm-year')?.value || '2568';
  const kind = document.getElementById('apm-kind')?.value || 'both';
  const wos = _generateWOsForYear(year, kind);
  wos.forEach(w => DB.pmList.push(w));
  addAuditLog('PM', currentUserName(), `สร้างแผน PM ประจำปี ${year}`, `สร้าง ${wos.length} Work Orders อัตโนมัติ`);
  closeAnnualPMModal();
  renderPMTable();
  renderPMCalendar();
  toast(`สร้างแผน PM ปี ${year} สำเร็จ — ${wos.length} รายการ`, 'teal');
}

/* ════════════════════════════════
   PART 5 — SPARE PARTS INVENTORY (ISO 13485 §7.4)
════════════════════════════════ */
/* ─── Spare Parts Transaction Ledger ─────────────────── */
function addSpareTransaction(spId, type, qty, balBefore, balAfter, ref, note, by) {
  if(!DB.spareTransactions) DB.spareTransactions = [];
  DB.spareTransactions.push({
    spId, type, qty, balBefore, balAfter,
    ref:  ref  || '—',
    note: note || '',
    by:   by   || currentUserName(),
    at:   new Date().toLocaleString('th-TH')
  });
  saveDB();
}

let _activeSpareTxnId = null;
function openSpareTxnDrawer(spId) {
  const sp = DB.spareParts.find(x=>x.id===spId);
  if(!sp) return;
  _activeSpareTxnId = spId;
  document.getElementById('sptxn-title').textContent = sp.name;
  document.getElementById('sptxn-sub').textContent   = `${sp.id} · ${sp.partNo||'—'} | คงเหลือ: ${sp.qty} ${sp.unit}`;
  const flt = document.getElementById('sptxn-type-filter');
  if(flt) flt.value = '';
  renderSpareTxnTable();
  openDrawer('drawer-spare-txn');
}

function renderSpareTxnTable() {
  const spId  = _activeSpareTxnId;
  const flt   = document.getElementById('sptxn-type-filter')?.value || '';
  const tbody = document.getElementById('sptxn-tbody');
  const countEl = document.getElementById('sptxn-count');
  if(!tbody) return;

  let txns = (DB.spareTransactions||[]).filter(t=>t.spId===spId);
  if(flt) txns = txns.filter(t=>t.type===flt);
  txns = [...txns].reverse();

  if(countEl) countEl.textContent = `${txns.length} รายการ`;

  if(!txns.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">ไม่มีประวัติ Transaction</td></tr>';
    return;
  }
  tbody.innerHTML = txns.map(t => {
    const isIn  = t.type === 'รับเข้า';
    const isAdj = t.type === 'ปรับปรุง';
    const qtyFmt = (isIn ? '+' : isAdj ? (t.qty>=0?'+':'') : '-') + Math.abs(t.qty);
    const refLink = t.ref && t.ref.startsWith('CM-')
      ? `<a href="#" onclick="event.preventDefault();closeDrawer();setTimeout(()=>openRepairManageDrawer('${t.ref}'),200)" style="color:var(--blue)">${t.ref}</a>`
      : `<span style="color:var(--text2)">${t.ref}</span>`;
    return `<tr>
      <td style="font-size:11px;color:var(--text3);white-space:nowrap">${t.at}</td>
      <td><span class="badge ${isIn?'green':isAdj?'blue':'red'}" style="font-size:10px">${t.type}</span></td>
      <td style="font-weight:700;color:${isIn?'var(--teal)':'var(--red)'};text-align:right">${qtyFmt}</td>
      <td style="text-align:right;color:var(--text3)">${t.balBefore}</td>
      <td style="text-align:right;font-weight:700">${t.balAfter}</td>
      <td>${refLink}</td>
      <td style="color:var(--text2);max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${t.note}">${t.note||'—'}</td>
      <td style="font-size:11px;color:var(--text3)">${t.by}</td>
    </tr>`;
  }).join('');
}

function renderSpareTable() {
  const tb = document.getElementById('spare-tbody');
  if (!tb) return;
  const catFlt = document.getElementById('spare-cat-filter')?.value || '';
  const showLow = document.getElementById('spare-low-btn')?.dataset.active === '1';
  let rows = DB.spareParts;
  if (catFlt) rows = rows.filter(p => p.category === catFlt);
  if (showLow) rows = rows.filter(p => p.qty <= p.minQty);
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">ไม่มีรายการ</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(p => {
    const low = p.qty <= p.minQty;
    const out = p.qty === 0;
    return `<tr>
      <td class="mid">${p.id}</td>
      <td class="fw">${p.name}<div style="font-size:11px;color:var(--text3)">${p.partNo}</div></td>
      <td><span class="badge gray">${p.category}</span></td>
      <td style="font-weight:700;color:${out?'var(--red)':low?'var(--amber)':'var(--text)'}">${p.qty} ${p.unit}
        ${out?'<span class="badge red" style="margin-left:4px">หมด</span>':low?'<span class="badge amber" style="margin-left:4px">ใกล้หมด</span>':''}
      </td>
      <td style="color:var(--text3)">${p.minQty} ${p.unit}</td>
      <td>${p.unitCost.toLocaleString()} ฿</td>
      <td style="font-size:12px">${p.location}</td>
      <td style="font-size:11px;color:var(--text2)">${p.compatible}</td>
      <td>
        <button class="btn btn-sm" onclick="openSpareDrawer('${p.id}')" style="font-size:11px;padding:3px 8px">แก้ไข</button>
        <button class="btn btn-sm" onclick="adjustSpareQty('${p.id}')" style="font-size:11px;padding:3px 8px;margin-left:4px">รับ/จ่าย</button>
        <button class="btn btn-sm" onclick="openSpareTxnDrawer('${p.id}')" style="font-size:11px;padding:3px 8px;margin-left:4px;border-color:var(--blue);color:var(--blue)">ประวัติ</button>
      </td>
    </tr>`;
  }).join('');
  updateSpareNavBadge();
}

function renderSpareKPI() {
  const container = document.getElementById('spare-kpi-row');
  if (!container) return;
  const total = DB.spareParts.length;
  const lowStock = DB.spareParts.filter(p => p.qty < p.minQty).length;
  const outStock = DB.spareParts.filter(p => p.qty === 0).length;
  const totalValue = DB.spareParts.reduce((s,p) => s + (p.qty * p.unitCost), 0);
  container.innerHTML = `
    <div class="kpi teal"><div class="kpi-label">รายการทั้งหมด</div><div class="kpi-value teal">${total}</div><div class="kpi-meta">รายการในคลัง</div></div>
    <div class="kpi ${lowStock?'amber':'teal'}"><div class="kpi-label">ใกล้หมด / Min Stock</div><div class="kpi-value ${lowStock?'amber':'teal'}">${lowStock}</div><div class="kpi-meta">รายการที่ต้องสั่งซื้อ</div></div>
    <div class="kpi ${outStock?'red':'teal'}"><div class="kpi-label">หมดสต๊อก</div><div class="kpi-value ${outStock?'red':'teal'}">${outStock}</div><div class="kpi-meta">ต้องจัดซื้อด่วน</div></div>
    <div class="kpi blue"><div class="kpi-label">มูลค่าคลังรวม</div><div class="kpi-value blue">${(totalValue/1000).toFixed(1)}K</div><div class="kpi-meta">บาท (ราคาทุน)</div></div>`;
}

function updateSpareNavBadge() {
  const low = DB.spareParts.filter(p => p.qty <= p.minQty).length;
  const el = document.getElementById('nb-spare');
  if (el) { el.textContent = low; el.style.display = low ? '' : 'none'; }
  const lowBtn = document.getElementById('spare-low-btn');
  const lowBadge = document.getElementById('nb-spare-low');
  if (lowBtn) lowBtn.style.display = low ? '' : 'none';
  if (lowBadge) lowBadge.textContent = low;
}

function filterLowStock() {
  const btn = document.getElementById('spare-low-btn');
  if (!btn) return;
  btn.dataset.active = btn.dataset.active === '1' ? '0' : '1';
  btn.style.fontWeight = btn.dataset.active === '1' ? '700' : '';
  renderSpareTable();
}

function openSpareDrawer(id = null) {
  document.getElementById('dsp-id').value = id || '';
  if (id) {
    const p = DB.spareParts.find(x => x.id === id);
    if (!p) return;
    document.getElementById('dsp-name').value = p.name;
    document.getElementById('dsp-partno').value = p.partNo || '';
    document.getElementById('dsp-cat').value = p.category;
    document.getElementById('dsp-unit').value = p.unit;
    document.getElementById('dsp-qty').value = p.qty;
    document.getElementById('dsp-minqty').value = p.minQty;
    document.getElementById('dsp-cost').value = p.unitCost;
    document.getElementById('dsp-loc').value = p.location;
    document.getElementById('dsp-vendor').value = p.vendor || '';
    document.getElementById('dsp-compat').value = p.compatible || '';
    document.getElementById('dsp-title').textContent = 'แก้ไขอะไหล่: ' + p.name;
  } else {
    ['dsp-name','dsp-partno','dsp-unit','dsp-loc','dsp-vendor','dsp-compat'].forEach(i => { const e=document.getElementById(i); if(e) e.value=''; });
    document.getElementById('dsp-qty').value = 0;
    document.getElementById('dsp-minqty').value = 0;
    document.getElementById('dsp-cost').value = 0;
    document.getElementById('dsp-title').textContent = 'เพิ่มรายการอะไหล่ใหม่';
  }
  openDrawer('drawer-spare-edit');
}

function saveSparePart() {
  const name = document.getElementById('dsp-name')?.value.trim();
  if (!name) { toast('กรุณาระบุชื่ออะไหล่', 'amber'); return; }
  const editId = document.getElementById('dsp-id').value;
  const rec = {
    id: editId || nextDocId('spare'),
    name,
    partNo: document.getElementById('dsp-partno').value.trim(),
    category: document.getElementById('dsp-cat').value,
    unit: document.getElementById('dsp-unit').value || 'ชิ้น',
    qty: parseInt(document.getElementById('dsp-qty').value) || 0,
    minQty: parseInt(document.getElementById('dsp-minqty').value) || 0,
    unitCost: parseFloat(document.getElementById('dsp-cost').value) || 0,
    location: document.getElementById('dsp-loc').value,
    vendor: document.getElementById('dsp-vendor').value,
    compatible: document.getElementById('dsp-compat').value,
    lastUpdated: new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}),
  };
  if (editId) {
    const old = DB.spareParts.find(x=>x.id===editId);
    const oldQty = old ? old.qty : 0;
    const idx = DB.spareParts.findIndex(x => x.id === editId);
    if (idx >= 0) DB.spareParts[idx] = rec;
    if (old && rec.qty !== oldQty) {
      const delta = rec.qty - oldQty;
      addSpareTransaction(rec.id, delta>=0?'รับเข้า':'จ่ายออก', delta, oldQty, rec.qty, 'ปรับปรุงข้อมูล', 'แก้ไขผ่านหน้าข้อมูล', currentUserName());
    }
    toast('อัปเดตอะไหล่ ' + name + ' สำเร็จ', 'teal');
  } else {
    DB.spareParts.push(rec);
    if (rec.qty > 0) {
      addSpareTransaction(rec.id, 'รับเข้า', rec.qty, 0, rec.qty, 'เปิดรายการใหม่', 'ขึ้นทะเบียนอะไหล่', currentUserName());
    }
    toast('เพิ่มอะไหล่ ' + name + ' สำเร็จ', 'teal');
  }
  addAuditLog('SPARE', currentUserName(), (editId?'แก้ไข':'เพิ่ม')+'อะไหล่', rec.id+' '+name);
  closeDrawer();
  renderSpareTable();
  renderSpareKPI();
  updateSpareNavBadge();
}

async function adjustSpareQty(partId) {
  const p = DB.spareParts.find(x => x.id === partId);
  if (!p) return;
  const input = await popPrompt(`รับเข้า (+) หรือจ่ายออก (-) จำนวน\n"${p.name}" (คงเหลือ: ${p.qty} ${p.unit})`, '0', 'ปรับ Stock');
  if (input === null || input === false) return;
  const delta = parseInt(input);
  if (isNaN(delta) || delta === 0) { toast('กรุณาระบุจำนวนที่ถูกต้อง', 'amber'); return; }
  const note = await popPrompt('เหตุผล / อ้างอิงเอกสาร (เว้นว่างได้)', '', delta > 0 ? 'บันทึกการรับเข้า' : 'บันทึกการจ่ายออก');
  if (note === null) return;
  const balBefore = p.qty;
  const newQty    = Math.max(0, p.qty + delta);
  p.qty = newQty;
  p.lastUpdated = new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
  const type = delta > 0 ? 'รับเข้า' : 'จ่ายออก';
  addSpareTransaction(p.id, type, delta, balBefore, newQty, note||'ปรับปรุงStock', note||'', currentUserName());
  addAuditLog('SPARE', currentUserName(), `${type}อะไหล่ ${p.id}`, `${p.name}: ${delta>0?'+':''}${delta} → คงเหลือ ${newQty} ${p.unit}${note?' ('+note+')':''}`);
  renderSpareTable();
  renderSpareKPI();
  updateSpareNavBadge();
  toast(`${p.name}: ${type} ${Math.abs(delta)} ${p.unit} (คงเหลือ ${newQty})`, newQty<=p.minQty?'amber':'teal');
}

function renderIncidentTable() {
  const sf = document.getElementById('inc-status-filter')?.value||'';
  let data = DB.incidents;
  if(sf) data = data.filter(i=>i.status===sf);
  
  const tb = document.getElementById('incident-tbody');
  if(!tb) return;
  tb.innerHTML = data.map(i => `
    <tr onclick="openIncidentDrawer('${i.id}')">
      <td><div class="fw">${i.id}</div><div style="font-size:11px;color:var(--text3);margin-top:2px">${i.date}</div></td>
      <td><div class="fw">${i.device}</div><div style="font-family:var(--m);font-size:10px;color:var(--text3);margin-top:2px">${i.devId}</div></td>
      <td style="font-size:12px">${i.event}</td>
      <td>${i.severity.includes('High')?'<span class="badge red">'+i.severity+'</span>':i.severity.includes('Medium')?'<span class="badge amber">'+i.severity+'</span>':'<span class="badge teal">'+i.severity+'</span>'}</td>
      <td>${i.status.includes('ปิดแล้ว')?'<span class="badge green">Closed</span>':i.status.includes('สืบสวน')?'<span class="badge amber">Investigation</span>':'<span class="badge red">Pending</span>'}</td>
    </tr>`).join('');
}

let activeIncId = null;
function openIncidentDrawer(incId) {
  const inc = DB.incidents.find(x=>x.id===incId);
  if(!inc) return;
  activeIncId = incId;
  document.getElementById('dinc-sub').textContent = `${inc.id} · อุปกรณ์: ${inc.devId} (${inc.device})`;
  document.getElementById('dinc-severity').textContent = `ระดับความรุนแรง: ${inc.severity}`;
  document.getElementById('dinc-event').textContent = `เหตุการณ์: ${inc.event} (รายงานโดย ${inc.reporter} เมื่อ ${inc.date})`;
  
  ['rca','ca','pa'].forEach(k => document.getElementById('dinc-'+k).value = inc[k] || '');
  document.getElementById('dinc-status').value = inc.status;
  document.getElementById('dinc-pin').value = '';
  openDrawer('drawer-incident');
}

function submitCAPA() {
  const pin = document.getElementById('dinc-pin').value;
  if(!pin || pin.length < 4) { toast('กรุณาลงนาม e-Signature ด้วย PIN 4 หลัก', 'amber'); return; }
  const inc = DB.incidents.find(x=>x.id===activeIncId);
  ['rca','ca','pa'].forEach(k => inc[k] = document.getElementById('dinc-'+k).value);
  inc.status = document.getElementById('dinc-status').value;
  addAuditLog('INC', currentUserName(), 'อัปเดต CAPA '+inc.id+' (e-Signed)', `สถานะ: ${inc.status}`);
  closeDrawer(); renderIncidentTable(); refreshDashboard(); toast('บันทึกผลการสืบสวน (CAPA) สำเร็จ','teal');
}

/* ════════════════════════════════
   QMS & DOCUMENT CONTROL
════════════════════════════════ */
function renderQMS() {
  const dtb = document.getElementById('qms-docs-tbody');
  if(dtb) {
    dtb.innerHTML = DB.qmsDocs.map((d, i) => `<tr><td class="fw">${d.id} <span style="font-weight:normal;color:var(--text2)">${d.name}</span></td><td class="mid">${d.rev}</td><td>${d.date}</td><td><span class="badge ${d.status==='Active'?'green':'gray'}">${d.status}</span></td><td style="text-align:right"><button class="btn btn-red btn-sm" onclick="deleteQMSDoc(${i})">ลบ</button></td></tr>`).join('');
  }
  const ttb = document.getElementById('qms-training-tbody');
  if(ttb) {
    ttb.innerHTML = DB.trainingRecords.map((t, i) => `<tr><td class="fw">${t.user}</td><td>${t.course}</td><td>${t.date}</td><td><span class="badge ${t.result==='ผ่านเกณฑ์'?'teal':'red'}">${t.result}</span></td><td style="text-align:right"><button class="btn btn-red btn-sm" onclick="deleteTrainingRecord(${i})">ลบ</button></td></tr>`).join('');
  }
}

function openAddQMSDrawer() {
  document.getElementById('qms-id').value = '';
  document.getElementById('qms-name').value = '';
  document.getElementById('qms-rev').value = '01';
  document.getElementById('qms-date').value = new Date().toISOString().split('T')[0];
  openDrawer('drawer-qms-add');
}

function submitQMS() {
  const id = document.getElementById('qms-id').value.trim();
  const name = document.getElementById('qms-name').value.trim();
  const rev = document.getElementById('qms-rev').value.trim() || '01';
  const dateRaw = document.getElementById('qms-date').value;
  if(!id || !name || !dateRaw) { toast('กรุณากรอกข้อมูลรหัส ชื่อ และวันที่ให้ครบถ้วน','red'); return; }
  DB.qmsDocs.push({id, name, rev, date: formatDateThai(dateRaw), status: 'Active'});
  addAuditLog('QMS', currentUserName(), 'เพิ่มเอกสารควบคุม', id+' '+name);
  closeDrawer(); renderQMS(); toast('บันทึกเอกสาร SOP สำเร็จ', 'teal');
}

function openAddTrainingDrawer() {
  const sel = document.getElementById('trn-user');
  if(sel) sel.innerHTML = DB.settings.technician.map(t=>`<option>${t}</option>`).join('');
  document.getElementById('trn-course').value = '';
  document.getElementById('trn-date').value = new Date().toISOString().split('T')[0];
  openDrawer('drawer-training-add');
}

function submitTraining() {
  const user = document.getElementById('trn-user').value;
  const course = document.getElementById('trn-course').value.trim();
  const dateRaw = document.getElementById('trn-date').value;
  const res = document.getElementById('trn-result').value;
  if(!user || !course || !dateRaw) { toast('กรุณากรอกข้อมูลบุคลากร หลักสูตร และวันที่','red'); return; }
  DB.trainingRecords.push({user, course, date: formatDateThai(dateRaw), result: res});
  addAuditLog('QMS', currentUserName(), 'บันทึกประวัติการอบรม', `${user} · ${course}`);
  closeDrawer(); renderQMS(); toast('บันทึกประวัติการฝึกอบรมสำเร็จ', 'teal');
}

async function deleteQMSDoc(idx) {
  const ok = await popConfirm('ยืนยันการลบเอกสาร SOP นี้?', 'ลบเอกสาร', true);
  if(!ok) return;
  const doc = DB.qmsDocs[idx];
  DB.qmsDocs.splice(idx, 1);
  addAuditLog('QMS', currentUserName(), 'ลบเอกสารควบคุม', doc.id+' '+doc.name);
  renderQMS();
  toast('ลบเอกสารเรียบร้อย', 'teal');
}

async function deleteTrainingRecord(idx) {
  const ok = await popConfirm('ยืนยันการลบประวัติการอบรมนี้?', 'ลบประวัติการอบรม', true);
  if(!ok) return;
  const rec = DB.trainingRecords[idx];
  DB.trainingRecords.splice(idx, 1);
  addAuditLog('QMS', currentUserName(), 'ลบประวัติการอบรม', `${rec.user} · ${rec.course}`);
  renderQMS();
  toast('ลบประวัติการอบรมเรียบร้อย', 'teal');
}

/* ════════════════════════════════
   NEW LOAN WIZARD
════════════════════════════════ */
function resetNewLoanForm() {
  selectedDeviceId = null;
  ['f-borrower','f-dept','f-reason','f-duedate','f-note','f-hn','f-rights','f-dx'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('device-search').value = '';
  document.getElementById('device-grid').style.display = 'block';
  // Progressive Disclosure: collapse patient info by default
  const tog = document.getElementById('sec-toggle-patient');
  const body = document.getElementById('sec-body-patient');
  if(tog) tog.classList.remove('open');
  if(body) body.classList.add('collapsed');
  renderDeviceCards();
  updateLoanPreview();
  validateLoanForm();
  // Auto-focus device search (Anticipatory Design)
  setTimeout(()=>document.getElementById('device-search')?.focus(), 120);
}

function renderDeviceCards() {
  const cards = document.getElementById('device-cards');
  if(!cards) return;
  const avail = DB.assets.filter(a=>a.status==='พร้อมใช้');
  cards.innerHTML = avail.map(a=>`
    <div class="device-select-card ${selectedDeviceId===a.id?'selected':''}" onclick="selectDevice('${a.id}')">
      <div class="device-avatar"><svg viewBox="0 0 22 22" fill="none" stroke="var(--teal)" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="5" width="18" height="13" rx="3"/><path d="M7 10h8M7 14h5"/></svg></div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px;color:var(--text)">${a.name}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--m);margin-top:2px">${a.id} · ${a.dept}</div>
        <div style="display:flex;gap:5px;margin-top:4px">
          <span class="tag">Cal. ${a.cal}</span>
          <span class="tag">Risk: ${a.risk}</span>
        </div>
      </div>
      <div>${selectedDeviceId===a.id?'<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" fill="var(--teal)"/><path d="M5 9l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}</div>
    </div>`).join('');
}

function selectDevice(id) {
  selectedDeviceId = id;
  const a = DB.assets.find(x=>x.id===id);
  document.getElementById('device-search').value = a.name + ' (' + a.id + ')';
  hideDeviceResults();
  renderDeviceCards();
  
  let standardDays = 7;
  if (a && a.category && a.category.includes('Ventilator')) standardDays = 3;
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('f-duedate').min = today;
  const d = new Date(); d.setDate(d.getDate()+standardDays);
  if(!document.getElementById('f-duedate').value) document.getElementById('f-duedate').value = d.toISOString().split('T')[0];

  validateLoanForm();
  updateLoanPreview();
}

function searchDevice(q) {
  let results = DB.assets.filter(a=>a.status==='พร้อมใช้');
  if(q.trim()) {
    results = results.filter(a=>a.name.toLowerCase().includes(q.toLowerCase())||a.id.toLowerCase().includes(q.toLowerCase()));
  }
  results = results.slice(0, 8); // แสดงสูงสุด 8 รายการ
  const r = document.getElementById('device-results');
  if(!results.length) { r.innerHTML='<div style="padding:12px;color:var(--text3);font-size:13px">ไม่พบ หรืออุปกรณ์ถูกยืมออก/จองไปแล้ว</div>'; r.style.display='block'; return; }
  r.innerHTML = results.map(a=>`<div class="sr-item" onmousedown="event.preventDefault(); selectDevice('${a.id}')"><div class="sr-icon"><svg viewBox="0 0 16 16" fill="none" stroke="var(--teal)" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="2"/></svg></div><div><div style="font-size:13px;font-weight:600">${a.name}</div><div style="font-size:11px;color:var(--text3);font-family:var(--m)">${a.id} · ${a.dept}</div></div></div>`).join('');
  r.style.display = 'block';
}
function showDeviceResults(){ searchDevice(document.getElementById('device-search').value); }
function hideDeviceResults(){ document.getElementById('device-results').style.display='none'; }

function validateLoanForm() {
  const b = document.getElementById('btn-submit-loan');
  const ok = selectedDeviceId && document.getElementById('f-borrower').value.trim() && document.getElementById('f-dept').value && document.getElementById('f-reason').value && document.getElementById('f-duedate').value;
  if(b) b.disabled = !ok;
  updateLoanPreview();
}

/* ════════════════════════════════
   INLINE VALIDATION
════════════════════════════════ */
function validateLoanField(el, field) {
  const val = el.value.trim();
  let ok = false, msg = '';
  if(field==='borrower') {
    ok = val.length >= 2;
    msg = ok ? '✓ ชื่อผู้ยืมถูกต้อง' : 'กรุณาระบุชื่อ-นามสกุล';
  } else if(field==='dept') {
    ok = !!val;
    msg = ok ? '✓ เลือกแผนกแล้ว' : 'กรุณาเลือกแผนก';
  } else if(field==='due') {
    const d = new Date(val); const today = new Date(); today.setHours(0,0,0,0);
    ok = !!val && d >= today;
    msg = ok ? '✓ กำหนดวันคืน '+val : 'กรุณาเลือกวันในอนาคต';
  } else if(field==='reason') {
    ok = !!val;
    msg = ok ? '✓ ระบุวัตถุประสงค์แล้ว' : 'กรุณาเลือกวัตถุประสงค์';
  }
  const touched = !!el.value;
  el.classList.toggle('valid', ok);
  el.classList.toggle('has-error', !ok && touched);
  const fb = document.getElementById('fb-'+field);
  if(fb) { fb.className = 'field-fb '+(ok?'ok':touched?'err':''); fb.textContent = msg; }
  validateLoanForm();
}

/* ════════════════════════════════
   BORROWER AUTO-COMPLETE
════════════════════════════════ */
function autocompleteBorrower(q) {
  const r = document.getElementById('borrower-results');
  if(!r) return;
  if(!q.trim() || q.length < 2) { r.style.display='none'; return; }
  const seen = new Set();
  const matches = DB.loans
    .filter(l => l.borrower.toLowerCase().includes(q.toLowerCase()) && !seen.has(l.borrower) && seen.add(l.borrower))
    .map(l => ({name:l.borrower, dept:l.dept}))
    .slice(0,5);
  if(!matches.length) { r.style.display='none'; return; }
  r.innerHTML = matches.map(m=>`
    <div class="sr-item" onmousedown="event.preventDefault();selectBorrower('${m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${m.dept}')">
      <div><div style="font-size:13px;font-weight:600">${m.name}</div><div style="font-size:11px;color:var(--text3)">${m.dept}</div></div>
    </div>`).join('');
  r.style.display='block';
}

function selectBorrower(name, dept) {
  const bf = document.getElementById('f-borrower');
  const df = document.getElementById('f-dept');
  if(bf) bf.value = name;
  if(df && dept) df.value = dept;
  document.getElementById('borrower-results').style.display='none';
  if(bf) validateLoanField(bf,'borrower');
  if(df) validateLoanField(df,'dept');
}

/* ════════════════════════════════
   KEYBOARD SHORTCUT OVERLAY
════════════════════════════════ */
function toggleShortcutHelp() {
  document.getElementById('shortcut-overlay').classList.toggle('open');
}

function updateLoanPreview() {
  const preview = document.getElementById('loan-preview');
  if(!preview) return;
  const borrower = document.getElementById('f-borrower')?.value||'';
  const dept = document.getElementById('f-dept')?.value||'';
  const due = document.getElementById('f-duedate')?.value||'';
  const reason = document.getElementById('f-reason')?.value||'';
  
  if(!selectedDeviceId) { preview.innerHTML = '<div class="empty"><svg viewBox="0 0 40 40"><path d="M8 12h24M8 20h16M8 28h10"/><rect x="3" y="5" width="34" height="30" rx="4"/></svg><div class="empty-title">ยังไม่มีข้อมูล</div><div class="empty-sub">เริ่มกรอกฟอร์มด้านซ้าย</div></div>'; return; }
  
  const a = DB.assets.find(x=>x.id===selectedDeviceId);
  
  preview.innerHTML = `
    <div class="device-info-box" style="margin-bottom:14px">
      <div class="device-info-icon"><svg viewBox="0 0 22 22" fill="none" stroke="var(--teal)" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="5" width="18" height="13" rx="3"/></svg></div>
      <div><div class="di-name">${a.name}</div><div style="font-size:11px;color:var(--text3);font-family:var(--m)">${a.id}</div></div>
    </div>
    <div class="detail-row"><div class="detail-key">ผู้ยืม</div><div class="detail-val">${borrower||'<span style="color:var(--text3)">รอกรอก</span>'}</div></div>
    <div class="detail-row"><div class="detail-key">แผนก</div><div class="detail-val">${dept||'<span style="color:var(--text3)">รอเลือก</span>'}</div></div>
    <div class="detail-row"><div class="detail-key">กำหนดคืน</div><div class="detail-val">${due||'<span style="color:var(--text3)">รอกรอก</span>'}</div></div>
    <div class="detail-row"><div class="detail-key">เหตุผล</div><div class="detail-val">${reason||'<span style="color:var(--text3)">รอเลือก</span>'}</div></div>
    <div class="detail-row"><div class="detail-key">สถานะ</div><div class="detail-val"><span class="badge blue">จองคิว / รอตรวจสอบ</span></div></div>
  `;
}

function submitNewLoan() {
  const borrower = document.getElementById('f-borrower').value.trim();
  const dept = document.getElementById('f-dept').value;
  const due = document.getElementById('f-duedate').value;
  const reason = document.getElementById('f-reason').value;
  const note = document.getElementById('f-note').value;
  const hn = document.getElementById('f-hn').value.trim();
  const rights = document.getElementById('f-rights').value;
  const dx = document.getElementById('f-dx').value.trim();
  
  const lnId = nextDocId('loan');
  const today = new Date();
  const thaiDate = today.getDate()+' เม.ย. '+(today.getFullYear()+543-2500+2567);
  
  const a = DB.assets.find(x=>x.id===selectedDeviceId);
  a.status = 'จอง/รอตรวจสอบ';
  const items = [{ reqId: a.id, allocId: a.id, name: a.name, category: a.category, inspect: false, postInspect: false }];

  DB.loans.unshift({
    id:lnId, items: items,
    borrower, dept, loanDate:thaiDate, due,
    dueTs:new Date(due), status:'pending', inspect:false, reason, note,
    hn, rights, dx
  });
  addAuditLog('LOAN','ผู้ยืม (ระบบออนไลน์)','ส่งคำขอยืม '+lnId,`${a.name} → ${dept}`);
  
  document.getElementById('nb-loan').textContent = DB.loans.filter(l=>l.status==='overdue'||l.status==='calexp').length;
  // Auto-navigate (Anticipatory Design: go to registry and open the new entry)
  goto('loanregistry', document.getElementById('nav-loanregistry'));
  toast('ส่งคำขอยืม '+lnId+' สำเร็จ — รอ BMED ตรวจสอบก่อนส่งมอบ', 'teal', 'เปิดดูรายละเอียด', ()=>openLoanDrawer(lnId));
}

/* ════════════════════════════════
   AUDIT LOG
════════════════════════════════ */
let filteredAudit = null;

function addAuditLog(type, user, action, detail) {
  const now = new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  const hash = '0x'+Math.random().toString(16).substring(2,10).toUpperCase();
  DB.auditLog.unshift({time:now,user,action,detail,type,hash:hash});
  saveDB();
}

function filterAuditLog(type) {
  filteredAudit = type ? DB.auditLog.filter(l=>l.type===type) : null;
  renderAuditLog();
}

function renderAuditLog() {
  const data = filteredAudit||DB.auditLog;
  const typeBadge = t=>({
    'LOAN':'<span class="badge teal">ยืม-คืน</span>',
    'INSPECT':'<span class="badge blue">Inspect</span>',
    'PM':'<span class="badge green">PM</span>',
    'CAL':'<span class="badge amber">Cal.</span>',
    'INC':'<span class="badge red">Incident</span>',
    'NOTIFY':'<span class="badge gray">แจ้งเตือน</span>',
    'ASSET':'<span class="badge teal">Asset</span>',
    'CM':'<span class="badge red">CM</span>',
  }[t]||'<span class="badge gray">'+t+'</span>');
  
  const b = document.getElementById('audit-body');
  if(!b) return;
  b.innerHTML = data.map(l=>`
    <div class="audit-row">
      <div class="audit-time">${l.time}</div>
      <div class="audit-type-badge">${typeBadge(l.type)}</div>
      <div class="audit-user">${l.user}</div>
      <div>
        <div class="audit-action">${l.action}</div>
        <div class="audit-detail">${l.detail}</div>
      </div>
      <div class="audit-hash" title="Immutable HASH">${l.hash||'0x2F8A1B9C'}</div>
    </div>`).join('');
}

/* ════════════════════════════════
   REPORTS & ANALYTICS
════════════════════════════════ */

function renderAssetReport() {
  const container = document.getElementById('asset-report-body');
  if (!container) return;

  const assets = DB.assets.filter(a => a.status !== 'จำหน่าย/แทงจำหน่าย');
  const totalValue = assets.reduce((sum, a) => sum + (a.price || 0), 0);
  
  const statusCounts = assets.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const statusColors = {
    'พร้อมใช้': 'var(--teal)',
    'ยืมออก': 'var(--amber)',
    'ซ่อม': 'var(--blue)',
    'รอ Cal.': 'var(--red)',
    'รอตรวจสอบ': 'var(--amber)',
    'จอง/รอตรวจสอบ': 'var(--blue)',
  };

  let kpiHtml = `
    <div class="kpi-row" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 20px;">
      <div class="kpi teal"><div class="kpi-label">จำนวนอุปกรณ์ทั้งหมด</div><div class="kpi-value">${assets.length}</div><div class="kpi-meta">เครื่อง</div></div>
      <div class="kpi blue"><div class="kpi-label">มูลค่ารวม</div><div class="kpi-value">${(totalValue / 1000000).toFixed(2)}M</div><div class="kpi-meta">บาท</div></div>
      ${Object.entries(statusCounts).map(([status, count]) => `
        <div class="kpi" style="--kpi-color: ${statusColors[status] || 'var(--gray)'}">
          <div class="kpi-label">${status}</div>
          <div class="kpi-value" style="color: var(--kpi-color)">${count}</div>
          <div class="kpi-meta">${((count / assets.length) * 100).toFixed(1)}%</div>
        </div>
      `).join('')}
    </div>
  `;

  const currentYear = 2567; // สมมติปีปัจจุบัน
  let tableHtml = `
    <div style="overflow-x:auto;">
      <table class="tbl" id="asset-report-table">
        <thead>
          <tr>
            <th>รหัสครุภัณฑ์</th>
            <th>ชื่ออุปกรณ์</th>
            <th>ประเภท</th>
            <th>แผนก</th>
            <th>สถานะ</th>
            <th style="text-align:center">อายุ (ปี)</th>
            <th style="text-align:right">มูลค่า (บาท)</th>
          </tr>
        </thead>
        <tbody>
          ${assets.map(a => {
            const age = currentYear - a.year;
            const isOld = age >= a.depYears;
            return `
              <tr class="${isOld ? 'dep-alert' : ''}">
                <td class="mid">${a.id}</td>
                <td class="fw">${a.name}</td>
                <td>${a.category}</td>
                <td>${a.dept}</td>
                <td><span class="badge" style="background-color:${statusColors[a.status] || 'var(--gray-d)'}; color:white;">${a.status}</span></td>
                <td style="text-align:center; ${isOld ? 'color:var(--red); font-weight:700;' : ''}">${age}</td>
                <td style="text-align:right; font-family:var(--m)">${(a.price || 0).toLocaleString()}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = kpiHtml + tableHtml;
}

function exportAssetReportExcel() {
  exportTableToExcel('asset-report-table', 'MedTrack_Asset_Inventory_Report.csv');
}

/**
 * Exports an HTML table to a CSV file.
 * @param {string} tableId The ID of the table to export.
 * @param {string} filename The desired filename for the CSV file.
 */
function exportTableToExcel(tableId, filename = 'export.csv') {
  const table = document.getElementById(tableId);
  if (!table) {
    toast(`ไม่พบตาราง '${tableId}'`, 'red');
    return;
  }

  let csv = [];
  // Get headers
  const headers = [];
  table.querySelectorAll('thead th').forEach(header => {
    headers.push(`"${header.textContent.trim().replace(/"/g, '""')}"`);
  });
  csv.push(headers.join(','));

  // Get rows
  table.querySelectorAll('tbody tr').forEach(row => {
    const rowData = [];
    row.querySelectorAll('td').forEach(cell => {
      // Clean up cell content (remove badges, etc. if needed, but for now, just text)
      let cellText = cell.textContent.trim().replace(/\s+/g, ' ');
      rowData.push(`"${cellText.replace(/"/g, '""')}"`);
    });
    csv.push(rowData.join(','));
  });

  const csvString = csv.join('\n');
  const blob = new Blob(["\ufeff", csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Export to Excel สำเร็จ', 'teal');
}

function renderMaintenanceReport() {
  const container = document.getElementById('maint-report-body');
  if (!container) return;

  // 1. KPIs
  const kpis = calcReliabilityKPIs();
  const totalRepairs = DB.repairs.length;
  const openRepairs = DB.repairs.filter(r => r.status !== 'ซ่อมเสร็จ').length;

  let kpiHtml = `
    <div class="kpi-row" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 20px;">
      <div class="kpi teal"><div class="kpi-label">Uptime / Availability</div><div class="kpi-value">${kpis.availPct}%</div><div class="kpi-meta">เป้า ≥ 95%</div></div>
      <div class="kpi blue"><div class="kpi-label">MTTR (ซ่อมเฉลี่ย)</div><div class="kpi-value">${kpis.mttrHrs} ชม.</div><div class="kpi-meta">เป้า ≤ 48 ชม.</div></div>
      <div class="kpi amber"><div class="kpi-label">MTBF (เสียเฉลี่ย)</div><div class="kpi-value">${kpis.mtbfDays} วัน</div><div class="kpi-meta">ยิ่งสูงยิ่งดี</div></div>
      <div class="kpi red"><div class="kpi-label">งานซ่อมทั้งหมด</div><div class="kpi-value">${totalRepairs}</div><div class="kpi-meta">${openRepairs} งานยังไม่ปิด</div></div>
    </div>
  `;

  // 2. Top 10 Bad Actors
  const repairCounts = DB.repairs.reduce((acc, repair) => {
    acc[repair.devId] = (acc[repair.devId] || 0) + 1;
    return acc;
  }, {});

  const sortedRepairs = Object.entries(repairCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  let tableHtml = `
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text)">Top 10 อุปกรณ์ที่เสียบ่อยที่สุด (Bad Actors)</div>
    <div style="overflow-x:auto;">
      <table class="tbl" id="maint-report-table">
        <thead>
          <tr>
            <th style="width:50px">อันดับ</th>
            <th>รหัสครุภัณฑ์</th>
            <th>ชื่ออุปกรณ์</th>
            <th>แผนก</th>
            <th style="text-align:center">จำนวนครั้งที่ซ่อม</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRepairs.map(([devId, count], index) => {
            const asset = DB.assets.find(a => a.id === devId) || { name: 'N/A', dept: 'N/A' };
            return `
              <tr>
                <td class="mid">${index + 1}</td>
                <td class="mid">${devId}</td>
                <td class="fw">${asset.name}</td>
                <td>${asset.dept}</td>
                <td style="text-align:center; font-weight:700; color:var(--red); font-family:var(--m)">${count}</td>
              </tr>
            `;
          }).join('')}
          ${sortedRepairs.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text3)">ยังไม่มีข้อมูลการซ่อม</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = kpiHtml + tableHtml;
}

function exportMaintReportExcel() {
  exportTableToExcel('maint-report-table', 'MedTrack_Maintenance_Report.csv');
}

function renderUtilizationReport() {
  const container = document.getElementById('utilization-report-body');
  if (!container) return;

  // --- 1. KPIs ---
  const totalLoans = DB.loans.length;
  const loanedAssets = DB.assets.filter(a => a.status === 'ยืมออก').length;
  const activeAssets = DB.assets.filter(a => a.status !== 'จำหน่าย/แทงจำหน่าย').length;
  const utilizationRate = activeAssets > 0 ? (loanedAssets / activeAssets) * 100 : 0;
  
  // On-time return rate calculation (Simulated)
  const returnedLoans = DB.loans.filter(l => l.status === 'returned');
  // The data model lacks a 'returnedDate'. This is a mock calculation.
  // A real implementation would compare returnedDate against dueTs.
  const onTimeReturns = returnedLoans.filter(l => parseInt(l.id.split('-')[1]) % 2 === 0).length;
  const onTimeRate = returnedLoans.length > 0 ? (onTimeReturns / returnedLoans.length) * 100 : 100;

  let kpiHtml = `
    <div class="kpi-row" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 20px;">
      <div class="kpi teal"><div class="kpi-label">อัตราการใช้งานปัจจุบัน</div><div class="kpi-value">${utilizationRate.toFixed(1)}%</div><div class="kpi-meta">${loanedAssets} / ${activeAssets} เครื่องกำลังถูกยืม</div></div>
      <div class="kpi blue"><div class="kpi-label">จำนวนการยืมทั้งหมด</div><div class="kpi-value">${totalLoans}</div><div class="kpi-meta">ครั้งในระบบ</div></div>
      <div class="kpi amber"><div class="kpi-label">อัตราคืนตรงเวลา (จำลอง)</div><div class="kpi-value">${onTimeRate.toFixed(1)}%</div><div class="kpi-meta">จาก ${returnedLoans.length} รายการที่คืนแล้ว</div></div>
    </div>
  `;

  // --- 2. Top 10 Borrowing Departments ---
  const deptCounts = DB.loans.reduce((acc, loan) => {
    acc[loan.dept] = (acc[loan.dept] || 0) + 1;
    return acc;
  }, {});

  const sortedDepts = Object.entries(deptCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  let tableHtml = `
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text)">Top 10 แผนกที่ยืมบ่อยที่สุด</div>
    <div style="overflow-x:auto;">
      <table class="tbl" id="utilization-report-table">
        <thead>
          <tr>
            <th style="width:50px">อันดับ</th>
            <th>แผนก</th>
            <th style="text-align:center">จำนวนครั้งที่ยืม</th>
            <th style="text-align:center">สัดส่วน</th>
          </tr>
        </thead>
        <tbody>
          ${sortedDepts.map(([dept, count], index) => {
            const percentage = totalLoans > 0 ? (count / totalLoans) * 100 : 0;
            return `
              <tr>
                <td class="mid">${index + 1}</td>
                <td class="fw">${dept}</td>
                <td style="text-align:center; font-weight:700; color:var(--blue); font-family:var(--m)">${count}</td>
                <td style="text-align:center; font-size:12px; color:var(--text2)"><div style="display:flex; align-items:center; gap:8px; justify-content:center;"><span>${percentage.toFixed(1)}%</span><div style="width:100px; height:8px; background:var(--border); border-radius:4px; overflow:hidden;"><div style="width:${percentage}%; height:100%; background:var(--blue);"></div></div></div></td>
              </tr>`;
          }).join('')}
          ${sortedDepts.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3)">ยังไม่มีข้อมูลการยืม-คืน</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = kpiHtml + tableHtml;
}

function exportUtilizationReportExcel() {
  exportTableToExcel('utilization-report-table', 'MedTrack_Utilization_Report.csv');
}

function renderFinancialReport() {
  const container = document.getElementById('finance-cost-report-body');
  if (!container) return;

  // --- 1. Calculate Costs ---
  let totalCost = 0;
  let inHouseCost = 0;
  let outsourceCost = 0;
  const costData = [];

  DB.repairs.forEach(r => {
    const c = r.cost || 0;
    if (c > 0 || r.status === 'ซ่อมเสร็จ') {
      totalCost += c;
      if (r.ext) outsourceCost += c;
      else inHouseCost += c;

      const asset = DB.assets.find(a => a.id === r.devId) || { dept: 'N/A' };
      costData.push({
        id: r.id, devId: r.devId, device: r.device, dept: asset.dept,
        type: r.ext ? 'ซ่อมภายนอก' : 'ซ่อมภายใน', cost: c
      });
    }
  });

  const inHousePct = totalCost > 0 ? ((inHouseCost / totalCost) * 100).toFixed(1) : 0;
  const outsourcePct = totalCost > 0 ? ((outsourceCost / totalCost) * 100).toFixed(1) : 0;

  // --- 2. Build HTML ---
  let kpiHtml = `
    <div class="kpi-row" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 20px; margin-top: 0;">
      <div class="kpi blue"><div class="kpi-label">ค่าใช้จ่ายซ่อมบำรุงรวม (CM)</div><div class="kpi-value">${totalCost.toLocaleString()}</div><div class="kpi-meta">บาท (ประวัติทั้งหมด)</div></div>
      <div class="kpi teal"><div class="kpi-label">ซ่อมภายใน (In-house)</div><div class="kpi-value">${inHouseCost.toLocaleString()}</div><div class="kpi-meta">คิดเป็น ${inHousePct}% ของค่าใช้จ่ายรวม</div><div class="kpi-bar"><div class="kpi-fill" style="width:${inHousePct}%;background:var(--teal)"></div></div></div>
      <div class="kpi amber"><div class="kpi-label">ส่งซ่อมภายนอก (Outsource)</div><div class="kpi-value">${outsourceCost.toLocaleString()}</div><div class="kpi-meta">คิดเป็น ${outsourcePct}% ของค่าใช้จ่ายรวม</div><div class="kpi-bar"><div class="kpi-fill" style="width:${outsourcePct}%;background:var(--amber)"></div></div></div>
    </div>
  `;

  let tableHtml = `
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text)">รายละเอียดงานซ่อมที่มีค่าใช้จ่าย</div>
    <div style="overflow-x:auto;">
      <table class="tbl" id="finance-cost-table">
        <thead><tr><th>ใบแจ้งซ่อม</th><th>อุปกรณ์</th><th>แผนก</th><th style="text-align:center">ประเภท</th><th style="text-align:right">ค่าใช้จ่าย (บาท)</th></tr></thead>
        <tbody>
          ${costData.map(r => `
            <tr>
              <td class="mid">${r.id}</td><td><div class="fw">${r.device}</div><div style="font-size:11px;color:var(--text3)">${r.devId}</div></td>
              <td>${r.dept}</td><td style="text-align:center"><span class="badge ${r.type === 'ซ่อมภายใน' ? 'teal' : 'amber'}">${r.type}</span></td>
              <td style="text-align:right; font-weight:700; font-family:var(--m)">${r.cost.toLocaleString()}</td>
            </tr>`).join('')}
          ${costData.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text3)">ไม่มีข้อมูลงานซ่อม</td></tr>' : ''}
        </tbody>
      </table>
    </div>`;

  container.innerHTML = kpiHtml + tableHtml;
}

function exportFinancialReportExcel() {
  exportTableToExcel('finance-cost-table', 'MedTrack_Financial_Cost_Report.csv');
}

/* ════════════════════════════════
   GLOBAL SEARCH
════════════════════════════════ */
function handleSearch(q) {
  const r = document.getElementById('search-results');
  if(!q.trim()) { r.style.display='none'; return; }
  const results = DB.assets.filter(a=>a.name.toLowerCase().includes(q.toLowerCase())||a.id.toLowerCase().includes(q.toLowerCase())).slice(0,6);
  if(!results.length) { r.innerHTML='<div style="padding:12px;color:var(--text3);font-size:13px">ไม่พบอุปกรณ์</div>'; r.style.display='block'; return; }
  r.innerHTML = results.map(a=>`<div class="sr-item" onmousedown="event.preventDefault(); openAssetDrawer('${a.id}');hideSearchResults()"><div class="sr-icon"><svg viewBox="0 0 16 16" fill="none" stroke="var(--teal)" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="2"/></svg></div><div><div style="font-size:13px;font-weight:600">${a.name}</div><div style="font-size:11px;color:var(--text3);font-family:var(--m)">${a.id} · ${a.status}</div></div></div>`).join('');
  r.style.display='block';
}
function showSearchResults(){const el = document.getElementById('global-search'); if(el && el.value) handleSearch(el.value);}
function hideSearchResults(){const r = document.getElementById('search-results'); if(r) r.style.display='none';}

/* ════════════════════════════════
   SETTINGS
════════════════════════════════ */
/* ════════════════════════════════
   DOCUMENT NUMBERING
════════════════════════════════ */
function nextDocId(type) {
  const cfg = DB.settings.docNumbering[type];
  if (!cfg) return type.toUpperCase() + '-' + Date.now();
  cfg.seq++;
  return cfg.prefix + '-' + String(cfg.seq).padStart(cfg.digits, '0');
}

function previewDocId(type) {
  const cfg = DB.settings.docNumbering[type];
  if (!cfg) return '—';
  return cfg.prefix + '-' + String(cfg.seq + 1).padStart(cfg.digits, '0');
}

function renderDocNumberingSection() {
  const cfg = DB.settings.docNumbering;
  const rows = Object.entries(cfg).map(([type, c]) => {
    const next = c.prefix + '-' + String(c.seq + 1).padStart(c.digits, '0');
    return `<tr>
      <td style="padding:10px 12px;white-space:nowrap">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${c.label}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${c.desc}</div>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <div style="display:flex;align-items:center;gap:6px;justify-content:center">
          <input id="dn-prefix-${type}" value="${c.prefix}" maxlength="8"
            style="width:80px;text-align:center;font-family:var(--m);font-weight:700;font-size:13px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);padding:5px 8px;outline:none;text-transform:uppercase"
            oninput="this.value=this.value.toUpperCase();updateDocPreview('${type}')"
            onfocus="this.style.borderColor='var(--teal)'" onblur="this.style.borderColor='var(--border)'">
          <span style="color:var(--text3);font-family:var(--m);font-size:13px">-</span>
          <input id="dn-digits-${type}" type="number" value="${c.digits}" min="2" max="6"
            style="width:52px;text-align:center;font-family:var(--m);font-size:13px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);padding:5px 6px;outline:none"
            oninput="updateDocPreview('${type}')"
            onfocus="this.style.borderColor='var(--teal)'" onblur="this.style.borderColor='var(--border)'">
          <span style="color:var(--text3);font-size:11px">หลัก</span>
        </div>
      </td>
      <td style="padding:10px 12px;text-align:center;font-family:var(--m);font-size:12px;color:var(--text3)">${c.seq}</td>
      <td style="padding:10px 12px;text-align:center">
        <span id="dn-preview-${type}" style="font-family:var(--m);font-size:13px;font-weight:700;color:var(--teal);background:var(--teal-d);padding:3px 10px;border-radius:6px">${next}</span>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <button class="btn btn-sm btn-teal" onclick="saveDocNumbering('${type}')">บันทึก</button>
      </td>
    </tr>`;
  }).join('');

  return `<div style="margin-top:28px">
    <div style="font-size:14px;font-weight:700;color:var(--text);border-bottom:2px solid var(--border);padding-bottom:8px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      การตั้งค่าเลขที่เอกสาร (Document Numbering)
    </div>
    <div class="panel">
      <div class="panel-head" style="background:var(--surface2)">
        <div>
          <div class="panel-title">กำหนด Prefix และรูปแบบเลขที่เอกสาร</div>
          <div class="panel-subtitle">เลขที่ถัดไปจะออกอัตโนมัติเมื่อสร้างเอกสารใหม่ — แก้ไข Prefix แล้วกด "บันทึก"</div>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;white-space:nowrap;letter-spacing:.06em;text-transform:uppercase">ประเภทเอกสาร</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--text3);text-align:center;letter-spacing:.06em;text-transform:uppercase">Prefix &amp; จำนวนหลัก</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--text3);text-align:center;letter-spacing:.06em;text-transform:uppercase">เลขล่าสุด</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--text3);text-align:center;letter-spacing:.06em;text-transform:uppercase">เลขถัดไป (Preview)</th>
              <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--text3);text-align:center;letter-spacing:.06em;text-transform:uppercase"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function updateDocPreview(type) {
  const prefix = (document.getElementById('dn-prefix-'+type)?.value || '').toUpperCase().trim();
  const digits = parseInt(document.getElementById('dn-digits-'+type)?.value) || 4;
  const cfg = DB.settings.docNumbering[type];
  if (!cfg) return;
  const next = (prefix||cfg.prefix) + '-' + String(cfg.seq + 1).padStart(digits, '0');
  const el = document.getElementById('dn-preview-'+type);
  if (el) el.textContent = next;
}

function saveDocNumbering(type) {
  const cfg = DB.settings.docNumbering[type];
  if (!cfg) return;
  const prefix = (document.getElementById('dn-prefix-'+type)?.value || '').toUpperCase().trim();
  const digits = parseInt(document.getElementById('dn-digits-'+type)?.value) || 4;
  if (!prefix) { toast('กรุณากรอก Prefix', 'red'); return; }
  cfg.prefix = prefix;
  cfg.digits = Math.max(2, Math.min(6, digits));
  addAuditLog('SETTINGS', currentUserName(), 'แก้ไข Prefix เอกสาร '+type, prefix+'-'+String(cfg.seq+1).padStart(cfg.digits,'0'));
  toast('บันทึก Prefix "'+prefix+'" สำหรับ '+cfg.label+' แล้ว', 'teal');
  renderSettings();
}

function renderSettings() {
  const container = document.getElementById('settings-container');
  if(!container) return;
  
  let html = '';
  for(const [groupKey, groupTitle] of Object.entries(SETTING_GROUPS)) {
    html += `<div style="font-size:14px;font-weight:700;color:var(--text);margin:24px 0 12px;border-bottom:2px solid var(--border);padding-bottom:8px">${groupTitle}</div>`;
    html += `<div class="g3-1" style="grid-template-columns:repeat(3,1fr);align-items:start;margin-bottom:24px">`;
    
    Object.keys(SETTING_META).filter(k => SETTING_META[k].group === groupKey).forEach(key => {
      const arr = DB.settings[key];
      if (key === 'vendor') {
        html += `<div class="panel" style="grid-column:span 2">
          <div class="panel-head">
            <div class="panel-title">${SETTING_META[key].title}</div>
            <button class="btn btn-teal btn-sm" onclick="openVendorModal()">+ เพิ่มบริษัท</button>
          </div>
          <div class="panel-body" style="background:var(--surface2)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:280px;overflow-y:auto;padding-right:4px">
              ${arr.map((item, i) => `
                <div style="display:flex;flex-direction:column;gap:4px;padding:10px;border-radius:var(--r);background:var(--surface);border:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:13px;font-weight:700;color:var(--text)">${item.name}</span>
                    <div style="display:flex;gap:4px"><button class="btn btn-sm" style="padding:2px 8px;font-size:10px" onclick="openVendorModal(${i})">แก้ไข</button><button class="btn btn-red btn-sm" style="padding:2px 8px;font-size:10px" onclick="deleteVendor(${i})">ลบ</button></div>
                  </div>
                  <div style="font-size:11px;color:var(--text3)">เลขผู้เสียภาษี: ${item.taxId||'-'} | โทร: ${item.tel||'-'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>`;
      } else {
        html += `<div class="panel">
          <div class="panel-head"><div class="panel-title">${SETTING_META[key].title}</div></div>
          <div class="panel-body" style="background:var(--surface2)">
            <div style="display:flex;gap:8px;margin-bottom:12px"><input class="finput" id="setting-new-${key}" placeholder="เพิ่มรายการ..."><button class="btn btn-teal btn-sm" onclick="addSetting('${key}')">เพิ่ม</button></div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;padding-right:4px">
              ${arr.map((item, i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:var(--r);background:var(--surface);border:1px solid var(--border)">
                  <span class="editable-inline" contenteditable="true"
                    onfocus="this.dataset.orig=this.textContent.trim()"
                    onblur="inlineSaveSetting('${key}',${i},this)"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}if(event.key==='Escape'){this.textContent=this.dataset.orig||'';this.blur();event.preventDefault()}"
                    title="คลิกเพื่อแก้ไข · Enter=บันทึก · Esc=ยกเลิก"
                    style="font-size:12px;font-weight:500;flex:1">${item}</span>
                  <button class="btn btn-red btn-sm qa-hover-btn" style="padding:2px 8px;font-size:10px;margin-left:8px" onclick="deleteSetting('${key}',${i})">ลบ</button>
                </div>`).join('')}
            </div>
          </div>
        </div>`;
      }
    });
    html += `</div>`;
  }
  if (currentUser && currentUser.role === 'admin') {
    html += renderDocNumberingSection();
    html += renderUserManagementSection();
  }
  container.innerHTML = html;
}

function renderUserManagementSection() {
  const roleLabels = { admin:'Admin', bmed:'ช่างชีวการแพทย์', nurse:'พยาบาล', manager:'ผู้บริหาร' };
  const roleBadge = { admin:'red', bmed:'teal', nurse:'blue', manager:'amber' };
  return `
  <div style="font-size:14px;font-weight:700;color:var(--text);margin:24px 0 12px;border-bottom:2px solid var(--border);padding-bottom:8px">การจัดการผู้ใช้งาน (User Management)</div>
  <div class="panel" style="margin-bottom:24px">
    <div class="panel-head">
      <div class="panel-title">รายชื่อผู้ใช้งานในระบบ</div>
      <button class="btn btn-teal btn-sm" onclick="openAddUserModal()">+ เพิ่มผู้ใช้</button>
    </div>
    <div class="panel-body" style="background:var(--surface2)">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
        ${DB.users.map(u => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px;display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;min-width:40px;border-radius:50%;background:var(--teal);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${u.avatar}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:1px">${u.username} · ${u.dept}</div>
              <div style="margin-top:4px"><span class="badge ${roleBadge[u.role]||'gray'}">${roleLabels[u.role]||u.role}</span>${!u.active?'<span class="badge red" style="margin-left:4px">ปิดใช้งาน</span>':''}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <button class="btn btn-sm" onclick="openEditUserModal('${u.id}')" style="font-size:10px;padding:3px 8px">แก้ไข</button>
              <button class="btn btn-sm" onclick="toggleUserActive('${u.id}')" title="${u.active?'ปิดใช้งาน':'เปิดใช้งาน'}" style="font-size:10px;padding:3px 8px">${u.active?'ปิด':'เปิด'}</button>
              <button class="btn btn-sm" onclick="resetUserPin('${u.id}')" title="รีเซ็ต PIN" style="font-size:10px;padding:3px 8px">PIN</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>`;
}

function toggleUserActive(userId) {
  const u = DB.users.find(x => x.id === userId);
  if (!u) return;
  if (u.id === currentUser.id) { toast('ไม่สามารถปิดบัญชีตัวเองได้', 'amber'); return; }
  u.active = !u.active;
  addAuditLog('SETTING', currentUserName(), (u.active?'เปิด':'ปิด')+'บัญชีผู้ใช้', u.username);
  renderSettings();
  toast((u.active?'เปิด':'ปิด')+'บัญชี '+u.username+' สำเร็จ', u.active?'teal':'amber');
}

function resetUserPin(userId) {
  const u = DB.users.find(x => x.id === userId);
  if (!u) return;
  u.pin = '0000';
  addAuditLog('SETTING', currentUserName(), 'รีเซ็ต PIN ผู้ใช้', u.username+' → 0000');
  toast('รีเซ็ต PIN ของ '+u.username+' เป็น 0000 สำเร็จ', 'teal');
}

function openAddUserModal() {
  document.getElementById('nu-id').value = '';
  document.getElementById('nu-uname').value = '';
  document.getElementById('nu-uname').readOnly = false;
  document.getElementById('nu-uname').style.opacity = '';
  document.getElementById('nu-name').value = '';
  document.getElementById('nu-pass').value = '';
  document.getElementById('nu-pin').value = '';
  document.getElementById('nu-dept').value = '';
  document.getElementById('nu-role').value = 'bmed';
  document.getElementById('user-modal-title').textContent = 'เพิ่มผู้ใช้งานใหม่';
  document.getElementById('user-modal-sub').textContent = 'กำหนดบัญชีและสิทธิ์การเข้าถึง';
  document.getElementById('nu-pass-label').innerHTML = 'รหัสผ่าน <span class="req">*</span>';
  document.getElementById('nu-pin-label').innerHTML = 'PIN 4 หลัก <span class="req">*</span>';
  document.getElementById('nu-pass').placeholder = 'อย่างน้อย 4 ตัวอักษร';
  document.getElementById('nu-pin').placeholder = '0000';
  document.getElementById('modal-add-user').classList.add('open');
}

function openEditUserModal(userId) {
  const u = DB.users.find(x => x.id === userId);
  if (!u) return;
  document.getElementById('nu-id').value = u.id;
  document.getElementById('nu-uname').value = u.username;
  document.getElementById('nu-uname').readOnly = true;
  document.getElementById('nu-uname').style.opacity = '0.6';
  document.getElementById('nu-name').value = u.name;
  document.getElementById('nu-pass').value = '';
  document.getElementById('nu-pin').value = '';
  document.getElementById('nu-dept').value = u.dept || '';
  document.getElementById('nu-role').value = u.role;
  document.getElementById('user-modal-title').textContent = 'แก้ไขข้อมูลผู้ใช้';
  document.getElementById('user-modal-sub').textContent = `แก้ไขข้อมูลของ ${u.username}`;
  document.getElementById('nu-pass-label').innerHTML = 'รหัสผ่านใหม่ <span style="color:var(--text3);font-weight:400">(เว้นว่างถ้าไม่เปลี่ยน)</span>';
  document.getElementById('nu-pin-label').innerHTML = 'PIN ใหม่ <span style="color:var(--text3);font-weight:400">(เว้นว่างถ้าไม่เปลี่ยน)</span>';
  document.getElementById('nu-pass').placeholder = 'เว้นว่างถ้าไม่เปลี่ยน';
  document.getElementById('nu-pin').placeholder = 'เว้นว่างถ้าไม่เปลี่ยน';
  document.getElementById('modal-add-user').classList.add('open');
}

function closeAddUserModal() {
  document.getElementById('modal-add-user').classList.remove('open');
}

function saveUserModal() {
  const editId = document.getElementById('nu-id').value.trim();
  const isEdit = !!editId;

  const uname = document.getElementById('nu-uname').value.trim().toLowerCase();
  const name  = document.getElementById('nu-name').value.trim();
  const pass  = document.getElementById('nu-pass').value.trim();
  const pin   = document.getElementById('nu-pin').value.trim();
  const role  = document.getElementById('nu-role').value;
  const dept  = document.getElementById('nu-dept').value.trim();

  if (!uname || !name) { toast('กรุณากรอก Username และชื่อ', 'amber'); return; }

  if (isEdit) {
    const u = DB.users.find(x => x.id === editId);
    if (!u) return;
    u.name   = name;
    u.role   = role;
    u.dept   = dept;
    u.avatar = name.substring(0, 2);
    if (pass.length >= 4) u.password = pass;
    if (pin.length === 4) u.pin = pin;
    if (u.id === currentUser.id) { currentUser.name = u.name; currentUser.role = u.role; applyRoleUI(); }
    addAuditLog('SETTING', currentUserName(), 'แก้ไขข้อมูลผู้ใช้', uname);
    closeAddUserModal();
    renderSettings();
    toast('อัปเดตข้อมูล ' + uname + ' สำเร็จ', 'teal');
  } else {
    if (!pass || !pin) { toast('กรุณากรอกรหัสผ่านและ PIN', 'amber'); return; }
    if (DB.users.find(x => x.username === uname)) { toast('Username นี้มีอยู่แล้ว', 'amber'); return; }
    const id = 'U' + String(DB.users.length + 1).padStart(3, '0');
    DB.users.push({ id, username: uname, password: pass, name, role, dept, avatar: name.substring(0, 2), pin, active: true });
    addAuditLog('SETTING', currentUserName(), 'เพิ่มผู้ใช้งานใหม่', uname + ' (' + role + ')');
    closeAddUserModal();
    renderSettings();
    toast('เพิ่มผู้ใช้ ' + uname + ' สำเร็จ', 'teal');
  }
}

function addSetting(cat) {
  const input = document.getElementById('setting-new-'+cat);
  const val = input.value.trim();
  if(!val) return;
  const arr = DB.settings[cat];
  if(arr.includes(val)) { toast('มีข้อมูลนี้อยู่แล้ว','red'); return; }
  arr.push(val);
  input.value = '';
  renderSettings();
  refreshSelectOptions();
  toast('เพิ่มรายการสำเร็จ','teal');
}

async function editSetting(cat, idx) {
  const arr = DB.settings[cat];
  const oldVal = arr[idx];
  const newVal = await popPrompt('แก้ไขชื่อรายการ:', oldVal, 'แก้ไขรายการ');
  if(newVal !== null && newVal.trim() !== '' && newVal.trim() !== oldVal) {
    if(arr.includes(newVal.trim())) { toast('มีข้อมูลนี้อยู่แล้ว','red'); return; }
    arr[idx] = newVal.trim();
    renderSettings();
    refreshSelectOptions();
    toast('แก้ไขรายการสำเร็จ','teal');
  }
}

function inlineSaveSetting(key, idx, el) {
  const val = el.textContent.trim();
  const orig = el.dataset.orig || '';
  if(!val) { el.textContent = orig; return; }
  if(val === orig) return;
  const arr = DB.settings[key];
  if(arr.includes(val)) { toast('มีข้อมูลนี้อยู่แล้ว','red'); el.textContent = orig; return; }
  arr[idx] = val;
  refreshSelectOptions();
  addAuditLog('SETTING', currentUserName(), `แก้ไข ${SETTING_META[key]?.title||key}`, `"${orig}" → "${val}"`);
  toast('บันทึกการแก้ไขแล้ว', 'teal');
}

async function deleteSetting(cat, idx) {
  const ok = await popConfirm('ยืนยันการลบรายการนี้?', 'ลบรายการ', true);
  if(!ok) return;
  const arr = DB.settings[cat];
  arr.splice(idx, 1);
  renderSettings();
  refreshSelectOptions();
  toast('ลบรายการแล้ว','teal');
}

let editingVendorIdx = null;
function openVendorModal(idx = null) {
  editingVendorIdx = idx;
  if(idx !== null) {
    document.getElementById('vendor-modal-title').textContent = 'แก้ไขข้อมูลบริษัท';
    const v = DB.settings.vendor[idx];
    document.getElementById('v-name').value = v.name || '';
    document.getElementById('v-tax').value = v.taxId || '';
    document.getElementById('v-address').value = v.address || '';
    document.getElementById('v-tel').value = v.tel || '';
    document.getElementById('v-contact').value = v.contact || '';
  } else {
    document.getElementById('vendor-modal-title').textContent = 'เพิ่มบริษัทผู้จัดจำหน่าย';
    ['v-name','v-tax','v-address','v-tel','v-contact'].forEach(id => document.getElementById(id).value = '');
  }
  document.getElementById('modal-vendor').classList.add('open');
}

function closeVendorModal() {
  document.getElementById('modal-vendor').classList.remove('open');
}

function submitVendor() {
  const name = document.getElementById('v-name').value.trim();
  if(!name) { toast('กรุณาระบุชื่อบริษัท','amber'); return; }
  const vendorData = { name: name, taxId: document.getElementById('v-tax').value.trim(), address: document.getElementById('v-address').value.trim(), tel: document.getElementById('v-tel').value.trim(), contact: document.getElementById('v-contact').value.trim() };
  if(editingVendorIdx !== null) {
    DB.settings.vendor[editingVendorIdx] = vendorData;
    toast('อัปเดตข้อมูลบริษัทสำเร็จ','teal');
  } else {
    DB.settings.vendor.push(vendorData);
    toast('เพิ่มบริษัทใหม่สำเร็จ','teal');
  }
  closeVendorModal(); renderSettings(); refreshSelectOptions();
}

async function deleteVendor(idx) {
  const ok = await popConfirm('ยืนยันการลบบริษัทนี้?', 'ลบบริษัทผู้จัดจำหน่าย', true);
  if(!ok) return;
  DB.settings.vendor.splice(idx, 1);
  renderSettings(); refreshSelectOptions(); toast('ลบบริษัทแล้ว','teal');
}

function refreshSelectOptions() {
  const genOptions = (arr, prepend='') => prepend + arr.map(d=>`<option>${d}</option>`).join('');
  
  const fd = document.getElementById('f-dept'); if(fd) fd.innerHTML = genOptions(DB.settings.dept, '<option value="">-- เลือกแผนก --</option>');
  const asdf = document.getElementById('asset-dept-filter'); if(asdf) asdf.innerHTML = genOptions(DB.settings.dept, '<option value="">ทุกแผนก</option>');
  const ascf = document.getElementById('asset-category-filter'); if(ascf) ascf.innerHTML = genOptions(DB.settings.category, '<option value="">ทุกชนิดครุภัณฑ์</option>');
  const asst = document.getElementById('asset-status-filter'); if(asst) asst.innerHTML = genOptions(DB.settings.status, '<option value="">ทุกสถานะ</option>');
  const ldf = document.getElementById('loan-dept-filter'); if(ldf) ldf.innerHTML = genOptions(DB.settings.dept, '<option value="">ทุกแผนก</option>');
  const rd = document.getElementById('repair-dept'); if(rd) rd.innerHTML = genOptions(DB.settings.dept, '<option value="">-- ทุกแผนก --</option>');
  
  const rCause = document.getElementById('drm-cause'); if(rCause) rCause.innerHTML = genOptions(DB.settings.repairCause, '<option value="">-- เลือกสาเหตุ --</option>');
  const rTech = document.getElementById('drm-tech'); if(rTech) rTech.innerHTML = genOptions(DB.settings.technician, '<option value="">-- รอจ่ายงาน/ไม่ระบุ --</option>');

  ['dept','category','sny','risk','procurement','vendor','brand'].forEach(k => {
    const el = document.getElementById('add-'+k);
    const arr = k === 'vendor' ? DB.settings[k].map(v=>v.name) : DB.settings[k];
    if(el) el.innerHTML = genOptions(arr);
  });
}

/* ════════════════════════════════
   QR SCANNER
════════════════════════════════ */
let html5QrcodeScanner = null;

function openQrScanner() {
  document.getElementById('modal-qr-scanner').classList.add('open');
  if (!html5QrcodeScanner) {
    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 }, false);
  }
  html5QrcodeScanner.render(onScanSuccess);
}

function closeQrScanner() {
  document.getElementById('modal-qr-scanner').classList.remove('open');
  if (html5QrcodeScanner) {
    html5QrcodeScanner.clear().catch(error => console.error("Failed to clear scanner.", error));
  }
}

function onScanSuccess(decodedText) {
  closeQrScanner();
  if (decodedText.startsWith('LN-')) {
    const loan = DB.loans.find(l => l.id === decodedText);
    if (loan) {
      goto('loanregistry', document.getElementById('nav-loanregistry'));
      setTimeout(() => { openLoanDrawer(decodedText); toast(`พบรายการใบยืม ${decodedText}`, 'teal'); }, 200);
    } else { toast(`ไม่พบข้อมูลใบยืมรหัส ${decodedText} ในระบบ`, 'red'); }
  } else {
    toast('QR Code ไม่ใช่รูปแบบใบยืมที่ถูกต้อง', 'amber');
  }
}

/* ════════════════════════════════
   DRAWERS
════════════════════════════════ */
function openDrawer(id) {
  closeDrawer();
  currentDrawer = id;
  document.getElementById('drawer-backdrop').classList.add('open');
  setTimeout(()=>document.getElementById(id).classList.add('open'),10);
}

function closeDrawer() {
  if(currentDrawer) document.getElementById(currentDrawer)?.classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
  currentDrawer = null;
  const dd = document.getElementById('dct-device-dropdown');
  if (dd) dd.style.display = 'none';
}

function toggleNotifDrawer() {
  renderAlertFeed();
  openDrawer('drawer-notif');
}

function openNotifDrawer() { toggleNotifDrawer(); }

/* ════════════════════════════════
   TOAST
════════════════════════════════ */
function toast(msg, type='teal', actionLabel='', onAction=null) {
  const w = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast '+type;
  const icons = {teal:'M1 4l3 3 5-6',green:'M1 4l3 3 5-6',amber:'M5 2v3M5 6v1',red:'M2 2l6 6M8 2L2 8'};
  el.innerHTML = `<div class="toast-icon"><svg viewBox="0 0 10 8" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="${icons[type]||icons.teal}"/></svg></div><span style="flex:1">${msg}</span>${actionLabel?`<span class="toast-action-btn">${actionLabel}</span>`:''}`;
  if(actionLabel && onAction) el.querySelector('.toast-action-btn').addEventListener('click',()=>{ onAction(); el.remove(); });
  w.appendChild(el);
  setTimeout(()=>{ el.style.transition='all .2s ease'; el.style.opacity='0'; el.style.transform='translateX(10px)'; setTimeout(()=>el.remove(),200); }, actionLabel ? 6000 : 3500);
}

/* ════════════════════════════════
   CHARTS
════════════════════════════════ */
let dashChartsInited = false, reportChartsInited = false;

function initDashboardCharts() {
  if(dashChartsInited) return; dashChartsInited = true;
  const opts = {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:11},color:'#475569'}}}};
  
  new Chart(document.getElementById('chart-monthly'),{
    type:'bar',
    data:{labels:['ม.ค.','ก.พ.','มี.ค.','เม.ย.'],
      datasets:[
        {label:'PM',data:[18,22,19,15],backgroundColor:'rgba(13,148,136,.75)',borderRadius:4,borderSkipped:false},
        {label:'ยืม-คืน',data:[32,28,35,30],backgroundColor:'rgba(37,99,235,.6)',borderRadius:4,borderSkipped:false},
        {label:'CM',data:[5,3,8,4],backgroundColor:'rgba(220,38,38,.55)',borderRadius:4,borderSkipped:false},
      ]},
    options:{...opts,scales:{x:{ticks:{color:'#94a3b8',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#94a3b8',font:{size:11}},grid:{color:'rgba(226,232,240,.8)'},beginAtZero:true}}}
  });
  
  new Chart(document.getElementById('chart-status'),{
    type:'doughnut',
    data:{labels:['พร้อมใช้','ยืมออก','ซ่อม'],
      datasets:[{data:[192,48,8],backgroundColor:['rgba(13,148,136,.8)','rgba(217,119,6,.8)','rgba(37,99,235,.7)'],borderWidth:0,hoverOffset:4}]},
    options:{...opts,cutout:'70%',plugins:{legend:{position:'right',labels:{font:{size:11},color:'#475569',boxWidth:10,padding:8}}}}
  });
}

function initReportCharts() {
  if(reportChartsInited) return; reportChartsInited = true;
  const opts = {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:11},color:'#475569'}}}};
  
  new Chart(document.getElementById('chart-trend'),{
    type:'line',
    data:{labels:['พ.ย.','ธ.ค.','ม.ค.','ก.พ.','มี.ค.','เม.ย.'],
      datasets:[
        {label:'PM %',data:[88,90,91,89,93,92],borderColor:'rgba(13,148,136,.9)',backgroundColor:'rgba(13,148,136,.08)',tension:.4,fill:true,pointRadius:4,pointBackgroundColor:'rgba(13,148,136,.9)'},
        {label:'Cal. %',data:[96,98,97,95,94,94],borderColor:'rgba(37,99,235,.9)',backgroundColor:'rgba(37,99,235,.06)',tension:.4,fill:true,pointRadius:4,pointBackgroundColor:'rgba(37,99,235,.9)'},
      ]},
    options:{...opts,scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(226,232,240,.6)'}},y:{min:80,max:100,ticks:{color:'#94a3b8',callback:v=>v+'%'},grid:{color:'rgba(226,232,240,.6)'}}}}
  });
  
  new Chart(document.getElementById('chart-pareto'),{
    type:'bar',
    data:{labels:['Wear & tear','Human error','Firmware','สภาพแวดล้อม','Unknown'],
      datasets:[{label:'จำนวนครั้ง',data:[12,7,4,3,2],backgroundColor:'rgba(217,119,6,.75)',borderRadius:4,borderSkipped:false}]},
    options:{...opts,indexAxis:'y',scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(226,232,240,.6)'},beginAtZero:true},y:{ticks:{color:'#64748b',font:{size:11}},grid:{display:false}}}}
  });
}

/* ════════════════════════════════
   PRINT DOCUMENTS
════════════════════════════════ */
function printDocument(title, content, qrData, orientation='portrait') {
  const w = window.open('', '_blank', 'width=900,height=1000');
  w.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Sarabun', sans-serif; font-size: 14px; line-height: 1.5; color: #000; padding: 40px 50px; }
      h2, h3, h4 { margin: 0; }
      .doc-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px; }
      .doc-logo { width: 64px; height: 64px; background: #0d9488; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700; text-align: center; flex-shrink: 0; line-height: 1.2; }
      .doc-org { flex: 1; }
      .doc-org-name { font-size: 18px; font-weight: 700; color: #0f172a; }
      .doc-org-sub { font-size: 13px; color: #475569; margin-top: 2px; }
      #qr-container { background: #fff; padding: 4px; border: 1px solid #e2e8f0; border-radius: 8px; }
      .doc-title-box { text-align: center; margin-bottom: 24px; }
      .doc-title-box h3 { font-size: 18px; font-weight: 700; display: inline-block; padding-bottom: 4px; }
      .doc-meta { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 8px 32px; }
      .doc-meta-item { font-size: 14px; }
      .doc-meta-item .lbl { font-weight: 700; color: #475569; margin-right: 4px; }
      .section-title { font-size: 15px; font-weight: 700; color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 4px; margin: 24px 0 12px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 16px; }
      .info-box { border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 8px; background: #f8fafc; }
      .info-row { display: flex; gap: 8px; font-size: 14px; padding: 4px 0; border-bottom: 1px dotted #cbd5e1; }
      .info-row .lbl { font-weight: 700; min-width: 140px; flex-shrink: 0; color: #475569; }
      .info-row.full { grid-column: span 2; }
      .sym-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; min-height: 60px; font-size: 14px; margin-bottom: 16px; background: #fff; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
      th, td { border: 1px solid #94a3b8; padding: 8px 12px; }
      th { background: #f1f5f9; font-weight: 700; text-align: center; color: #0f172a; }
      .sigs { display: flex; justify-content: space-between; margin-top: 40px; gap: 24px; text-align: center; }
      .sig-box { flex: 1; }
      .sig-line { border-bottom: 1px dashed #475569; height: 50px; margin-bottom: 8px; }
      .sig-role { font-size: 14px; font-weight: 700; color: #0f172a; }
      .sig-date { font-size: 13px; color: #64748b; margin-top: 4px; }
      .badge-status { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #d97706; border: 1px solid #fcd34d; }
      .official-from { margin: 12px 0; font-size: 15px; }
      .official-from div { margin-bottom: 6px; }
      .body-text { font-size: 15px; line-height: 1.8; text-indent: 2.5em; margin-bottom: 12px; }
      .footer-note { font-size: 12px; color: #94a3b8; text-align: right; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      @media print { 
        body { padding: 0; } 
        @page { margin: 15mm; size: A4 ${orientation}; } 
        .info-box, .doc-meta { background: transparent !important; }
        th { background-color: #e2e8f0 !important; -webkit-print-color-adjust: exact; }
      }
    </style>
    </head><body>
    ${content}
    <div class="footer-note">พิมพ์จากระบบ MedTrack Management System</div>
    <script>
      window.onload = function() {
        var qrc = document.getElementById("qr-container");
        if(qrc && "${qrData}") { new QRCode(qrc, {text:"${qrData}", width:70, height:70, colorDark:"#0f172a", colorLight:"#ffffff"}); }
        setTimeout(function(){ window.print(); }, 800);
      }
    <\/script>
    </body></html>
  `);
  w.document.close();
}

function printLoanForm(id) {
  const loan = DB.loans.find(l => l.id === id);
  if(!loan) return;
  
  let itemsHtml = loan.items.map((it, idx) => {
    const a = DB.assets.find(x => x.id === it.allocId) || DB.assets.find(x => x.id === it.reqId) || {name: it.name, mfr: '-', model: '-', serial: '-'};
      return `<tr>
        <td style="text-align:center">${idx+1}</td>
        <td style="font-weight:600">${it.allocId}</td>
        <td>${a.name}</td>
        <td>${a.mfr || '-'} / ${a.model || '-'}</td>
        <td>${a.serial || '-'}</td>
      </tr>`;
  }).join('');

  const html = `
      <div class="doc-header">
        <div class="doc-logo">ศูนย์<br>เครื่องมือ<br>แพทย์</div>
        <div class="doc-org">
          <div class="doc-org-name">BMS HOSxP HOSPITAL — ศูนย์วิศวกรรมการแพทย์ (BMED)</div>
          <div class="doc-org-sub">BMS HOSxP HOSPITAL</div>
      </div>
      <div id="qr-container"></div>
    </div>

      <div class="doc-title-box"><h3>ใบยืม-คืน เครื่องมือแพทย์ (Loan & Return Form)</h3></div>

      <div class="doc-meta">
        <div class="doc-meta-item"><span class="lbl">เลขที่ใบยืม:</span> <strong>${loan.id}</strong></div>
        <div class="doc-meta-item"><span class="lbl">วันที่พิมพ์:</span> ${new Date().toLocaleDateString('th-TH')}</div>
    </div>

      <div class="section-title">ส่วนที่ 1: ข้อมูลการยืม</div>
      <div class="info-grid">
        <div class="info-box">
          <div class="info-row"><span class="lbl">ชื่อผู้ยืม:</span><span>${loan.borrower}</span></div>
          <div class="info-row"><span class="lbl">หน่วยงาน/แผนก:</span><span>${loan.dept}</span></div>
          <div class="info-row"><span class="lbl">วัตถุประสงค์:</span><span>${loan.reason}</span></div>
          <div class="info-row"><span class="lbl">วันที่ยืม:</span><span>${loan.loanDate}</span></div>
          <div class="info-row"><span class="lbl">กำหนดคืน:</span><span style="color:#dc2626;font-weight:700">${loan.due}</span></div>
        </div>
        <div class="info-box">
          <div style="font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color:#0f172a">ข้อมูลผู้ป่วย (กรณีใช้กับผู้ป่วย)</div>
          <div class="info-row"><span class="lbl">HN:</span><span>${loan.hn || '-'}</span></div>
          <div class="info-row"><span class="lbl">สิทธิ์การรักษา:</span><span>${loan.rights || '-'}</span></div>
          <div class="info-row"><span class="lbl">Diagnosis:</span><span>${loan.dx || '-'}</span></div>
        </div>
    </div>

      <div class="section-title">ส่วนที่ 2: รายการเครื่องมือแพทย์ที่ยืม</div>
    <table>
        <thead><tr><th style="width:50px">ลำดับ</th><th style="width:140px">รหัสอุปกรณ์</th><th>ชื่อรายการ</th><th>ยี่ห้อ / รุ่น</th><th style="width:140px">Serial Number</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
      <div class="info-row full" style="border:none;margin-top:8px"><span class="lbl" style="min-width:100px">หมายเหตุเพิ่มเติม:</span><span>${loan.note || '-'}</span></div>

      <div class="sigs">
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( ${loan.borrower} )</div><div class="sig-date">ผู้ยืม / ผู้รับมอบอุปกรณ์<br>วันที่: ______/______/______</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( .................................................... )</div><div class="sig-date">เจ้าหน้าที่ศูนย์ฯ ผู้ส่งมอบ<br>วันที่: ______/______/______</div></div>
      </div>

      <div class="section-title" style="margin-top: 40px;">ส่วนที่ 3: สำหรับเจ้าหน้าที่ (เมื่อรับคืน)</div>
      <div class="info-box" style="display: flex; justify-content: space-between;">
        <div style="font-size:14px"><span class="lbl" style="font-weight:700;color:#475569">วันที่รับคืนจริง:</span> ______/______/______</div>
        <div style="font-size:14px"><span class="lbl" style="font-weight:700;color:#475569">สภาพเครื่องเมื่อรับคืน:</span> [ &nbsp; ] ปกติ &nbsp;&nbsp; [ &nbsp; ] ชำรุด/สูญหาย</div>
      </div>
      
      <div class="sigs">
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( .................................................... )</div><div class="sig-date">ผู้ส่งคืนอุปกรณ์<br>วันที่: ______/______/______</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( .................................................... )</div><div class="sig-date">เจ้าหน้าที่ศูนย์ฯ ผู้รับคืน<br>วันที่: ______/______/______</div></div>
    </div>
  `;
  printDocument('ใบยืม-คืน ' + loan.id, html, loan.id);
}

function printRepairForm(id) {
  if(!id) { toast('ไม่พบรหัสงานซ่อม','red'); return; }
  const r = DB.repairs.find(x => x.id === id);
  if(!r) { toast('ไม่พบข้อมูลงานซ่อม','red'); return; }
  const asset = DB.assets.find(a => a.id === r.devId) || {};
  const pastRepairs = DB.repairs.filter(x => x.devId === r.devId && x.id !== r.id).slice(0, 5);

  const today = new Date();
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const printDate = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()+543}`;

  const pastRows = pastRepairs.length
        ? pastRepairs.map((pr,i) => `<tr><td style="text-align:center">${i+1}</td><td>${pr.id}</td><td>${pr.date}</td><td>${pr.sym}</td><td>${pr.status}</td><td>${pr.cost ? pr.cost.toLocaleString()+' ฿' : '—'}</td></tr>`).join('')
        : `<tr><td colspan="6" style="text-align:center;color:#94a3b8">ไม่มีประวัติการซ่อมก่อนหน้า</td></tr>`;

  const html = `
    <div class="doc-header">
      <div class="doc-logo">ศูนย์<br>เครื่องมือ<br>แพทย์</div>
      <div class="doc-org">
        <div class="doc-org-name">BMS HOSxP HOSPITAL — ศูนย์วิศวกรรมการแพทย์ (BMED)</div>
        <div class="doc-org-sub">BMS HOSxP HOSPITAL</div>
      </div>
      <div id="qr-container"></div>
    </div>

    <div class="doc-title-box"><h3>ใบแจ้งซ่อมเครื่องมือแพทย์ (Corrective Maintenance Report)</h3></div>

    <div class="doc-meta">
      <div class="doc-meta-item"><span class="lbl">เลขที่ใบแจ้งซ่อม:</span> <strong>${r.id}</strong></div>
      <div class="doc-meta-item"><span class="lbl">วันที่แจ้งซ่อม:</span> ${r.date}</div>
      <div class="doc-meta-item"><span class="lbl">สถานะปัจจุบัน:</span> <span class="badge-status">${r.status}</span></div>
      <div class="doc-meta-item"><span class="lbl">Downtime:</span> ${r.days || 0} วัน</div>
      <div class="doc-meta-item"><span class="lbl">วันที่พิมพ์:</span> ${printDate}</div>
    </div>

    <div class="section-title">ข้อมูลผู้แจ้งและสถานที่</div>
    <div class="info-grid">
      <div class="info-row"><span class="lbl">ผู้แจ้งซ่อม:</span><span>${r.reporter || '—'}</span></div>
      <div class="info-row"><span class="lbl">หน่วยงาน / แผนก:</span><span>${asset.dept || '—'}</span></div>
      <div class="info-row"><span class="lbl">สถานที่ซ่อม:</span><span>${r.location || '—'}</span></div>
        <div class="info-row"><span class="lbl">ประเภทงาน:</span><span style="font-weight:700;color:var(--teal)">${r.ext ? 'ส่งซ่อมภายนอก (External)' : 'ซ่อมหน้างาน (Internal)'}</span></div>
    </div>

    <div class="section-title">ข้อมูลเครื่องมือแพทย์</div>
    <div class="info-grid">
        <div class="info-row"><span class="lbl">รหัสครุภัณฑ์:</span><span style="font-weight:700">${r.devId}</span></div>
      <div class="info-row"><span class="lbl">ชื่ออุปกรณ์:</span><span>${asset.name || r.device}</span></div>
      <div class="info-row"><span class="lbl">ยี่ห้อ / รุ่น:</span><span>${asset.mfr||'—'} / ${asset.model||'—'}</span></div>
      <div class="info-row"><span class="lbl">Serial Number:</span><span>${asset.serial||'—'}</span></div>
      <div class="info-row"><span class="lbl">ทะเบียน อย.:</span><span>${asset.fda||'—'}</span></div>
      <div class="info-row"><span class="lbl">ระดับความเสี่ยง:</span><span>${asset.risk||'—'}</span></div>
      <div class="info-row"><span class="lbl">รหัส สนย.:</span><span>${asset.sny||'—'}</span></div>
        <div class="info-row"><span class="lbl">บริษัทตัวแทนจำหน่าย:</span><span>${asset.vendor||'—'}</span></div>
    </div>

    <div class="section-title">อาการเสียที่พบ</div>
    <div class="sym-box">${r.sym || '—'}</div>

    <div class="section-title">บันทึกการดำเนินงานซ่อม (BMED Section)</div>
    <div class="info-grid">
      <div class="info-row"><span class="lbl">ช่างผู้รับผิดชอบ:</span><span>${r.tech || '—'}</span></div>
      <div class="info-row"><span class="lbl">สาเหตุการชำรุด:</span><span>${r.cause || '—'}</span></div>
        <div class="info-row full"><span class="lbl">รายการอะไหล่ที่ใช้:</span><span>${r.parts || '—'}</span></div>
        <div class="info-row"><span class="lbl">ค่าใช้จ่ายการซ่อม:</span><span style="font-weight:700">${r.cost ? r.cost.toLocaleString()+' บาท' : '—'}</span></div>
    </div>

    <div class="section-title">ประวัติการซ่อมก่อนหน้า (Repair History)</div>
    <table>
      <thead><tr><th style="width:32px">#</th><th>CM ID</th><th>วันที่</th><th>อาการ</th><th>สถานะ</th><th>ค่าใช้จ่าย</th></tr></thead>
      <tbody>${pastRows}</tbody>
    </table>

    <div class="section-title">ภาพถ่ายประกอบการแจ้งซ่อม / การซ่อมบำรุง</div>
    <table style="table-layout: fixed; margin-bottom: 20px;">
      <tbody>
        <tr style="height: 220px;">
          <td style="text-align: center; color: #64748b; width: 50%; border: 1.5px dashed #94a3b8; background: #f8fafc;">
            <svg viewBox="0 0 24 24" style="width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:1.5;margin-bottom:12px;opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><br>
            [ ติดรูปภาพที่ 1 : สภาพก่อนซ่อม / จุดที่ชำรุด ]
          </td>
          <td style="text-align: center; color: #64748b; width: 50%; border: 1.5px dashed #94a3b8; background: #f8fafc;">
            <svg viewBox="0 0 24 24" style="width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:1.5;margin-bottom:12px;opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><br>
            [ ติดรูปภาพที่ 2 : สภาพหลังซ่อม / อะไหล่ที่เปลี่ยน ]
          </td>
        </tr>
      </tbody>
    </table>

    <div class="sigs">
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( ${r.reporter || '...........................................'} )</div><div class="sig-date">ผู้แจ้งซ่อม<br>วันที่ _____ / _____ / _____</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( ${r.tech || '...........................................'} )</div><div class="sig-date">ช่างผู้รับผิดชอบ<br>วันที่ _____ / _____ / _____</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-role">( ........................................... )</div><div class="sig-date">หัวหน้าศูนย์วิศวกรรมการแพทย์<br>วันที่ _____ / _____ / _____</div></div>
    </div>
  `;
  printDocument('ใบแจ้งซ่อม ' + r.id, html, r.id, 'portrait');
}

function printRepairApproval(id) {
  if(!id) { toast('ไม่พบรหัสงานซ่อม','red'); return; }
  const r = DB.repairs.find(x => x.id === id);
  if(!r) { toast('ไม่พบข้อมูลงานซ่อม','red'); return; }
  const asset = DB.assets.find(a => a.id === r.devId) || {};

  const today = new Date();
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const printDate = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()+543}`;
  const costStr = r.cost ? r.cost.toLocaleString() + ' บาท' : 'รอประเมิน';

  const cost = r.cost || 0;
  let approvalLevel, approvalSig;
  if (cost <= 10000) {
    approvalLevel = 'หัวหน้าศูนย์วิศวกรรมการแพทย์ (วงเงินไม่เกิน 10,000 บาท)';
    approvalSig = 'หัวหน้าศูนย์วิศวกรรมการแพทย์';
  } else if (cost <= 50000) {
    approvalLevel = 'รองผู้อำนวยการฝ่ายการแพทย์ (วงเงิน 10,001–50,000 บาท)';
    approvalSig = 'รองผู้อำนวยการฝ่ายการแพทย์';
  } else {
    approvalLevel = 'ผู้อำนวยการโรงพยาบาล (วงเงินเกิน 50,000 บาท)';
    approvalSig = 'ผู้อำนวยการโรงพยาบาล';
  }

  const html = `
    <div class="doc-header">
      <div class="doc-logo">ศูนย์<br>เครื่องมือ<br>แพทย์</div>
      <div class="doc-org">
        <div class="doc-org-name">BMS HOSxP HOSPITAL — ศูนย์วิศวกรรมการแพทย์ (BMED)</div>
        <div class="doc-org-sub">BMS HOSxP HOSPITAL</div>
      </div>
      <div id="qr-container"></div>
    </div>

    <div class="doc-title-box"><h3>บันทึกขออนุมัติดำเนินการซ่อมบำรุงเครื่องมือแพทย์</h3></div>

    <div class="official-from">
          <div><strong style="display:inline-block;width:50px">ที่:</strong> BMS/บมพ. ${r.id} / ${today.getFullYear()+543}</div>
          <div><strong style="display:inline-block;width:50px">วันที่:</strong> ${printDate}</div>
    </div>
    <div class="official-from">
          <div><strong style="display:inline-block;width:50px">เรื่อง:</strong> ขออนุมัติหลักการดำเนินการซ่อมบำรุงเครื่องมือแพทย์ ${asset.name || r.device} (${r.devId})</div>
          <div><strong style="display:inline-block;width:50px">เรียน:</strong> ${approvalLevel}</div>
    </div>

        <p class="body-text">ด้วยศูนย์วิศวกรรมการแพทย์ได้รับแจ้งว่าเครื่องมือแพทย์รายการดังกล่าวชำรุดเสียหาย ไม่สามารถใช้งานได้ตามปกติ ศูนย์ฯ จึงขออนุมัติหลักการดำเนินการซ่อมบำรุง เพื่อให้เครื่องมือแพทย์สามารถกลับมาใช้งานได้ตามมาตรฐานและมีความปลอดภัยต่อผู้ป่วย</p>

    <div class="section-title">รายละเอียดเครื่องมือแพทย์</div>
    <div class="info-grid">
          <div class="info-row"><span class="lbl">รหัสครุภัณฑ์:</span><span style="font-weight:700">${r.devId}</span></div>
      <div class="info-row"><span class="lbl">ชื่ออุปกรณ์:</span><span>${asset.name || r.device}</span></div>
      <div class="info-row"><span class="lbl">ยี่ห้อ / รุ่น:</span><span>${asset.mfr||'—'} / ${asset.model||'—'}</span></div>
      <div class="info-row"><span class="lbl">Serial Number:</span><span>${asset.serial||'—'}</span></div>
      <div class="info-row"><span class="lbl">ทะเบียน อย.:</span><span>${asset.fda||'—'}</span></div>
      <div class="info-row"><span class="lbl">ระดับความเสี่ยง:</span><span>${asset.risk||'—'}</span></div>
          <div class="info-row"><span class="lbl">หน่วยงานรับผิดชอบ:</span><span>${asset.dept||'—'}</span></div>
    </div>

        <div class="section-title">สาเหตุและอาการชำรุด</div>
    <div class="sym-box">${r.sym || '—'}</div>

    <div class="section-title">รายละเอียดงานซ่อมและประมาณการค่าใช้จ่าย</div>
    <table>
      <thead><tr><th>รายการ</th><th>รายละเอียด</th></tr></thead>
      <tbody>
            <tr><td style="font-weight:700;width:35%">ประเภทการซ่อม</td><td>${r.ext ? 'ส่งซ่อมภายนอก (External Vendor)' : 'ซ่อมหน้างานโดยช่างภายใน'}</td></tr>
            <tr><td style="font-weight:700">บริษัท / ช่างผู้รับผิดชอบ</td><td>${r.tech || '—'}</td></tr>
            <tr><td style="font-weight:700">สาเหตุการชำรุด</td><td>${r.cause || 'อยู่ระหว่างการวินิจฉัย'}</td></tr>
            <tr><td style="font-weight:700">อะไหล่ที่ต้องใช้</td><td>${r.parts || '—'}</td></tr>
            <tr><td style="font-weight:700">ประมาณการค่าซ่อม</td><td style="font-weight:700;color:#dc2626">${costStr}</td></tr>
            <tr><td style="font-weight:700">ระดับผู้อนุมัติ</td><td>${approvalLevel}</td></tr>
      </tbody>
    </table>

    <p class="body-text">จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ และหากมีข้อสงสัยประการใด กรุณาติดต่อ ศูนย์วิศวกรรมการแพทย์ โทร. 074-451-xxx</p>

        <div class="sigs" style="margin-top:60px">
      <div class="sig-box">
        <div class="sig-line"></div>
            <div class="sig-role">( ${r.tech || '...........................................'} )</div>
            <div class="sig-date">ผู้เสนอ (ช่างวิศวกรรม)<br>วันที่ _____ / _____ / _____</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
            <div class="sig-role">( ........................................... )</div>
            <div class="sig-date">หัวหน้าศูนย์วิศวกรรมการแพทย์<br>วันที่ _____ / _____ / _____</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
            <div class="sig-role">( ........................................... )</div>
            <div class="sig-date">${approvalSig}<br>วันที่ _____ / _____ / _____</div>
      </div>
    </div>
  `;
  printDocument('ใบอนุมัติซ่อม ' + r.id, html, r.id, 'portrait');
}

/* ════════════════════════════════
   KEYBOARD
════════════════════════════════ */
document.addEventListener('click', e => {
  const dd = document.getElementById('dct-device-dropdown');
  const srch = document.getElementById('dct-device-search');
  if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== srch) {
    dd.style.display = 'none';
  }
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape') {
    if(document.getElementById('shortcut-overlay').classList.contains('open')) { toggleShortcutHelp(); return; }
    const dd = document.getElementById('dct-device-dropdown');
    if (dd && dd.style.display !== 'none') { dd.style.display = 'none'; return; }
    closeDrawer(); hideSearchResults(); hideDeviceResults(); closeAddDeviceModal(); closeVendorModal(); closeQrScanner();
  }
  // Keyboard shortcuts (Alt+Key) — only when app shell is visible
  if(e.altKey && document.getElementById('app-shell').style.display!=='none') {
    const map = {'1':['dashboard','nav-dashboard'],'2':['assets','nav-assets'],'3':['loanregistry','nav-loanregistry'],'4':['pm','nav-pm'],'5':['repair','nav-repair'],'n':['newloan',null],'s':['settings','nav-settings']};
    const hit = map[e.key.toLowerCase()];
    if(hit) { e.preventDefault(); goto(hit[0], hit[1]?document.getElementById(hit[1]):null); }
  }
  // ? key — toggle shortcut cheatsheet
  if(e.key==='?' && !e.ctrlKey && !e.altKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
    toggleShortcutHelp();
  }
  // Ctrl+S — context-aware save
  if(e.ctrlKey && e.key==='s' && document.getElementById('app-shell').style.display!=='none') {
    e.preventDefault();
    const drawerBtn = document.querySelector('.drawer.open .drawer-foot .btn-teal:not(:disabled)');
    if(drawerBtn) { drawerBtn.click(); return; }
    const modalBtn = document.querySelector('.modal-overlay.open .modal-foot .btn-teal:not(:disabled)');
    if(modalBtn) { modalBtn.click(); return; }
    const loanBtn = document.getElementById('btn-submit-loan');
    if(loanBtn && !loanBtn.disabled) loanBtn.click();
  }
  // / key — focus global search
  if(e.key==='/' && !e.ctrlKey && !e.altKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !(document.activeElement.isContentEditable)) {
    e.preventDefault();
    const gs = document.getElementById('global-search');
    if(gs) { gs.focus(); gs.select(); }
  }
});

/* ════════════════════════════════
   LOGIN SYSTEM (Mockup)
════════════════════════════════ */
function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  const err = document.getElementById('login-err');

  // Lockout check (Item 10)
  const lockMsg = checkLoginLockout(u);
  if (lockMsg) {
    err.textContent = lockMsg;
    err.style.display = 'block';
    return;
  }

  const user = DB.users.find(x => x.username.toLowerCase() === u.toLowerCase() && x.password === p && x.active);
  if (user) {
    clearFailedLogin(u);
    currentUser = user;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('app-fab').style.display = canAccess('loans') ? 'grid' : 'none';
    err.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    err.style.display = 'none';
    addAuditLog('AUTH', user.name, 'เข้าสู่ระบบสำเร็จ', 'Role: '+user.role+' · IP: local');
    resetSessionTimer();
    applyRoleUI();
    updateSafetyNavBadge();
    updateSpareNavBadge();
    updateContractNavBadge();
    updateFSCANavBadge();
    try { initDashboardCharts(); } catch(e) { console.warn('Chart init:', e); }
  } else {
    recordFailedLogin(u);
    const rec = _failedLogins.get(u.toLowerCase()) || {};
    const remaining = Math.max(0, LOGIN_MAX_ATTEMPTS - (rec.count || 0));
    if (remaining > 0) {
      err.textContent = `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือ ${remaining} ครั้ง)`;
    } else {
      err.textContent = `บัญชีถูกล็อก 5 นาที เนื่องจากพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง`;
    }
    err.style.display = 'block';
  }
}

function doLogout() {
  clearTimeout(_sessionTimer); clearTimeout(_sessionWarnTimer);
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-err').textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  document.getElementById('login-err').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('app-fab').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
}

function applyRoleUI() {
  if (!currentUser) return;
  const perms = ROLE_PERMISSIONS[currentUser.role] || [];

  // อัปเดต sidebar user card
  const avatarEl = document.querySelector('.avatar');
  if (avatarEl) avatarEl.textContent = currentUser.avatar;
  const nameEl = document.querySelector('.user-name');
  if (nameEl) nameEl.textContent = currentUser.name;
  const roleEl = document.querySelector('.user-role');
  const roleLabels = { admin:'ผู้ดูแลระบบ (Admin)', bmed:'ช่างวิศวกรรมชีวการแพทย์', nurse:'พยาบาล', manager:'ผู้บริหาร / แพทย์' };
  if (roleEl) roleEl.textContent = roleLabels[currentUser.role] || currentUser.role;

  // แสดง/ซ่อน nav items ตาม role
  const navPerms = {
    'nav-assets':       'assets',
    'nav-qms':          'qms',
    'nav-decommission': 'assets',
    'nav-loanregistry': 'loans',
    'nav-pm':           'pm',
    'nav-cal':          'pm',
    'nav-repair':       'repair',
    'nav-incident':     'incident',
    'nav-fsca':         'fsca',
    'nav-audit':        'audit',
    'nav-reports':      'reports',
    'nav-settings':     'settings',
    'nav-safety':       'safety',
    'nav-spare':        'spare',
    'nav-contracts':    'contracts',
  };
  for (const [navId, perm] of Object.entries(navPerms)) {
    const el = document.getElementById(navId);
    if (el) el.style.display = perms.includes(perm) ? '' : 'none';
  }

  // ซ่อน nav-section ที่ไม่มี item แสดง
  document.querySelectorAll('.nav-section').forEach(section => {
    const items = section.querySelectorAll('.ni');
    const hasVisible = [...items].some(el => el.style.display !== 'none');
    section.style.display = hasVisible ? '' : 'none';
  });
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  loadDB(); // Item 1: restore persisted data
  refreshSelectOptions();
  refreshDashboard();
  renderDeviceCards();
  renderLoanRegistry();
  renderPMTable();
  renderPMCalendar();
  renderRepairTable();
  renderIncidentTable();
  renderQMS();
  renderIncomingQC();
  populateRepairDevices();
  updateFSCANavBadge();
  
  // Hide Splash Screen
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.visibility = 'hidden';
      setTimeout(() => splash.remove(), 500);
    }
  }, 1500);
});
/* ════════════════════════════════════════════════════════════════
   ITEM 3 — ISO 14971 NUMERICAL RISK SCORE (5x5 Matrix)
════════════════════════════════════════════════════════════════ */
function riskInfo(score) {
  if (score >= 15) return {level:'สูงมาก (High)',    color:'#dc2626', bg:'#fef2f2'};
  if (score >= 9)  return {level:'กลาง (Medium)',     color:'#d97706', bg:'#fffbeb'};
  if (score >= 4)  return {level:'ต่ำ (Low)',          color:'#16a34a', bg:'#f0fdf4'};
  return              {level:'ต่ำมาก (Negligible)', color:'#64748b', bg:'#f8fafc'};
}

function openRiskModal(assetId) {
  const asset = DB.assets.find(a => a.id === assetId);
  if (!asset) return;
  document.getElementById('risk-modal-asset-name').textContent = asset.name + ' (' + asset.id + ')';
  document.getElementById('risk-asset-id').value  = assetId;
  document.getElementById('risk-p').value         = asset.riskP || 3;
  document.getElementById('risk-s').value         = asset.riskS || 3;
  document.getElementById('risk-rationale').value = asset.riskRationale || '';
  updateRiskPreview();
  document.getElementById('modal-risk').classList.add('open');
}
function closeRiskModal() { document.getElementById('modal-risk').classList.remove('open'); }

function updateRiskPreview() {
  const p     = parseInt(document.getElementById('risk-p').value) || 3;
  const s     = parseInt(document.getElementById('risk-s').value) || 3;
  const score = p * s;
  const info  = riskInfo(score);
  const el    = document.getElementById('risk-score-preview');
  el.style.background = info.bg;
  el.style.border     = '2px solid ' + info.color + '55';
  el.innerHTML = '<div style="font-size:36px;font-weight:800;color:' + info.color + '">' + score + '</div>'
    + '<div style="font-weight:700;color:' + info.color + ';font-size:13px">' + info.level + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px">P=' + p + ' x S=' + s + '</div>';
}

function saveRiskScore() {
  const assetId   = document.getElementById('risk-asset-id').value;
  const p         = parseInt(document.getElementById('risk-p').value);
  const s         = parseInt(document.getElementById('risk-s').value);
  const rationale = document.getElementById('risk-rationale').value.trim();
  const score     = p * s;
  const info      = riskInfo(score);
  const idx       = DB.assets.findIndex(a => a.id === assetId);
  if (idx < 0) { toast('ไม่พบอุปกรณ์', 'red'); return; }
  DB.assets[idx].riskP         = p;
  DB.assets[idx].riskS         = s;
  DB.assets[idx].riskScore     = score;
  DB.assets[idx].riskLevel14971= info.level;
  DB.assets[idx].riskRationale = rationale;
  DB.assets[idx].riskDate      = new Date().toLocaleDateString('th-TH');
  addAuditLog('RISK', currentUserName(), 'ประเมินความเสี่ยง ISO 14971', assetId + ' Score=' + score + ' (' + info.level + ')');
  closeRiskModal();
  toast('บันทึกคะแนนความเสี่ยง ' + score + ' (' + info.level + ') สำเร็จ', 'teal');
  renderAssetsTable();
}

/* ════════════════════════════════════════════════════════════════
   ITEM 4 — FSCA / RECALL MODULE (ECRI, ISO 13485 §8.5.2)
════════════════════════════════════════════════════════════════ */
function renderFSCATable() {
  const tbody = document.getElementById('fsca-tbody');
  if (!tbody) return;
  if (!DB.fsca) DB.fsca = [];
  const rows = DB.fsca.map(function(f) {
    const sc = f.status === 'ปิดแล้ว' ? 'green' : f.status === 'ดำเนินการแล้ว' ? 'teal' : 'red';
    const tc = f.type === 'Recall' ? 'red' : f.type === 'Hazard Alert' ? 'amber' : 'blue';
    return '<tr>'
      + '<td><span class="mono" style="font-weight:700">' + f.id + '</span><div style="font-size:10px;color:var(--text3)">' + (f.date || '') + '</div></td>'
      + '<td><div style="font-weight:600">' + f.title + '</div><div style="font-size:11px;color:var(--text2)">' + (f.mfr || '') + ' ' + (f.model || '') + '</div></td>'
      + '<td><span class="badge ' + tc + '">' + f.type + '</span></td>'
      + '<td style="font-size:11px">' + (f.affectedDevices || []).map(function(id) { return '<span class="mono">' + id + '</span>'; }).join('<br>') + '</td>'
      + '<td><span class="badge ' + sc + '">' + f.status + '</span></td>'
      + '<td style="max-width:180px;white-space:normal;font-size:12px">' + (f.action || '—') + '</td>'
      + '<td><button class="btn btn-sm" onclick="openFSCADrawer(\'' + f.id + '\')">จัดการ</button></td>'
      + '</tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">ไม่มีรายการ FSCA / Recall</td></tr>';
  tbody.innerHTML = rows;
}

var _editingFSCAId = null;

function openFSCACreateDrawer() {
  _editingFSCAId = null;
  document.getElementById('fsca-drawer-title').textContent = 'สร้าง FSCA Notice ใหม่';
  document.getElementById('fsca-id-preview').textContent   = previewDocId('fsca');
  ['fsca-title', 'fsca-mfr', 'fsca-model', 'fsca-source', 'fsca-action', 'fsca-affected'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('fsca-type').value   = 'Safety Alert';
  document.getElementById('fsca-status').value = 'รอดำเนินการ';
  document.getElementById('fsca-date').value   = new Date().toISOString().split('T')[0];
  openDrawer('drawer-fsca');
}

function openFSCADrawer(id) {
  const f = DB.fsca.find(function(x) { return x.id === id; });
  if (!f) return;
  _editingFSCAId = id;
  document.getElementById('fsca-drawer-title').textContent = 'จัดการ FSCA: ' + id;
  document.getElementById('fsca-id-preview').textContent   = id;
  document.getElementById('fsca-title').value    = f.title || '';
  document.getElementById('fsca-mfr').value      = f.mfr || '';
  document.getElementById('fsca-model').value    = f.model || '';
  document.getElementById('fsca-type').value     = f.type || 'Safety Alert';
  document.getElementById('fsca-source').value   = f.source || '';
  document.getElementById('fsca-action').value   = f.action || '';
  document.getElementById('fsca-affected').value = (f.affectedDevices || []).join(', ');
  document.getElementById('fsca-status').value   = f.status || 'รอดำเนินการ';
  document.getElementById('fsca-date').value     = f.dateIso || new Date().toISOString().split('T')[0];
  openDrawer('drawer-fsca');
}

function saveFSCA() {
  const title = document.getElementById('fsca-title').value.trim();
  if (!title) { toast('กรุณาระบุหัวข้อ FSCA', 'red'); return; }
  const dateIso  = document.getElementById('fsca-date').value;
  const affected = document.getElementById('fsca-affected').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  const obj = {
    title:           title,
    mfr:             document.getElementById('fsca-mfr').value.trim(),
    model:           document.getElementById('fsca-model').value.trim(),
    type:            document.getElementById('fsca-type').value,
    source:          document.getElementById('fsca-source').value.trim(),
    action:          document.getElementById('fsca-action').value.trim(),
    affectedDevices: affected,
    status:          document.getElementById('fsca-status').value,
    dateIso:         dateIso,
    date:            dateIso ? formatDateThai(dateIso) : '—',
  };
  if (_editingFSCAId) {
    const idx = DB.fsca.findIndex(function(x) { return x.id === _editingFSCAId; });
    if (idx > -1) DB.fsca[idx] = Object.assign({}, DB.fsca[idx], obj);
    addAuditLog('FSCA', currentUserName(), 'อัปเดต FSCA', _editingFSCAId + ' ' + title);
    toast('อัปเดต FSCA สำเร็จ', 'teal');
  } else {
    obj.id = nextDocId('fsca');
    DB.fsca.push(obj);
    addAuditLog('FSCA', currentUserName(), 'สร้าง FSCA Notice', obj.id + ' ' + title);
    toast('สร้าง FSCA ' + obj.id + ' สำเร็จ', 'teal');
  }
  saveDB();
  closeDrawer();
  renderFSCATable();
  updateFSCANavBadge();
}

function updateFSCANavBadge() {
  const el = document.getElementById('nb-fsca');
  if (!el) return;
  const open = (DB.fsca || []).filter(function(f) { return f.status === 'รอดำเนินการ'; }).length;
  el.textContent    = open;
  el.style.display  = open ? '' : 'none';
}

/* ════════════════════════════════════════════════════════════════
   ITEM 5 — DYNAMIC MTBF / MTTR / AVAILABILITY
════════════════════════════════════════════════════════════════ */
function calcReliabilityKPIs() {
  const done      = DB.repairs.filter(function(r) { return r.status === 'ซ่อมเสร็จ' || r.status === 'คืนแล้ว' || r.status === 'ปิดงาน'; });
  const totalDays = done.reduce(function(s, r) { return s + (r.days || 0); }, 0);
  const mttr      = done.length ? totalDays / done.length : 0;
  const active    = DB.assets.filter(function(a) { return a.status !== 'จำหน่าย/แทงจำหน่าย'; }).length;
  const failRate  = active > 0 ? DB.repairs.length / active : 0;
  const mtbf      = failRate > 0 ? 365 / failRate : 365;
  const avail     = mtbf > 0 ? (mtbf / (mtbf + mttr)) * 100 : 100;
  return {
    mttrHrs:  (mttr * 24).toFixed(1),
    mtbfDays: mtbf.toFixed(0),
    availPct: avail.toFixed(1),
  };
}

function refreshReportsKPIDynamic() {
  const kpis   = calcReliabilityKPIs();
  const elMttr = document.getElementById('kpi-mttr-box');
  if (elMttr) {
    const ok = parseFloat(kpis.mttrHrs) <= 48;
    elMttr.innerHTML = '<div class="kpi-label">MTTR เฉลี่ย</div>'
      + '<div class="kpi-value">' + kpis.mttrHrs + ' ชม.</div>'
      + '<div class="kpi-meta">เป้า ≤ 48 ชม. ' + (ok ? '✓' : '✗') + '</div>'
      + '<div class="kpi-bar"><div class="kpi-fill" style="width:' + Math.min(100, parseFloat(kpis.mttrHrs) / 48 * 100).toFixed(0) + '%;background:var(--blue)"></div></div>';
  }
  const elAvail = document.getElementById('kpi-uptime-box');
  if (elAvail) {
    const ok2 = parseFloat(kpis.availPct) >= 95;
    elAvail.innerHTML = '<div class="kpi-label">Uptime เฉลี่ย</div>'
      + '<div class="kpi-value">' + kpis.availPct + '%</div>'
      + '<div class="kpi-meta">เป้า ≥ 95% ' + (ok2 ? '✓' : '✗') + '</div>'
      + '<div class="kpi-bar"><div class="kpi-fill" style="width:' + kpis.availPct + '%;background:var(--teal)"></div></div>';
  }
}

/* ════════════════════════════════════════════════════════════════
   ITEM 6 — CAL CERTIFICATE LINK (ISO 13485 §7.6 / NIMT)
════════════════════════════════════════════════════════════════ */
function linkCalCert(pmId) {
  const pm = DB.pmList.find(function(x) { return x.id === pmId && x.kind === 'cal'; });
  if (!pm) { toast('ไม่พบงานสอบเทียบ', 'red'); return; }
  popPrompt('กรอกเลขที่ใบรับรองการสอบเทียบ (Certificate No.):', '', 'บันทึก Cal Certificate').then(function(certNo) {
    if (!certNo || !certNo.trim()) return;
    const certDate = new Date().toLocaleDateString('th-TH');
    pm.certNo   = certNo.trim();
    pm.certDate = certDate;
    const asset = DB.assets.find(function(a) { return a.id === pm.devId; });
    if (asset) {
      if (!asset.calCerts) asset.calCerts = [];
      asset.calCerts.push({ certNo: certNo.trim(), date: certDate, pmId: pmId, resp: pm.resp || '' });
      asset.calLastCert     = certNo.trim();
      asset.calLastCertDate = certDate;
    }
    addAuditLog('CAL', currentUserName(), 'บันทึก Cal Certificate', pm.devId + ' Cert:' + certNo.trim() + ' (' + pmId + ')');
    toast('บันทึก Cal Certificate สำเร็จ', 'teal');
    renderPMTable();
  });
}

/* ════════════════════════════════════════════════════════════════
   ITEM 7 — INCOMING QC WORKFLOW (ISO 13485 §7.4.3)
════════════════════════════════════════════════════════════════ */
var IQC_CHECKLIST_ITEMS = [
  'บรรจุภัณฑ์ครบถ้วน ไม่มีรอยชำรุด',
  'ตรงกับ PO/Invoice: ชื่อ รุ่น Serial Number',
  'เอกสาร IFU / Manual ครบถ้วน',
  'มีใบรับรอง CE / TIS / อย. (Thai FDA)',
  'เปิดเครื่องได้ ไม่มี Error code',
  'Accessories ครบตาม Packing List',
  'ทดสอบ Function หลักผ่าน',
  'Electrical Safety test ผ่าน (IEC 62353)',
];

function renderIncomingQC() {
  const tbody = document.getElementById('incoming-qc-tbody');
  if (!tbody) return;
  if (!DB.incomingQC) DB.incomingQC = [];
  const rows = DB.incomingQC.map(function(q) {
    const sc = q.decision === 'ผ่าน (Accept)' ? 'green' : q.decision === 'ไม่ผ่าน (Reject)' ? 'red' : 'amber';
    return '<tr>'
      + '<td><span class="mono" style="font-weight:700">' + q.id + '</span><div style="font-size:10px;color:var(--text3)">' + (q.date || '') + '</div></td>'
      + '<td><span class="mono">' + q.devId + '</span><div style="font-size:11px">' + (q.devName || '') + '</div></td>'
      + '<td>' + (q.inspector || '—') + '</td>'
      + '<td><span class="badge ' + sc + '">' + (q.decision || 'รอตรวจ') + '</span></td>'
      + '<td style="max-width:160px;font-size:12px">' + (q.note || '—') + '</td>'
      + '<td><button class="btn btn-sm" onclick="viewIQCDetail(\'' + q.id + '\')">รายละเอียด</button></td>'
      + '</tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">ไม่มีรายการตรวจรับ</td></tr>';
  tbody.innerHTML = rows;
}

var _iqcEditId = null;

function openNewIQCDrawer() {
  _iqcEditId = null;
  document.getElementById('iqc-drawer-title').textContent = 'ตรวจรับเครื่องมือ (Incoming QC)';
  document.getElementById('iqc-id-preview').textContent   = previewDocId('incomingQC');
  document.getElementById('iqc-dev-id').value    = '';
  document.getElementById('iqc-dev-name').value  = '';
  document.getElementById('iqc-inspector').value = currentUser ? currentUser.name : '';
  document.getElementById('iqc-date').value      = new Date().toISOString().split('T')[0];
  document.getElementById('iqc-decision').value  = '';
  document.getElementById('iqc-note').value      = '';
  renderIQCChecklist([]);
  openDrawer('drawer-incoming-qc');
}

function viewIQCDetail(id) {
  const q = DB.incomingQC.find(function(x) { return x.id === id; });
  if (!q) return;
  _iqcEditId = id;
  document.getElementById('iqc-drawer-title').textContent = 'ผลตรวจรับ: ' + id;
  document.getElementById('iqc-id-preview').textContent   = id;
  document.getElementById('iqc-dev-id').value    = q.devId || '';
  document.getElementById('iqc-dev-name').value  = q.devName || '';
  document.getElementById('iqc-inspector').value = q.inspector || '';
  document.getElementById('iqc-date').value      = q.dateIso || '';
  document.getElementById('iqc-decision').value  = q.decision || '';
  document.getElementById('iqc-note').value      = q.note || '';
  renderIQCChecklist(q.checklist || []);
  openDrawer('drawer-incoming-qc');
}

function renderIQCChecklist(saved) {
  const el = document.getElementById('iqc-checklist-body');
  if (!el) return;
  el.innerHTML = IQC_CHECKLIST_ITEMS.map(function(item, i) {
    const prev    = saved[i];
    const checked = prev ? prev.pass : false;
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">'
      + '<input type="checkbox" id="iqc-chk-' + i + '" ' + (checked ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;accent-color:var(--teal)">'
      + '<label for="iqc-chk-' + i + '" style="font-size:12px;cursor:pointer;flex:1">' + item + '</label>'
      + '</div>';
  }).join('');
}

function saveIncomingQC() {
  const devId    = document.getElementById('iqc-dev-id').value.trim();
  const devName  = document.getElementById('iqc-dev-name').value.trim();
  const decision = document.getElementById('iqc-decision').value;
  if (!devId)    { toast('กรุณาระบุรหัสอุปกรณ์', 'red'); return; }
  if (!decision) { toast('กรุณาเลือกผลการตรวจรับ', 'red'); return; }
  const dateIso  = document.getElementById('iqc-date').value;
  const chkResults = IQC_CHECKLIST_ITEMS.map(function(item, i) {
    var chk = document.getElementById('iqc-chk-' + i);
    return { item: item, pass: !!(chk && chk.checked) };
  });
  const passCount = chkResults.filter(function(c) { return c.pass; }).length;
  const obj = {
    id:         nextDocId('incomingQC'),
    devId:      devId,
    devName:    devName,
    inspector:  document.getElementById('iqc-inspector').value.trim(),
    dateIso:    dateIso,
    date:       dateIso ? formatDateThai(dateIso) : '—',
    decision:   decision,
    note:       document.getElementById('iqc-note').value.trim(),
    checklist:  chkResults,
    passCount:  passCount,
    totalCount: IQC_CHECKLIST_ITEMS.length,
  };
  DB.incomingQC.push(obj);
  if (decision === 'ผ่าน (Accept)') {
    const asset = DB.assets.find(function(a) { return a.id === devId; });
    if (asset && (asset.status === 'รอตรวจสอบ' || asset.status === 'จอง/รอตรวจสอบ')) {
      asset.status = 'พร้อมใช้';
    }
  }
  if (decision === 'ไม่ผ่าน (Reject)') {
    const repId = nextDocId('repair');
    DB.repairs.push({
      id: repId, devId: devId, device: devName,
      sym: 'ไม่ผ่านการตรวจรับ (Incoming QC Reject) — ' + (obj.note || ''),
      reporter: obj.inspector, date: obj.date, days: 0,
      status: 'รอดำเนินการ', ext: false, cost: 0, cause: 'ไม่ผ่าน Incoming QC', parts: '', tech: '',
    });
    toast('สร้างใบแจ้งซ่อม ' + repId + ' อัตโนมัติ', 'amber');
  }
  addAuditLog('QC', currentUserName(), 'ตรวจรับ ' + decision,
    devId + ' ' + devName + ' (' + obj.id + ') ' + passCount + '/' + IQC_CHECKLIST_ITEMS.length + ' รายการผ่าน');
  saveDB();
  closeDrawer();
  renderIncomingQC();
  toast('บันทึกผลตรวจรับ ' + obj.id + ' สำเร็จ', 'teal');
}

/* ════════════════════════════════════════════════════════════════
   ITEM 8 — ANNUAL BUDGET PLANNING (HA Thailand §3.3)
════════════════════════════════════════════════════════════════ */
function calcBudgetData() {
  var byDept = {};
  DB.assets.filter(function(a) { return a.status !== 'จำหน่าย/แทงจำหน่าย'; }).forEach(function(asset) {
    var dept = asset.dept || 'ไม่ระบุ';
    if (!byDept[dept]) byDept[dept] = { pmCost: 0, calCost: 0, spareCost: 0, total: 0, count: 0 };
    byDept[dept].count++;
    var pmCost    = DB.pmList.filter(function(p) { return p.devId === asset.id && p.kind === 'pm'; })
                             .reduce(function(s, p) { return s + (p.cost || 0); }, 0);
    var calCost   = DB.pmList.filter(function(p) { return p.devId === asset.id && p.kind === 'cal'; })
                             .reduce(function(s, p) { return s + (p.cost || 0); }, 0);
    var spareCost = DB.spareParts.filter(function(s) { return s.compatible === asset.id; })
                                 .reduce(function(s2, s) { return s2 + (s.unitCost || 0) * (s.qty || 0); }, 0);
    byDept[dept].pmCost    += pmCost;
    byDept[dept].calCost   += calCost;
    byDept[dept].spareCost += spareCost;
    byDept[dept].total     += pmCost + calCost + spareCost;
  });
  return byDept;
}

function renderBudgetPanel() {
  var el = document.getElementById('budget-panel-body');
  if (!el) return;
  var byDept = calcBudgetData();
  var rows = Object.entries(byDept).sort(function(a, b) { return b[1].total - a[1].total; })
    .map(function(entry) {
      var dept = entry[0]; var d = entry[1];
      return '<tr>'
        + '<td>' + dept + '</td>'
        + '<td style="text-align:right">' + d.count + '</td>'
        + '<td style="text-align:right">' + d.pmCost.toLocaleString() + '</td>'
        + '<td style="text-align:right">' + d.calCost.toLocaleString() + '</td>'
        + '<td style="text-align:right">' + d.spareCost.toLocaleString() + '</td>'
        + '<td style="text-align:right;font-weight:700;color:var(--teal)">' + d.total.toLocaleString() + '</td>'
        + '</tr>';
    }).join('');
  var grand = Object.values(byDept).reduce(function(s, d) { return s + d.total; }, 0);
  el.innerHTML = '<div style="margin-bottom:10px;font-size:12px;color:var(--text2)">ประมาณการจาก PM/Cal Work Orders และมูลค่าอะไหล่ Compatible แยกตามแผนก (บาท)</div>'
    + '<table class="tbl">'
    + '<thead><tr><th>แผนก</th><th style="text-align:right">อุปกรณ์</th><th style="text-align:right">ค่า PM</th><th style="text-align:right">ค่า Cal</th><th style="text-align:right">อะไหล่</th><th style="text-align:right">รวม (บาท)</th></tr></thead>'
    + '<tbody>' + (rows || '<tr><td colspan="6" style="text-align:center;color:var(--text3)">ไม่มีข้อมูล</td></tr>') + '</tbody>'
    + '<tfoot><tr style="font-weight:700;background:var(--bg2)"><td colspan="5" style="text-align:right">งบประมาณรวม</td><td style="text-align:right;color:var(--teal)">' + grand.toLocaleString() + ' บาท</td></tr></tfoot>'
    + '</table>';
}

/* ════════════════════════════════════════════════════════════════
   ITEM 9 — HA/JCI COMPLIANCE REPORT (HA Thailand / JCI ME)
════════════════════════════════════════════════════════════════ */
function generateComplianceReport() {
  var pmWOs   = DB.pmList.filter(function(p) { return p.kind === 'pm'; });
  var calWOs  = DB.pmList.filter(function(p) { return p.kind === 'cal'; });
  var pmRate  = pmWOs.length  ? (pmWOs.filter(function(p)  { return p.status === 'เสร็จสิ้น'; }).length / pmWOs.length  * 100).toFixed(1) : '0';
  var calRate = calWOs.length ? (calWOs.filter(function(p) { return p.status === 'เสร็จสิ้น'; }).length / calWOs.length * 100).toFixed(1) : '0';
  var safetyPass = DB.safetyTests.filter(function(t) { return t.result === 'ผ่าน (Pass)'; }).length;
  var safetyRate = DB.safetyTests.length ? (safetyPass / DB.safetyTests.length * 100).toFixed(1) : '0';
  var openInc    = DB.incidents.filter(function(i) { return i.status !== 'ปิดแล้ว (Closed)'; }).length;
  var kpis       = calcReliabilityKPIs();
  var activeAssets = DB.assets.filter(function(a) { return a.status !== 'จำหน่าย/แทงจำหน่าย'; });
  var depts = activeAssets.map(function(a) { return a.dept; }).filter(function(v, i, arr) { return arr.indexOf(v) === i; });

  var deptRows = depts.map(function(dept) {
    var ids  = activeAssets.filter(function(a) { return a.dept === dept; }).map(function(a) { return a.id; });
    var dpm  = pmWOs.filter(function(p) { return ids.indexOf(p.devId) > -1; });
    var done = dpm.filter(function(p) { return p.status === 'เสร็จสิ้น'; }).length;
    var rate = dpm.length ? (done / dpm.length * 100).toFixed(0) : 'N/A';
    var col  = parseFloat(rate) >= 80 ? '#16a34a' : parseFloat(rate) >= 60 ? '#d97706' : '#dc2626';
    return '<tr><td>' + dept + '</td><td>' + dpm.length + '</td><td>' + done + '</td><td style="font-weight:700;color:' + col + '">' + rate + '%</td></tr>';
  }).join('');

  var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var d = new Date();
  var printDate = d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);

  var html = '<style>'
    + 'body{font-family:"Noto Sans Thai",sans-serif;font-size:12px;color:#1e293b;line-height:1.6}'
    + 'h2{color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:6px;margin-top:0}'
    + 'h3{font-size:13px;margin:18px 0 6px;color:#0f172a}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
    + 'th{background:#f1f5f9;padding:5px 8px;text-align:left;font-weight:700;font-size:11px}'
    + 'td{padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}'
    + '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}'
    + '.kpi-b{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}'
    + '.kpi-b .n{font-size:24px;font-weight:800;color:#0d9488}.kpi-b .l{font-size:10px;color:#64748b}'
    + '</style>'
    + '<h2>รายงานความสอดคล้องมาตรฐาน HA Thailand / JCI</h2>'
    + '<div style="color:#64748b;margin-bottom:10px">วันที่: ' + printDate + ' | จัดทำโดย: ' + currentUserName() + '</div>'
    + '<div class="kpis">'
    + '<div class="kpi-b"><div class="n">' + pmRate + '%</div><div class="l">PM Completion</div></div>'
    + '<div class="kpi-b"><div class="n">' + calRate + '%</div><div class="l">Cal Completion</div></div>'
    + '<div class="kpi-b"><div class="n">' + kpis.availPct + '%</div><div class="l">Availability</div></div>'
    + '<div class="kpi-b"><div class="n">' + openInc + '</div><div class="l">Open Incidents</div></div>'
    + '</div>'
    + '<h3>PM Completion แยกตามแผนก</h3>'
    + '<table><thead><tr><th>แผนก</th><th>PM ทั้งหมด</th><th>เสร็จสิ้น</th><th>Rate</th></tr></thead>'
    + '<tbody>' + (deptRows || '<tr><td colspan="4" style="text-align:center">ไม่มีข้อมูล</td></tr>') + '</tbody></table>'
    + '<h3>สรุปอุบัติการณ์</h3>'
    + '<table><thead><tr><th>INC#</th><th>วันที่</th><th>อุปกรณ์</th><th>Severity</th><th>สถานะ</th></tr></thead>'
    + '<tbody>' + (DB.incidents.map(function(i) { return '<tr><td>' + i.id + '</td><td>' + i.date + '</td><td>' + i.device + '</td><td>' + i.severity + '</td><td>' + i.status + '</td></tr>'; }).join('') || '<tr><td colspan="5" style="text-align:center">ไม่มีข้อมูล</td></tr>') + '</tbody></table>'
    + '<h3>ทดสอบความปลอดภัยไฟฟ้า IEC 62353 (Pass Rate: ' + safetyRate + '%)</h3>'
    + '<table><thead><tr><th>EST#</th><th>อุปกรณ์</th><th>วันที่</th><th>ผู้ทดสอบ</th><th>ผล</th></tr></thead>'
    + '<tbody>' + (DB.safetyTests.map(function(t) {
        var col2 = t.result.indexOf('ผ่าน') > -1 ? '#16a34a' : '#dc2626';
        return '<tr><td>' + t.id + '</td><td>' + t.device + '</td><td>' + t.testDate + '</td><td>' + t.tech + '</td><td style="color:' + col2 + ';font-weight:700">' + t.result + '</td></tr>';
      }).join('') || '<tr><td colspan="5" style="text-align:center">ไม่มีข้อมูล</td></tr>') + '</tbody></table>'
    + '<h3>FSCA / Recall Notices (' + (DB.fsca || []).length + ' รายการ)</h3>'
    + '<table><thead><tr><th>FSCA#</th><th>วันที่</th><th>หัวข้อ</th><th>ประเภท</th><th>สถานะ</th></tr></thead>'
    + '<tbody>' + ((DB.fsca || []).map(function(f) { return '<tr><td>' + f.id + '</td><td>' + (f.date || '') + '</td><td>' + f.title + '</td><td>' + f.type + '</td><td>' + f.status + '</td></tr>'; }).join('') || '<tr><td colspan="5" style="text-align:center">ไม่มีข้อมูล FSCA</td></tr>') + '</tbody></table>';

  printDocument('รายงาน HA/JCI Compliance ' + printDate, html, null, 'portrait');
  addAuditLog('REPORT', currentUserName(), 'ออกรายงาน HA/JCI Compliance', printDate);
}

function exportComplianceCSV() {
  var pmWOs   = DB.pmList.filter(function(p) { return p.kind === 'pm'; });
  var calWOs  = DB.pmList.filter(function(p) { return p.kind === 'cal'; });
  var pmRate  = pmWOs.length  ? (pmWOs.filter(function(p)  { return p.status === 'เสร็จสิ้น'; }).length / pmWOs.length  * 100).toFixed(1) : '0';
  var calRate = calWOs.length ? (calWOs.filter(function(p) { return p.status === 'เสร็จสิ้น'; }).length / calWOs.length * 100).toFixed(1) : '0';
  var safetyPass = DB.safetyTests.filter(function(t) { return t.result === 'ผ่าน (Pass)'; }).length;
  var safetyRate = DB.safetyTests.length ? (safetyPass / DB.safetyTests.length * 100).toFixed(1) : '0';
  var openInc    = DB.incidents.filter(function(i) { return i.status !== 'ปิดแล้ว (Closed)'; }).length;
  var kpis       = calcReliabilityKPIs();
  var rows = [
    ['﻿ตัวชี้วัด', 'ค่า', 'เป้าหมาย', 'ผ่าน/ไม่ผ่าน'],
    ['PM Completion Rate', pmRate + '%', '≥80%', parseFloat(pmRate) >= 80 ? 'ผ่าน' : 'ไม่ผ่าน'],
    ['Cal Completion Rate', calRate + '%', '100%', parseFloat(calRate) === 100 ? 'ผ่าน' : 'ไม่ผ่าน'],
    ['Electrical Safety Pass Rate', safetyRate + '%', '100%', parseFloat(safetyRate) === 100 ? 'ผ่าน' : 'ไม่ผ่าน'],
    ['Open Incidents', openInc, '0', openInc === 0 ? 'ผ่าน' : 'ไม่ผ่าน'],
    ['Availability (Uptime)', kpis.availPct + '%', '≥95%', parseFloat(kpis.availPct) >= 95 ? 'ผ่าน' : 'ไม่ผ่าน'],
    ['MTTR เฉลี่ย', kpis.mttrHrs + ' ชม.', '≤48 ชม.', parseFloat(kpis.mttrHrs) <= 48 ? 'ผ่าน' : 'ไม่ผ่าน'],
  ];
  var csv  = rows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'compliance_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('ดาวน์โหลด CSV สำเร็จ', 'teal');
}

/* ════════════════════════════════════════════════════════════════
   PRINT ASSET LABEL (QR CODE STICKER)
════════════════════════════════════════════════════════════════ */
function printAssetLabel(id) {
  const a = DB.assets.find(x => x.id === id);
  if (!a) { toast('ไม่พบข้อมูลอุปกรณ์', 'red'); return; }
  
  const printWindow = window.open('', '_blank', 'width=500,height=400');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>Print Label - ${a.id}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
      <style>
        @media print { @page { margin: 0; size: auto; } body { margin: 0; } }
        body { font-family: 'Sarabun', sans-serif; display: flex; justify-content: center; padding-top: 20px; }
        .label-box { width: 6.5cm; height: 3.5cm; border: 1px solid #cbd5e1; padding: 10px; display: flex; align-items: center; gap: 12px; border-radius: 8px; }
        .info { font-size: 11px; line-height: 1.3; color: #0f172a; flex: 1; overflow: hidden; }
        .title { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
        .dept { font-size: 10px; padding: 2px 6px; background: #e2e8f0; border-radius: 4px; display: inline-block; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="label-box">
        <div id="qr-code"></div>
        <div class="info">
          <div class="title">${a.id}</div>
          <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.name}</div>
          <div>S/N: ${a.serial || '-'}</div>
          <div class="dept">แผนก: ${a.dept}</div>
        </div>
      </div>
      <script>
        new QRCode(document.getElementById("qr-code"), { text: "${a.id}", width: 75, height: 75, colorDark: "#0f172a", colorLight: "#ffffff" });
        setTimeout(function() { window.print(); }, 500);
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
