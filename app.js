import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://hqdjbdkxvexuduvqccpc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ufFPu9CzpyI9ROqCbDG6Lw_DKKGFPCl';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const queueKey = 'vipro-multi-tracker-offline-queue-v1';
const cacheKey = 'vipro-multi-tracker-cache-v1';
let session = null;
let state = { trackers: [], logs: [], settings: { theme: 'system' } };

function esc(v=''){return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),2200)}
function localDateTimeValue(date=new Date()){const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,16)}
function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d}
function fmtDate(v){return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}
function loadQueue(){try{return JSON.parse(localStorage.getItem(queueKey)||'[]')}catch{return []}}
function saveQueue(q){localStorage.setItem(queueKey,JSON.stringify(q));renderQueueInfo()}
function cacheState(){localStorage.setItem(cacheKey,JSON.stringify(state))}
function loadCache(){try{const x=JSON.parse(localStorage.getItem(cacheKey));if(x)state=x}catch{}}

async function init(){loadCache();bind();applyTheme(localStorage.getItem('vipro-theme')||'system');const {data}=await supabase.auth.getSession();session=data.session;await handleSession();supabase.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;await handleSession()});window.addEventListener('online',async()=>{setOnlineState();await syncQueue();await loadData()});window.addEventListener('offline',setOnlineState);setOnlineState()}

function bind(){
  $('#authForm').addEventListener('submit',signIn);$('#signUpBtn').addEventListener('click',signUp);$('#signOutBtn').addEventListener('click',signOut);$('#settingsSignOut').addEventListener('click',signOut);
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $('#addTrackerBtn').addEventListener('click',()=>openTracker());$('#addTrackerTop').addEventListener('click',()=>openTracker());
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
  $('#trackerForm').addEventListener('submit',saveTracker);$('#logForm').addEventListener('submit',saveLog);
  $('#historyTracker').addEventListener('change',renderHistory);$('#historyDate').addEventListener('change',renderHistory);$('#historySearch').addEventListener('input',renderHistory);$('#clearFilters').addEventListener('click',()=>{$('#historyTracker').value='all';$('#historyDate').value='';$('#historySearch').value='';renderHistory()});
  $('#themeSelect').addEventListener('change',async e=>{applyTheme(e.target.value);await updateSettings({theme:e.target.value})});$('#syncNowBtn').addEventListener('click',async()=>{await syncQueue();await loadData();toast('Sync complete')});
}

async function handleSession(){if(!session){$('#authScreen').classList.remove('hidden');$('#app').classList.add('hidden');return}$('#authScreen').classList.add('hidden');$('#app').classList.remove('hidden');$('#accountEmail').textContent=session.user.email;await syncQueue();await loadData()}
async function signIn(e){e.preventDefault();setAuthMessage('Signing in...');const {error}=await supabase.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});setAuthMessage(error?error.message:'')}
async function signUp(){setAuthMessage('Creating account...');const {error}=await supabase.auth.signUp({email:$('#email').value.trim(),password:$('#password').value});setAuthMessage(error?error.message:'Account created. You can sign in now.')}
async function signOut(){await supabase.auth.signOut();state={trackers:[],logs:[],settings:{theme:'system'}};cacheState()}
function setAuthMessage(m){$('#authMessage').textContent=m}

async function loadData(){if(!session)return;$('#syncStatus').textContent='Syncing...';const [{data:trackers,error:e1},{data:logs,error:e2},{data:settings,error:e3}]=await Promise.all([
  supabase.from('trackers').select('*').order('sort_order').order('created_at'),
  supabase.from('tracking_logs').select('*').order('occurred_at',{ascending:false}).limit(1000),
  supabase.from('user_settings').select('*').maybeSingle()
]);
if(e1||e2){$('#syncStatus').textContent='Using local cache';toast((e1||e2).message);return}
state.trackers=trackers||[];state.logs=logs||[];state.settings=settings||{theme:'system'};cacheState();applyTheme(state.settings.theme||'system');renderAll();$('#syncStatus').textContent='Synced'}

