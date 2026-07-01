// ============================================================
//  d3v NEXUS v4.0 — Full App Logic
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDtY4F7lGiCTPsHJaGJkmDKoqnkOzPs6is",
  authDomain: "all-in-one-428f7.firebaseapp.com",
  projectId: "all-in-one-428f7",
  storageBucket: "all-in-one-428f7.firebasestorage.app",
  messagingSenderId: "1082420226312",
  appId: "1:1082420226312:web:11a933323a9d4fd5e724bd"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const gProvider = new firebase.auth.GoogleAuthProvider();

//auth.getRedirectResult().then(r => { if (r.user) initApp(r.user); }).catch(console.error);
//auth.onAuthStateChanged(u => { if (u) initApp(u); else showSignIn(); });

// ===== STATE =====
let user = null;
let expenses = [], income = [], recurring = [], dailyReports = [], visitReports = [];
let cfg = { monthlyBudget: 0, catBudgets: {} };
let tab = 'home', txType = 'expense', selCat = null;
let recExp = false, recInc = false;
let period = 'month', hFilter = 'all';
let delTarget = null, charts = {}, budgetFlags = {};
let notifOn = false, reportTab = 'daily';
let lastSyncedAt = null;
let viewMonthOff = 0;
let csvState = { t: { expense: true, income: true }, group: 'none', cols: {}, exportType: 'expense' };
let amountHasValue = false;

// ===== CONSTANTS =====
const ECATS = [
  { k:'food',    e:'🍜', l:'Food'    },{ k:'travel', e:'🚗', l:'Travel' },
  { k:'shop',    e:'🛒', l:'Shop'    },{ k:'bills',  e:'⚡', l:'Bills'  },
  { k:'fun',     e:'🎬', l:'Fun'     },{ k:'health', e:'💊', l:'Health' },
  { k:'cafe',    e:'☕', l:'Cafe'    },{ k:'study',  e:'📚', l:'Study'  },
  { k:'rent',    e:'🏠', l:'Rent'    },{ k:'other',  e:'💰', l:'Other'  },
];
const ICATS = [
  { k:'salary',  e:'💼', l:'Salary'  },{ k:'freelance', e:'💻', l:'Freelance' },
  { k:'business',e:'🏢', l:'Business'},{ k:'invest',    e:'📈', l:'Invest'    },
  { k:'gift',    e:'🎁', l:'Gift'    },{ k:'reimburse', e:'🔄', l:'Reimburse' },
  { k:'other',   e:'💰', l:'Other'   },
];
const MOOD = { great:'😄', good:'🙂', okay:'😐', tough:'😔' };
const FOLLOWUP = { no:'None', call:'📞 Call', email:'📧 Email', meeting:'🤝 Meet' };
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HAP = { l:[6], m:[12], h:[20], dbl:[10,50,10], ok:[8,40,8] };

