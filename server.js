const express        = require('express');
const http           = require('http');
const { Server }     = require('socket.io');
const { DatabaseSync } = require('node:sqlite');   // Node.js 22+ 내장
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { Tunnel }     = require('cloudflared');
const os             = require('os');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const JWT_SECRET = process.env.JWT_SECRET || 'yumyum_dev_secret_change_in_prod';
const PORT       = process.env.PORT || 3000;

// ── DB ──────────────────────────────────────────────
const db = new DatabaseSync('yumyum.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    emoji         TEXT    DEFAULT '😊',
    saved_amount  INTEGER DEFAULT 0,
    order_count   INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    addressee_id INTEGER NOT NULL,
    status       TEXT DEFAULT 'pending',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    text        TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Middleware ───────────────────────────────────────
app.use(express.json());
app.use(express.static('.'));
app.get('/', (req, res) => res.sendFile('delivery-app.html', { root: '.' }));

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '로그인이 필요해요' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '토큰이 만료됐어요. 다시 로그인해주세요' });
  }
}

// ── Auth ────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password, emoji = '😊' } = req.body;
  if (!username?.trim() || !password)
    return res.status(400).json({ error: '이름과 비밀번호를 입력해주세요' });
  if (username.trim().length > 12)
    return res.status(400).json({ error: '이름은 12자 이하로 해주세요' });
  if (password.length < 8)
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요' });
  if (!/[a-zA-Z]/.test(password))
    return res.status(400).json({ error: '비밀번호에 영문자를 포함해주세요' });
  if (!/[0-9]/.test(password))
    return res.status(400).json({ error: '비밀번호에 숫자를 포함해주세요' });
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return res.status(400).json({ error: '비밀번호에 특수문자를 포함해주세요' });
  try {
    const hash   = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, emoji) VALUES (?, ?, ?)'
    ).run(username.trim(), hash, emoji);

    const id    = Number(result.lastInsertRowid);
    const token = jwt.sign({ id, username: username.trim() }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      token,
      user: { id, username: username.trim(), emoji, savedAmount: 0, orderCount: 0 }
    });
  } catch (e) {
    if (e.message?.includes('UNIQUE'))
      return res.status(409).json({ error: '이미 사용중인 이름이에요' });
    console.error(e);
    res.status(500).json({ error: '서버 오류가 발생했어요' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: '이름과 비밀번호를 입력해주세요' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: '없는 사용자예요' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: '비밀번호가 틀렸어요' });
  const token = jwt.sign(
    { id: Number(user.id), username: user.username },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({
    token,
    user: {
      id: Number(user.id), username: user.username, emoji: user.emoji,
      savedAmount: Number(user.saved_amount), orderCount: Number(user.order_count)
    }
  });
});

