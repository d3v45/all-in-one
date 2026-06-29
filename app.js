// ============================================================
//  d3v NEXUS — App Logic v3.0
//  Multi-purpose: Expenses · Reports · Visits
// ============================================================

// ===== FIREBASE CONFIG =====
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
const googleProvider = new firebase.auth.GoogleAuthProvider();

auth.getRedirectResult().then(r => { if (r.user) initApp(r.user); }).catch(console.error);
auth.onAuthStateChanged(user => { if (user) initApp(user); else showSignIn(); });

// ===== STATE =====
let currentUser = null;
let expenses = [], incomeList = [], recurring = [], dailyReports = [], visitReports = [];
let settings  = { monthlyBudget: 0, catBudgets: {} };
let currentTab  = 'home';
let currentType = 'expense';
let selectedCat = null;
let isRecurringExpense = false;
let isRecurringIncome  = false;
let currentPeriod = 'month';
let historyFilter = 'all';
let deleteTarget  = null;
let chartInstances = {};
let budgetAlertFlags = {};
let notifEnabled = false;
let currentReportType = 'daily';
let viewMonthOffset   = 0;

// CSV state
let csvState = {
  type: { expense: true, income: true },
  groupBy: 'none',
  columns: { Date: true, Type: true, Category: true, Note: true, Amount: true }
};

// ===== CONSTANTS =====
const EXPENSE_CATS = [
  { key:'food',    emoji:'🍜', label:'Food'    },
  { key:'travel',  emoji:'🚗', label:'Travel'  },
  { key:'shop',    emoji:'🛒', label:'Shop'    },
  { key:'bills',   emoji:'⚡', label:'Bills'   },
  { key:'fun',     emoji:'🎬', label:'Fun'     },
  { key:'health',  emoji:'💊', label:'Health'  },
  { key:'cafe',    emoji:'☕', label:'Cafe'    },
  { key:'study',   emoji:'📚', label:'Study'   },
  { key:'rent',    emoji:'🏠', label:'Rent'    },
  { key:'other',   emoji:'💰', label:'Other'   },
];
const INCOME_SOURCES = [
  { key:'salary',    emoji:'💼', label:'Salary'    },
  { key:'freelance', emoji:'💻', label:'Freelance' },
  { key:'business',  emoji:'🏢', label:'Business'  },
  { key:'invest',    emoji:'📈', label:'Invest'    },
  { key:'gift',      emoji:'🎁', label:'Gift'      },
  { key:'reimbursement', emoji:'🔄', label:'Reimburse' },
  { key:'other',     emoji:'💰', label:'Other'     },
];
const MOOD_EMOJI = { great:'😄', good:'🙂', okay:'😐', tough:'😔' };
const FOLLOWUP_LABEL = { no:'None', call:'📞 Call', email:'📧 Email', meeting:'🤝 Meeting' };
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HAPTIC = { light:[6], medium:[12], heavy:[20], double:[10,50,10], success:[8,40,8] };