// ===== UTILS =====
function fmt(n) {
  if (!n && n !== 0) return '₹0';
  const s = n < 0 ? '-' : '', a = Math.abs(n);
  if (a >= 10000000) return s + '₹' + (a/10000000).toFixed(2).replace(/\.?0+$/,'') + ' Cr';
  if (a >= 100000)   return s + '₹' + (a/100000).toFixed(2).replace(/\.?0+$/,'')   + ' L';
  return s + '₹' + a.toLocaleString('en-IN');
}
function today() { return new Date().toISOString().split('T')[0]; }
function dayOff(d) { const x=new Date(); x.setDate(x.getDate()+d); return x.toISOString().split('T')[0]; }
function mStart(off=0) { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+off); return d.toISOString().slice(0,7)+'-01'; }
function mEnd(off=0)   { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+off+1); d.setDate(0); return d.toISOString().split('T')[0]; }
function wStart() { const d=new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split('T')[0]; }
function sum(a) { return a.reduce((s,x)=>s+(x.amount||0),0); }
function nowTime() { const d=new Date(); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }
function greet(n) { const h=new Date().getHours(); return (h<12?'Good morning':h<17?'Good afternoon':'Good evening')+(n?', '+n.split(' ')[0]:''); }
function dlbl(ds) {
  if (ds===today()) return 'Today';
  if (ds===dayOff(-1)) return 'Yesterday';
  const d=new Date(ds); return MN[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();
}
function hap(t='l') { if(navigator.vibrate) navigator.vibrate(HAP[t]||[8]); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function el(id) { return document.getElementById(id); }
function setVal(id,v) { const e=el(id); if(e) e.value=v; }

// ===== THEME =====
function initTheme() {
  const dark = localStorage.getItem('theme') !== 'light';
  document.documentElement[dark?'removeAttribute':'setAttribute']('data-theme','light');
  updateMeta(); const t=el('dark-tog'); if(t) t.classList.toggle('on',dark);
}
function toggleTheme() {
  hap('m'); const dark=!document.documentElement.hasAttribute('data-theme');
  document.documentElement[dark?'setAttribute':'removeAttribute']('data-theme','light');
  localStorage.setItem('theme',dark?'light':'dark');
  el('dark-tog').classList.toggle('on'); updateMeta();
  if(tab==='analytics') setTimeout(renderCharts.bind(null,...getChartData()),60);
}
function updateMeta() {
  const dark=!document.documentElement.hasAttribute('data-theme');
  el('meta-theme').setAttribute('content', dark?'#06080f':'#eef0f8');
}

// ===== TOAST =====
function toast(msg, type='ok', ms=3000) {
  const c=el('toasts'); const t=document.createElement('div');
  t.className='toast '+type;
  t.innerHTML=`<span>${{ok:'✓',err:'✕',warn:'⚠',info:'ℹ'}[type]}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(()=>{ t.style.cssText='transition:.3s;opacity:0;transform:translateY(-10px)'; setTimeout(()=>t.remove(),300); },ms);
}

// ===== AUTH =====
function showSignIn() {
  el('signin').classList.remove('hidden');
  el('app').style.display='none'; user=null;
}
function doSignIn() {
  hap('m'); el('signin-hint').innerHTML='<div class="loader-spin"></div>';
  auth.signInWithPopup(gProvider).catch(err=>{
    const c=(err.code||'').toLowerCase();
    if(['popup-blocked','popup-closed','cancelled','cross-origin'].some(e=>c.includes(e))){
      toast('Opening login…','info'); auth.signInWithRedirect(gProvider);
    } else { el('signin-hint').textContent='Try again'; toast('Sign-in failed','err'); }
  });
}
function doSignOut() { hap('h'); auth.signOut(); location.reload(); }

function initApp(u) {
  user=u;
  el('signin').classList.add('hidden');
  el('app').style.display='flex';
  ['topbar','bot-nav'].forEach(id=>{ const e=el(id); if(e) e.style.display='flex'; });
  el('user-chip').style.display='flex';
  el('topbar-greet').textContent=greet(u.displayName);

  const av=el('user-av');
  if(u.photoURL){ av.innerHTML=`<img src="${u.photoURL}" style="width:100%;height:100%;object-fit:cover;">`; }
  else { av.textContent=(u.displayName||'U')[0].toUpperCase(); }
  const sa=el('s-avatar'); if(sa){ if(u.photoURL){sa.src=u.photoURL;sa.style.display='block';el('s-avatar-fb').style.display='none';}else{el('s-avatar-fb').textContent=(u.displayName||'U')[0];el('s-avatar-fb').style.display='flex';} }
  const sn=el('s-name'); if(sn) sn.textContent=u.displayName||'User';
  const se=el('s-email'); if(se) se.textContent=u.email||'';

  initTheme();
  setupListeners();
  setVal('date-inp',today()); setVal('dr-date',today());
  setVal('vr-date',today()); setVal('vr-time',nowTime());
  renderCatGrid(); updateMonthNav();
  scheduleNotifCheck();
}

// ===== FIRESTORE =====
function setupListeners() {
  const uid=user.uid;
  db.collection('users').doc(uid).collection('expenses')
    .onSnapshot(s=>{ expenses=s.docs.map(d=>({id:d.id,...d.data()})); onChange(); });
  db.collection('users').doc(uid).collection('income')
    .onSnapshot(s=>{ income=s.docs.map(d=>({id:d.id,...d.data()})); onChange(); });
  db.collection('users').doc(uid).collection('recurring')
    .onSnapshot(s=>{ recurring=s.docs.map(d=>({id:d.id,...d.data()})); checkRecurring(); if(tab==='settings') renderSettings(); });
  db.collection('users').doc(uid).collection('meta').doc('settings')
    .onSnapshot(d=>{ if(d.exists) cfg=d.data(); if(tab==='settings') renderSettings(); if(tab==='home') renderHome(); });
  db.collection('users').doc(uid).collection('dailyReports').orderBy('date','desc')
    .onSnapshot(s=>{ dailyReports=s.docs.map(d=>({id:d.id,...d.data()})); if(tab==='reports'&&reportTab==='daily') renderDailyList(); });
  db.collection('users').doc(uid).collection('visitReports').orderBy('date','desc')
    .onSnapshot(s=>{ visitReports=s.docs.map(d=>({id:d.id,...d.data()})); if(tab==='reports'&&reportTab==='visit') renderVisitList(); });
}
function onChange() {
  if(tab==='home')      renderHome();
  if(tab==='history')   renderHistory();
  if(tab==='analytics') renderAnalytics();
  if(tab==='settings')  renderSettings();
  checkBudgetAlerts();
}

// ===== BUDGET ALERTS =====
function checkBudgetAlerts() {
  const ms=mStart(), spent=sum(expenses.filter(e=>e.date>=ms)), mb=cfg?.monthlyBudget||0;
  if(mb>0){
    const p=spent/mb*100;
    if(p>=100&&!budgetFlags.o100){ budgetFlags.o100=true; toast('Monthly budget exceeded! '+fmt(spent)+' / '+fmt(mb),'err',5000); pushNotif('Budget exceeded','You have spent '+fmt(spent)+' of '+fmt(mb)); }
    else if(p>=80&&!budgetFlags.o80){ budgetFlags.o80=true; toast('80% of budget used','warn',4000); }
  }
  if(cfg?.catBudgets) for(const[cat,bud]of Object.entries(cfg.catBudgets)){
    const s=sum(expenses.filter(e=>e.date>=ms&&e.category===cat));
    if(bud>0&&s>bud&&!budgetFlags['c_'+cat]){ budgetFlags['c_'+cat]=true; toast((ECATS.find(c=>c.k===cat)?.l||cat)+' budget exceeded!','err'); }
  }
}
function pushNotif(title,body) {
  if(notifOn&&'Notification' in window&&Notification.permission==='granted')
    new Notification(title,{body,icon:'icon-192.png'});
}

// ===== HOME =====
function updateMonthNav() {
  const d=new Date(); d.setMonth(d.getMonth()+viewMonthOff);
  el('month-nav-lbl').textContent=viewMonthOff===0?'This Month':MN[d.getMonth()]+' '+d.getFullYear();
  const nb=el('month-nav-next'); if(nb){nb.style.opacity=viewMonthOff>=0?'.3':'1';nb.disabled=viewMonthOff>=0;}
}
function changeMonth(dir) {
  hap('l'); if(dir>0&&viewMonthOff>=0) return;
  viewMonthOff+=dir; updateMonthNav(); renderHome();
}

function renderHome() {
  const ms=mStart(viewMonthOff), me=mEnd(viewMonthOff);
  const mExp=expenses.filter(e=>e.date>=ms&&e.date<=me);
  const mInc=income.filter(i=>i.date>=ms&&i.date<=me);
  const spent=sum(mExp), earned=sum(mInc), bal=earned-spent;
  const budget=cfg?.monthlyBudget||0;

  // Speedometer
  drawSpeedometer(spent, budget);

  // Today's usage
  const todaySpent=sum(expenses.filter(e=>e.date===today()));
  el('today-amt').textContent=fmt(todaySpent);

  // Overview strip
  el('ov-earned').textContent=fmt(earned);
  const bel=el('ov-balance'); bel.textContent=fmt(bal);
  bel.className='ov-val '+(bal>=0?'vb':'t-exp');

  // Trend
  const ps=mStart(viewMonthOff-1), pe=mEnd(viewMonthOff-1);
  const prevSpent=sum(expenses.filter(e=>e.date>=ps&&e.date<=pe));
  const tEl=el('spent-trend');
  if(tEl&&prevSpent>0){ const chg=((spent-prevSpent)/prevSpent*100).toFixed(0); const up=spent>prevSpent; tEl.innerHTML=`<span class="${up?'trend-up':'trend-dn'}">${up?'↑':'↓'}${Math.abs(chg)}% vs prev</span>`; }
  else if(tEl) tEl.innerHTML='';
}

function drawSpeedometer(spent, budget) {
  const svg=el('speedo-svg'); if(!svg) return;
  const W=280, H=185, cx=140, cy=130, r=95, stroke=16;
  const pct = budget>0 ? Math.min(spent/budget,1) : 0;
  const startAngle=Math.PI, sweepAngle=Math.PI;
  const toXY=(a,rr)=>({ x:cx+rr*Math.cos(a), y:cy+rr*Math.sin(a) });
  const arcPath=(a1,a2,rr)=>{
    const s=toXY(a1,rr), e=toXY(a2,rr), lg=a2-a1>Math.PI?1:0;
    return `M ${s.x} ${s.y} A ${rr} ${rr} 0 ${lg} 1 ${e.x} ${e.y}`;
  };
  const color = pct>=1?'#ff5f7e':pct>=0.8?'#f9ca24':'#00d2a0';
  const endAngle = startAngle + sweepAngle*pct;
  const nx=cx+(r-stroke/2)*Math.cos(endAngle), ny=cy+(r-stroke/2)*Math.sin(endAngle);

  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.innerHTML=`
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="${arcPath(Math.PI,0,r)}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${stroke}" stroke-linecap="round"/>
    ${pct>0?`<path d="${arcPath(Math.PI,endAngle,r)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" filter="url(#glow)" opacity="0.9"/>`:''}
    ${[0,0.25,0.5,0.75,1].map(t=>{
      const a=Math.PI+Math.PI*t;
      const x1=cx+(r+stroke/2+5)*Math.cos(a), y1=cy+(r+stroke/2+5)*Math.sin(a);
      const x2=cx+(r+stroke/2+12)*Math.cos(a), y2=cy+(r+stroke/2+12)*Math.sin(a);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round"/>`;
    }).join('')}
    ${pct>0?`<circle cx="${nx}" cy="${ny}" r="5" fill="${color}" filter="url(#glow)"/>`:''}
    <text x="${cx}" y="${cy-46}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Grotesk" font-weight="600" letter-spacing="1">MONTHLY SPEND</text>
    <text x="${cx}" y="${cy-18}" text-anchor="middle" fill="${color}" font-size="26" font-family="JetBrains Mono" font-weight="700">${fmt(spent)}</text>
    <text x="${cx}" y="${cy+6}" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="11" font-family="Space Grotesk" font-weight="500">${budget>0?'of '+fmt(budget):'No budget set'}</text>
    ${budget>0?`<text x="${cx}" y="${cy+26}" text-anchor="middle" fill="${color}" font-size="12" font-family="Space Grotesk" font-weight="700">${(pct*100).toFixed(0)}% used</text>`:''}
    <text x="${toXY(Math.PI,r+32).x}" y="${cy+4}" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="10" font-family="JetBrains Mono">0%</text>
    <text x="${toXY(0,r+32).x}" y="${cy+4}" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="10" font-family="JetBrains Mono">100%</text>
  `;
}

// ===== HOME AMOUNT INPUT =====
function initAmountInput() {
  const inp=el('amount-inp');
  if(!inp) return;
  inp.addEventListener('input',()=>{
    const has=inp.value.trim()!=='';
    if(has!==amountHasValue){ amountHasValue=has; toggleFormExpand(has); }
    const kbd=el('dismiss-kbd'); if(kbd) kbd.classList.toggle('visible',has);
  });
  inp.addEventListener('focus',()=>{
    el('amount-wrap').classList.add('focused');
    const kbd=el('dismiss-kbd'); if(kbd&&inp.value.trim()) kbd.classList.add('visible');
  });
  inp.addEventListener('blur',()=>{
    el('amount-wrap').classList.remove('focused');
  });
}
function toggleFormExpand(show) {
  const body=el('form-body');
  if(!body) return;
  body.classList.toggle('open',show);
  const qa=el('quick-actions');
  if(qa) qa.style.display=show?'none':'flex';
}
function dismissKbd() {
  hap('l');
  const inp=el('amount-inp'); if(inp) inp.blur();
  el('dismiss-kbd').classList.remove('visible');
  // Smooth scroll to form
  setTimeout(()=>{
    const body=el('form-body');
    if(body) body.scrollIntoView({behavior:'smooth',block:'start'});
  },120);
}

// ===== TYPE / CAT =====
function setType(t) {
  hap('m'); txType=t; selCat=null;
  const be=el('pill-exp'), bi=el('pill-inc');
  if(be) be.classList.toggle('active',t==='expense');
  if(bi) bi.classList.toggle('active',t==='income');
  const re=el('rec-row-e'), ri=el('rec-row-i');
  if(re) re.style.display=t==='expense'?'flex':'none';
  if(ri) ri.style.display=t==='income'?'flex':'none';
  ['rec-opts-e','rec-opts-i'].forEach(id=>{const e=el(id);if(e)e.style.display='none';});
  recExp=false; recInc=false;
  ['rec-tog-e','rec-tog-i'].forEach(id=>{const e=el(id);if(e)e.classList.remove('on');});
  const btn=el('btn-add');
  if(btn){btn.className='btn btn-'+(t==='expense'?'expense':'income');btn.querySelector('span').textContent='Add '+(t==='expense'?'Expense':'Income');}
  renderCatGrid();
}
function renderCatGrid() {
  const g=el('cat-grid'); if(!g) return;
  const items=txType==='expense'?ECATS:ICATS;
  g.innerHTML=items.map(c=>`<button class="cat-btn ${selCat===c.k?(txType==='expense'?'sel-e':'sel-i'):''}" onclick="pickCat('${c.k}')"><span class="ce">${c.e}</span><span>${c.l}</span></button>`).join('');
}
function pickCat(k) { hap('l'); selCat=k; renderCatGrid(); }
function togRecExp() { hap('l'); recExp=!recExp; el('rec-tog-e').classList.toggle('on',recExp); el('rec-opts-e').style.display=recExp?'block':'none'; }
function togRecInc() { hap('l'); recInc=!recInc; el('rec-tog-i').classList.toggle('on',recInc); el('rec-opts-i').style.display=recInc?'block':'none'; }

function addTx() {
  hap('m');
  const amt=parseFloat(el('amount-inp').value);
  if(!amt||amt<=0){ hap('dbl'); toast('Enter a valid amount','warn'); return; }
  if(!selCat){ hap('dbl'); toast('Select a category','warn'); return; }
  const note=(el('note-inp').value||'').trim();
  const date=el('date-inp').value||today();
  const uid=user.uid;
  if(txType==='expense'){
    db.collection('users').doc(uid).collection('expenses').add({
      amount:amt,category:selCat,note,date,isRecurring:false,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    }).then(()=>{ hap('ok'); toast('Expense added!','ok'); resetForm(); });
    if(recExp){
      const freq=el('rec-freq-e').value, d=new Date();
      db.collection('users').doc(uid).collection('recurring').add({
        amount:amt,category:selCat,note,frequency:freq,recType:'expense',
        dayOfWeek:d.getDay(),dayOfMonth:d.getDate(),lastAdded:date,active:true,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } else {
    db.collection('users').doc(uid).collection('income').add({
      amount:amt,source:selCat,note,date,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    }).then(()=>{ hap('ok'); toast('Income added!','ok'); resetForm(); });
    if(recInc){
      const freq=el('rec-freq-i').value, d=new Date();
      db.collection('users').doc(uid).collection('recurring').add({
        amount:amt,category:selCat,note,frequency:freq,recType:'income',
        dayOfWeek:d.getDay(),dayOfMonth:d.getDate(),lastAdded:date,active:true,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }
}
function resetForm() {
  setVal('amount-inp',''); setVal('note-inp',''); setVal('date-inp',today());
  selCat=null; recExp=false; recInc=false; amountHasValue=false;
  ['rec-tog-e','rec-tog-i'].forEach(id=>{const e=el(id);if(e)e.classList.remove('on');});
  ['rec-opts-e','rec-opts-i'].forEach(id=>{const e=el(id);if(e)e.style.display='none';});
  toggleFormExpand(false);
  el('dismiss-kbd').classList.remove('visible');
  renderCatGrid();
}

// ===== RECURRING =====
function checkRecurring() {
  if(!user) return;
  const uid=user.uid, td=today(); let added=0;
  recurring.filter(r=>r.active).forEach(r=>{
    let ok=false; const last=r.lastAdded, d=new Date();
    if(r.frequency==='daily') ok=last!==td;
    else if(r.frequency==='weekly'){const days=last?Math.floor((new Date(td)-new Date(last))/86400000):999;ok=d.getDay()===(r.dayOfWeek??1)&&days>=6;}
    else if(r.frequency==='monthly'){const mos=last?(d.getFullYear()-new Date(last).getFullYear())*12+d.getMonth()-new Date(last).getMonth():999;ok=d.getDate()===(r.dayOfMonth??1)&&mos>=1;}
    if(ok){
      const col=r.recType==='income'?'income':'expenses';
      const data=r.recType==='income'?{amount:r.amount,source:r.category,note:r.note||'',date:td,isRecurring:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()}:{amount:r.amount,category:r.category,note:r.note||'',date:td,isRecurring:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
      db.collection('users').doc(uid).collection(col).add(data);
      db.collection('users').doc(uid).collection('recurring').doc(r.id).update({lastAdded:td});
      added++;
    }
  });
  if(added>0) toast(`${added} recurring transaction${added>1?'s':''} added`,'info');
}

// ===== HISTORY =====
function renderHistory() {
  const q=(el('h-search')?.value||'').toLowerCase();
  const chips=el('h-chips');
  const cats=[...new Set(expenses.map(e=>e.category))];
  let ch=`<button class="chip ${hFilter==='all'?'on':''}" onclick="setHFilter('all')">All</button>`;
  ch+=`<button class="chip ${hFilter==='income'?'on':''}" onclick="setHFilter('income')">📥 Income</button>`;
  ch+=`<button class="chip ${hFilter==='expense'?'on':''}" onclick="setHFilter('expense')">📤 Expense</button>`;
  cats.forEach(c=>{const ci=ECATS.find(x=>x.k===c);if(ci)ch+=`<button class="chip ${hFilter===c?'on':''}" onclick="setHFilter('${c}')">${ci.e} ${ci.l}</button>`;});
  if(chips) chips.innerHTML=ch;

  let all=[...expenses.map(e=>({...e,_t:'expense'})),...income.map(i=>({...i,_t:'income'}))];
  if(hFilter==='income') all=all.filter(x=>x._t==='income');
  else if(hFilter==='expense') all=all.filter(x=>x._t==='expense');
  else if(hFilter!=='all') all=all.filter(x=>x.category===hFilter||x.source===hFilter);
  if(q) all=all.filter(x=>(x.note||'').toLowerCase().includes(q)||(x.category||x.source||'').toLowerCase().includes(q));
  all.sort((a,b)=>b.date.localeCompare(a.date)||((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));

  const list=el('h-list'); if(!list) return;
  if(!all.length){list.innerHTML='<div class="empty"><div class="empty-icon">📋</div><h3>Nothing yet</h3><p>Add your first transaction</p></div>';return;}

  const groups={};
  all.forEach(x=>{if(!groups[x.date])groups[x.date]=[];groups[x.date].push(x);});
  let html='';
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
    const items=groups[date];
    const dE=sum(items.filter(x=>x._t==='expense')), dI=sum(items.filter(x=>x._t==='income'));
    html+=`<div class="h-date-hd"><span>${dlbl(date)}</span><span class="h-date-totals">${dE>0?`<span class="t-exp">-${fmt(dE)}</span> `:''} ${dI>0?`<span class="t-inc">+${fmt(dI)}</span>`:''}</span></div>`;
    items.forEach(x=>{
      const isE=x._t==='expense';
      const ck=isE?x.category:x.source;
      const ci=isE?ECATS.find(c=>c.k===ck):ICATS.find(c=>c.k===ck);
      html+=`<div class="h-item fade-up">
        <div class="h-icon">${ci?ci.e:'💰'}</div>
        <div class="h-info">
          <div class="h-cat">${esc(ci?ci.l:ck)}${x.isRecurring?'<span class="rec-badge">↻</span>':''}</div>
          <div class="h-note">${x.note?esc(x.note):'<span style="opacity:.35">No note</span>'}</div>
        </div>
        <div style="text-align:right">
          <div class="h-amt ${isE?'h-exp':'h-inc'}">${isE?'-':'+'}${fmt(x.amount)}</div>
          <div class="h-acts">
            <button onclick="openEdit('${x.id}','${x._t}')">✏</button>
            <button onclick="askDelete('${x.id}','${x._t}')">🗑</button>
          </div>
        </div>
      </div>`;
    });
  });
  list.innerHTML=html;
}
function setHFilter(f){hap('l');hFilter=f;renderHistory();}

// ===== EDIT =====
function openEdit(id,type) {
  hap('l');
  const arr=type==='expense'?expenses:income;
  const item=arr.find(x=>x.id===id); if(!item) return;
  setVal('edit-id',id); setVal('edit-type',type);
  setVal('edit-amount',item.amount);
  const ck=item.category||item.source;
  const ci=(type==='expense'?ECATS:ICATS).find(c=>c.k===ck);
  setVal('edit-cat',ci?ci.l:ck);
  setVal('edit-note',item.note||''); setVal('edit-date',item.date);
  el('edit-save').className='btn btn-'+(type==='expense'?'expense':'income');
  showSheet('edit');
}
function saveEdit() {
  hap('m');
  const id=el('edit-id').value, type=el('edit-type').value;
  const amt=parseFloat(el('edit-amount').value);
  if(!amt||amt<=0){hap('dbl');toast('Enter valid amount','warn');return;}
  db.collection('users').doc(user.uid).collection(type==='expense'?'expenses':'income').doc(id)
    .update({amount:amt,note:(el('edit-note').value||'').trim(),date:el('edit-date').value})
    .then(()=>{hap('ok');toast('Updated!','ok');hideSheet('edit');});
}

// ===== DELETE =====
function askDelete(id,type) {
  hap('m'); delTarget={id,type};
  el('dlg-msg').textContent='This action cannot be undone.';
  el('confirm-dlg').classList.add('show');
}
function cancelDel() { delTarget=null; el('confirm-dlg').classList.remove('show'); }
function confirmDel() {
  hap('h'); if(!delTarget) return;
  if(delTarget.type.startsWith('__r_')){
    const col=delTarget.type==='__r_daily'?'dailyReports':'visitReports';
    db.collection('users').doc(user.uid).collection(col).doc(delTarget.id).delete()
      .then(()=>{hap('ok');toast('Report deleted','ok');cancelDel();});
    return;
  }
  db.collection('users').doc(user.uid).collection(delTarget.type==='expense'?'expenses':'income').doc(delTarget.id).delete()
    .then(()=>{hap('ok');toast('Deleted','ok');cancelDel();});
}

// ===== ANALYTICS =====
function setPeriod(p) {
  hap('l'); period=p;
  ['week','month','3m','year','all'].forEach(id=>{const e=el('p-'+id);if(e)e.classList.remove('on');});
  el('p-'+p)?.classList.add('on'); renderAnalytics();
}
function getChartData() {
  const td=today(), ws=wStart(), ms=mStart();
  let start;
  if(period==='week') start=ws;
  else if(period==='month') start=ms;
  else if(period==='3m'){const d=new Date();d.setMonth(d.getMonth()-3);start=d.toISOString().split('T')[0];}
  else if(period==='year') start=new Date().getFullYear()+'-01-01';
  else start='2000-01-01';
  return [expenses.filter(e=>e.date>=start&&e.date<=td), income.filter(i=>i.date>=start&&i.date<=td)];
}
function renderAnalytics() {
  const [pExp,pInc]=getChartData();
  const td=today(),ws=wStart(),ms=mStart();
  const tE=sum(pExp),tI=sum(pInc),bal=tI-tE;

  el('s-today').textContent=fmt(sum(expenses.filter(e=>e.date===td)));
  el('s-week').textContent=fmt(sum(expenses.filter(e=>e.date>=ws)));
  el('s-month').textContent=fmt(sum(expenses.filter(e=>e.date>=ms)));

  const bv=el('bal-val'); if(bv){bv.textContent=fmt(bal);bv.style.color=bal>=0?'var(--balance)':'var(--expense)';}
  const bi=el('bal-inc'); if(bi) bi.textContent=fmt(tI);
  const be=el('bal-exp'); if(be) be.textContent=fmt(tE);

  if(period==='month'){
    const ls=mStart(-1),le=mEnd(-1);
    const lbal=sum(income.filter(i=>i.date>=ls&&i.date<=le))-sum(expenses.filter(e=>e.date>=ls&&e.date<=le));
    const bt=el('bal-trend');
    if(bt&&lbal!==0){const chg=((bal-lbal)/Math.abs(lbal)*100).toFixed(0);const up=bal>lbal;bt.innerHTML=`<span class="${up?'trend-dn':'trend-up'}">${up?'↑':'↓'}${Math.abs(chg)}% vs last month</span>`;}
    else if(bt) bt.innerHTML='';
  } else {const bt=el('bal-trend');if(bt)bt.innerHTML='';}

  renderCharts(pExp,pInc);
  renderCatBD(pExp);
}
function renderCharts(pExp,pInc) {
  const dark=!document.documentElement.hasAttribute('data-theme');
  const gc=dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)';
  const tc=dark?'#334560':'#8fa4cc';

  const months=[],mlbls=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7));mlbls.push(MN[parseInt(d.toISOString().slice(5,7))-1]);}

  if(charts.trend) charts.trend.destroy();
  charts.trend=new Chart(el('ch-trend'),{
    type:'bar',
    data:{labels:mlbls,datasets:[
      {label:'Expenses',data:months.map(m=>sum(expenses.filter(e=>e.date.startsWith(m)))),backgroundColor:'rgba(255,95,126,0.75)',borderRadius:5,borderSkipped:false},
      {label:'Income',data:months.map(m=>sum(income.filter(i=>i.date.startsWith(m)))),backgroundColor:'rgba(0,210,160,0.75)',borderRadius:5,borderSkipped:false}
    ]},
    options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:tc,font:{size:11},boxWidth:10,padding:12}}},scales:{x:{grid:{color:gc},ticks:{color:tc,font:{size:10}}},y:{grid:{color:gc},ticks:{color:tc,font:{size:10},callback:v=>fmt(v)}}}}
  });

  const days=period==='week'?7:30,dlbls=[],ddata=[];
  for(let i=days-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split('T')[0];dlbls.push(d.getDate());ddata.push(sum(expenses.filter(e=>e.date===ds)));}
  if(charts.daily) charts.daily.destroy();
  charts.daily=new Chart(el('ch-daily'),{
    type:'bar',data:{labels:dlbls,datasets:[{data:ddata,backgroundColor:ddata.map((_,i)=>i===ddata.length-1?'rgba(108,92,231,.9)':'rgba(255,95,126,.5)'),borderRadius:4,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:tc,font:{size:9}}},y:{grid:{color:gc},ticks:{color:tc,font:{size:9},callback:v=>fmt(v)}}}}
  });
  el('ch-daily-lbl').textContent=period==='week'?'Daily Spending (7 Days)':'Daily Spending (30 Days)';

  const ctotals={};
  pExp.forEach(e=>{ctotals[e.category]=(ctotals[e.category]||0)+e.amount;});
  const ckeys=Object.keys(ctotals);
  const colors=['#6c5ce7','#ff5f7e','#00d2a0','#f9ca24','#4dc9f6','#a29bfe','#fb7185','#22d3ee','#a3e635','#f472b6'];
  if(charts.cat) charts.cat.destroy();
  if(ckeys.length) charts.cat=new Chart(el('ch-cat'),{
    type:'doughnut',
    data:{labels:ckeys.map(k=>ECATS.find(x=>x.k===k)?.l||k),datasets:[{data:ckeys.map(k=>ctotals[k]),backgroundColor:colors.slice(0,ckeys.length),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'right',labels:{color:tc,font:{size:10},boxWidth:10,padding:8}}},cutout:'62%'}
  });
}
function renderCatBD(pExp) {
  const totals={},total=sum(pExp);
  pExp.forEach(e=>{totals[e.category]=(totals[e.category]||0)+e.amount;});
  const el2=el('cat-bd'); if(!el2) return;
  if(!total){el2.innerHTML='<div class="empty" style="padding:18px"><div class="empty-icon">📊</div><p>No expense data</p></div>';return;}
  el2.innerHTML=Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{
    const ci=ECATS.find(c=>c.k===cat),pct=(amt/total*100).toFixed(0);
    const bud=cfg?.catBudgets?.[cat];
    let bl='',bc='#6c5ce7';
    if(bud>0){const left=bud-amt,bp=amt/bud;bl=`<div style="font-size:10px;color:${bp>1?'var(--expense)':bp>0.8?'var(--warn)':'var(--income)'};margin-top:2px;">${left>=0?fmt(left)+' left':'Over by '+fmt(Math.abs(left))}</div>`;bc=bp>1?'#ff5f7e':bp>0.8?'#f9ca24':'#00d2a0';}
    return `<div class="bd-item"><div class="bd-icon">${ci?ci.e:''}</div><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:13px;font-weight:600">${ci?ci.l:cat}</span><span style="font-family:var(--mono);font-size:13px;font-weight:700">${fmt(amt)} <span style="color:var(--text3);font-size:10px">${pct}%</span></span></div><div class="bd-bar-wrap"><div class="bd-bar" style="width:${pct}%;background:${bc}"></div></div>${bl}</div></div>`;
  }).join('');
}

