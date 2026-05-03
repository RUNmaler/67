const fs = require('fs');
const http = require('http');
const path = require('path');

const DB_FILE = path.join(__dirname, 'users.json');

function ensureDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');
}

function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function defaultUsername() {
  return 'username_' + new Date().toUTCString().replace(/:/g, '_').replace(/\s+/g, '_');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.end();

  if (req.method !== 'POST' || req.url !== '/C&C.js') {
    return send(res, 404, { ok: false, message: 'Not found' });
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const db = readDB();

      if (data.action === 'create') {
        const username = (data.username || '').trim() || defaultUsername();
        if (db.some(u => u.username === username)) {
          return send(res, 409, { ok: false, message: 'Username já existe.' });
        }

        const user = {
          username,
          password: data.password || '',
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
          loginCount: 0,
          remembered: !!data.rememberMe
        };

        db.push(user);
        writeDB(db);

        return send(res, 200, {
          ok: true,
          user,
          userAuth: {
            username: user.username,
            createdAt: user.createdAt,
            lastLoginAt: null,
            loginCount: 0,
            remembered: !!data.rememberMe
          }
        });
      }

      if (data.action === 'login') {
        const username = (data.username || '').trim();
        const user = db.find(u => u.username === username && u.password === (data.password || ''));
        if (!user) return send(res, 401, { ok: false, message: 'Credenciais inválidas.' });

        user.lastLoginAt = new Date().toISOString();
        user.loginCount = (user.loginCount || 0) + 1;
        user.remembered = !!data.rememberMe;
        writeDB(db);

        return send(res, 200, {
          ok: true,
          user,
          userAuth: {
            username: user.username,
            lastLoginAt: user.lastLoginAt,
            loginCount: user.loginCount,
            remembered: !!data.rememberMe
          }
        });
      }

      if (data.action === 'rename') {
        const oldUsername = (data.oldUsername || '').trim();
        const newUsername = (data.newUsername || '').trim();
        if (!newUsername) return send(res, 400, { ok: false, message: 'Novo username vazio.' });
        if (db.some(u => u.username === newUsername)) return send(res, 409, { ok: false, message: 'Esse username já existe.' });

        const user = db.find(u => u.username === oldUsername);
        if (!user) return send(res, 404, { ok: false, message: 'Usuário não encontrado.' });

        user.username = newUsername;
        writeDB(db);
        return send(res, 200, { ok: true, user });
      }

      if (data.action === 'forget') {
        const user = db.find(u => u.username === (data.username || '').trim());
        if (user) {
          user.remembered = false;
          user.lastLoginAt = null;
          writeDB(db);
        }
        return send(res, 200, { ok: true });
      }

      if (data.action === 'get') {
        const user = db.find(u => u.username === (data.username || '').trim());
        if (!user) return send(res, 404, { ok: false, message: 'Usuário não encontrado.' });
        return send(res, 200, { ok: true, user });
      }

      return send(res, 400, { ok: false, message: 'Ação inválida.' });
    } catch {
      return send(res, 400, { ok: false, message: 'JSON inválido.' });
    }
  });
});

server.listen(3000);
