(function(){
var A='https://geogoku-classroom.classroom-response-local.workers.dev';
var LOCAL='https://geogoku.github.io/classroom/sessions.json';
var app=document.getElementById('app'),Q=new URLSearchParams(location.search);
var want=+Q.get('session')||+Q.get('s')||0,ident={},mem={},token='',sid=0,state=null,off=0;
try{ident=JSON.parse(localStorage.getItem('classroom.identity')||'{}')||{};}catch(e){}
try{mem=JSON.parse(localStorage.getItem('classroom.memberships')||'{}')||{};}catch(e){}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function svc(t){var el=document.getElementById('svc');if(el)el.textContent=t;}
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
function api(p,b,tok){return xhr(b?'POST': 'GET', A+p, b||null, tok, b?12000:8000);}
function jsonp(){return new Promise(function(ok,no){var d=false;window.__cs=function(x){if(d)return;d=true;ok(x);};var s=document.createElement('script');s.src=A+'/api/sessions.js?cb=__cs&t='+Date.now();s.onerror=function(){if(!d){d=true;no(new Error('api down'));}};setTimeout(function(){if(!d){d=true;no(new Error('timeout'));}},8000);document.head.appendChild(s);});}
function load(){
  return api('/api/sessions').catch(function(){
    return xhr('GET', LOCAL+'?t='+Date.now(), null, 0, 8000);
  }).catch(function(){
    return xhr('GET', './sessions.json?t='+Date.now(), null, 0, 8000);
  }).catch(jsonp);
}
function joinUI(list,err){
  list=list||[];
  var pick=want&&list.some(function(s){return s.id===want;})?want:(list.length===1?list[0].id:want||0);
  var cards;
  if(list.length){
    cards=list.map(function(s){return '<button type="button" class="cls'+(s.id===pick?' on':'')+'" data-id="'+s.id+'"><b>'+esc(s.className)+'</b><small>'+esc(s.course)+' #'+s.id+'</small></button>';}).join('');
  }else if(err){
    cards='<p class="err">课堂列表暂时打不开。不要找下拉菜单，直接填老师屏幕上的课堂编号。</p>';
  }else{
    cards='<p class="err">现在没有进行中的课堂。请老师先点「创建并进入课堂」，再把课堂编号告诉学生。</p>';
  }
  app.innerHTML='<section class="card"><h1>加入课堂</h1><p>点班级卡片；没有卡片就填编号。微信里请点右上角「在浏览器打开」。</p><div id="list">'+cards+'</div><form id="f"><input type="hidden" id="sid" value="'+(pick||'')+'"><label>课堂编号</label><input id="manual" inputmode="numeric" placeholder="老师屏幕上的数字" value="'+(pick||want||'')+'"><label>姓名</label><input id="name" required value="'+esc(ident.name||'')+'"><label>学号</label><input id="stu" required value="'+esc(ident.studentId||'')+'"><button>进入课堂</button></form><p id="msg" hidden></p><button type="button" class="ghost" id="retry">重新查找</button></section>';
  svc(err?'未连通':(list.length?'已连通':'已连通 · 暂无课堂'));
  [].forEach.call(document.querySelectorAll('.cls'),function(b){b.onclick=function(){[].forEach.call(document.querySelectorAll('.cls'),function(x){x.className='cls';});b.className='cls on';document.getElementById('sid').value=b.getAttribute('data-id');document.getElementById('manual').value=b.getAttribute('data-id');};});
  document.getElementById('retry').onclick=boot;
  document.getElementById('f').onsubmit=function(e){
    e.preventDefault();
    var id=String(document.getElementById('manual').value||document.getElementById('sid').value||'').trim();
    var name=document.getElementById('name').value.trim(),stu=document.getElementById('stu').value.trim(),msg=document.getElementById('msg');
    if(!id||!name||!stu){msg.hidden=false;msg.className='err';msg.textContent='请填课堂编号、姓名、学号';return;}
    var p=mem[id];if(!p||p.studentId!==stu){var a=new Uint8Array(32);crypto.getRandomValues(a);p={sessionId:+id,studentId:stu,token:Array.prototype.map.call(a,function(x){return('0'+x.toString(16)).slice(-2);}).join('')};mem[id]=p;save('classroom.memberships',mem);}
    msg.hidden=false;msg.className='ok';msg.textContent='正在进入…';
    api('/api/join',{sessionId:+id,name:name,studentId:stu,token:p.token}).then(function(r){ident={name:r.name,studentId:r.studentId};save('classroom.identity',ident);mem[r.sessionId]=r;save('classroom.memberships',mem);save('classroom.current',r.sessionId);enter(r);}).catch(function(err){msg.className='err';msg.textContent=err.message||'进入失败，请改用校园网或系统浏览器';});
  };
}
