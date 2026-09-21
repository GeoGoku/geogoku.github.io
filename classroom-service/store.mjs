export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const fail=(m,s)=>{throw new AppError(m,s);};
const integer=(v,label,min=1,max=999)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)fail(`${label}须在 ${min}–${max} 之间。`);return n;};
const text=(v,label,max=80)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(`${label}不能为空，且不能超过 ${max} 个字。`);return v.trim();};
export async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const randomToken=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const csvCell=v=>{let s=String(v??'');if(/^\s*[=+@\-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
const open=q=>q.closed===null&&q.deadline>Date.now();
export function makeStore(db){
  const stmt=(q,...p)=>db.prepare(q).bind(...p);
  const get=(q,...p)=>stmt(q,...p).first();
  const all=async(q,...p)=>(await stmt(q,...p).all()).results;
  const run=(q,...p)=>stmt(q,...p).run();
  async function session(id,active=false){const s=await get('SELECT * FROM sessions WHERE id=?',integer(id,'课堂编号',1,1e9));if(!s)fail('课堂不存在。',404);if(active&&s.ended!==null)fail('本次课堂已结束。');return s;}
  async function participant(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('请先加入课堂。',401);const p=await get('SELECT * FROM participants WHERE tokenHash=?',await hash(token));if(!p)fail('身份信息已失效，请重新加入。',401);return p;}
  async function teacherState(id){
    const s=await session(id);
    const result=await db.batch([
      stmt('SELECT id,studentId,name,joined FROM participants WHERE sessionId=? ORDER BY studentId',s.id),
      stmt('SELECT * FROM questions WHERE sessionId=? ORDER BY id',s.id),
      stmt('SELECT a.*,p.name,p.studentId FROM answers a JOIN participants p ON p.id=a.participantId WHERE p.sessionId=? ORDER BY submitted',s.id)
    ]);
    const [students,questions,answers]=result.map(r=>r.results);
    return {session:s,students,questions:questions.map(q=>{const qa=answers.filter(a=>a.questionId===q.id),counts=Object.fromEntries([...q.options].map(c=>[c,0]));for(const a of qa)counts[a.choice]++;return {...q,open:open(q),counts,answers:qa,submitted:qa.length};}),serverNow:Date.now()};
  }
  return {
    list:(teacher=false)=>all(`SELECT s.*, (SELECT COUNT(*) FROM participants p WHERE p.sessionId=s.id) AS students FROM sessions s ${teacher?'':'WHERE ended IS NULL'} ORDER BY id DESC LIMIT 300`),
    teacherState,
    async create(b){const course=text(b.course,'课程'),className=text(b.className,'班级'),lecture=integer(b.lecture,'讲次');try{const r=await run('INSERT INTO sessions(course,className,lecture,created) VALUES(?,?,?,?)',course,className,lecture,Date.now());return teacherState(r.meta.last_row_id);}catch(e){if(String(e).includes('UNIQUE'))fail('这个班已有进行中的课堂，请先进入原课堂或结束它。');throw e;}},
    async switchLecture(id,lecture){const s=await session(id,true);await run('UPDATE sessions SET lecture=? WHERE id=? AND ended IS NULL',integer(lecture,'讲次'),s.id);return teacherState(s.id);},
    async open(id,b){const s=await session(id,true),number=integer(b.number,'题号'),seconds=integer(b.seconds,'答题秒数',5,600),options=b.options==='ABCD'?'ABCD':'ABC';const t=Date.now();try{await run('INSERT INTO questions(sessionId,lecture,number,options,opened,deadline) VALUES(?,?,?,?,?,?)',s.id,s.lecture,number,options,t,t+seconds*1000);}catch(e){if(String(e).includes('UNIQUE'))fail('这道题已经开过，不能重开或补交。');if(String(e).includes('SESSION_CHANGED'))fail('课堂状态已变化，请刷新后重试。');throw e;}return teacherState(s.id);},
    async close(id){const s=await session(id,true);await run('UPDATE questions SET closed=? WHERE sessionId=? AND closed IS NULL',Date.now(),s.id);return teacherState(s.id);},
    async end(id){const s=await session(id,true);await run('UPDATE sessions SET ended=? WHERE id=? AND ended IS NULL',Date.now(),s.id);return teacherState(s.id);},
    async reveal(id,b){const s=await session(id),q=await get('SELECT * FROM questions WHERE id=? AND sessionId=?',integer(b.questionId,'题目',1,1e9),s.id);if(!q)fail('题目不存在。',404);if(open(q))fail('请先结束作答，再公布答案。');if(typeof b.answerKey!=='string'||b.answerKey.length!==1||!q.options.includes(b.answerKey))fail('请选择有效的正确答案。');await run('UPDATE questions SET answerKey=?,revealed=1 WHERE id=?',b.answerKey,q.id);return teacherState(s.id);},
    async join(b){
      const s=await session(b.sessionId,true),name=text(b.name,'姓名',40),studentId=text(b.studentId,'学号',40);
      const token=typeof b.token==='string'&&/^[a-f0-9]{64}$/.test(b.token)?b.token:randomToken(),tokenHash=await hash(token);
      try{await run('INSERT INTO participants(sessionId,studentId,name,tokenHash,joined) VALUES(?,?,?,?,?) ON CONFLICT(sessionId,studentId) DO NOTHING',s.id,studentId,name,tokenHash,Date.now());}catch(e){if(String(e).includes('SESSION_ENDED'))fail('本次课堂已结束。');throw e;}
      const p=await get('SELECT * FROM participants WHERE sessionId=? AND studentId=?',s.id,studentId);
      if(p.tokenHash!==tokenHash)fail('这个学号已加入课堂，请用原浏览器继续作答。');
      return {token,name:p.name,studentId:p.studentId,sessionId:s.id};
    },
    async studentState(token){const p=await participant(token),s=await session(p.sessionId),questions=await all('SELECT q.*,a.choice,a.submitted FROM questions q LEFT JOIN answers a ON a.questionId=q.id AND a.participantId=? WHERE q.sessionId=? ORDER BY q.id DESC',p.id,s.id);return {session:s,name:p.name,studentId:p.studentId,questions:questions.map(q=>({...q,answerKey:q.revealed?q.answerKey:null,open:s.ended===null&&open(q)})),serverNow:Date.now()};},
    async submit(token,b){
      const p=await participant(token),qid=integer(b.questionId,'题目',1,1e9),q=await get('SELECT * FROM questions WHERE id=? AND sessionId=?',qid,p.sessionId);if(!q)fail('题目不存在。',404);
      const existing=()=>get('SELECT choice,submitted FROM answers WHERE questionId=? AND participantId=?',qid,p.id);
      const old=await existing();if(old)return {...old,repeated:true};
      if(typeof b.choice!=='string'||b.choice.length!==1||!q.options.includes(b.choice))fail('请选择有效选项。');
      try{await run("INSERT INTO answers(questionId,participantId,choice,submitted) VALUES(?,?,?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))",qid,p.id,b.choice);}catch(e){const saved=await existing();if(saved)return {...saved,repeated:true};if(String(e).includes('ANSWER_CLOSED'))fail('本题已截止，不能补交。',409);throw e;}
      return existing();
    },
    async export(id,wide=false){
      const state=await teacherState(id),s=state.session,date=t=>new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),prefix=[s.course,s.className,s.id,date(s.created)],rows=[];
      if(wide){rows.push(['课程','班级','课堂编号','上课时间','学号','姓名',...state.questions.flatMap(q=>[`${q.lecture}-${q.number} 作答`,`${q.lecture}-${q.number} 标准答案`]),'已答题数','答对题数','已设答案题数']);for(const p of state.students){let answered=0,correct=0,graded=0;const cells=state.questions.flatMap(q=>{const a=q.answers.find(a=>a.participantId===p.id);if(a)answered++;if(q.answerKey){graded++;if(a?.choice===q.answerKey)correct++;}return[a?.choice??(q.open?'作答中':'未答'),q.answerKey??'未设置'];});rows.push([...prefix,p.studentId,p.name,...cells,answered,correct,graded]);}}
      else{rows.push(['课程','班级','课堂编号','上课时间','学号','姓名','题号','学生答案','标准答案','是否正确','提交时间']);for(const p of state.students)for(const q of state.questions){const a=q.answers.find(a=>a.participantId===p.id);rows.push([...prefix,p.studentId,p.name,`${q.lecture}-${q.number}`,a?.choice??(q.open?'作答中':'未答'),q.answerKey??'未设置',q.answerKey?(a?.choice===q.answerKey?'正确':a?'错误':'未答'):'未判分',a?date(a.submitted):'']);}}
      return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
    }
  };
}
