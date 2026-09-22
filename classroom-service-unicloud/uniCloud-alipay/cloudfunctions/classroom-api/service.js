'use strict';
const crypto=require('crypto');
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
const integer=(v,label,min=1,max=999)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)fail(`${label}须在 ${min}–${max} 之间。`);return n;};
const text=(v,label,max=80)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(`${label}不能为空且不能超过 ${max} 个字。`);return v.trim();};
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const pkey=id=>'p'+hash(id).slice(0,32);
const qkey=(l,n)=>`q${l}_${n}`;
const qid=(l,n)=>l*1000+n;
// Keys already encode the question and student. Store only choice/time to keep
// each class small; retain compatibility with the original imported objects.
const expandAnswer=(a,questionId,participantId)=>Array.isArray(a)?{questionId,participantId,choice:a[0],submitted:a[1]}:a;
const sessionView=s=>({id:s.id,course:s.course,className:s.className,lecture:s.lecture,created:s.created,ended:s.ended});
const summaryFields={id:true,course:true,className:true,lecture:true,created:true,ended:true,studentCount:true};
const isOpen=(s,q)=>s.ended===null&&s.activeKey===qkey(q.lecture,q.number)&&q.closed===null&&q.deadline>Date.now();
const csvCell=v=>{let s=String(v??'');if(/^\s*[=+@\-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
function createService(db){
  const col=db.collection('classroom_sessions'),cmd=db.command;
  async function get(id,fields){let query=col.doc(String(integer(id,'课堂编号',1,999999999)));if(fields)query=query.field(fields);const s=(await query.get()).data[0];if(!s)fail('课堂不存在。',404);return s;}
  async function auth(id,studentId,token){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('请重新加入课堂。',401);
    const key=pkey(text(studentId,'学号',40));
    const s=await get(id,{...summaryFields,activeKey:true,questions:true,[`students.${key}`]:true,[`answers.${key}`]:true});
    const p=s.students?.[key];if(!p||p.tokenHash!==hash(token))fail('身份信息失效，请用原浏览器加入课堂。',401);
    return {s,p,key};
  }
  function studentView(s,p,key){
    return {session:sessionView(s),name:p.name,studentId:p.studentId,questions:Object.values(s.questions||{}).sort((a,b)=>a.opened-b.opened).map(q=>{const a=expandAnswer(s.answers?.[key]?.[qkey(q.lecture,q.number)],q.id,key);return {id:q.id,lecture:q.lecture,number:q.number,options:q.options,opened:q.opened,deadline:q.deadline,closed:q.closed,revealed:q.revealed,answerKey:q.revealed?q.answerKey:null,open:isOpen(s,q),choice:a?.choice||null,submitted:a?.submitted||null};})};
  }
  function teacherView(s){
    const students=Object.values(s.students||{}).map(({tokenHash,...p})=>p);
    const questions=Object.values(s.questions||{}).sort((a,b)=>a.opened-b.opened).map(q=>{
      const key=qkey(q.lecture,q.number),answers=students.flatMap(p=>{const a=expandAnswer(s.answers?.[p.id]?.[key],q.id,p.id);return a?[{...a,name:p.name,studentId:p.studentId}]:[];});
      return {...q,open:isOpen(s,q),submitted:answers.length,counts:Object.fromEntries([...q.options].map(c=>[c,answers.filter(a=>a.choice===c).length])),answers};
    });
    return {session:sessionView(s),students,questions};
  }
  async function teacherState(id){return teacherView(await get(id));}
  async function list(teacher){return (await col.where(teacher?{}:{ended:null}).field(summaryFields).orderBy('created','desc').limit(300).get()).data.map(s=>({...sessionView(s),students:s.studentCount||0}));}
  async function create(b){
    const course=text(b.course,'课程'),className=text(b.className,'班级'),lecture=integer(b.lecture,'讲次');
    const existing=(await col.where({course,className,ended:null}).field({id:true}).limit(1).get()).data[0];
    if(existing)return teacherState(existing.id);
    const s={id:crypto.randomInt(100000,1000000),course,className,lecture,created:Date.now(),ended:null,activeKey:null,controlVersion:0,studentCount:0,students:{},questions:{},answers:{}};
    s._id=String(s.id);await col.add(s);return teacherView(s);
  }
  async function control(id,action,b){
    const s=await get(id,{...summaryFields,activeKey:true,controlVersion:true,questions:true});
    if(s.ended!==null&&action!=='reveal')fail('课堂已结束，不能再次开题。');
    const now=Date.now(),updates={controlVersion:cmd.inc(1)},condition={_id:String(s.id),controlVersion:s.controlVersion};
    const close=()=>{if(s.activeKey&&s.questions[s.activeKey])updates[`questions.${s.activeKey}.closed`]=now;updates.activeKey=null;};
    if(action==='open'){
      const number=integer(b.number,'题号',1,20),seconds=integer(b.seconds,'答题秒数',5,600),key=qkey(s.lecture,number);
      if(s.questions[key])fail('这道题已经开过，不能重开或补交。');
      if(Object.keys(s.questions).length>=100)fail('本堂课已达到 100 道题，请结束后新建课堂。');
      close();updates.activeKey=key;condition[`questions.${key}`]=cmd.exists(false);
      updates[`questions.${key}`]={id:qid(s.lecture,number),lecture:s.lecture,number,options:b.options==='ABCD'?'ABCD':'ABC',opened:now,deadline:now+seconds*1000,closed:null,answerKey:null,revealed:0};
    }else if(action==='close')close();
    else if(action==='lecture'){close();updates.lecture=integer(b.lecture,'讲次');}
    else if(action==='end'){close();updates.ended=now;}
    else if(action==='reveal'){
      const q=Object.values(s.questions).find(q=>q.id===Number(b.questionId));if(!q)fail('题目不存在。',404);if(isOpen(s,q)){if(b.close===true)close();else fail('请先截止作答，再公布答案。');}
      if(typeof b.answerKey!=='string'||b.answerKey.length!==1||!q.options.includes(b.answerKey))fail('请选择有效的正确答案。');
      const key=qkey(q.lecture,q.number);updates[`questions.${key}.answerKey`]=b.answerKey;updates[`questions.${key}.revealed`]=1;
    }
    const r=await col.where(condition).update(updates);if(r.updated!==1)fail('课堂状态刚有变化，请手动刷新后重试。',409);
    return teacherState(id);
  }
  async function join(b){
    const name=text(b.name,'姓名',40),studentId=text(b.studentId,'学号',40),key=pkey(studentId);
    const token=typeof b.token==='string'&&/^[a-f0-9]{64}$/.test(b.token)?b.token:crypto.randomBytes(32).toString('hex');
    const tokenHash=hash(token),s=await get(b.sessionId,{...summaryFields,[`students.${key}`]:true});
    if(s.ended!==null)fail('本次课堂已结束。');
    let p=s.students?.[key];
    if(!p){
      const record={id:key,studentId,name,tokenHash,joined:Date.now()};
      await col.where({_id:String(s.id),ended:null,studentCount:cmd.lt(300),[`students.${key}`]:cmd.exists(false)}).update({[`students.${key}`]:record,studentCount:cmd.inc(1)});
      p=(await get(s.id,{[`students.${key}`]:true})).students?.[key];
      if(!p)fail('加入失败，课堂可能已结束或人数已满。');
    }
    if(p.tokenHash!==tokenHash)fail('该学号已加入，请使用原浏览器继续，不能换人或换设备重答。');
    const {s:current}=await auth(s.id,studentId,token);
    return {token,name:p.name,studentId,sessionId:s.id,state:studentView(current,p,key)};
  }
  async function studentState(id,studentId,token){const {s,p,key}=await auth(id,studentId,token);return studentView(s,p,key);}
  async function enter(b){
    if(b.sessionId)return join(b);
    const sessions=await list(false);
    if(sessions.length!==1)return {choose:true,sessions};
    const sessionId=sessions[0].id;
    const previous=Array.isArray(b.resume)?b.resume.slice(0,10).find(p=>p.sessionId===sessionId&&p.studentId===b.studentId):null;
    return join({...b,sessionId,token:previous?.token||b.token});
  }
  async function submit(id,studentId,token,b){
    const {s,p,key}=await auth(id,studentId,token),lecture=integer(b.lecture,'讲次'),number=integer(b.number,'题号',1,20),qk=qkey(lecture,number),q=s.questions?.[qk];
    const prior=expandAnswer(s.answers?.[key]?.[qk],qid(lecture,number),key);if(prior)return {...prior,repeated:true};
    if(!q)fail('老师尚未开放这道题，请核对讲次和题号。',409);
    if(!isOpen(s,q))fail('本题已截止或尚未开放，不能补交。',409);
    if(typeof b.choice!=='string'||b.choice.length!==1||!q.options.includes(b.choice))fail('该题没有这个选项，请核对 PPT。');
    const submitted=Date.now(),answer={questionId:q.id,participantId:key,choice:b.choice,submitted};
    // 截止、换讲、下课与答题都更新同一个文档。条件更新保证同时发生时也不能越过截止状态或覆盖第一次答案。
    const r=await col.where({_id:String(s.id),ended:null,activeKey:qk,[`questions.${qk}.closed`]:null,[`questions.${qk}.deadline`]:cmd.gt(submitted),[`students.${key}.tokenHash`]:hash(token),[`answers.${key}.${qk}`]:cmd.exists(false)}).update({[`answers.${key}.${qk}`]:[answer.choice,answer.submitted]});
    if(r.updated!==1){const current=await get(s.id,{[`answers.${key}.${qk}`]:true});const existing=expandAnswer(current.answers?.[key]?.[qk],q.id,key);if(existing)return {...existing,repeated:true};fail('本题已截止，不能补交。',409);}
    return answer;
  }
  async function exportCsv(id,wide){
    const st=await teacherState(id),s=st.session,format=t=>new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),prefix=[s.course,s.className,s.id,format(s.created)],rows=[];
    if(wide){rows.push(['课程','班级','课堂编号','上课时间','学号','姓名',...st.questions.flatMap(q=>[`${q.lecture}-${q.number} 作答`,`${q.lecture}-${q.number} 标准答案`]),'已答题数','答对题数','已设答案题数']);for(const p of st.students){let answered=0,correct=0,graded=0;const cells=st.questions.flatMap(q=>{const a=q.answers.find(a=>a.participantId===p.id);if(a)answered++;if(q.answerKey){graded++;if(a?.choice===q.answerKey)correct++;}return[a?.choice??'未答',q.answerKey??'未设置'];});rows.push([...prefix,p.studentId,p.name,...cells,answered,correct,graded]);}}
    else{rows.push(['课程','班级','课堂编号','上课时间','学号','姓名','题号','学生答案','标准答案','是否正确','提交时间']);for(const p of st.students)for(const q of st.questions){const a=q.answers.find(a=>a.participantId===p.id);rows.push([...prefix,p.studentId,p.name,`${q.lecture}-${q.number}`,a?.choice??'未答',q.answerKey??'未设置',q.answerKey?(a?.choice===q.answerKey?'正确':a?'错误':'未答'):'未判分',a?format(a.submitted):'']);}}
    return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  }
  async function importSession(b){
    const s=b.session;if(!s||!Array.isArray(b.students)||!Array.isArray(b.questions)||!Array.isArray(b.answers))fail('迁移格式错误。');
    const doc={_id:String(integer(s.id,'编号',1,999999999)),...sessionView(s),activeKey:null,controlVersion:0,studentCount:b.students.length,students:{},questions:{},answers:{}};
    const people=new Map(),questions=new Map();
    for(const p of b.students){const key=pkey(p.studentId);people.set(p.id,key);doc.students[key]={id:key,name:p.name,studentId:p.studentId,tokenHash:p.tokenHash,joined:p.joined};}
    for(const q of b.questions){const key=qkey(q.lecture,q.number);questions.set(q.id,key);doc.questions[key]={...q,id:qid(q.lecture,q.number)};delete doc.questions[key].sessionId;if(s.ended===null&&q.closed===null&&q.deadline>Date.now())doc.activeKey=key;}
    for(const a of b.answers){const pk=people.get(a.participantId),qk=questions.get(a.questionId);if(!pk||!qk)fail('迁移数据关联不完整。');doc.answers[pk]||={};doc.answers[pk][qk]={questionId:doc.questions[qk].id,participantId:pk,choice:a.choice,submitted:a.submitted};}
    const existing=(await col.doc(doc._id).get()).data[0];if(existing)fail('这个课堂已存在，未覆盖。',409);
    await col.add(doc);return {ok:true,id:doc.id,students:doc.studentCount,questions:b.questions.length,answers:b.answers.length};
  }
  async function removeSession(id){
    const s=await get(id,{...summaryFields});
    if(s.ended===null)fail('请先结束本次课堂，再删除记录。',409);
    // The class document contains its roster, questions and answers; remove them atomically.
    const r=await col.where({_id:String(s.id),ended:s.ended}).remove();
    if(r.deleted!==1)fail('课堂状态已变化，请刷新列表后重试。',409);
    return {ok:true,deletedId:s.id};
  }
  return {list,create,teacherState,control,join,enter,studentState,submit,export:exportCsv,importSession,removeSession};
}
module.exports={createService};