function switchView(view){$$('.view').forEach(v=>v.classList.remove('active'));$('#'+view+'View').classList.add('active');$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#pageTitle').textContent={home:'Today',history:'History',trackers:'Trackers',settings:'Settings'}[view]}
function renderAll(){renderSummary();renderTrackers();renderRecent();renderHistoryOptions();renderHistory();renderManage();renderQueueInfo()}
function todayLogs(){const start=startOfToday();return state.logs.filter(l=>new Date(l.occurred_at)>=start)}
function totalFor(id,logs=todayLogs()){return logs.filter(l=>l.tracker_id===id).reduce((s,l)=>s+Number(l.value),0)}
function renderSummary(){const logs=todayLogs();$('#summaryCards').innerHTML=`<div class="summary-card"><span class="muted">Records today</span><strong>${logs.length}</strong></div><div class="summary-card"><span class="muted">Active trackers</span><strong>${state.trackers.filter(t=>t.is_active).length}</strong></div><div class="summary-card"><span class="muted">Last record</span><strong style="font-size:17px">${logs[0]?fmtDate(logs[0].occurred_at):'No records yet'}</strong></div>`}
function renderTrackers(){const list=state.trackers.filter(t=>t.is_active);$('#trackerCards').innerHTML=list.length?list.map(t=>`<article class="tracker-card"><div class="tracker-top"><div class="tracker-title"><span class="tracker-icon" style="background:${esc(t.color)}">${esc(t.icon)}</span><div><strong>${esc(t.name)}</strong><div class="muted">${esc(t.unit)}</div></div></div><button class="icon-btn" onclick="window.openCustomLog('${t.id}')">＋</button></div><div class="tracker-total">${totalFor(t.id)} <small class="muted" style="font-size:14px">${esc(t.unit)}</small></div>${t.daily_goal?`<div class="muted">Goal: ${t.daily_goal} ${esc(t.unit)}</div>`:''}<div class="quick-row">${t.quick_values.map(v=>`<button class="quick-btn" onclick="window.quickLog('${t.id}',${Number(v)})">+${v}</button>`).join('')}<button class="quick-btn" onclick="window.openCustomLog('${t.id}')">Custom</button></div></article>`).join(''):'<p class="muted">Create your first tracker to begin.</p>'}
function renderRecent(){const rows=state.logs.slice(0,8);$('#recentList').innerHTML=rows.length?rows.map(logRow).join(''):'<p class="muted">No activity yet.</p>'}
function logRow(l){const t=state.trackers.find(x=>x.id===l.tracker_id);return `<div class="list-row"><div><strong>${esc(t?.name||'Deleted tracker')} · ${l.value} ${esc(t?.unit||'')}</strong><div class="muted">${fmtDate(l.occurred_at)}${l.note?' · '+esc(l.note):''}</div></div><div class="row-actions"><button class="icon-btn" onclick="window.editLog('${l.id}')">✎</button><button class="icon-btn" onclick="window.deleteLog('${l.id}')">×</button></div></div>`}
function renderHistoryOptions(){const current=$('#historyTracker').value;$('#historyTracker').innerHTML='<option value="all">All trackers</option>'+state.trackers.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');if([...$('#historyTracker').options].some(o=>o.value===current))$('#historyTracker').value=current}
function renderHistory(){const tracker=$('#historyTracker').value,date=$('#historyDate').value,q=$('#historySearch').value.toLowerCase();const rows=state.logs.filter(l=>(tracker==='all'||l.tracker_id===tracker)&&(!date||localDateTimeValue(new Date(l.occurred_at)).slice(0,10)===date)&&(!q||(l.note||'').toLowerCase().includes(q)));$('#historyList').innerHTML=rows.length?rows.map(logRow).join(''):'<p class="muted">No matching records.</p>'}
function renderManage(){const rows=state.trackers;$('#manageTrackers').innerHTML=rows.length?rows.map(t=>`<div class="list-row"><div><strong>${esc(t.icon)} ${esc(t.name)}</strong><div class="muted">${esc(t.unit)} · Quick: ${t.quick_values.join(', ')} · ${t.is_active?'Active':'Hidden'}</div></div><div class="row-actions"><button class="secondary" onclick="window.editTracker('${t.id}')">Edit</button><button class="danger-outline" onclick="window.deleteTracker('${t.id}')">Delete</button></div></div>`).join(''):'<p class="muted">No trackers yet.</p>'}

function openTracker(t=null){$('#trackerDialogTitle').textContent=t?'Edit tracker':'New tracker';$('#trackerId').value=t?.id||'';$('#trackerName').value=t?.name||'';$('#trackerUnit').value=t?.unit||'';$('#trackerIcon').value=t?.icon||'◫';$('#trackerColor').value=t?.color||'#6d4aff';$('#trackerGoal').value=t?.daily_goal??'';$('#trackerQuickValues').value=(t?.quick_values||[1]).join(',');$('#trackerDialog').showModal()}
async function saveTracker(e){e.preventDefault();const id=$('#trackerId').value;const payload={user_id:session.user.id,name:$('#trackerName').value.trim(),unit:$('#trackerUnit').value.trim(),icon:$('#trackerIcon').value.trim()||'◫',color:$('#trackerColor').value,daily_goal:$('#trackerGoal').value===''?null:Number($('#trackerGoal').value),quick_values:$('#trackerQuickValues').value.split(',').map(v=>Number(v.trim())).filter(v=>v>0)};if(!payload.quick_values.length)return toast('Add at least one quick value');await mutate(id?'updateTracker':'insertTracker',{id,payload});$('#trackerDialog').close();await loadData()}
function openLog(trackerId,log=null){const t=state.trackers.find(x=>x.id===trackerId);$('#logDialogTitle').textContent=log?'Edit record':`Add ${t?.name||'record'}`;$('#logId').value=log?.id||'';$('#logTrackerId').value=trackerId;$('#logValue').value=log?.value||'';$('#logOccurredAt').value=localDateTimeValue(log?new Date(log.occurred_at):new Date());$('#logNote').value=log?.note||'';$('#logDialog').showModal()}
async function saveLog(e){e.preventDefault();const id=$('#logId').value,payload={user_id:session.user.id,tracker_id:$('#logTrackerId').value,value:Number($('#logValue').value),occurred_at:new Date($('#logOccurredAt').value).toISOString(),note:$('#logNote').value.trim()||null,source:'website'};await mutate(id?'updateLog':'insertLog',{id,payload});$('#logDialog').close();await loadData()}
async function mutate(type,data){if(!navigator.onLine){const q=loadQueue();q.push({id:crypto.randomUUID(),type,data,queued_at:new Date().toISOString()});saveQueue(q);applyOptimistic(type,data);toast('Saved offline');return}const error=await runMutation(type,data);if(error)throwOrToast(error);else toast('Saved')}
async function runMutation(type,{id,payload}){let r;if(type==='insertTracker')r=await supabase.from('trackers').insert(payload);if(type==='updateTracker')r=await supabase.from('trackers').update(payload).eq('id',id);if(type==='deleteTracker')r=await supabase.from('trackers').delete().eq('id',id);if(type==='insertLog')r=await supabase.from('tracking_logs').insert(payload);if(type==='updateLog')r=await supabase.from('tracking_logs').update(payload).eq('id',id);if(type==='deleteLog')r=await supabase.from('tracking_logs').delete().eq('id',id);return r?.error}
function throwOrToast(error){console.error(error);toast(error.message||'Something went wrong')}
function applyOptimistic(type,{id,payload}){if(type==='insertTracker')state.trackers.push({...payload,id:'local-'+crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),is_active:true,sort_order:0});if(type==='insertLog')state.logs.unshift({...payload,id:'local-'+crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()});if(type==='updateTracker')state.trackers=state.trackers.map(x=>x.id===id?{...x,...payload}:x);if(type==='updateLog')state.logs=state.logs.map(x=>x.id===id?{...x,...payload}:x);if(type==='deleteTracker')state.trackers=state.trackers.filter(x=>x.id!==id);if(type==='deleteLog')state.logs=state.logs.filter(x=>x.id!==id);cacheState();renderAll()}
async function syncQueue(){if(!navigator.onLine||!session)return;const q=loadQueue();if(!q.length)return;$('#syncStatus').textContent='Syncing offline changes...';const remaining=[];for(const item of q){const error=await runMutation(item.type,item.data);if(error)remaining.push(item)}saveQueue(remaining);if(!remaining.length)toast('Offline changes synced')}
function renderQueueInfo(){const n=loadQueue().length;$('#queueInfo').textContent=n?`${n} pending change${n===1?'':'s'}.`:'No pending changes.'}
function setOnlineState(){$('#offlineBanner').classList.toggle('hidden',navigator.onLine);renderQueueInfo()}
async function updateSettings(patch){if(!session)return;state.settings={...state.settings,...patch};await supabase.from('user_settings').upsert({user_id:session.user.id,...state.settings},{onConflict:'user_id'});cacheState()}
function applyTheme(theme){localStorage.setItem('vipro-theme',theme);$('#themeSelect').value=theme;const actual=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;document.documentElement.dataset.theme=actual}

window.quickLog=async(id,value)=>{await mutate('insertLog',{payload:{user_id:session.user.id,tracker_id:id,value,occurred_at:new Date().toISOString(),note:null,source:'website'}});await loadData()};
window.openCustomLog=id=>openLog(id);
window.editLog=id=>{const l=state.logs.find(x=>x.id===id);if(l)openLog(l.tracker_id,l)};
window.deleteLog=async id=>{if(!confirm('Delete this record?'))return;await mutate('deleteLog',{id});await loadData()};
window.editTracker=id=>{const t=state.trackers.find(x=>x.id===id);if(t)openTracker(t)};
window.deleteTracker=async id=>{if(!confirm('Delete this tracker and all of its records?'))return;await mutate('deleteTracker',{id});await loadData()};

init();