// ===== SETTINGS =====
function renderSettings() {
  const mb=cfg?.monthlyBudget||0,mbD=el('mb-display'),mbP=el('mb-progress');
  if(mb>0&&mbD){
    mbD.textContent='Budget: '+fmt(mb); if(mbP) mbP.style.display='block';
    const sp=sum(expenses.filter(e=>e.date>=mStart())),pct=Math.min(sp/mb*100,100);
    const bar=el('mb-bar'); if(bar){bar.style.width=pct+'%';bar.style.background=pct>100?'var(--expense)':pct>80?'var(--warn)':'var(--income)';}
    const bt=el('mb-txt'); if(bt) bt.textContent=fmt(sp)+' / '+fmt(mb)+' ('+pct.toFixed(0)+'%)';
  } else { if(mbD) mbD.textContent='No budget set'; if(mbP) mbP.style.display='none'; }

  const thisExp=expenses.filter(e=>e.date>=mStart());
  const cbEl=el('cat-budgets');
  if(cbEl) cbEl.innerHTML=ECATS.map(cat=>{
    const sp=sum(thisExp.filter(e=>e.category===cat.k)),bud=cfg?.catBudgets?.[cat.k]||0;
    return `<div class="s-row mb10" onclick="openCatBudget('${cat.k}')"><div class="s-row-l"><div class="s-row-icon">${cat.e}</div><div><div class="s-row-title">${cat.l}</div><div class="s-row-sub">Spent: ${fmt(sp)}${bud>0?' · Limit: '+fmt(bud):''}</div></div></div><span style="font-size:11px;font-weight:700;color:var(--accent2)">${bud>0?'Edit':'Set'}</span></div>`;
  }).join('');

  const actRec=recurring.filter(r=>r.active);
  const recEl=el('settings-rec');
  if(recEl) recEl.innerHTML=!actRec.length
    ?'<div class="empty" style="padding:18px"><div class="empty-icon">🔄</div><p>No recurring transactions</p></div>'
    :actRec.map(r=>{
        const isI=r.recType==='income';
        const c=isI?ICATS.find(x=>x.k===r.category):ECATS.find(x=>x.k===r.category);
        return `<div class="s-row mb10"><div class="s-row-l"><div class="s-row-icon">${c?c.e:''}</div><div><div class="s-row-title">${r.note||(c?c.l:r.category)}</div><div class="s-row-sub">${r.frequency} · ${fmt(r.amount)} · <span style="color:${isI?'var(--income)':'var(--expense)'}">${isI?'Income':'Expense'}</span></div></div></div><button class="btn-sm" style="color:var(--expense)" onclick="delRecurring('${r.id}')">Remove</button></div>`;
      }).join('');
}
function openBudget() { hap('l'); el('budget-cat').value=''; el('budget-title').textContent='Monthly Budget'; setVal('budget-amt',cfg?.monthlyBudget||''); showSheet('budget'); }
function openCatBudget(cat) { hap('l'); const c=ECATS.find(x=>x.k===cat); el('budget-cat').value=cat; el('budget-title').textContent=(c?c.l:cat)+' Budget'; setVal('budget-amt',cfg?.catBudgets?.[cat]||''); showSheet('budget'); }
function saveBudget() {
  hap('m'); const cat=el('budget-cat').value, amt=parseFloat(el('budget-amt').value);
  const ref=db.collection('users').doc(user.uid).collection('meta').doc('settings');
  const data={};
  if(cat){const cb={...(cfg?.catBudgets||{})};cb[cat]=amt||0;data.catBudgets=cb;}else data.monthlyBudget=amt||0;
  ref.set(data,{merge:true}).then(()=>{hap('ok');toast('Budget saved','ok');hideSheet('budget');});
}
function removeBudget() {
  hap('m'); const cat=el('budget-cat').value;
  const ref=db.collection('users').doc(user.uid).collection('meta').doc('settings');
  const data={};
  if(cat){const cb={...(cfg?.catBudgets||{})};delete cb[cat];data.catBudgets=cb;}else data.monthlyBudget=0;
  ref.set(data,{merge:true}).then(()=>{hap('ok');toast('Budget removed','ok');hideSheet('budget');});
}
function delRecurring(id){hap('m');db.collection('users').doc(user.uid).collection('recurring').doc(id).update({active:false}).then(()=>toast('Removed','ok'));}

