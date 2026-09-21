function enter(m){sid=m.sessionId;token=m.token;app.innerHTML='<section class="card"><div class="row"><div><p id="course" style="color:#185dcb;font-weight:700;margin:0"></p><h1 id="clsname"></h1></div><button type="button" class="ghost" id="leave" style="width:auto">switch</button></div><p id="who"></p><div id="box"></div></section>';document.getElementById('leave').onclick=function(){save('classroom.current',null);sid=0;token='';boot();};poll();}
function left(q){return Math.max(0,Math.ceil((q.deadline-Date.now()-off)/1000));}
function poll(){if(!sid)return;api('/api/state',null,1).then(function(d){state=d;svc('ok');draw();if(!d.session.ended)setTimeout(poll,2000);}).catch(function(e){svc('down');var b=document.getElementById('box');if(b)b.innerHTML='<p class="err">'+esc(e.message)+'</p>';setTimeout(poll,4000);});}
function boot(){joinUI([],'');document.getElementById('list').innerHTML='<p>...</p>';load().then(function(d){joinUI(d.sessions||[],'');}).catch(function(e){joinUI([],e.message);});}
var saved;try{saved=JSON.parse(localStorage.getItem('classroom.current'));}catch(e){}
if(saved&&mem[saved]&&mem[saved].token)enter(mem[saved]);else boot();
})();
