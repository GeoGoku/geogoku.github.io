(function(){
var A='https://geogoku-classroom.classroom-response-local.workers.dev';
var app=document.getElementById('app'),Q=new URLSearchParams(location.search);
var want=+Q.get('session')||+Q.get('s')||0,ident={},mem={},token='',sid=0,state=null,off=0;
try{ident=JSON.parse(localStorage.getItem('classroom.identity')||'{}')||{};}catch(e){}
try{mem=JSON.parse(localStorage.getItem('classroom.memberships')||'{}')||{};}catch(e){}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c];});}
function svc(t){document.getElementById('svc').textContent=t;}
function api(p,b,tok){
  var o={method:b?'POST':'GET',cache:'no-store',headers:{}};
  if(b){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b);}
  if(tok&&token)o.headers.Authorization='Bearer '+token;
  return fetch(A+p,o).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'fail');if(d.serverNow)off=d.serverNow-Date.now();return d;});});
}
function jsonp(){return new Promise(function(ok,no){var d=false;window.__cs=function(x){if(d)return;d=true;ok(x);};var s=document.createElement('script');s.src=A+'/api/sessions.js?cb=__cs&t='+Date.now();s.onerror=function(){if(!d){d=true;no(new Error('api down'));}};setTimeout(function(){if(!d){d=true;no(new Error('timeout'));}},12000);document.head.appendChild(s);});}
function load(){return api('/api/sessions').catch(jsonp);}
function joinUI(list,err){
  list=list||[];
  var pick=want&&list.some(function(s){return s.id===want;})?want:(list.length===1?list[0].id:0);
  var cards=list.length?list.map(function(s){return '<button type="button" class="cls'+(s.id===pick?' on':'')+'" data-id="'+s.id+'"><b>'+esc(s.className)+'</b><small>'+esc(s.course)+' #'+s.id+'</small></button>';}).join(''):'<p class="err">'+(err||'no class')+'</p>';
  app.innerHTML='<section class="card"><h1>加入课堂</h1><p>点选班级，选不出就填编号</p><div id="list">'+cards+'</div><form id="f"><input type="hidden" id="sid" value="'+(pick||'')+'"><label>课堂编号</label><input id="manual" inputmode="numeric" value="'+(pick||want||'')+'"><label>姓名</label><input id="name" required value="'+esc(ident.name||'')+'"><label>学号</label><input id="stu" required value="'+esc(ident.studentId||'')+'"><button>进入课堂</button></form><p id="msg" hidden></p><button type="button" class="ghost" id="retry">retry</button></section>';
  svc(err?'off':'on');
  [].forEach.call(document.querySelectorAll('.cls'),function(b){b.onclick=function(){[].forEach.call(document.querySelectorAll('.cls'),function(x){x.className='cls';});b.className='cls on';document.getElementById('sid').value=b.getAttribute('data-id');document.getElementById('manual').value=b.getAttribute('data-id');};});
  document.getElementById('retry').onclick=boot;
  document.getElementById('f').onsubmit=function(e){
    e.preventDefault();
    var id=String(document.getElementById('manual').value||document.getElementById('sid').value||'').trim();
    var name=document.getElementById('name').value.trim(),stu=document.getElementById('stu').value.trim(),msg=document.getElementById('msg');
    if(!id||!name||!stu){msg.hidden=false;msg.className='err';msg.textContent='请填班级姓名学号';return;}
    var p=mem[id];if(!p||p.studentId!==stu){var a=new Uint8Array(32);crypto.getRandomValues(a);p={sessionId:+id,studentId:stu,token:Array.prototype.map.call(a,function(x){return('0'+x.toString(16)).slice(-2);}).join('')};mem[id]=p;save('classroom.memberships',mem);}
    msg.hidden=false;msg.className='ok';msg.textContent='...';
    api('/api/join',{sessionId:+id,name:name,studentId:stu,token:p.token}).then(function(r){ident={name:r.name,studentId:r.studentId};save('classroom.identity',ident);mem[r.sessionId]=r;save('classroom.memberships',mem);save('classroom.current',r.sessionId);enter(r);}).catch(function(err){msg.className='err';msg.textContent=err.message;});
  };
}
