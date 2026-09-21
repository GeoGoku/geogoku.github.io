PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY, course TEXT NOT NULL, className TEXT NOT NULL, lecture INTEGER NOT NULL, created INTEGER NOT NULL, ended INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_active_class ON sessions(course,className) WHERE ended IS NULL;
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY, sessionId INTEGER NOT NULL REFERENCES sessions(id), lecture INTEGER NOT NULL, number INTEGER NOT NULL, options TEXT NOT NULL, opened INTEGER NOT NULL, deadline INTEGER NOT NULL, closed INTEGER, answerKey TEXT, revealed INTEGER NOT NULL DEFAULT 0, UNIQUE(sessionId,lecture,number));
CREATE TABLE IF NOT EXISTS participants(id INTEGER PRIMARY KEY, sessionId INTEGER NOT NULL REFERENCES sessions(id), studentId TEXT NOT NULL, name TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, joined INTEGER NOT NULL, UNIQUE(sessionId,studentId));
CREATE TABLE IF NOT EXISTS answers(questionId INTEGER NOT NULL REFERENCES questions(id), participantId INTEGER NOT NULL REFERENCES participants(id), choice TEXT NOT NULL, submitted INTEGER NOT NULL, PRIMARY KEY(questionId,participantId));
CREATE INDEX IF NOT EXISTS idx_answers_participant ON answers(participantId);
CREATE TRIGGER IF NOT EXISTS check_question BEFORE INSERT ON questions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.sessionId AND ended IS NULL AND lecture=NEW.lecture) THEN RAISE(ABORT,'SESSION_CHANGED') END;
 UPDATE questions SET closed=NEW.opened WHERE sessionId=NEW.sessionId AND closed IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS close_on_session_change AFTER UPDATE OF lecture,ended ON sessions BEGIN
 UPDATE questions SET closed=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE sessionId=NEW.id AND closed IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS check_participant BEFORE INSERT ON participants BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.sessionId AND ended IS NULL) THEN RAISE(ABORT,'SESSION_ENDED') END;
END;
CREATE TRIGGER IF NOT EXISTS check_answer BEFORE INSERT ON answers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM questions q JOIN sessions s ON s.id=q.sessionId JOIN participants p ON p.sessionId=s.id WHERE q.id=NEW.questionId AND p.id=NEW.participantId AND s.ended IS NULL AND q.closed IS NULL AND length(NEW.choice)=1 AND instr(q.options,NEW.choice)>0) THEN RAISE(ABORT,'ANSWER_CLOSED') END;
END;