// ── Friends ─────────────────────────────────────────
app.get('/api/friends', requireAuth, (req, res) => {
  const me   = req.user.id;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.emoji, u.saved_amount AS savedAmount
    FROM friendships f
    JOIN users u ON u.id = CASE
      WHEN f.requester_id = ? THEN f.addressee_id
      ELSE f.requester_id
    END
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    ORDER BY u.username
  `).all(me, me, me);
  res.json(rows.map(r => ({ ...r, id: Number(r.id), savedAmount: Number(r.savedAmount) })));
});

app.get('/api/friends/requests', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, u.id AS userId, u.username, u.emoji
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json(rows.map(r => ({ ...r, id: Number(r.id), userId: Number(r.userId) })));
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { username } = req.body;
  const target = db.prepare('SELECT id, username, emoji FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: '없는 사용자예요' });
  const targetId = Number(target.id);
  if (targetId === req.user.id) return res.status(400).json({ error: '자기 자신이에요' });

  const existing = db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(req.user.id, targetId, targetId, req.user.id);

  if (existing) {
    const msg = existing.status === 'accepted' ? '이미 친구예요' : '이미 요청이 존재해요';
    return res.status(409).json({ error: msg });
  }

  db.prepare('INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)').run(req.user.id, targetId);

  const senderEmoji = db.prepare('SELECT emoji FROM users WHERE id = ?').get(req.user.id)?.emoji;
  io.to(`user_${targetId}`).emit('friend_request', {
    userId: req.user.id, username: req.user.username, emoji: senderEmoji,
  });

  res.json({ message: `${target.username}에게 친구 요청을 보냈어요 ✉️` });
});

app.put('/api/friends/request/:id/accept', requireAuth, (req, res) => {
  const f = db.prepare(
    'SELECT * FROM friendships WHERE id = ? AND addressee_id = ?'
  ).get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: '요청을 찾을 수 없어요' });

  db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(f.id);
  io.to(`user_${Number(f.requester_id)}`).emit('friend_accepted', { by: req.user.username });
  res.json({ message: '친구 수락 완료' });
});

app.delete('/api/friends/request/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM friendships WHERE id = ? AND addressee_id = ?').run(req.params.id, req.user.id);
  res.json({ message: '거절했어요' });
});

// ── Messages ────────────────────────────────────────
app.get('/api/messages/:friendId', requireAuth, (req, res) => {
  const me    = req.user.id;
  const other = parseInt(req.params.friendId);
  const msgs  = db.prepare(`
    SELECT m.id, m.sender_id, m.receiver_id, m.text, m.created_at,
           u.username AS senderName, u.emoji AS senderEmoji
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC
    LIMIT 200
  `).all(me, other, other, me);
  res.json(msgs.map(m => ({
    ...m,
    id: Number(m.id),
    sender_id: Number(m.sender_id),
    receiver_id: Number(m.receiver_id)
  })));
});

// ── Orders ──────────────────────────────────────────
app.post('/api/orders', requireAuth, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: '금액 오류' });
  db.prepare(`
    UPDATE users SET saved_amount = saved_amount + ?, order_count = order_count + 1 WHERE id = ?
  `).run(amount, req.user.id);
  const user = db.prepare('SELECT saved_amount, order_count FROM users WHERE id = ?').get(req.user.id);
  res.json({ savedAmount: Number(user.saved_amount), orderCount: Number(user.order_count) });
});

// ── Socket.IO ────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('인증 실패'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('인증 실패'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user_${socket.user.id}`);

  socket.on('send_message', ({ toUserId, text }) => {
    if (!text?.trim() || !toUserId) return;
    const result = db.prepare(
      'INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)'
    ).run(socket.user.id, toUserId, text.trim());

    const senderEmoji = db.prepare('SELECT emoji FROM users WHERE id = ?').get(socket.user.id)?.emoji;
    const msg = {
      id:          Number(result.lastInsertRowid),
      sender_id:   socket.user.id,
      receiver_id: toUserId,
      text:        text.trim(),
      senderName:  socket.user.username,
      senderEmoji: senderEmoji,
      created_at:  new Date().toISOString(),
    };
    socket.emit('message', msg);
    io.to(`user_${toUserId}`).emit('message', msg);
  });
});

// ── Start ────────────────────────────────────────────
function getLanIP() {
  return Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal)?.address;
}

server.listen(PORT, async () => {
  const lanIP = getLanIP();
  console.log('\n🛵  YUMYUM 서버 실행 중\n');
  console.log(`  📱 내 컴퓨터:     http://localhost:${PORT}`);
  if (lanIP) {
    console.log(`  🏠 같은 와이파이: http://${lanIP}:${PORT}`);
  }
  console.log('\n  🌐 인터넷 공개 URL 생성 중...');

  try {
    const t = Tunnel.quick(`http://localhost:${PORT}`);
    t.once('url', (url) => {
      console.log(`  🔗 친구에게 공유: ${url}`);
      console.log('\n  (위 URL을 친구에게 보내면 어디서든 접속 가능해요)\n');
    });
    t.once('error', () => {
      console.log('  ⚠️  인터넷 터널 생성 실패 (같은 와이파이에서는 위 LAN 주소로 접속하세요)\n');
    });
    process.on('SIGINT', () => { t.stop(); process.exit(0); });
  } catch {
    console.log('  ⚠️  인터넷 터널 생성 실패 (같은 와이파이에서는 위 LAN 주소로 접속하세요)\n');
  }
});
