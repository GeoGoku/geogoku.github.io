-- 已部署过的 D1 执行一次：去掉用 SQLite julianday 判断截止时间，避免 Worker 时钟与 D1 时钟不一致导致学生交不了、老师看不到。
DROP TRIGGER IF EXISTS check_answer;
CREATE TRIGGER IF NOT EXISTS check_answer BEFORE INSERT ON answers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM questions q JOIN sessions s ON s.id=q.sessionId JOIN participants p ON p.sessionId=s.id WHERE q.id=NEW.questionId AND p.id=NEW.participantId AND s.ended IS NULL AND q.closed IS NULL AND length(NEW.choice)=1 AND instr(q.options,NEW.choice)>0) THEN RAISE(ABORT,'ANSWER_CLOSED') END;
END;
