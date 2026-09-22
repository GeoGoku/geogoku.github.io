const app = document.querySelector('#app');
const teacher = location.pathname.endsWith('/teacher.html');
const API_BASE = window.CLASSROOM_API;
let teacherAuth; try { teacherAuth=sessionStorage.getItem('classroom.v3.teacherAuth'); } catch {}
const teacherURL = new URL('teacher.html',location.href);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, sessionId, offset = 0, refreshTimer, signature = '', busy = false, noticeTimer;
const storage = {
  get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); } catch { notify('浏览器未允许保存身份；请保持当前页面打开。'); } }
};
let identity = storage.get('classroom.identity', {});
let memberships = storage.get('classroom.memberships', {});
let token;
const requestedSession=Number(new URLSearchParams(location.search).get('session'));
function studentEntryUrl(id){
  const u=new URL('https://geogoku.github.io/classroom/');
  if(id)u.searchParams.set('session',String(id));
  return u.toString();
}
app.className = teacher ? '' : 'student';
function notify(message) {
  $('#notice').textContent = message; $('#notice').style.display = 'block';
  clearTimeout(noticeTimer); noticeTimer = setTimeout(()=>$('#notice').style.display='none',5000);
}
async function api(url, body) {
  if(!API_BASE)throw new Error('课堂地址尚未配置。');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(API_BASE,{method:'POST',signal:controller.signal,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({path:url,method:body===undefined?'GET':'POST',body:body||{},token:teacherAuth})});
    const data=await response.json();
    if(!response.ok){const e=new Error(data.error||'请求失败，请手动重试。');e.status=response.status;if(response.status===401&&url!=='/api/teacher/login'){teacherAuth=null;try{sessionStorage.removeItem('classroom.v3.teacherAuth');}catch{}showLogin();}throw e;}
    if(data.serverNow)offset=data.serverNow-Date.now();connection(true);return data;
  }catch(e){connection(false);if(e.name==='AbortError'||e instanceof TypeError)throw new Error('连接中断，请手动刷新确认结果；不要连续点击。');throw e;}
  finally{clearTimeout(timeout);}
}
function connection(ok, message='') { const badge=$('#svc');if(badge)badge.textContent=ok?'课堂互动 · 已连通':'课堂互动 · 未连通'; const el=$('#connection'); if(el) {el.textContent=ok?`已连接 · ${new Date(Date.now()+offset).toLocaleTimeString('zh-CN')} 已同步`:message;el.className=ok?'muted':'error';} }
function scheduleDeadlineRefresh(){clearTimeout(refreshTimer);}
function startAction(fn) {
  return async event => { event.preventDefault(); if(busy) return; busy=true;
    const button = event.submitter || (event.currentTarget.tagName==='BUTTON'?event.currentTarget:null);
    if(button) button.disabled=true;
    try { await fn(event); } catch(e) { notify(e.message); } finally {busy=false;if(button?.isConnected)button.disabled=button.id==='end'&&!!state?.session?.ended;tick();}
  };
}
function time(t){return new Date(t).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function remaining(q){return Math.max(0,Math.ceil((q.deadline-Date.now()-offset)/1000));}
function qLabel(q){return `${q.lecture}-${q.number}`;}
function tick(){
  document.querySelectorAll('[data-deadline]').forEach(el=>{
    const seconds=Math.max(0,Math.ceil((Number(el.dataset.deadline)-Date.now()-offset)/1000));
    el.textContent=seconds>0?`${seconds} 秒`:'已截止';
    if(seconds===0){const box=el.closest('.question');box?.querySelectorAll('[data-answer-control]').forEach(b=>b.disabled=true);}
  });
}
setInterval(tick,250);

async function teacherHome() {
  clearTimeout(refreshTimer); sessionId=null; state=null; signature='';
  history.replaceState(null,'',teacherURL.pathname);
  const data=await api('/api/teacher/sessions');
  app.innerHTML=`<div class="row spread"><div><p class="eyebrow">老师端</p><h1>这一堂课，从这里开始</h1></div><a class="button secondary" href="./" target="_blank">打开学生答题页</a></div><div class="grid"><div><section class="card"><h2>新建课堂</h2><form id="create"><div class="fields"><div class="field"><label for="course">课程</label><select id="course" name="course" required>${['地磁与地电','重力与固体潮','重磁电数据处理与解释','科技论文英语写作'].map(course=>`<option value="${esc(course)}"${course === storage.get('classroom.course','重力与固体潮') ? ' selected' : ''}>${esc(course)}</option>`).join('')}</select></div><div class="field"><label for="className">班级</label><input id="className" name="className" placeholder="例如：地球物理 1 班" maxlength="80" required></div></div><div class="field"><label for="lecture">从第几讲开始</label><input id="lecture" name="lecture" type="number" value="3" min="1" max="999" required></div><button>创建并进入课堂</button></form></section><section class="card"><div class="row spread"><h2>课堂记录</h2><button class="secondary small" id="refresh-list">刷新列表</button></div>${data.sessions.length ? data.sessions.map(s=>`<div class="history-item"><div><strong>${esc(s.className)}</strong><p class="muted">${esc(s.course)} · ${time(s.created)} · ${s.ended?'已结束':'进行中'}</p></div><button class="secondary small" data-enter="${s.id}">${s.ended?'查看记录':'进入课堂'}</button></div>`).join(''):'<p>还没有课堂。填写课程、班级和讲次即可开始。</p>'}</section></div><aside><section class="card"><h2>按需同步，节省额度</h2><p>学生填姓名、学号后进入课堂。每讲预列 20 道题，听到开题后直接选项提交。等待期间不自动请求服务器。</p><p class="info">题目仍然展示在 PPT 中。这里负责收答案，时间一到服务器拒收。点击“收题并公布答案”，一次完成收题、公布和统计。</p></section><section class="card"><h2>使用固定二维码</h2><p>每次上课创建课堂，学生扫描同一个二维码，选择班级后逐题作答。</p><p class="muted">学生可以使用手机流量或 Wi-Fi，无需与你连接同一个网络。</p></section></aside></div>`;
  $('#refresh-list').onclick=startAction(teacherHome);
  $('#create').onsubmit=startAction(async e=>{
    const body=Object.fromEntries(new FormData(e.currentTarget));
    const result=await api('/api/teacher/sessions',body);
    storage.set('classroom.course',body.course);
    await enterTeacher(result.session.id,data.addresses,result);
  });
  document.querySelectorAll('[data-enter]').forEach(b=>b.onclick=startAction(()=>enterTeacher(b.dataset.enter,data.addresses)));
}
async function enterTeacher(id, addresses, initial) {
  sessionId=Number(id); signature='';
  state=initial || await api(`/api/teacher/sessions/${id}`);
  history.replaceState(null,'',`${teacherURL.pathname}?session=${sessionId}`);
  if(!Array.isArray(addresses)||!addresses.length){
    addresses=[{name:'本堂课入口',address:'手机扫码直接进入本班',url:studentEntryUrl(sessionId)}];
  }else{
    addresses=addresses.map(a=>{try{const u=new URL(a.url,studentEntryUrl());if(sessionId)u.searchParams.set('session',String(sessionId));return {...a,url:u.toString()};}catch{return {...a,url:studentEntryUrl(sessionId)};}});
  }
  const s=state.session;
  app.innerHTML=`<div class="row spread"><div><p class="eyebrow">${esc(s.course)} · ${time(s.created)}</p><h1>${esc(s.className)} <span class="pill" id="session-status"></span></h1></div><button class="secondary" id="home">返回课堂列表</button></div><div class="grid"><div><section class="card" id="controls"><div class="row spread"><h2>当前讲次</h2><span class="badge" id="lecture-badge"></span></div><form id="switch-lecture" class="row"><label for="next-lecture">第</label><input id="next-lecture" name="lecture" type="number" min="1" max="999" value="${s.lecture}" required style="width:90px"><span>讲</span><button class="secondary">切换讲次</button></form><p class="muted">开新 PPT 时切换；如有正在作答的题，将同时截止。已有记录全部保留。切换后请提醒学生点“同步讲次 / 结果”。</p><hr class="rule"><form id="open-question"><div class="fields"><div class="field"><label for="number">本讲第几题</label><input id="number" name="number" type="number" min="1" max="20" value="1" required></div><div class="field"><label for="seconds">答题时间（秒）</label><input id="seconds" name="seconds" type="number" min="5" max="600" value="60" required></div></div><div class="row spread"><div class="row"><label for="options">选项</label><select id="options" name="options"><option value="ABC">A / B / C</option><option value="ABCD">A / B / C / D</option></select></div><button id="start-question">开始本题作答</button></div></form></section><section class="card"><div class="row spread"><h2>作答情况</h2><button class="secondary small" id="refresh-stats">刷新统计</button><span id="joined" class="badge"></span></div><p id="connection" class="muted">按需同步：收题并公布答案时一起更新统计；需要时也可手动刷新</p><div id="live"></div></section><section class="card"><h2>本堂课的题目</h2><div id="history"></div></section><section class="card"><details><summary>已加入的学生 <span id="roster-count"></span></summary><div class="scroll" id="roster"></div></details></section></div><aside><section class="card qr"><h2>学生扫码进入</h2><p class="muted">切换讲次后，学生点一次“同步讲次 / 结果”</p><label for="address" class="muted">学生使用手机流量或 Wi-Fi 均可</label><select class="full gap-top" id="address">${addresses.map(a=>`<option value="${esc(a.url)}">${esc(a.name)} · ${esc(a.address)}</option>`).join('') || '<option value="">未找到可用的局域网地址</option>'}</select><div id="qr"></div><a id="student-address" class="address" target="_blank"></a><a class="button secondary full" href="./" target="_blank">打开学生答题页</a><a class="button secondary full gap-top" id="download-qr">下载二维码</a><p class="info">课堂编号 ${s.id}。学生扫码后应看到「${esc(s.className)}」。学生只在进入、提交、手动同步时联网。</p></section><section class="card"><h2>导出本堂课</h2><a class="button full" href="/api/teacher/sessions/${id}/export?wide=1">下载成绩汇总表</a><a class="button secondary full gap-top" href="/api/teacher/sessions/${id}/export">下载逐题明细</a><p class="muted">Excel 可直接打开。未作答标为“未答”；没有开过的题不计入。</p><hr class="rule"><button id="end" class="danger full">结束本次课堂</button></section></aside></div>`;
  $('#home').onclick=startAction(teacherHome);
  $('#refresh-stats').onclick=startAction(pollTeacher);
  $('#switch-lecture').onsubmit=startAction(async e=>{await teacherAction('lecture',Object.fromEntries(new FormData(e.currentTarget)));notify(`已切换到第 ${state.session.lecture} 讲，请学生点同步`);});
  $('#open-question').onsubmit=startAction(async e=>{await teacherAction('open',Object.fromEntries(new FormData(e.currentTarget)));notify('本题已开放，学生可以提交。');});
  $('#end').onclick=startAction(async()=>{if(confirm('结束本次课堂？结束后不能补交，记录仍可查看和导出。')) await teacherAction('end',{});});
  $('#address').onchange=drawQr;drawQr();updateTeacher(true);scheduleDeadlineRefresh();
}
let qrObjectUrl;
function drawQr(){
  const url=$('#address').value;
  if(!url){$('#qr').innerHTML='<p>可先在电脑上测试学生端。</p>';$('#download-qr').hidden=true;return;}
  const qr=window.qrcode(0,'M');qr.addData(url);qr.make();
  const svg=qr.createSvgTag({cellSize:6,margin:24,scalable:true});
  $('#qr').innerHTML=svg;$('#student-address').textContent=url;$('#student-address').href=url;
  if(qrObjectUrl)URL.revokeObjectURL(qrObjectUrl);
  qrObjectUrl=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  $('#download-qr').href=qrObjectUrl;$('#download-qr').download='课堂答题-固定二维码.svg';
}
async function teacherAction(action,body){state=await api(`/api/teacher/sessions/${sessionId}/${action}`,body);updateTeacher(true);scheduleDeadlineRefresh();}
async function pollTeacher(){
  if(!sessionId || !teacher)return;
  try{state=await api(`/api/teacher/sessions/${sessionId}`);updateTeacher();connection(true);}catch(e){connection(false,e.message);}
  scheduleDeadlineRefresh();
}
function bars(q){return Object.entries(q.counts).map(([c,n])=>`<div class="bar-row ${q.answerKey===c?'correct':''}"><strong>${c}</strong><div class="bar-track"><div class="bar-fill" style="width:${q.submitted?n/q.submitted*100:0}%"></div></div><span>${n} 人</span></div>`).join('');}
function revealForm(q){return `<form data-reveal="${q.id}" class="row gap-top" data-close="${q.open?1:0}"><label for="key-${q.id}">正确答案</label><select id="key-${q.id}" name="answerKey">${[...q.options].map(c=>`<option ${q.answerKey===c?'selected':''}>${c}</option>`).join('')}</select><button class="secondary small">${q.open?'收题并公布答案':q.revealed?'更新答案':'公布答案'}</button></form><p class="muted">${q.answerKey?`已公布：${q.answerKey}`:'可选：答案优先投屏讲解；学生需要查看个人结果时才点“同步讲次 / 结果”，导出表会自动标记对错。'}</p>`;}
function updateTeacher(reset=false){
  const s=state.session;
  $('#session-status').textContent=s.ended?'已结束':'进行中';$('#lecture-badge').textContent=`第 ${s.lecture} 讲`;
  $('#controls').hidden=!!s.ended;$('#end').disabled=!!s.ended;
  if(reset){$('#next-lecture').value=s.lecture;$('#number').value=1+Math.max(0,...state.questions.filter(q=>q.lecture===s.lecture).map(q=>q.number));}
  $('#joined').textContent=`${state.students.length} 人已加入`;
  const snapshot=JSON.stringify([state.questions,state.students]);
  if(snapshot===signature&&!reset)return;signature=snapshot;
  const preserved=Object.fromEntries([...document.querySelectorAll('[id^="key-"]')].map(el=>[el.id,el.value]));
  const expanded=[...document.querySelectorAll('details[data-q]:is([open])')].map(el=>el.dataset.q);
  const current=state.questions.filter(q=>q.lecture===s.lecture).at(-1);
  $('#live').innerHTML=current?`<div class="question ${current.open?'active':''}"><div class="row spread"><div><span class="muted">第 ${current.lecture} 讲 · 第 ${current.number} 题</span><div class="qnum">${qLabel(current)}</div></div><span class="timer" ${current.open?`data-deadline="${current.deadline}"`:''}>${current.open?`${remaining(current)} 秒`:'已截止'}</span></div><div class="row gap-top"><span class="metric">${current.submitted}</span><span>人已提交 / ${state.students.length} 人已加入</span></div>${bars(current)}${current.open?revealForm(current)+'<button class="danger full gap-top" id="close-question">只收题，暂不公布答案</button>':revealForm(current)}</div>`:`<div class="empty"><h3>第 ${s.lecture} 讲，还没有开题</h3><p>讲到 PPT 的互动题时，点击“开始本题作答”。</p></div>`;
  const past=state.questions.filter(q=>q.id!==current?.id).slice().reverse();
  $('#history').innerHTML=past.length?past.map(q=>`<details data-q="${q.id}" ${expanded.includes(String(q.id))?'open':''}><summary>${qLabel(q)} <span class="muted">· ${q.submitted} 人已答${q.answerKey?` · 正确答案 ${q.answerKey}`:''}</span></summary>${bars(q)}${revealForm(q)}</details>`).join(''):'<p class="muted">其他题目的记录会保留在这里，跨讲次也不会丢失。</p>';
  $('#roster-count').textContent=`（${state.students.length}）`;
  $('#roster').innerHTML=`<table><thead><tr><th>学号</th><th>姓名</th><th>已提交</th></tr></thead><tbody>${state.students.map(p=>`<tr><td>${esc(p.studentId)}</td><td>${esc(p.name)}</td><td>${state.questions.filter(q=>q.answers.some(a=>a.participantId===p.id)).length} 题</td></tr>`).join('')}</tbody></table>`;
  for(const [id,value] of Object.entries(preserved)){const el=document.getElementById(id);if(el&&!reset)el.value=value;}
  if($('#close-question'))$('#close-question').onclick=startAction(()=>teacherAction('close',{}));
  document.querySelectorAll('[data-reveal]').forEach(form=>form.onsubmit=startAction(async e=>{await teacherAction('reveal',{questionId:Number(form.dataset.reveal),close:form.dataset.close==='1',answerKey:new FormData(e.currentTarget).get('answerKey')});notify('答案已公布。');}));
  tick();
}

async function init(){
  if(!teacherAuth){showLogin();return;}
  try{const requested=Number(new URLSearchParams(location.search).get('session'));if(requested>0)await enterTeacher(requested);else await teacherHome();}
  catch(e){if(e.status===401){showLogin();return;}app.innerHTML='<section class="card"><h1>暂时无法连接</h1><p class="error">'+esc(e.message)+'</p><button id="retry">重试连接</button></section>';$('#retry').onclick=init;}
}
function showLogin(){
  clearTimeout(refreshTimer);sessionId=null;state=null;
  app.innerHTML='<section class="card" style="max-width:480px;margin:40px auto"><p class="eyebrow">老师端</p><h1>登录课堂管理</h1><form id="teacher-login"><div class="field"><label for="teacher-password">老师口令</label><input id="teacher-password" type="password" name="password" autocomplete="current-password" required></div><button class="full">登录</button></form><p class="muted">学生扫码即可答题，无需老师口令。口令仅供你自己保管。</p></section>';
  $('#teacher-login').onsubmit=startAction(async e=>{const r=await api('/api/teacher/login',Object.fromEntries(new FormData(e.currentTarget)));teacherAuth=r.token;try{sessionStorage.setItem('classroom.v3.teacherAuth',r.token);}catch{};await init();});
}
if(teacher){const logout=document.createElement('button');logout.className='secondary small';logout.textContent='退出登录';logout.onclick=()=>{teacherAuth=null;try{sessionStorage.removeItem('classroom.v3.teacherAuth');}catch{};showLogin();};document.querySelector('header').append(logout);}
document.addEventListener('click',async e=>{
 const link=e.target.closest('a');if(!link)return;
 const url=new URL(link.href);if(!url.pathname.startsWith('/api/teacher/sessions/')||!url.pathname.endsWith('/export'))return;
 e.preventDefault();try{const data=await api(url.pathname+url.search);const blob=new Blob([data.csv],{type:'text/csv;charset=utf-8'}),download=document.createElement('a');download.href=URL.createObjectURL(blob);download.download=url.searchParams.get('wide')?'课堂成绩汇总.csv':'课堂逐题明细.csv';download.click();setTimeout(()=>URL.revokeObjectURL(download.href),10000);}catch(error){notify(error.message);}
});
init();