// ===== NOTIFICATIONS =====
function toggleNotif() {
  hap('m');
  if(!notifOn){
    Notification.requestPermission().then(p=>{
      if(p==='granted'){notifOn=true;el('notif-tog').classList.add('on');el('notif-sub').textContent='On · Daily reminders active';toast('Alerts enabled','ok');localStorage.setItem('notif','on');}
      else{el('notif-sub').textContent='Blocked — check browser settings';toast('Blocked','err');}
    });
  } else {
    notifOn=false;el('notif-tog').classList.remove('on');el('notif-sub').textContent='Tap to enable';toast('Disabled','info');localStorage.removeItem('notif');
  }
}
async function sendTestNotif() {
  hap('m');
  if (!("Notification" in window)) { toast("Browser doesn't support notifications", "err"); return; }
  
  let perm = Notification.permission;
  if (perm !== "granted") perm = await Notification.requestPermission();
  
  if (perm === "granted") {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification("d3v Nexus — Daily Reminder", {
          body: "Don't forget to log today's expenses and daily report! 📋",
          icon: "icon-192.png",
          badge: "icon-192.png",
          vibrate: [200, 100, 200],
          tag: 'nexus-daily-reminder'
        });
      });
      toast('Test notification sent!','ok');
    } else {
      toast("Service worker not ready", "err");
    }
  } else {
    toast("Notification permission denied", "err");
  }
}
function scheduleNotifCheck() {
  if(localStorage.getItem('notif')==='on') notifOn=true;
  if(el('notif-tog')) el('notif-tog').classList.toggle('on',notifOn);
  if(el('notif-sub')) el('notif-sub').textContent=notifOn?'On · Daily reminders active':'Tap to enable';
  if(!notifOn) return;
  // Check every hour if we should fire daily reminder (fire once per day after 8pm if no expense today)
  setInterval(()=>{
    const h=new Date().getHours();
    if(h<20) return;
    const key='notif-fired-'+today();
    if(localStorage.getItem(key)) return;
    const todayExp=expenses.filter(e=>e.date===today()).length;
    const todayDR=dailyReports.filter(r=>r.date===today()).length;
    if(todayExp===0||todayDR===0){
      localStorage.setItem(key,'1');
      pushNotif('d3v Nexus Reminder',
        (todayExp===0?'No expenses logged today. ':'')+(todayDR===0?'Daily report pending!':''));
    }
  },3600000);
}

