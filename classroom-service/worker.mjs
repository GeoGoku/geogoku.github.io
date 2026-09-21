import {makeStore,AppError,fail,hash,randomToken} from './store.mjs';
const enc=new TextEncoder();
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
async function signature(payload,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function teacherToken(secret){const payload=btoa(JSON.stringify({expires:Date.now()+12*3600_000,nonce:randomToken()}));return payload+'.'+await signature(payload,secret);}
async function verifyTeacher(token,secret){if(!secret||!token||token.length>1000)return false;try{const [payload,sig]=token.split('.');if(!equal(sig,await signature(payload,secret)))return false;return JSON.parse(atob(payload)).expires>Date.now();}catch{return false;}}
async function body(req){const raw=await req.text();if(raw.length>8192)fail('提交内容过长。',413);try{const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))fail('请求格式不正确。');return v;}catch{fail('请求格式不正确。');}}
export default {async fetch(req,env){
  const origin=req.headers.get('Origin'),allowed=env.ALLOWED_ORIGIN||'https://geogoku.github.io';
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'3600'};
  if(origin===allowed)headers['Access-Control-Allow-Origin']=allowed;
  const send=(v,status=200,type='application/json; charset=utf-8',extra={})=>new Response(type.startsWith('application/json')?JSON.stringify(v):v,{status,headers:{...headers,'Content-Type':type,...extra}});
  try{
    if(origin&&origin!==allowed)fail('访问来源不受支持。',403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='GET'&&(origin!==allowed||!req.headers.get('Content-Type')?.startsWith('application/json')))fail('请从课堂网页提交。',403);
    const u=new URL(req.url),p=u.pathname,token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
    if(p==='/api/health'&&req.method==='GET')return send({ok:true,version:1});
    if(!env.DB)fail('课堂服务尚未完成配置。',503);
    if(p==='/api/teacher/login'&&req.method==='POST'){
      if(!env.TEACHER_SECRET)fail('老师登录尚未完成配置。',503);
      const b=await body(req);
      if(typeof b.password!=='string'||!equal(await hash(b.password),await hash(env.TEACHER_SECRET)))fail('老师口令不正确。',401);
      return send({token:await teacherToken(env.TEACHER_SECRET),expiresIn:43200});
    }
    if(p.startsWith('/api/teacher/')&&!await verifyTeacher(token,env.TEACHER_SECRET))fail('请先登录老师端。',401);
    const store=makeStore(env.DB);
    if(req.method==='GET'&&p==='/api/sessions')return send({sessions:await store.list(),serverNow:Date.now()});
    if(req.method==='GET'&&p==='/api/teacher/sessions')return send({sessions:await store.list(true),addresses:[{name:'固定学生入口',address:'无需同一 Wi-Fi',url:env.STUDENT_URL||'https://geogoku.github.io/classroom/'}],serverNow:Date.now()});
    if(req.method==='POST'&&p==='/api/teacher/sessions')return send(await store.create(await body(req)));
    const route=p.match(/^\/api\/teacher\/sessions\/(\d+)(?:\/(\w+))?$/);
    if(route){const[,id,action]=route;
      if(req.method==='GET'&&!action)return send(await store.teacherState(id));
      if(req.method==='GET'&&action==='export')return send(await store.export(id,u.searchParams.get('wide')==='1'),200,'text/csv; charset=utf-8',{'Content-Disposition':`attachment; filename="classroom-${id}.csv"`});
      if(req.method==='POST'){const b=await body(req);if(action==='lecture')return send(await store.switchLecture(id,b.lecture));if(action==='open')return send(await store.open(id,b));if(action==='close')return send(await store.close(id));if(action==='end')return send(await store.end(id));if(action==='reveal')return send(await store.reveal(id,b));}
    }
    if(req.method==='POST'&&p==='/api/join')return send(await store.join(await body(req)));
    if(req.method==='GET'&&p==='/api/state')return send(await store.studentState(token));
    if(req.method==='POST'&&p==='/api/submit')return send(await store.submit(token,await body(req)));
    fail('页面不存在。',404);
  }catch(e){if(!(e instanceof AppError))console.error(e.message);return send({error:e instanceof AppError?e.message:'服务暂时不可用，请稍后重试。'},e.status||500);}
}};
