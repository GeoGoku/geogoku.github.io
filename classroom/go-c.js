(function(){
var ORIGIN='https://geogoku-classroom.classroom-response-local.workers.dev';
var LOCAL='https://geogoku.github.io/classroom/sessions.json';
var HOSTS=[], alive=null;
function addHost(h){
  if(!h||typeof h!=='string')return;
  h=String(h).trim().replace(/\/$/,'');
  if(!h||h.indexOf('http')!==0)return;
  if(HOSTS.indexOf(h)<0)HOSTS.push(h);
}
try{
  var q=(location.search||'').match(/[?&]api=([^&]+)/);
  if(q)addHost(decodeURIComponent(q[1]));
}catch(e){}
try{addHost(window.CLASSROOM_CDN);}catch(e){}
try{
  var fb=window.CLASSROOM_API_FALLBACKS;
  if(fb&&fb.length)for(var i=0;i<fb.length;i++)addHost(fb[i]);
}catch(e){}
try{addHost(window.CLASSROOM_API);}catch(e){}
addHost(ORIGIN);

var app=document.getElementById('app');
var want=0,ident={},mem={},token='',sid=0,state=null,off=0;
try{var m=(location.search||'').match(/[?&]s(?:ession)?=(\d+)/);if(m)want=+m[1];}catch(e){}

try{ident=JSON.parse(localStorage.getItem('classroom.identity')||'{}')||{};}catch(e){}
try{mem=JSON.parse(localStorage.getItem('classroom.memberships')||'{}')||{};}catch(e){}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&'+'amp;','<':'&'+'lt;','>':'&'+'gt;','"':'&'+'quot;',"'":'&#39;'}[c];});}
function svc(t){var el=document.getElementById('svc');if(el)el.textContent=t;}
function failText(m){
  m=String(m||'');
  if(m==='network'||m==='timeout'||m.indexOf('连不上')>=0)return '当前网络未能连接答题服务，暂时不能加入或提交。可切换网络重试；若仍失败，请告诉老师。';
  if(m.indexOf('访问来源')>=0)return '答题服务拒绝了当前页面来源，请从老师提供的正式入口打开。';
  if(m.indexOf('课堂网页')>=0)return '提交格式被拒。请用系统浏览器打开后再进入。';
  return m||'进入失败';
}
function xhr(method,url,body,tok,ms){
  return new Promise(function(ok,no){
    var x=new XMLHttpRequest();
    x.open(method,url,true);
    x.timeout=ms||8000;
    if(body)x.setRequestHeader('Content-Type','application/json');
    if(tok&&token)x.setRequestHeader('Authorization','Bearer '+token);
    x.onload=function(){
      var d={};
      try{d=JSON.parse(x.responseText||'{}');}catch(e){}
      if(x.status<200||x.status>=300){no(new Error(d.error||('http '+x.status)));return;}
      if(d.serverNow)off=d.serverNow-Date.now();
      ok(d);
    };
    x.onerror=function(){no(new Error('network'));};
    x.ontimeout=function(){no(new Error('timeout'));};
    x.send(body?JSON.stringify(body):null);
  });
}
function hosts(){
  if(!alive)return HOSTS.slice();
  return [alive].concat(HOSTS.filter(function(h){return h!==alive;}));
}
function api(p,b,tok){
  var list=hosts(), i=0;
  function next(){
    if(i>=list.length)return Promise.reject(new Error('连不上课堂接口'));
    var host=list[i++];
    return xhr(b?'POST':'GET', host+p, b||null, tok, b?12000:8000).then(function(d){
      alive=host;
      return d;
    }).catch(function(e){
      var m=e.message||'';
      if(m==='network'||m==='timeout')return next();
      throw e;
    });
  }
  return next();
}
function load(){
  return new Promise(function(ok){
    var worker=null, local=null, left=2, werr='';
    function fin(){
      left--;
      if(left>0)return;
      var list=[];
      if(worker&&Array.isArray(worker.sessions)) list=worker.sessions;
      else if(local&&Array.isArray(local.sessions)) list=local.sessions;
      ok({sessions:list, err:werr});
    }
    api('/api/sessions').then(function(d){worker=d;fin();}).catch(function(e){werr=e.message||'offline';fin();});
    xhr('GET','./sessions.json?t='+Date.now(),null,0,8000).then(function(d){local=d;fin();}).catch(function(){
      xhr('GET',LOCAL+'?t='+Date.now(),null,0,8000).then(function(d){local=d;fin();}).catch(function(){fin();});
    });
  });
}
function joinUI(list,err){
  list=list||[];
  var pick=want&&list.some(function(s){return s.id===want;})?want:(list.length===1?list[0].id:want||0);
  var cards;
  if(list.length){
    cards=list.map(function(s){return '<button type="button" class="cls'+(s.id===pick?' on':'')+'" data-id="'+s.id+'"><b>'+esc(s.className)+'</b><small>'+esc(s.course)+' · 编号 '+s.id+'</small></button>';}).join('');
  }else if(err){
    cards='<p class="err">当前网络未连接答题服务。手填编号也需要连接成功才能进入。</p>';
  }else{
    cards='<p class="err">目前没有进行中的课堂，请等待老师开启。</p>';
  }
  app.innerHTML='<section class="card"><h1>加入课堂</h1><p>请选择班级，或填写老师提供的课堂编号。</p><div id="list">'+cards+'</div><form id="f"><input type="hidden" id="sid" value="'+(pick||'')+'"><label>课堂编号</label><input id="manual" inputmode="numeric" placeholder="老师屏幕上的数字" value="'+(pick||want||'')+'"><label>姓名</label><input id="name" required value="'+esc(ident.name||'')+'"><label>学号</label><input id="stu" required value="'+esc(ident.studentId||'')+'"><button>进入课堂</button></form><p id="msg" hidden></p><button type="button" class="ghost" id="retry">重新查找</button></section>';
  if(err){var status=document.getElementById('msg');status.hidden=false;status.className='err';status.textContent='未连接答题服务。'+(list.length?'下方班级来自缓存，不能代表已连通。':'')+' '+failText(err);}
  svc(err?'未连通':(list.length?'已连通':'已连通 · 暂无课堂'));
  [].forEach.call(document.querySelectorAll('.cls'),function(b){b.onclick=function(){[].forEach.call(document.querySelectorAll('.cls'),function(x){x.className='cls';});b.className='cls on';document.getElementById('sid').value=b.getAttribute('data-id');document.getElementById('manual').value=b.getAttribute('data-id');};});
  document.getElementById('retry').onclick=boot;
  document.getElementById('f').onsubmit=function(e){
    e.preventDefault();
    var id=String(document.getElementById('manual').value||document.getElementById('sid').value||'').trim();
    var name=document.getElementById('name').value.trim(),stu=document.getElementById('stu').value.trim(),msg=document.getElementById('msg');
    if(!id||!name||!stu){msg.hidden=false;msg.className='err';msg.textContent='请填课堂编号、姓名、学号';return;}
    var p=mem[id];if(!p||p.studentId!==stu){var tok='';try{var a=new Uint8Array(32);crypto.getRandomValues(a);tok=Array.prototype.map.call(a,function(x){return('0'+x.toString(16)).slice(-2);}).join('');}catch(err2){for(var i=0;i<64;i++)tok+='0123456789abcdef'.charAt((Math.random()*16)|0);}p={sessionId:+id,studentId:stu,token:tok};mem[id]=p;save('classroom.memberships',mem);}
    msg.hidden=false;msg.className='ok';msg.textContent='正在进入…';
    api('/api/join',{sessionId:+id,name:name,studentId:stu,token:p.token}).then(function(r){ident={name:r.name,studentId:r.studentId};save('classroom.identity',ident);mem[r.sessionId]=r;save('classroom.memberships',mem);save('classroom.current',r.sessionId);enter(r);}).catch(function(err){msg.className='err';msg.textContent=failText(err.message);});
  };
}
function enter(m){sid=m.sessionId;token=m.token;app.innerHTML='<section class="card"><div class="row"><div><p id="course" style="color:#185dcb;font-weight:700;margin:0"></p><h1 id="clsname"></h1></div><button type="button" class="ghost" id="leave" style="width:auto">切换</button></div><p id="who"></p><div id="box"></div></section>';document.getElementById('leave').onclick=function(){save('classroom.current',null);sid=0;token='';boot();};poll();}
function left(q){return Math.max(0,Math.ceil((q.deadline-Date.now()-off)/1000));}
function poll(){if(!sid)return;api('/api/state',null,1).then(function(d){state=d;svc('已连通');draw();if(!d.session.ended)setTimeout(poll,2000);}).catch(function(e){svc('未连通');var b=document.getElementById('box');if(b)b.innerHTML='<p class="err">'+esc(failText(e.message))+'</p>';setTimeout(poll,30000);});}
function draw(){if(!state)return;document.getElementById('course').textContent=state.session.course;document.getElementById('clsname').textContent=state.session.className;document.getElementById('who').textContent=state.name+' · '+state.studentId;var open=null,past=[];state.questions.forEach(function(q){if(q.open)open=q;else past.push(q);});var h='';if(state.session.ended)h+='<div class="wait"><h3>课堂已结束</h3></div>';else if(!open)h+='<div class="wait"><h3>等待老师开题</h3></div>';if(open)h+=qh(open,1);if(past.length){h+='<h2>记录</h2>';past.forEach(function(q){h+=qh(q,0);});}document.getElementById('box').innerHTML=h;var f=document.querySelector('form[data-qid]');if(f)f.onsubmit=function(e){e.preventDefault();var c=(f.querySelector('input:checked')||{}).value;if(!c){alert('请先选择');return;}api('/api/submit',{questionId:+f.getAttribute('data-qid'),choice:c},1).then(function(){return api('/api/state',null,1);}).then(function(d){state=d;draw();}).catch(function(err){alert(failText(err.message));});};}
function qh(q,live){var n=left(q),can=live&&n>0&&!q.choice,h='<div style="border:1px solid #d8e1eb;border-radius:12px;padding:16px;margin:12px 0"><div class="row"><div class="qnum">'+q.lecture+'-'+q.number+'</div><div class="'+(can?'timer':'')+'">'+(can?n+'s':'已截止')+'</div></div>';if(q.choice)h+='<p class="ok">'+q.choice+'</p>';else if(can){h+='<form data-qid="'+q.id+'"><div class="choices">';String(q.options).split('').forEach(function(c){h+='<label><input type="radio" name="c" value="'+c+'"><span>'+c+'</span></label>';});h+='</div><button>提交</button></form>';}else h+='<p>未答</p>';if(q.answerKey)h+='<p><b>'+q.answerKey+'</b></p>';return h+'</div>';}
function boot(){joinUI([],'');svc('正在连接…');var list=document.getElementById('list');if(list)list.innerHTML='<p>正在查找班级…</p>';load().then(function(d){joinUI(d.sessions||[],d.err||'');}).catch(function(e){joinUI([],e.message);});}
var saved;try{saved=JSON.parse(localStorage.getItem('classroom.current'));}catch(e){}
if(saved&&mem[saved]&&mem[saved].token)enter(mem[saved]);else boot();
})();
