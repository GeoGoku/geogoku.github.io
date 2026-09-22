'use strict';
const crypto=require('crypto');
const {createService}=require('./service.js');
const config=require('./private-config.json');
const ORIGIN='https://geogoku.github.io';
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const sign=s=>crypto.createHmac('sha256',config.teacherSecret).update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function teacherToken(){const payload=Buffer.from(JSON.stringify({expires:Date.now()+12*3600000,nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+sign(payload);}
function isTeacher(token){try{const [p,s]=String(token||'').split('.');return p.length<1000&&equal(s,sign(p))&&JSON.parse(Buffer.from(p,'base64url')).expires>Date.now();}catch{return false;}}
function result(code,payload){return {mpserverlessComposedResponse:true,statusCode:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin'},body:JSON.stringify(payload)};}
exports.main=async event=>{
  try{
    const origin=event.headers?.origin||event.headers?.Origin;
    if(origin&&origin!==ORIGIN)return result(403,{error:'请从老师提供的课堂网页进入。'});
    if(event.httpMethod==='GET'&&String(event.path).endsWith('/health'))return result(200,{ok:true,version:3,mode:'on-demand',serverNow:Date.now()});
    if(event.httpMethod!=='POST')return result(405,{error:'请求方式不支持。'});
    const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body;
    if(typeof raw!=='string'||raw.length>500000)return result(413,{error:'请求内容过长。'});
    let request;try{request=JSON.parse(raw);}catch{return result(400,{error:'请求格式不正确。'});}
    if(!request||typeof request!=='object'||Array.isArray(request))return result(400,{error:'请求格式不正确。'});
    const {path,method='GET',body={},token}=request;
    if(typeof path!=='string'||path.length>200||!['GET','POST'].includes(method)||!body||typeof body!=='object'||Array.isArray(body))return result(400,{error:'请求格式不正确。'});
    if(path==='/api/teacher/login'&&method==='POST'){
      if(typeof body.password!=='string'||!equal(hash(body.password),hash(config.teacherSecret)))return result(401,{error:'老师口令不正确。'});
      return result(200,{token:teacherToken(),serverNow:Date.now()});
    }
    if(path.startsWith('/api/teacher/')&&!isTeacher(token))return result(401,{error:'请先登录老师端。'});
    if(raw.length>12000&&path!=='/api/teacher/import')return result(413,{error:'请求内容过长。'});
    const service=createService(uniCloud.database());
    if(path==='/api/teacher/import'&&method==='POST'){
      return result(403,{error:'迁移入口已关闭。'});
    }
    let data;
    if(path==='/api/sessions'&&method==='GET')data={sessions:await service.list(false)};
    else if(path==='/api/teacher/sessions'&&method==='GET')data={sessions:await service.list(true),addresses:[{name:'固定学生入口',address:'手机流量或 Wi-Fi 均可',url:ORIGIN+'/classroom/'}]};
    else if(path==='/api/teacher/sessions'&&method==='POST')data=await service.create(body);
    else if(path==='/api/enter'&&method==='POST')data=await service.enter(body);
    else if(path==='/api/join'&&method==='POST')data=await service.join(body);
    else if(path==='/api/state'&&method==='GET')data=await service.studentState(request.sessionId,request.studentId,token);
    else if(path==='/api/submit'&&method==='POST')data=await service.submit(request.sessionId,request.studentId,token,body);
    else {
      const route=path.match(/^\/api\/teacher\/sessions\/(\d+)(?:\/(\w+))?(?:\?(wide)=1)?$/);
      if(!route)return result(404,{error:'请求地址不存在。'});
      const [,id,action,wide]=route;
      if(method==='GET'&&!action)data=await service.teacherState(id);
      else if(method==='GET'&&action==='export')data={csv:await service.export(id,!!wide)};
      else if(method==='POST'&&['open','close','lecture','end','reveal'].includes(action))data=await service.control(id,action,body);
      else return result(404,{error:'请求地址不存在。'});
    }
    return result(200,{...data,serverNow:Date.now()});
  }catch(error){if(!error.status)console.error('classroom error:',error.message);return result(error.status||500,{error:error.status?error.message:'服务暂时不可用，请稍后手动重试；收到“已提交”才表示保存成功。'});}
};
