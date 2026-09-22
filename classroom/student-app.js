(()=>{'use strict';
const app=document.querySelector('#app'),$=s=>document.querySelector(s),API=window.CLASSROOM_API;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))??def;}catch{return def;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let identity=read('classroom.identity',{}),members=read('classroom.v3.memberships',read('classroom.memberships',{})),membership=null,state=null,busy=false;
const want=Number(new URLSearchParams(location.search).get('session')||new URLSearchParams(location.search).get('s'));
const drafts={};
function badge(text){$('#svc').textContent=text;}
function notify(message){$('#notice').textContent=message;$('#notice').style.display='block';setTimeout(()=>$('#notice').style.display='none',6000);}
async function api(path,body,auth=false){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(API,{method:'POST',signal:controller.signal,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({path,method:body===undefined?'GET':'POST',body:body||{},...(auth?{token:membership.token,sessionId:membership.sessionId,studentId:membership.studentId}:{})})});
    const data=await response.json();if(!response.ok){const error=new Error(data.error||'请求失败，请手动重试。');error.status=response.status;throw error;}
    badge('已同步 · 按需联网');return data;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError){badge('暂未连通');throw Error('网络未连通，请手动重试。只有显示“已提交”才代表保存成功。');}throw error;}
  finally{clearTimeout(timer);}
}
function action(fn){return async event=>{event.preventDefault();if(busy)return;busy=true;const button=event.submitter||(event.currentTarget.tagName==='BUTTON'?event.currentTarget:null);if(button)button.disabled=true;try{await fn(event);}catch(error){notify(error.message);}finally{busy=false;if(button?.isConnected)button.disabled=false;}};}
function token(){return [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function home(sessions=null){
  membership=null;state=null;badge('填写信息后加入');
  const selected=sessions?.length===1?sessions[0].id:0;
  app.innerHTML=`<section class="card"><h1>加入课堂</h1><p>填写姓名和学号，点击后查找老师当前课堂。</p><form id="join">${sessions?`<div class="field"><label for="classroom">课堂</label><select id="classroom" name="sessionId" required><option value="">${sessions.length?'请选择班级':'暂无课堂，请等待老师创建'}</option>${sessions.map(s=>`<option value="${s.id}" ${s.id===selected?'selected':''}>${esc(s.className)} · ${esc(s.course)}</option>`).join('')}</select></div>`:`<input type="hidden" name="sessionId" value="${want||''}">`}<div class="field"><label for="name">姓名</label><input id="name" name="name" maxlength="40" value="${esc(identity.name||'')}" autocomplete="name" required></div><div class="field"><label for="studentId">学号</label><input id="studentId" name="studentId" maxlength="40" value="${esc(identity.studentId||'')}" autocomplete="off" required></div><button class="full">进入课堂</button></form><button id="find" class="secondary full gap-top">查找其他课堂</button><p class="info">只有一堂课进行时会直接加入；有多堂课时会让你选择班级。等待时不会自动请求服务器。</p></section>`;
  $('#find').onclick=action(async()=>{identity={name:$('#name').value,studentId:$('#studentId').value};await home((await api('/api/sessions')).sessions);});
  $('#join').onsubmit=action(async event=>{
    const b=Object.fromEntries(new FormData(event.currentTarget));const sid=Number(b.sessionId);
    identity={name:b.name,studentId:b.studentId};save('classroom.identity',identity);
    const pending=read('classroom.v3.pending',{});
    let member=members[sid];if(!member||member.studentId!==b.studentId)member=pending.studentId===b.studentId?pending:{sessionId:sid,studentId:b.studentId,token:token()};
    save('classroom.v3.pending',member);if(sid){members[sid]=member;save('classroom.v3.memberships',members);}
    const result=await api('/api/enter',{...b,sessionId:sid||undefined,token:member.token,resume:Object.values(members).filter(p=>p.studentId===b.studentId).slice(-10)});
    if(result.choose){await home(result.sessions);return;}
    membership={token:result.token,sessionId:result.sessionId,name:result.name,studentId:result.studentId};members[result.sessionId]=membership;save('classroom.v3.memberships',members);save('classroom.v3.current',result.sessionId);save('classroom.v3.pending',null);
    identity={name:result.name,studentId:result.studentId};save('classroom.identity',identity);state=result.state;draw();
  });
}
function questionHtml(lecture,number){
  const key=`${lecture}-${number}`,q=state.questions.find(q=>q.lecture===lecture&&q.number===number),choice=q?.choice;
  const closed=!!state.session.ended||(q&&!q.open),options=q?.options||'ABCD';
  return `<section class="question compact" id="q-${key}"><div class="row spread"><span class="qnum">${key}</span><span class="muted">${choice?'已提交':closed?'未答 · 已截止':'按老师要求作答'}</span></div>${choice?`<p class="submitted">已提交 ${esc(choice)}</p>`:closed?'<p class="muted">本题不能补交。</p>':`<form data-question="${number}" data-lecture="${lecture}"><div class="choices">${[...options].map(c=>`<label class="choice"><input type="radio" name="choice" value="${c}" ${drafts[key]===c?'checked':''} required><span>${c}</span></label>`).join('')}</div><button class="secondary full" type="submit">提交 ${key}</button><p class="error" data-error hidden></p></form>`}${q?.answerKey?`<p class="status">正确答案：${esc(q.answerKey)}${choice?choice===q.answerKey?' · 回答正确':' · 回答错误':''}</p>`:''}</section>`;
}
function draw(){
  const s=state.session;
  app.innerHTML=`<section class="card"><p class="eyebrow">${esc(s.course)}</p><div class="row spread"><h1>${esc(s.className)}</h1><button id="leave" class="secondary small">切换课堂</button></div><p>${esc(state.name)} · ${esc(state.studentId)}</p><div class="lecture-title">第 ${s.lecture} 讲${s.ended?' · 课堂已结束':''}</div><p class="info">听到老师开题后，在对应题号选答案并提交。提前交或超时交都会被拒绝；没有 D 选项的题请只选 A、B、C。</p></section><div class="student-toolbar"><button id="sync" class="secondary">同步讲次 / 结果</button><p class="sync-note">换讲时点一次；正确答案看老师投屏，需要查个人结果时再点。</p><p id="sync-status" class="muted">本页不会自动刷新或自动提交。</p></div><div id="questions">${s.ended?state.questions.filter(q=>q.lecture===s.lecture).map(q=>questionHtml(q.lecture,q.number)).join(''):Array.from({length:20},(_,i)=>questionHtml(s.lecture,i+1)).join('')}</div>${state.questions.some(q=>q.lecture!==s.lecture)?`<section class="card"><h2>其他讲次记录</h2>${state.questions.filter(q=>q.lecture!==s.lecture).map(q=>questionHtml(q.lecture,q.number)).join('')}</section>`:''}`;
  $('#leave').onclick=action(async()=>{save('classroom.v3.current',null);await home();});
  $('#sync').onclick=action(async()=>{const data=await api('/api/state',undefined,true);state=data;draw();$('#sync-status').textContent='已同步：'+new Date().toLocaleTimeString('zh-CN');});
  document.querySelectorAll('form[data-question]').forEach(form=>{
    form.onchange=()=>{drafts[`${form.dataset.lecture}-${form.dataset.question}`]=new FormData(form).get('choice');};
    form.onsubmit=action(async()=>{
      const choice=new FormData(form).get('choice'),lecture=Number(form.dataset.lecture),number=Number(form.dataset.question);if(!choice)return;
      try{
        const result=await api('/api/submit',{lecture,number,choice},true);
        let q=state.questions.find(q=>q.lecture===lecture&&q.number===number);
        if(!q){q={id:result.questionId,lecture,number,options:'ABCD',answerKey:null};state.questions.push(q);}
        q.choice=result.choice;q.submitted=result.submitted;q.open=false;draw();
        document.getElementById(`q-${lecture}-${number}`)?.scrollIntoView({block:'nearest'});
      }catch(error){const message=form.querySelector('[data-error]');message.hidden=false;message.textContent=error.message;}
    });
  });
}
async function init(){const saved=want||read('classroom.v3.current',0);if(saved&&members[saved]?.token){membership=members[saved];try{state=await api('/api/state',undefined,true);draw();return;}catch{}}await home();}
init();
})();