// ===== REPORTS =====
function switchReportTab(t) {
  hap('m'); reportTab=t;
  el('rtab-daily').classList.toggle('on',t==='daily');
  el('rtab-visit').classList.toggle('on',t==='visit');
  el('daily-form').style.display=t==='daily'?'block':'none';
  el('visit-form').style.display=t==='visit'?'block':'none';
  if(t==='daily') renderDailyList(); else renderVisitList();
}
function saveDailyReport() {
  hap('m');
  const date=el('dr-date').value, notes=(el('dr-notes').value||'').trim();
  if(!date){hap('dbl');toast('Select a date','warn');return;}
  if(!notes){hap('dbl');toast('Add a summary','warn');return;}
  db.collection('users').doc(user.uid).collection('dailyReports').add({
    date,notes,tasks:(el('dr-tasks').value||'').trim(),issues:(el('dr-issues').value||'').trim(),
    plan:(el('dr-plan').value||'').trim(),mood:el('dr-mood').value,status:el('dr-status').value,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{hap('ok');toast('Report saved!','ok');['dr-notes','dr-tasks','dr-issues','dr-plan'].forEach(id=>{setVal(id,'');});setVal('dr-date',today());});
}
function saveVisitReport() {
  hap('m');
  const date=el('vr-date').value,client=(el('vr-client').value||'').trim(),notes=(el('vr-notes').value||'').trim();
  if(!date){hap('dbl');toast('Select a date','warn');return;}
  if(!client){hap('dbl');toast('Enter client name','warn');return;}
  if(!notes){hap('dbl');toast('Add visit notes','warn');return;}
  db.collection('users').doc(user.uid).collection('visitReports').add({
    date,time:el('vr-time').value,client,location:(el('vr-location').value||'').trim(),
    contact:(el('vr-contact').value||'').trim(),purpose:(el('vr-purpose').value||'').trim(),
    notes,outcome:(el('vr-outcome').value||'').trim(),status:el('vr-status').value,
    followup:el('vr-followup').value,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{hap('ok');toast('Visit saved!','ok');['vr-client','vr-location','vr-contact','vr-purpose','vr-notes','vr-outcome'].forEach(id=>{setVal(id,'');});setVal('vr-date',today());setVal('vr-time',nowTime());});
}
function renderDailyList() {
  const s=el('dr-s-total');if(s)s.textContent=dailyReports.length;
  const sc=el('dr-s-done');if(sc)sc.textContent=dailyReports.filter(r=>r.status==='completed').length;
  const sp=el('dr-s-pend');if(sp)sp.textContent=dailyReports.filter(r=>r.status==='pending').length;
  const list=el('daily-list'); if(!list) return;
  if(!dailyReports.length){list.innerHTML='<div class="empty"><div class="empty-icon">📋</div><h3>No reports yet</h3><p>Save your first daily report</p></div>';return;}
  list.innerHTML=dailyReports.map(r=>{
    const d=new Date(r.date);
    return `<div class="r-item fade-up">
      <div class="r-item-hd"><span class="r-date">${MN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</span><span class="s-badge ${r.status}">${r.status}</span></div>
      ${r.mood?`<span style="font-size:18px">${MOOD[r.mood]||''}</span>`:''}
      <div class="r-note" style="-webkit-line-clamp:3">${esc(r.notes||'')}</div>
      ${r.tasks?`<div style="font-size:11px;color:var(--text3);margin-top:5px">✓ ${esc(r.tasks)}</div>`:''}
      <div class="r-acts"><button onclick="viewDR('${r.id}')">View</button><button style="color:var(--accent2)" onclick="editDR('${r.id}')">Edit</button><button style="color:var(--expense)" onclick="askDelReport('${r.id}','daily')">Delete</button></div>
    </div>`;
  }).join('');
}
function renderVisitList() {
  const s=el('vr-s-total');if(s)s.textContent=visitReports.length;
  const sc=el('vr-s-done');if(sc)sc.textContent=visitReports.filter(r=>r.status==='completed').length;
  const sf=el('vr-s-fu');if(sf)sf.textContent=visitReports.filter(r=>r.followup&&r.followup!=='no').length;
  const list=el('visit-list'); if(!list) return;
  if(!visitReports.length){list.innerHTML='<div class="empty"><div class="empty-icon">📍</div><h3>No visits yet</h3><p>Log your first client visit</p></div>';return;}
  list.innerHTML=visitReports.map(r=>{
    const d=new Date(r.date);
    return `<div class="r-item fade-up">
      <div class="r-item-hd"><span class="r-date">${MN[d.getMonth()]} ${d.getDate()}${r.time?', '+r.time:''}</span><span class="s-badge ${r.status}">${r.status}</span></div>
      <div class="r-client">🏢 ${esc(r.client||'')}</div>
      ${r.location?`<div class="r-loc">📍 ${esc(r.location)}</div>`:''}
      ${r.purpose?`<div style="font-size:11px;color:var(--accent2);margin-top:3px">📌 ${esc(r.purpose)}</div>`:''}
      <div class="r-note">${esc(r.notes||'')}</div>
      ${r.followup&&r.followup!=='no'?`<div style="font-size:11px;color:var(--warn);margin-top:5px">⚡ ${FOLLOWUP[r.followup]||r.followup}</div>`:''}
      <div class="r-acts"><button onclick="viewVR('${r.id}')">View</button><button style="color:var(--accent2)" onclick="editVR('${r.id}')">Edit</button><button style="color:var(--expense)" onclick="askDelReport('${r.id}','visit')">Delete</button></div>
    </div>`;
  }).join('');
}
function askDelReport(id,type){hap('m');delTarget={id,type:'__r_'+type};el('dlg-msg').textContent='This report will be permanently deleted.';el('confirm-dlg').classList.add('show');}

// ===== EDIT REPORTS LOGIC =====
function editDR(id) {
  hap('l');
  const r = dailyReports.find(x => x.id === id); if (!r) return;
  setVal('dr-date', r.date); setVal('dr-notes', r.notes || '');
  setVal('dr-tasks', r.tasks || ''); setVal('dr-issues', r.issues || '');
  setVal('dr-plan', r.plan || ''); setVal('dr-mood', r.mood || 'good');
  setVal('dr-status', r.status || 'completed');
  switchReportTab('daily');
  // Optional: Auto-scroll to the top form
  el('daily-form').scrollIntoView({behavior: 'smooth'});
  toast('Editing report. Save when done.', 'info');
  // Note: To fully save an edit, your saveDailyReport function will need to be updated to handle overwrites.
}

function editVR(id) {
  hap('l');
  const r = visitReports.find(x => x.id === id); if (!r) return;
  setVal('vr-date', r.date); setVal('vr-time', r.time || '');
  setVal('vr-client', r.client || ''); setVal('vr-location', r.location || '');
  setVal('vr-contact', r.contact || ''); setVal('vr-purpose', r.purpose || '');
  setVal('vr-notes', r.notes || ''); setVal('vr-outcome', r.outcome || '');
  setVal('vr-status', r.status || 'completed'); setVal('vr-followup', r.followup || 'no');
  switchReportTab('visit');
  el('visit-form').scrollIntoView({behavior: 'smooth'});
  toast('Editing visit. Save when done.', 'info');
}

// ===== EDIT REPORTS LOGIC =====
function editDR(id) {
  hap('l');
  const r = dailyReports.find(x => x.id === id); if (!r) return;
  setVal('dr-date', r.date); setVal('dr-notes', r.notes || '');
  setVal('dr-tasks', r.tasks || ''); setVal('dr-issues', r.issues || '');
  setVal('dr-plan', r.plan || ''); setVal('dr-mood', r.mood || 'good');
  setVal('dr-status', r.status || 'completed');
  switchReportTab('daily');
  // Optional: Auto-scroll to the top form
  el('daily-form').scrollIntoView({behavior: 'smooth'});
  toast('Editing report. Save when done.', 'info');
  // Note: To fully save an edit, your saveDailyReport function will need to be updated to handle overwrites.
}

function editVR(id) {
  hap('l');
  const r = visitReports.find(x => x.id === id); if (!r) return;
  setVal('vr-date', r.date); setVal('vr-time', r.time || '');
  setVal('vr-client', r.client || ''); setVal('vr-location', r.location || '');
  setVal('vr-contact', r.contact || ''); setVal('vr-purpose', r.purpose || '');
  setVal('vr-notes', r.notes || ''); setVal('vr-outcome', r.outcome || '');
  setVal('vr-status', r.status || 'completed'); setVal('vr-followup', r.followup || 'no');
  switchReportTab('visit');
  el('visit-form').scrollIntoView({behavior: 'smooth'});
  toast('Editing visit. Save when done.', 'info');
}
function vField(lbl,val){if(!val)return '';return `<div class="vf"><div class="vf-lbl">${lbl}</div><div class="vf-val">${esc(val)}</div></div>`;}
function viewDR(id) {
  const r=dailyReports.find(x=>x.id===id); if(!r) return;
  const d=new Date(r.date);
  el('view-report-title').textContent='Daily Report — '+MN[d.getMonth()]+' '+d.getDate();
  el('view-report-body').innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span class="s-badge ${r.status}">${r.status}</span>${r.mood?`<span style="font-size:24px">${MOOD[r.mood]||''}</span>`:''}</div>`+vField('Summary',r.notes)+vField('Tasks',r.tasks)+vField('Issues',r.issues)+vField('Plan for Tomorrow',r.plan);
  showSheet('view-report');
}
function viewVR(id) {
  const r=visitReports.find(x=>x.id===id); if(!r) return;
  const d=new Date(r.date);
  el('view-report-title').textContent='Visit — '+esc(r.client||'');
  el('view-report-body').innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><span class="s-badge ${r.status}">${r.status}</span>${r.followup&&r.followup!=='no'?`<span style="font-size:11px;color:var(--warn);font-weight:700">⚡ ${FOLLOWUP[r.followup]||r.followup}</span>`:''}</div>`+vField('Date & Time',MN[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()+(r.time?' at '+r.time:''))+vField('Client',r.client)+vField('Location',r.location)+vField('Contact',r.contact)+vField('Purpose',r.purpose)+vField('What Was Done',r.notes)+vField('Outcome',r.outcome);
  showSheet('view-report');
}

// ===== CSV EXPORT =====
function buildCsvCols(type) {
  const cols={expense:['Date','Type','Category','Note','Amount'],daily:['Date','Status','Mood','Summary','Tasks','Issues','Plan'],visit:['Date','Time','Client','Location','Contact','Purpose','Notes','Outcome','Status','Follow-up']};
  const list=el('csv-cols'); if(!list) return;
  list.innerHTML=(cols[type]||cols.expense).map(c=>{
    const on=csvState.cols[c]!==false;
    return `<div class="csv-row"><span class="csv-lbl">${c}</span><div class="csv-chk ${on?'on':''}" id="cc-${c.replace(/[^a-z0-9]/gi,'_')}" onclick="togCsvCol('${c}')"></div></div>`;
  }).join('');
}
function togCsvCol(c){csvState.cols[c]=!csvState.cols[c];const e=el('cc-'+c.replace(/[^a-z0-9]/gi,'_'));if(e)e.classList.toggle('on',csvState.cols[c]);}
function togCsvType(t){csvState.t[t]=!csvState.t[t];el('cchk-'+t)?.classList.toggle('on',csvState.t[t]);}
function setCsvRange(r){
  const td=today(); let fr;
  if(r==='week') fr=wStart();
  else if(r==='month') fr=mStart();
  else if(r==='3m'){const d=new Date();d.setMonth(d.getMonth()-3);fr=d.toISOString().split('T')[0];}
  else if(r==='year') fr=new Date().getFullYear()+'-01-01';
  else fr='2000-01-01';
  setVal('csv-from',fr); setVal('csv-to',td);
}
function selCsvGroup(btn,val){document.querySelectorAll('#csv-grp-row .chip').forEach(b=>b.classList.remove('on'));btn.classList.add('on');csvState.group=val;}
function openExpCsv(){hap('l');csvState.exportType='expense';el('csv-sheet-title').textContent='Export Expenses';el('csv-type-row').style.display='block';el('csv-grp-row').style.display='block';setCsvRange('month');buildCsvCols('expense');showSheet('csv');}
function openReportCsv(type){hap('l');csvState.exportType=type;el('csv-sheet-title').textContent='Export '+(type==='daily'?'Daily Reports':'Visit Reports');el('csv-type-row').style.display='none';el('csv-grp-row').style.display='none';setCsvRange('month');buildCsvCols(type);showSheet('csv');}
function runCsv(){
  hap('m');
  const fr=el('csv-from').value||'2000-01-01', to=el('csv-to').value||today();
  const etype=csvState.exportType;
  const get=(c)=>csvState.cols[c]!==false;
  if(etype==='daily'){
    const rows=dailyReports.filter(r=>r.date>=fr&&r.date<=to);
    if(!rows.length){toast('No records in range','warn');return;}
    const cols=['Date','Status','Mood','Summary','Tasks','Issues','Plan'].filter(get);
    let csv=cols.join(',')+'\n';
rows.forEach(r=>{csv+=cols.map(c=>`"${String({Date:r.date,Status:r.status,Mood:r.mood,Summary:r.notes,Tasks:r.tasks,Issues:r.issues,Plan:r.plan}[c]||'').replace(/\"/g,'""')}"`).join(',')+'\n';});    dl(csv,'d3v-nexus-daily-'+fr+'-'+to+'.csv'); toast('Exported '+rows.length+' reports!','ok'); hideSheet('csv'); return;
  }
  if(etype==='visit'){
    const rows=visitReports.filter(r=>r.date>=fr&&r.date<=to);
    if(!rows.length){toast('No records in range','warn');return;}
    const cols=['Date','Time','Client','Location','Contact','Purpose','Notes','Outcome','Status','Follow-up'].filter(get);
    let csv=cols.join(',')+'\n';
rows.forEach(r=>{csv+=cols.map(c=>`"${String({'Date':r.date,'Time':r.time,'Client':r.client,'Location':r.location,'Contact':r.contact,'Purpose':r.purpose,'Notes':r.notes,'Outcome':r.outcome,'Status':r.status,'Follow-up':r.followup}[c]||'').replace(/\"/g,'""')}"`).join(',')+'\n';});    dl(csv,'d3v-nexus-visits-'+fr+'-'+to+'.csv'); toast('Exported '+rows.length+'!','ok'); hideSheet('csv'); return;
  }
  let rows=[];
  if(csvState.t.expense) rows.push(...expenses.filter(e=>e.date>=fr&&e.date<=to).map(e=>({Date:e.date,Type:'Expense',Category:ECATS.find(c=>c.k===e.category)?.l||e.category,Note:e.note||'',Amount:e.amount})));
  if(csvState.t.income)  rows.push(...income.filter(i=>i.date>=fr&&i.date<=to).map(i=>({Date:i.date,Type:'Income',Category:ICATS.find(c=>c.k===i.source)?.l||i.source,Note:i.note||'',Amount:i.amount})));
  rows.sort((a,b)=>a.Date.localeCompare(b.Date));
  if(!rows.length){toast('No records in range','warn');return;}
  const cols=['Date','Type','Category','Note','Amount'].filter(get);
  let csv='';
  const row2csv=r=>cols.map(c=>`"${String(r[c]||'').replace(/"/g,'""')}"`).join(',')+'\n';
  if(csvState.group==='month'){
    const g={};rows.forEach(r=>{const k=r.Date.slice(0,7);if(!g[k])g[k]=[];g[k].push(r);});
    Object.entries(g).sort().forEach(([k,gr])=>{const[y,m]=k.split('-');csv+=`"--- ${MN[parseInt(m)-1]} ${y} ---"\n`+cols.join(',')+'\n';gr.forEach(r=>{csv+=row2csv(r);});});
  } else if(csvState.group==='category'){
    const g={};rows.forEach(r=>{if(!g[r.Category])g[r.Category]=[];g[r.Category].push(r);});
    Object.entries(g).sort().forEach(([k,gr])=>{csv+=`"--- ${k} ---"\n`+cols.join(',')+'\n';gr.forEach(r=>{csv+=row2csv(r);});});
  } else { csv=cols.join(',')+'\n'; rows.forEach(r=>{csv+=row2csv(r);}); }
  dl(csv,'d3v-nexus-expenses-'+fr+'-'+to+'.csv'); toast('Exported '+rows.length+' records!','ok'); hideSheet('csv');
}
function dl(csv,fn){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download=fn;document.body.appendChild(a);a.click();document.body.removeChild(a);}

// ===== SHEETS =====
function showSheet(n){el(n+'-ov').classList.add('show');el(n+'-sheet').classList.add('show');}
function hideSheet(n){el(n+'-ov').classList.remove('show');el(n+'-sheet').classList.remove('show');}

// ===== TAB SWITCH =====
function switchTab(t) {
  hap('l'); tab=t;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  el('tab-'+t).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const tabs=['home','history','analytics','reports','settings'];
  document.querySelectorAll('.nav-item')[tabs.indexOf(t)]?.classList.add('active');
  const titles={home:'d3v Nexus',history:'History',analytics:'Analytics',reports:'Reports',settings:'Settings'};
  el('page-title').textContent=titles[t]||t;
  if(t==='home')     { renderHome(); }
  if(t==='history')  { renderHistory(); }
  if(t==='analytics'){ renderAnalytics(); }
  if(t==='reports')  { if(reportTab==='daily') renderDailyList(); else renderVisitList(); }
  if(t==='settings') { renderSettings(); }
}

// ===== SW =====
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);

// Remove these lines from the TOP of your file:
// auth.getRedirectResult().then(...)
// auth.onAuthStateChanged(...)
// initTheme();

// ===== BOOT =====
window.addEventListener('DOMContentLoaded', () => {
  // 1. Setup UI first
  initTheme();
  initAmountInput();
  
  // 2. Then check Firebase Auth
  auth.getRedirectResult().then(r => { if (r.user) initApp(r.user); }).catch(console.error);
  auth.onAuthStateChanged(u => { if (u) initApp(u); else showSignIn(); });
});