// ===== UTILS =====
function fmt(n) {
  if (!n && n !== 0) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '₹' + (abs/10000000).toFixed(1) + 'Cr';
  if (abs >= 100000)   return sign + '₹' + (abs/100000).toFixed(1) + 'L';
  if (abs >= 1000)     return sign + '₹' + (abs/1000).toFixed(1) + 'K';
  return sign + '₹' + abs.toFixed(0);
}
function fmtFull(n) {
  if (!n) return '₹0';
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function dayStr(offset) { const d = new Date(); d.setDate(d.getDate()+offset); return d.toISOString().split('T')[0]; }
function monthStart(offset=0) { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset); return d.toISOString().slice(0,7)+'-01'; }
function monthEnd(offset=0)   { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset+1); d.setDate(0); return d.toISOString().split('T')[0]; }
function weekStart() { const d=new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split('T')[0]; }
function sum(arr) { return arr.reduce((a,b)=>a+(b.amount||0),0); }
function nowTime() { const d=new Date(); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }
function getGreeting(name) {
  const h = new Date().getHours();
  const g = h<12 ? 'Good morning' : h<17 ? 'Good afternoon' : 'Good evening';
  return g + (name ? ', ' + name.split(' ')[0] : '');
}
function formatDateLabel(ds) {
  if (ds===todayStr()) return 'Today';
  if (ds===dayStr(-1)) return 'Yesterday';
  const d = new Date(ds);
  return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function haptic(type='light') {
  if (navigator.vibrate) navigator.vibrate(HAPTIC[type] || [8]);
}
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ===== THEME =====
function initTheme() {
  const dark = localStorage.getItem('theme') !== 'light';
  document.documentElement[dark?'removeAttribute':'setAttribute']('data-theme','light');
  updateThemeMeta();
  const t = document.getElementById('dark-toggle');
  if (t) t.classList.toggle('on', dark);
}
function toggleDarkMode() {
  haptic('medium');
  const isDark = !document.documentElement.hasAttribute('data-theme');
  document.documentElement[isDark?'setAttribute':'removeAttribute']('data-theme','light');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  document.getElementById('dark-toggle').classList.toggle('on');
  updateThemeMeta();
  if (currentTab==='analytics') setTimeout(renderAnalytics, 60);
}
function updateThemeMeta() {
  const dark = !document.documentElement.hasAttribute('data-theme');
  document.getElementById('theme-color-meta').setAttribute('content', dark ? '#04080f' : '#f0f2fa');
}

// ===== TOAST =====
function toast(msg, type='ok', duration=3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = { ok:'✓', err:'✕', warn:'⚠', info:'ℹ' };
  t.innerHTML = `<span>${icons[type]}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s, transform 0.3s';
    t.style.opacity = '0'; t.style.transform = 'translateY(-10px)';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ===== AUTH =====
function showSignIn() {
  document.getElementById('signin-screen').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
  currentUser = null;
}
function handleSignIn() {
  haptic('medium');
  document.getElementById('signin-status').innerHTML = '<div class="loader-spin" style="margin:0 auto;"></div>';
  auth.signInWithPopup(googleProvider).catch(err => {
    const c = (err.code||'').toLowerCase(), m = (err.message||'').toLowerCase();
    if (['popup-blocked','popup-closed-by-user','cancelled-popup-request','cross-origin'].some(e=>c.includes(e)||m.includes(e))) {
      toast('Opening secure login…', 'info');
      auth.signInWithRedirect(googleProvider);
    } else {
      document.getElementById('signin-status').textContent = 'Try again';
      toast('Sign-in failed', 'err');
    }
  });
}
function handleSignOut() { haptic('heavy'); auth.signOut(); location.reload(); }

function initApp(user) {
  currentUser = user;
  document.getElementById('signin-screen').classList.add('hidden');
  document.getElementById('app').style.display = 'flex';
  ['topbar','bottom-nav','user-chip'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='flex'; });
  document.getElementById('topbar-greeting').textContent = getGreeting(user.displayName);

  const av = document.getElementById('user-avatar');
  if (user.photoURL) {
    av.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    const sa = document.getElementById('settings-avatar');
    if (sa) { sa.src = user.photoURL; sa.style.display='block'; }
    const sf = document.getElementById('settings-avatar-fallback');
    if (sf) sf.style.display='none';
  } else {
    const letter = (user.displayName||'U')[0].toUpperCase();
    av.textContent = letter;
    const sf = document.getElementById('settings-avatar-fallback');
    if (sf) { sf.textContent=letter; sf.style.display='flex'; }
  }
  const sn = document.getElementById('settings-name');   if(sn) sn.textContent = user.displayName||'User';
  const se = document.getElementById('settings-email');  if(se) se.textContent = user.email||'';

  initTheme();
  setupListeners();

  setToday('date-input');
  setToday('dr-date');
  setToday('vr-date');
  const vt = document.getElementById('vr-time'); if(vt) vt.value = nowTime();
  renderCatGrid();
  updateMonthSelector();
}
function setToday(id) { const el=document.getElementById(id); if(el) el.value=todayStr(); }

// ===== FIRESTORE LISTENERS =====
function setupListeners() {
  const uid = currentUser.uid;
  db.collection('users').doc(uid).collection('expenses')
    .onSnapshot(s => { expenses = s.docs.map(d=>({id:d.id,...d.data()})); onDataChange(); });
  db.collection('users').doc(uid).collection('income')
    .onSnapshot(s => { incomeList = s.docs.map(d=>({id:d.id,...d.data()})); onDataChange(); });
  db.collection('users').doc(uid).collection('recurring')
    .onSnapshot(s => { recurring = s.docs.map(d=>({id:d.id,...d.data()})); checkRecurring(); if(currentTab==='settings') renderSettings(); });
  db.collection('users').doc(uid).collection('meta').doc('settings')
    .onSnapshot(d => { if(d.exists) settings=d.data(); if(currentTab==='settings') renderSettings(); });
  db.collection('users').doc(uid).collection('dailyReports').orderBy('date','desc')
    .onSnapshot(s => { dailyReports = s.docs.map(d=>({id:d.id,...d.data()})); if(currentTab==='reports'&&currentReportType==='daily') renderDailyReports(); });
  db.collection('users').doc(uid).collection('visitReports').orderBy('date','desc')
    .onSnapshot(s => { visitReports = s.docs.map(d=>({id:d.id,...d.data()})); if(currentTab==='reports'&&currentReportType==='visit') renderVisitReports(); });
}

function onDataChange() {
  if (currentTab==='home')      renderHome();
  if (currentTab==='history')   renderHistory();
  if (currentTab==='analytics') renderAnalytics();
  if (currentTab==='settings')  renderSettings();
  checkBudgetAlerts();
}

// ===== BUDGET ALERTS =====
function checkBudgetAlerts() {
  if (!settings) return;
  const ms = monthStart();
  const thisExp = expenses.filter(e=>e.date>=ms);
  const total = sum(thisExp);
  const mb = settings.monthlyBudget||0;
  if (mb>0) {
    const pct = total/mb*100;
    if (pct>=100 && !budgetAlertFlags.o100) { budgetAlertFlags.o100=true; toast('Monthly budget exceeded! '+fmt(total)+' / '+fmt(mb),'err',5000); sendNotif('Budget exceeded','You used '+fmt(total)+' of your '+fmt(mb)+' budget'); }
    else if (pct>=80 && !budgetAlertFlags.o80) { budgetAlertFlags.o80=true; toast('80% of monthly budget used','warn',4000); }
  }
  if (settings.catBudgets) {
    for (const [cat,budget] of Object.entries(settings.catBudgets)) {
      const s = sum(thisExp.filter(e=>e.category===cat));
      if (budget>0 && s>budget && !budgetAlertFlags['c_'+cat]) {
        budgetAlertFlags['c_'+cat]=true;
        const cl = EXPENSE_CATS.find(c=>c.key===cat)?.label||cat;
        toast(cl+' budget exceeded!','err');
      }
    }
  }
}
function sendNotif(title, body) {
  if (notifEnabled && 'Notification' in window && Notification.permission==='granted')
    new Notification(title, { body, icon:'icon-192.png' });
}

// ===== HOME =====
function updateMonthSelector() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth()+viewMonthOffset, 1);
  const label = viewMonthOffset===0 ? 'This Month' : MONTH_NAMES[d.getMonth()]+' '+d.getFullYear();
  document.getElementById('month-selector-label').textContent = label;
  const nb = document.getElementById('month-next-btn');
  if(nb) { nb.style.opacity = viewMonthOffset>=0?'0.3':'1'; nb.disabled = viewMonthOffset>=0; }
}
function changeViewMonth(dir) {
  haptic('light');
  if (dir>0 && viewMonthOffset>=0) return;
  viewMonthOffset += dir;
  updateMonthSelector();
  renderHome();
}
function renderHome() {
  const mS = monthStart(viewMonthOffset), mE = monthEnd(viewMonthOffset);
  const mExp = expenses.filter(e=>e.date>=mS&&e.date<=mE);
  const mInc = incomeList.filter(i=>i.date>=mS&&i.date<=mE);
  const spent = sum(mExp), earned = sum(mInc), balance = earned - spent;

  document.getElementById('home-spent').textContent   = fmt(spent);
  document.getElementById('home-earned').textContent  = fmt(earned);
  const bEl = document.getElementById('home-balance');
  bEl.textContent  = fmt(balance);
  bEl.className    = 'overview-value ' + (balance>=0 ? 'ov-balance' : 'ov-expense');

  const pS = monthStart(viewMonthOffset-1), pE = monthEnd(viewMonthOffset-1);
  const prevSpent = sum(expenses.filter(e=>e.date>=pS&&e.date<=pE));
  const tEl = document.getElementById('spent-trend');
  if (tEl && prevSpent>0) {
    const chg = ((spent-prevSpent)/prevSpent*100).toFixed(0);
    const up = spent>prevSpent;
    tEl.innerHTML = `<span class="${up?'trend-up':'trend-down'}">${up?'↑':'↓'}${Math.abs(chg)}% vs prev</span>`;
  } else if(tEl) tEl.innerHTML='';
}

function setType(type) {
  haptic('medium');
  currentType = type; selectedCat = null;
  const btnE = document.getElementById('btn-type-expense');
  const btnI = document.getElementById('btn-type-income');
  if(btnE) btnE.className = type==='expense' ? 'active-expense' : '';
  if(btnI) btnI.className = type==='income'  ? 'active-income'  : '';

  const recRowE = document.getElementById('rec-row-expense');
  const recRowI = document.getElementById('rec-row-income');
  const recOptsE = document.getElementById('rec-opts-expense');
  const recOptsI = document.getElementById('rec-opts-income');
  if(recRowE) recRowE.style.display = type==='expense'?'flex':'none';
  if(recRowI) recRowI.style.display = type==='income'?'flex':'none';
  if(recOptsE) recOptsE.style.display='none';
  if(recOptsI) recOptsI.style.display='none';
  isRecurringExpense=false; isRecurringIncome=false;
  const teE=document.getElementById('rec-toggle-expense'), teI=document.getElementById('rec-toggle-income');
  if(teE) teE.classList.remove('on');
  if(teI) teI.classList.remove('on');

  const btn = document.getElementById('btn-add');
  if(btn) { btn.className='btn-primary btn-'+type; btn.querySelector('span').textContent='Add '+(type==='expense'?'Expense':'Income'); }
  renderCatGrid();
}
function renderCatGrid() {
  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  const items = currentType==='expense' ? EXPENSE_CATS : INCOME_SOURCES;
  grid.innerHTML = items.map(cat => {
    const sel = selectedCat===cat.key;
    const selClass = sel ? (currentType==='expense'?'sel-expense':'sel-income') : '';
    return `<button class="cat-btn ${selClass}" onclick="selectCat('${cat.key}')"><span class="cat-emoji">${cat.emoji}</span><span>${cat.label}</span></button>`;
  }).join('');
}
function selectCat(key) { haptic('light'); selectedCat=key; renderCatGrid(); }

function toggleRecurringExpense() {
  haptic('light');
  isRecurringExpense = !isRecurringExpense;
  document.getElementById('rec-toggle-expense').classList.toggle('on', isRecurringExpense);
  document.getElementById('rec-opts-expense').style.display = isRecurringExpense?'block':'none';
}
function toggleRecurringIncome() {
  haptic('light');
  isRecurringIncome = !isRecurringIncome;
  document.getElementById('rec-toggle-income').classList.toggle('on', isRecurringIncome);
  document.getElementById('rec-opts-income').style.display = isRecurringIncome?'block':'none';
}

function addTransaction() {
  haptic('medium');
  const amount = parseFloat(document.getElementById('amount-input').value);
  if (!amount||amount<=0) { haptic('double'); toast('Enter a valid amount','warn'); return; }
  if (!selectedCat)        { haptic('double'); toast('Select a category','warn'); return; }
  const note = document.getElementById('note-input').value.trim();
  const date = document.getElementById('date-input').value||todayStr();
  const uid  = currentUser.uid;

  if (currentType==='expense') {
    db.collection('users').doc(uid).collection('expenses').add({
      amount, category:selectedCat, note, date, isRecurring:false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(()=>{ haptic('success'); toast('Expense added!','ok'); resetForm(); });
    if (isRecurringExpense) {
      const freq = document.getElementById('rec-freq-expense').value;
      const d = new Date();
      db.collection('users').doc(uid).collection('recurring').add({
        amount, category:selectedCat, note, frequency:freq, recType:'expense',
        dayOfWeek:d.getDay(), dayOfMonth:d.getDate(), lastAdded:date, active:true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } else {
    db.collection('users').doc(uid).collection('income').add({
      amount, source:selectedCat, note, date,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(()=>{ haptic('success'); toast('Income added!','ok'); resetForm(); });
    if (isRecurringIncome) {
      const freq = document.getElementById('rec-freq-income').value;
      const d = new Date();
      db.collection('users').doc(uid).collection('recurring').add({
        amount, category:selectedCat, note, frequency:freq, recType:'income',
        dayOfWeek:d.getDay(), dayOfMonth:d.getDate(), lastAdded:date, active:true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }
}

function resetForm() {
  document.getElementById('amount-input').value='';
  document.getElementById('note-input').value='';
  document.getElementById('date-input').value=todayStr();
  selectedCat=null; isRecurringExpense=false; isRecurringIncome=false;
  ['rec-toggle-expense','rec-toggle-income'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('on'); });
  ['rec-opts-expense','rec-opts-income'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  renderCatGrid();
}

// ===== RECURRING CHECK =====
function checkRecurring() {
  if (!currentUser) return;
  const uid=currentUser.uid, today=todayStr();
  let added=0;
  recurring.filter(r=>r.active).forEach(r=>{
    let ok=false;
    const last=r.lastAdded, d=new Date();
    if (r.frequency==='daily') ok = last!==today;
    else if (r.frequency==='weekly') {
      const days = last ? Math.floor((new Date(today)-new Date(last))/86400000) : 999;
      ok = d.getDay()===(r.dayOfWeek??1) && days>=6;
    } else if (r.frequency==='monthly') {
      const months = last ? (d.getFullYear()-new Date(last).getFullYear())*12+d.getMonth()-new Date(last).getMonth() : 999;
      ok = d.getDate()===(r.dayOfMonth??1) && months>=1;
    }
    if (ok) {
      const col = r.recType==='income' ? 'income' : 'expenses';
      const data = r.recType==='income'
        ? { amount:r.amount, source:r.category, note:r.note||'', date:today, isRecurring:true, createdAt:firebase.firestore.FieldValue.serverTimestamp() }
        : { amount:r.amount, category:r.category, note:r.note||'', date:today, isRecurring:true, createdAt:firebase.firestore.FieldValue.serverTimestamp() };
      db.collection('users').doc(uid).collection(col).add(data);
      db.collection('users').doc(uid).collection('recurring').doc(r.id).update({ lastAdded:today });
      added++;
    }
  });
  if (added>0) toast(`Added ${added} recurring transaction${added>1?'s':''}`, 'info');
}

// ===== HISTORY =====
function renderHistory() {
  const search = (document.getElementById('history-search')?.value||'').toLowerCase();
  const chipsEl = document.getElementById('filter-chips');
  const usedCats = [...new Set(expenses.map(e=>e.category))];
  let chipsHtml = `<button class="chip ${historyFilter==='all'?'active':''}" onclick="setFilter('all')">All</button>`;
  chipsHtml += `<button class="chip ${historyFilter==='income'?'active':''}" onclick="setFilter('income')">📥 Income</button>`;
  chipsHtml += `<button class="chip ${historyFilter==='expense'?'active':''}" onclick="setFilter('expense')">📤 Expense</button>`;
  usedCats.forEach(cat=>{
    const c=EXPENSE_CATS.find(x=>x.key===cat);
    if(c) chipsHtml += `<button class="chip ${historyFilter===cat?'active':''}" onclick="setFilter('${cat}')">${c.emoji} ${c.label}</button>`;
  });
  if(chipsEl) chipsEl.innerHTML=chipsHtml;

  let all = [
    ...expenses.map(e=>({...e,_type:'expense'})),
    ...incomeList.map(i=>({...i,_type:'income'}))
  ];
  if (historyFilter==='income')       all = all.filter(x=>x._type==='income');
  else if (historyFilter==='expense') all = all.filter(x=>x._type==='expense');
  else if (historyFilter!=='all')     all = all.filter(x=>x.category===historyFilter||x.source===historyFilter);
  if (search) all = all.filter(x=>(x.note||'').toLowerCase().includes(search)||(x.category||x.source||'').toLowerCase().includes(search));
  all.sort((a,b)=>b.date.localeCompare(a.date)||((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));

  const listEl = document.getElementById('history-list');
  if (!listEl) return;
  if (!all.length) { listEl.innerHTML='<div class="empty-state"><div class="ee">📋</div><h3>Nothing here yet</h3><p>Add your first transaction above</p></div>'; return; }

  const groups={};
  all.forEach(item=>{ if(!groups[item.date]) groups[item.date]=[]; groups[item.date].push(item); });

  let html='';
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
    const items=groups[date];
    const dExp=sum(items.filter(x=>x._type==='expense')), dInc=sum(items.filter(x=>x._type==='income'));
    html+=`<div class="history-date-header"><span>${formatDateLabel(date)}</span><span class="history-date-totals">${dExp>0?`<span class="text-expense">-${fmt(dExp)}</span> `:''} ${dInc>0?`<span class="text-income">+${fmt(dInc)}</span>`:''}</span></div>`;
    items.forEach(item=>{
      const isE=item._type==='expense';
      const catKey=isE?item.category:item.source;
      const catInfo=isE?EXPENSE_CATS.find(c=>c.key===catKey):INCOME_SOURCES.find(c=>c.key===catKey);
      const emoji=catInfo?catInfo.emoji:'💰', catName=catInfo?catInfo.label:catKey;
      html+=`<div class="history-item anim-in">
        <div class="history-icon">${emoji}</div>
        <div class="history-info">
          <div class="history-cat">${esc(catName)}${item.isRecurring?'<span class="recurring-badge">↻ auto</span>':''}</div>
          <div class="history-note">${item.note?esc(item.note):'<span style="opacity:0.35">No note</span>'}</div>
        </div>
        <div style="text-align:right;">
          <div class="history-amt ${isE?'h-expense':'h-income'}">${isE?'-':'+'}${fmt(item.amount)}</div>
          <div class="history-actions">
            <button onclick="openEdit('${item.id}','${item._type}')" title="Edit">✏</button>
            <button onclick="promptDelete('${item.id}','${item._type}')" title="Delete">🗑</button>
          </div>
        </div>
      </div>`;
    });
  });
  listEl.innerHTML=html;
}
function setFilter(f) { haptic('light'); historyFilter=f; renderHistory(); }

// ===== EDIT =====
function openEdit(id, type) {
  haptic('light');
  const arr = type==='expense' ? expenses : incomeList;
  const item = arr.find(x=>x.id===id);
  if (!item) return;
  document.getElementById('edit-id').value   = id;
  document.getElementById('edit-type').value = type;
  document.getElementById('edit-amount').value = item.amount;
  const catKey = item.category||item.source;
  const catInfo = (type==='expense'?EXPENSE_CATS:INCOME_SOURCES).find(c=>c.key===catKey);
  document.getElementById('edit-category').value = catInfo?catInfo.label:catKey;
  document.getElementById('edit-note').value = item.note||'';
  document.getElementById('edit-date').value = item.date;
  document.getElementById('edit-save-btn').className = 'btn-primary btn-'+type;
  showSheet('edit');
}
function saveEdit() {
  haptic('medium');
  const id=document.getElementById('edit-id').value, type=document.getElementById('edit-type').value;
  const amount=parseFloat(document.getElementById('edit-amount').value);
  const note=document.getElementById('edit-note').value.trim();
  const date=document.getElementById('edit-date').value;
  if (!amount||amount<=0) { haptic('double'); toast('Enter valid amount','warn'); return; }
  const col = type==='expense'?'expenses':'income';
  db.collection('users').doc(currentUser.uid).collection(col).doc(id).update({amount,note,date}).then(()=>{ haptic('success'); toast('Updated!','ok'); hideSheet('edit'); });
}

// ===== DELETE =====
function promptDelete(id, type) {
  haptic('medium');
  deleteTarget={id,type};
  document.getElementById('confirm-msg').textContent='This action cannot be undone.';
  document.getElementById('confirm-overlay').classList.add('show');
}
function cancelDelete() { deleteTarget=null; document.getElementById('confirm-overlay').classList.remove('show'); }
function confirmDelete() {
  haptic('heavy');
  if (!deleteTarget) return;
  if (deleteTarget.type.startsWith('__report_')) {
    const rtype=deleteTarget.type.replace('__report_','');
    const col=rtype==='daily'?'dailyReports':'visitReports';
    db.collection('users').doc(currentUser.uid).collection(col).doc(deleteTarget.id).delete().then(()=>{ haptic('success'); toast('Report deleted','ok'); cancelDelete(); });
    return;
  }
  const col=deleteTarget.type==='expense'?'expenses':'income';
  db.collection('users').doc(currentUser.uid).collection(col).doc(deleteTarget.id).delete().then(()=>{ haptic('success'); toast('Deleted','ok'); cancelDelete(); });
}

// ===== ANALYTICS =====
function setPeriod(p) {
  haptic('light'); currentPeriod=p;
  ['week','month','3m','year','all'].forEach(id=>{ const el=document.getElementById('period-'+id); if(el) el.classList.remove('active'); });
  const a=document.getElementById('period-'+p); if(a) a.classList.add('active');
  renderAnalytics();
}
function renderAnalytics() {
  const today=todayStr(), wS=weekStart(), mS=monthStart();
  let startDate;
  if (currentPeriod==='week')  startDate=wS;
  else if (currentPeriod==='month') startDate=mS;
  else if (currentPeriod==='3m')    { const d=new Date(); d.setMonth(d.getMonth()-3); startDate=d.toISOString().split('T')[0]; }
  else if (currentPeriod==='year')  startDate=new Date().getFullYear()+'-01-01';
  else startDate='2000-01-01';

  const pExp=expenses.filter(e=>e.date>=startDate&&e.date<=today);
  const pInc=incomeList.filter(i=>i.date>=startDate&&i.date<=today);
  const tExp=sum(pExp), tInc=sum(pInc), balance=tInc-tExp;

  document.getElementById('stat-today').textContent = fmt(sum(expenses.filter(e=>e.date===today)));
  document.getElementById('stat-week').textContent  = fmt(sum(expenses.filter(e=>e.date>=wS)));
  document.getElementById('stat-month').textContent = fmt(sum(expenses.filter(e=>e.date>=mS)));

  const bv=document.getElementById('balance-value');
  if(bv) { bv.textContent=fmt(balance); bv.style.color=balance>=0?'var(--balance)':'var(--expense)'; }
  const bi=document.getElementById('balance-income');   if(bi) bi.textContent=fmt(tInc);
  const be=document.getElementById('balance-expense');  if(be) be.textContent=fmt(tExp);

  if (currentPeriod==='month') {
    const lS=monthStart(-1), lE=monthEnd(-1);
    const lNet=sum(incomeList.filter(i=>i.date>=lS&&i.date<=lE))-sum(expenses.filter(e=>e.date>=lS&&e.date<=lE));
    const tEl=document.getElementById('balance-trend');
    if(tEl&&lNet!==0){ const chg=((balance-lNet)/Math.abs(lNet)*100).toFixed(0); const up=balance>lNet; tEl.innerHTML=`<span class="${up?'trend-down':'trend-up'}">${up?'↑':'↓'}${Math.abs(chg)}% vs last month</span>`; }
    else if(tEl) tEl.innerHTML='';
  } else { const tEl=document.getElementById('balance-trend'); if(tEl) tEl.innerHTML=''; }

  renderCharts(pExp, pInc);
  renderCatBreakdown(pExp);
}

function renderCharts(pExp, pInc) {
  const dark = !document.documentElement.hasAttribute('data-theme');
  const gridC = dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)';
  const textC = dark?'#3d5470':'#94a3b8';
  Chart.defaults.color = textC;

  // 6-month bar
  const months=[], labels=[];
  for(let i=5;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); months.push(d.toISOString().slice(0,7)); labels.push(MONTH_NAMES[parseInt(d.toISOString().slice(5,7))-1]); }
  if(chartInstances.trend) chartInstances.trend.destroy();
  chartInstances.trend=new Chart(document.getElementById('chart-trend'),{
    type:'bar',
    data:{ labels, datasets:[
      { label:'Expenses', data:months.map(m=>sum(expenses.filter(e=>e.date.startsWith(m)))), backgroundColor:'rgba(255,107,138,0.75)', borderRadius:5, borderSkipped:false },
      { label:'Income',   data:months.map(m=>sum(incomeList.filter(i=>i.date.startsWith(m)))),  backgroundColor:'rgba(45,212,160,0.75)',  borderRadius:5, borderSkipped:false }
    ]},
    options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ labels:{ color:textC, font:{size:11}, boxWidth:10, padding:12 } } }, scales:{ x:{grid:{color:gridC},ticks:{color:textC,font:{size:10}}}, y:{grid:{color:gridC},ticks:{color:textC,font:{size:10},callback:v=>fmt(v)}} } }
  });

  // Daily bars
  const days=currentPeriod==='week'?7:30, dLabels=[], dData=[];
  for(let i=days-1;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const ds=d.toISOString().split('T')[0]; dLabels.push(d.getDate()); dData.push(sum(expenses.filter(e=>e.date===ds))); }
  const barColors=dData.map((_,i)=>i===dLabels.length-1?'rgba(108,99,255,0.9)':'rgba(255,107,138,0.55)');
  if(chartInstances.daily) chartInstances.daily.destroy();
  chartInstances.daily=new Chart(document.getElementById('chart-daily'),{
    type:'bar', data:{ labels:dLabels, datasets:[{ data:dData, backgroundColor:barColors, borderRadius:4, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false} }, scales:{ x:{grid:{display:false},ticks:{color:textC,font:{size:9}}}, y:{grid:{color:gridC},ticks:{color:textC,font:{size:10},callback:v=>fmt(v)}} } }
  });
  const dt=document.getElementById('daily-chart-title'); if(dt) dt.textContent=(currentPeriod==='week'?'Daily Spending (7 Days)':'Daily Spending (30 Days)');

  // Doughnut
  const catTotals={};
  pExp.forEach(e=>{ catTotals[e.category]=(catTotals[e.category]||0)+e.amount; });
  const catKeys=Object.keys(catTotals);
  const colors=['#6c63ff','#ff6b8a','#2dd4a0','#fbbf24','#60d4f7','#a78bfa','#fb7185','#22d3ee','#a3e635','#f472b6'];
  if(chartInstances.cat) chartInstances.cat.destroy();
  if(catKeys.length) chartInstances.cat=new Chart(document.getElementById('chart-cat'),{
    type:'doughnut',
    data:{ labels:catKeys.map(k=>EXPENSE_CATS.find(x=>x.key===k)?.label||k), datasets:[{ data:catKeys.map(k=>catTotals[k]), backgroundColor:colors.slice(0,catKeys.length), borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ position:'right', labels:{ color:textC, font:{size:10}, boxWidth:10, padding:8 } } }, cutout:'62%' }
  });
}

function renderCatBreakdown(pExp) {
  const totals={};
  pExp.forEach(e=>{ totals[e.category]=(totals[e.category]||0)+e.amount; });
  const total=sum(pExp);
  const el=document.getElementById('cat-breakdown');
  if (!el) return;
  if (!total) { el.innerHTML='<div class="empty-state" style="padding:20px;"><div class="ee">📊</div><p>No expense data for this period</p></div>'; return; }
  const sorted=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  el.innerHTML=sorted.map(([cat,amt])=>{
    const ci=EXPENSE_CATS.find(c=>c.key===cat);
    const pct=(amt/total*100).toFixed(0);
    const budget=settings?.catBudgets?.[cat];
    let budgetHtml='', barColor='#6c63ff';
    if(budget>0){ const left=budget-amt, bp=amt/budget; budgetHtml=`<div class="cat-bd-budget" style="color:${bp>1?'var(--expense)':bp>0.8?'var(--warn)':'var(--income)'}">${left>=0?fmt(left)+' left':'Over by '+fmt(Math.abs(left))}</div>`; barColor=bp>1?'#ff6b8a':bp>0.8?'#fbbf24':'#2dd4a0'; }
    return `<div class="cat-breakdown-item"><div class="cat-bd-icon">${ci?ci.emoji:''}</div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:baseline;"><span class="cat-bd-name">${ci?ci.label:cat}</span><span class="cat-bd-amt">${fmt(amt)} <span style="color:var(--text3);font-size:10px;">${pct}%</span></span></div><div class="cat-bd-bar"><div class="cat-bd-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>${budgetHtml}</div></div>`;
  }).join('');
}

// ===== SETTINGS =====
function renderSettings() {
  const mb=settings?.monthlyBudget||0;
  const mbD=document.getElementById('monthly-budget-display');
  const mbP=document.getElementById('monthly-budget-progress');
  if (mb>0&&mbD) {
    mbD.textContent='Budget: '+fmtFull(mb);
    if(mbP) mbP.style.display='block';
    const spent=sum(expenses.filter(e=>e.date>=monthStart()));
    const pct=Math.min(spent/mb*100,100);
    const bar=document.getElementById('monthly-budget-bar');
    if(bar) { bar.style.width=pct+'%'; bar.style.background=pct>100?'var(--expense)':pct>80?'var(--warn)':'var(--income)'; }
    const bt=document.getElementById('monthly-budget-text'); if(bt) bt.textContent=fmtFull(spent)+' / '+fmtFull(mb)+' ('+pct.toFixed(0)+'%)';
  } else { if(mbD) mbD.textContent='No budget set'; if(mbP) mbP.style.display='none'; }

  const thisExp=expenses.filter(e=>e.date>=monthStart());
  const cbEl=document.getElementById('settings-cat-budgets');
  if(cbEl) cbEl.innerHTML=EXPENSE_CATS.map(cat=>{
    const spent=sum(thisExp.filter(e=>e.category===cat.key));
    const budget=settings?.catBudgets?.[cat.key]||0;
    return `<div class="settings-row mb-8" onclick="openCatBudget('${cat.key}')"><div class="settings-row-left"><div class="settings-row-icon">${cat.emoji}</div><div><div class="settings-row-label">${cat.label}</div><div class="settings-row-sub">Spent: ${fmt(spent)}${budget>0?' · Limit: '+fmt(budget):''}</div></div></div><span style="font-size:11px;font-weight:700;color:var(--accent2);">${budget>0?'Edit':'Set'}</span></div>`;
  }).join('');

  const actRec=recurring.filter(r=>r.active);
  const recEl=document.getElementById('settings-recurring');
  if(recEl) recEl.innerHTML=!actRec.length
    ? '<div class="empty-state" style="padding:18px;"><div class="ee">🔄</div><p>No recurring transactions set</p></div>'
    : actRec.map(r=>{
        const isInc=r.recType==='income';
        const c=isInc?INCOME_SOURCES.find(x=>x.key===r.category):EXPENSE_CATS.find(x=>x.key===r.category);
        return `<div class="settings-row mb-8"><div class="settings-row-left"><div class="settings-row-icon">${c?c.emoji:''}</div><div><div class="settings-row-label">${r.note||(c?c.label:r.category)}</div><div class="settings-row-sub">${r.frequency} · ${fmt(r.amount)} · <span style="color:${isInc?'var(--income)':'var(--expense)'}">${isInc?'Income':'Expense'}</span></div></div></div><button class="btn-secondary btn-danger" onclick="deleteRecurring('${r.id}')">Remove</button></div>`;
      }).join('');
}

function openBudget() {
  haptic('light');
  document.getElementById('budget-cat').value='';
  document.getElementById('budget-modal-title').textContent='Monthly Budget';
  document.getElementById('budget-amount').value=settings?.monthlyBudget||'';
  showSheet('budget');
}
function openCatBudget(cat) {
  haptic('light');
  const c=EXPENSE_CATS.find(x=>x.key===cat);
  document.getElementById('budget-cat').value=cat;
  document.getElementById('budget-modal-title').textContent=(c?c.label:cat)+' Budget';
  document.getElementById('budget-amount').value=settings?.catBudgets?.[cat]||'';
  showSheet('budget');
}
function saveBudget() {
  haptic('medium');
  const cat=document.getElementById('budget-cat').value;
  const amount=parseFloat(document.getElementById('budget-amount').value);
  const ref=db.collection('users').doc(currentUser.uid).collection('meta').doc('settings');
  const data={};
  if(cat){ const cb={...(settings?.catBudgets||{})}; cb[cat]=amount||0; data.catBudgets=cb; }
  else data.monthlyBudget=amount||0;
  ref.set(data,{merge:true}).then(()=>{ haptic('success'); toast('Budget saved','ok'); hideSheet('budget'); });
}
function removeBudget() {
  haptic('medium');
  const cat=document.getElementById('budget-cat').value;
  const ref=db.collection('users').doc(currentUser.uid).collection('meta').doc('settings');
  const data={};
  if(cat){ const cb={...(settings?.catBudgets||{})}; delete cb[cat]; data.catBudgets=cb; }
  else data.monthlyBudget=0;
  ref.set(data,{merge:true}).then(()=>{ haptic('success'); toast('Budget removed','ok'); hideSheet('budget'); });
}
function deleteRecurring(id) {
  haptic('medium');
  db.collection('users').doc(currentUser.uid).collection('recurring').doc(id).update({active:false}).then(()=>toast('Removed','ok'));
}
function toggleNotifications() {
  haptic('medium');
  if (!notifEnabled) {
    Notification.requestPermission().then(p=>{
      if(p==='granted'){ notifEnabled=true; document.getElementById('notif-toggle').classList.add('on'); document.getElementById('notif-status').textContent='Enabled'; toast('Budget alerts on','ok'); }
      else { document.getElementById('notif-status').textContent='Blocked — check browser settings'; toast('Notifications blocked','err'); }
    });
  } else {
    notifEnabled=false; document.getElementById('notif-toggle').classList.remove('on');
    document.getElementById('notif-status').textContent='Tap to enable'; toast('Alerts disabled','info');
  }
}

// ===== REPORTS =====
function switchReportType(type) {
  haptic('medium');
  currentReportType=type;
  document.getElementById('rtab-daily').classList.toggle('active', type==='daily');
  document.getElementById('rtab-visit').classList.toggle('active', type==='visit');
  document.getElementById('daily-report-form').style.display = type==='daily'?'block':'none';
  document.getElementById('visit-report-form').style.display = type==='visit'?'block':'none';
  if(type==='daily') renderDailyReports(); else renderVisitReports();
}

function saveDailyReport() {
  haptic('medium');
  const date=document.getElementById('dr-date').value;
  const notes=document.getElementById('dr-notes').value.trim();
  if(!date){ haptic('double'); toast('Select a date','warn'); return; }
  if(!notes){ haptic('double'); toast('Add a summary note','warn'); return; }
  db.collection('users').doc(currentUser.uid).collection('dailyReports').add({
    date, notes,
    tasks: document.getElementById('dr-tasks').value.trim(),
    issues:document.getElementById('dr-issues').value.trim(),
    plan:  document.getElementById('dr-plan').value.trim(),
    mood:  document.getElementById('dr-mood').value,
    status:document.getElementById('dr-status').value,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{ haptic('success'); toast('Daily report saved!','ok'); ['dr-notes','dr-tasks','dr-issues','dr-plan'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); setToday('dr-date'); });
}

function saveVisitReport() {
  haptic('medium');
  const date=document.getElementById('vr-date').value;
  const client=document.getElementById('vr-client').value.trim();
  const notes=document.getElementById('vr-notes').value.trim();
  if(!date){ haptic('double'); toast('Select a date','warn'); return; }
  if(!client){ haptic('double'); toast('Enter client name','warn'); return; }
  if(!notes){ haptic('double'); toast('Add visit notes','warn'); return; }
  db.collection('users').doc(currentUser.uid).collection('visitReports').add({
    date, time:document.getElementById('vr-time').value,
    client, location:document.getElementById('vr-location').value.trim(),
    contact:document.getElementById('vr-contact').value.trim(),
    purpose:document.getElementById('vr-purpose').value.trim(),
    notes, outcome:document.getElementById('vr-outcome').value.trim(),
    status:document.getElementById('vr-status').value,
    followup:document.getElementById('vr-followup').value,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{ haptic('success'); toast('Visit report saved!','ok'); ['vr-client','vr-location','vr-contact','vr-purpose','vr-notes','vr-outcome'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); setToday('vr-date'); document.getElementById('vr-time').value=nowTime(); });
}

function renderDailyReports() {
  const el=document.getElementById('daily-report-list');
  if(!el) return;
  const ss=document.getElementById('dr-stats-total'); if(ss) ss.textContent=dailyReports.length;
  const sc=document.getElementById('dr-stats-completed'); if(sc) sc.textContent=dailyReports.filter(r=>r.status==='completed').length;
  const sp=document.getElementById('dr-stats-pending'); if(sp) sp.textContent=dailyReports.filter(r=>r.status==='pending').length;
  if(!dailyReports.length){ el.innerHTML='<div class="empty-state"><div class="ee">📋</div><h3>No reports yet</h3><p>Save your first daily report above</p></div>'; return; }
  el.innerHTML=dailyReports.map(r=>{
    const d=new Date(r.date);
    return `<div class="report-item anim-in">
      <div class="report-item-header">
        <span class="report-item-date">${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</span>
        <span class="status-badge ${r.status}">${r.status}</span>
      </div>
      ${r.mood?`<span style="font-size:18px;">${MOOD_EMOJI[r.mood]||''}</span>`:''}
      <div class="report-item-note" style="-webkit-line-clamp:3;">${esc(r.notes||'')}</div>
      ${r.tasks?`<div style="font-size:11px;color:var(--text3);margin-top:5px;">✓ ${esc(r.tasks)}</div>`:''}
      <div class="report-item-actions">
        <button onclick="viewDailyReport('${r.id}')">View Full</button>
        <button class="btn-danger" onclick="deleteReport('${r.id}','daily')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function renderVisitReports() {
  const el=document.getElementById('visit-report-list');
  if(!el) return;
  const ss=document.getElementById('vr-stats-total'); if(ss) ss.textContent=visitReports.length;
  const sc=document.getElementById('vr-stats-completed'); if(sc) sc.textContent=visitReports.filter(r=>r.status==='completed').length;
  const sf=document.getElementById('vr-stats-followup'); if(sf) sf.textContent=visitReports.filter(r=>r.followup&&r.followup!=='no').length;
  if(!visitReports.length){ el.innerHTML='<div class="empty-state"><div class="ee">📍</div><h3>No visit reports yet</h3><p>Log your first client visit above</p></div>'; return; }
  el.innerHTML=visitReports.map(r=>{
    const d=new Date(r.date);
    return `<div class="report-item anim-in">
      <div class="report-item-header">
        <span class="report-item-date">${MONTH_NAMES[d.getMonth()]} ${d.getDate()}${r.time?', '+r.time:''}</span>
        <span class="status-badge ${r.status}">${r.status}</span>
      </div>
      <div class="report-item-client">🏢 ${esc(r.client||'')}</div>
      ${r.location?`<div class="report-item-loc">📍 ${esc(r.location)}</div>`:''}
      ${r.purpose?`<div style="font-size:11px;color:var(--accent2);margin-top:3px;">📌 ${esc(r.purpose)}</div>`:''}
      <div class="report-item-note">${esc(r.notes||'')}</div>
      ${r.followup&&r.followup!=='no'?`<div style="font-size:11px;color:var(--warn);margin-top:5px;">⚡ Follow-up: ${FOLLOWUP_LABEL[r.followup]||r.followup}</div>`:''}
      <div class="report-item-actions">
        <button onclick="viewVisitReport('${r.id}')">View Full</button>
        <button class="btn-danger" onclick="deleteReport('${r.id}','visit')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function viewDailyReport(id) {
  const r=dailyReports.find(x=>x.id===id);
  if(!r) return;
  const d=new Date(r.date);
  document.getElementById('view-report-title').textContent='Daily Report — '+MONTH_NAMES[d.getMonth()]+' '+d.getDate();
  document.getElementById('view-report-content').innerHTML=
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span class="status-badge ${r.status}">${r.status}</span>
      ${r.mood?`<span style="font-size:24px;">${MOOD_EMOJI[r.mood]||''}</span>`:''}
    </div>`+
    vField('Summary',r.notes)+vField('Tasks Completed',r.tasks)+vField('Issues / Blockers',r.issues)+vField('Plan for Tomorrow',r.plan);
  showSheet('view-report');
}
function viewVisitReport(id) {
  const r=visitReports.find(x=>x.id===id);
  if(!r) return;
  const d=new Date(r.date);
  document.getElementById('view-report-title').textContent='Visit — '+esc(r.client||'');
  document.getElementById('view-report-content').innerHTML=
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span class="status-badge ${r.status}">${r.status}</span>
      ${r.followup&&r.followup!=='no'?`<span style="font-size:11px;color:var(--warn);font-weight:700;">⚡ ${FOLLOWUP_LABEL[r.followup]||r.followup}</span>`:''}
    </div>`+
    vField('Date & Time', MONTH_NAMES[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()+(r.time?' at '+r.time:''))+
    vField('Client',r.client)+vField('Location',r.location)+vField('Contact Person',r.contact)+
    vField('Purpose',r.purpose)+vField('What Was Done',r.notes)+vField('Outcome / Next Steps',r.outcome);
  showSheet('view-report');
}
function vField(label,val) {
  if(!val) return '';
  return `<div class="view-field"><div class="view-field-label">${label}</div><div class="view-field-value">${esc(val)}</div></div>`;
}
function deleteReport(id,type) {
  haptic('medium');
  deleteTarget={id,type:'__report_'+type};
  document.getElementById('confirm-msg').textContent='This report will be permanently deleted.';
  document.getElementById('confirm-overlay').classList.add('show');
}

// ===== CSV EXPORT =====
function buildCsvColumns(type) {
  const expCols=['Date','Type','Category','Note','Amount'];
  const drCols=['Date','Status','Mood','Summary','Tasks','Issues','Plan'];
  const vrCols=['Date','Time','Client','Location','Contact','Purpose','Notes','Outcome','Status','Follow-up'];
  const cols = type==='daily' ? drCols : type==='visit' ? vrCols : expCols;
  const el=document.getElementById('csv-columns-list');
  if(!el) return;
  el.innerHTML=cols.map(col=>{
    const checked=csvState.columns[col]!==false;
    return `<div class="csv-col-row"><span class="csv-col-label">${col}</span><div class="csv-checkbox ${checked?'checked':''}" id="csv-col-${col.replace(/[^a-z0-9]/gi,'_')}" onclick="toggleCsvCol('${col}')"></div></div>`;
  }).join('');
}
function toggleCsvCol(col) {
  csvState.columns[col]=!csvState.columns[col];
  const id='csv-col-'+col.replace(/[^a-z0-9]/gi,'_');
  const el=document.getElementById(id); if(el) el.classList.toggle('checked',csvState.columns[col]);
}
function toggleCsvType(type) {
  csvState.type[type]=!csvState.type[type];
  document.getElementById('csv-chk-'+type)?.classList.toggle('checked',csvState.type[type]);
}
function setCsvRange(range) {
  const today=todayStr();
  let from;
  if(range==='week') from=weekStart();
  else if(range==='month') from=monthStart();
  else if(range==='3m'){ const d=new Date(); d.setMonth(d.getMonth()-3); from=d.toISOString().split('T')[0]; }
  else if(range==='year') from=new Date().getFullYear()+'-01-01';
  else from='2000-01-01';
  document.getElementById('csv-from').value=from;
  document.getElementById('csv-to').value=today;
}
function selectCsvGroup(btn,val) {
  document.querySelectorAll('#csv-groupby .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); csvState.groupBy=val;
}
function openExpenseCsv() {
  haptic('light');
  csvState.exportType='expense';
  document.getElementById('csv-sheet-title').textContent='Export Expenses';
  document.getElementById('csv-type-row').style.display='flex';
  setCsvRange('month');
  buildCsvColumns('expense');
  showSheet('csv');
}
function openReportCsv(type) {
  haptic('light');
  csvState.exportType=type;
  document.getElementById('csv-sheet-title').textContent='Export '+(type==='daily'?'Daily Reports':'Visit Reports');
  document.getElementById('csv-type-row').style.display='none';
  setCsvRange('month');
  buildCsvColumns(type);
  showSheet('csv');
}
function runCsvExport() {
  haptic('medium');
  const from=document.getElementById('csv-from').value||'2000-01-01';
  const to=document.getElementById('csv-to').value||todayStr();
  const etype=csvState.exportType||'expense';

  if (etype==='daily') {
    const rows=dailyReports.filter(r=>r.date>=from&&r.date<=to);
    if(!rows.length){ toast('No records in range','warn'); return; }
    const cols=['Date','Status','Mood','Summary','Tasks','Issues','Plan'].filter(c=>csvState.columns[c]!==false);
    let csv=cols.join(',')+'\n';
    rows.forEach(r=>{ csv+=cols.map(c=>{ const v={Date:r.date,Status:r.status,Mood:r.mood,Summary:r.notes,Tasks:r.tasks,Issues:r.issues,Plan:r.plan}[c]||''; return `"${String(v).replace(/"/g,'""')}"`; }).join(',')+'\n'; });
    downloadCSV(csv,'d3v-nexus-daily-'+from+'-'+to+'.csv');
    toast('Exported '+rows.length+' reports!','ok'); hideSheet('csv'); return;
  }
  if (etype==='visit') {
    const rows=visitReports.filter(r=>r.date>=from&&r.date<=to);
    if(!rows.length){ toast('No records in range','warn'); return; }
    const cols=['Date','Time','Client','Location','Contact','Purpose','Notes','Outcome','Status','Follow-up'].filter(c=>csvState.columns[c]!==false);
    let csv=cols.join(',')+'\n';
    rows.forEach(r=>{ csv+=cols.map(c=>{ const v={Date:r.date,Time:r.time,Client:r.client,Location:r.location,Contact:r.contact,Purpose:r.purpose,Notes:r.notes,Outcome:r.outcome,Status:r.status,'Follow-up':r.followup}[c]||''; return `"${String(v).replace(/"/g,'""')}"`; }).join(',')+'\n'; });
    downloadCSV(csv,'d3v-nexus-visits-'+from+'-'+to+'.csv');
    toast('Exported '+rows.length+' reports!','ok'); hideSheet('csv'); return;
  }

  // Expenses
  let rows=[];
  if(csvState.type.expense) rows.push(...expenses.filter(e=>e.date>=from&&e.date<=to).map(e=>({Date:e.date,Type:'Expense',Category:EXPENSE_CATS.find(c=>c.key===e.category)?.label||e.category,Note:e.note||'',Amount:e.amount})));
  if(csvState.type.income)  rows.push(...incomeList.filter(i=>i.date>=from&&i.date<=to).map(i=>({Date:i.date,Type:'Income',Category:INCOME_SOURCES.find(c=>c.key===i.source)?.label||i.source,Note:i.note||'',Amount:i.amount})));
  rows.sort((a,b)=>a.Date.localeCompare(b.Date));
  if(!rows.length){ toast('No records in range','warn'); return; }
  const cols=['Date','Type','Category','Note','Amount'].filter(c=>csvState.columns[c]!==false);
  let csv='';
  if(csvState.groupBy==='month') {
    const groups={};
    rows.forEach(r=>{ const k=r.Date.slice(0,7); if(!groups[k]) groups[k]=[]; groups[k].push(r); });
    Object.entries(groups).sort().forEach(([k,gr])=>{ const [y,m]=k.split('-'); csv+=`"--- ${MONTH_NAMES[parseInt(m)-1]} ${y} ---"\n`+cols.join(',')+'\n'; gr.forEach(r=>{ csv+=cols.map(c=>`"${String(r[c]||'').replace(/"/g,'""')}"`).join(',')+'\n'; }); });
  } else if(csvState.groupBy==='category') {
    const groups={};
    rows.forEach(r=>{ if(!groups[r.Category]) groups[r.Category]=[]; groups[r.Category].push(r); });
    Object.entries(groups).sort().forEach(([k,gr])=>{ csv+=`"--- ${k} ---"\n`+cols.join(',')+'\n'; gr.forEach(r=>{ csv+=cols.map(c=>`"${String(r[c]||'').replace(/"/g,'""')}"`).join(',')+'\n'; }); });
  } else {
    csv=cols.join(',')+'\n';
    rows.forEach(r=>{ csv+=cols.map(c=>`"${String(r[c]||'').replace(/"/g,'""')}"`).join(',')+'\n'; });
  }
  downloadCSV(csv,'d3v-nexus-expenses-'+from+'-'+to+'.csv');
  toast('Exported '+rows.length+' records!','ok'); hideSheet('csv');
}
function downloadCSV(csv,filename) {
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ===== SHEET HELPERS =====
function showSheet(name) {
  document.getElementById(name+'-overlay').classList.add('show');
  document.getElementById(name+'-sheet').classList.add('show');
}
function hideSheet(name) {
  document.getElementById(name+'-overlay').classList.remove('show');
  document.getElementById(name+'-sheet').classList.remove('show');
}

// ===== TAB SWITCH =====
function switchTab(tab) {
  haptic('light');
  currentTab=tab;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const tabs=['home','history','analytics','reports','settings'];
  const titles={home:'d3v Nexus',history:'History',analytics:'Analytics',reports:'Reports',settings:'Settings'};
  document.getElementById('page-title').textContent=titles[tab]||tab;
  tabs.indexOf(tab)>=0 && document.querySelectorAll('.nav-item')[tabs.indexOf(tab)]?.classList.add('active');

  if(tab==='home')      renderHome();
  if(tab==='history')   renderHistory();
  if(tab==='analytics') renderAnalytics();
  if(tab==='reports'){  if(currentReportType==='daily') renderDailyReports(); else renderVisitReports(); }
  if(tab==='settings')  renderSettings();
}

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);

// ===== BOOT =====
initTheme();
