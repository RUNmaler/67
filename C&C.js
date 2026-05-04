const fs = require('fs');
const http = require('http');
const path = require('path');

const DB_FILE = path.join(__dirname, 'users.json');

function now() {
  return new Date().toISOString();
}

function defaultUsername() {
  return 'username_' + new Date().toUTCString().replace(/:/g, '_').replace(/\s+/g, '_');
}

function makeId(prefix, n) {
  return `${prefix}_${String(n).padStart(6, '0')}`;
}

function defaultDB() {
  const t = now();
  return {
    app: {
      name: "C&C User System",
      version: "1.1.0",
      environment: "development",
      createdAt: t,
      updatedAt: t,
      description: "User auth + chat storage"
    },
    settings: {
      defaultRememberMe: false,
      allowRename: true,
      allowForget: true,
      storePasswordsAsPlainText: true,
      maxLoginAttempts: 5,
      lockMinutes: 15,
      sessionTimeoutMinutes: 30,
      rememberMeDays: 30
    },
    stats: {
      totalUsers: 0,
      totalLogins: 0,
      failedLogins: 0,
      totalRenames: 0,
      totalForgets: 0,
      totalMessages: 0,
      lastUserCreated: null,
      lastUserLogin: null,
      lastUserRename: null,
      lastMessageAt: null,
      lastUpdatedAt: t
    },
    users: [],
    chat_permanente: [],
    sessions: [],
    audit: [],
    events: [{ id: "e_000001", time: t, type: "system", message: "System started" }],
    templates: {
      defaultUser: {
        id: "",
        username: "",
        password: "",
        createdAt: "",
        updatedAt: "",
        lastLoginAt: null,
        loginCount: 0,
        remembered: false,
        active: true,
        roles: ["user"],
        profile: { displayName: "", language: "pt-BR", theme: "dark" },
        history: { logins: [], renames: [], forgets: [] },
        meta: { source: "manual", notes: "" }
      },
      defaultMessage: {
        id: "",
        username: "",
        texto: "",
        time: ""
      }
    }
  };
}

function ensureDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB(), null, 2), 'utf8');
}

function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(databank) {
  databank.app.updatedAt = now();
  databank.stats.lastUpdatedAt = databank.app.updatedAt;
  fs.writeFileSync(DB_FILE, JSON.stringify(databank, null, 2), 'utf8');
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function collectBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'POST' || req.url !== '/C&C.js') return send(res, 404, { ok: false, message: 'Not found' });

  try {
    const data = JSON.parse(await collectBody(req) || '{}');
    const databank = readDB();

    if (data.action === 'getUsername') {
      const username = (data.username || '').trim();
      const user = databank.users.find(u => u.username === username);
      if (!user) return send(res, 404, { ok: false, message: 'Usuário não encontrado.' });
      return send(res, 200, { ok: true, username: user.username });
    }

    if (data.action === 'create') {
      const username = (data.username || '').trim() || defaultUsername();
      if (databank.users.some(u => u.username === username)) return send(res, 409, { ok: false, message: 'Username já existe.' });

      const nowIso = now();
      const user = {
        ...databank.templates.defaultUser,
        id: makeId('u', databank.users.length + 1),
        username,
        password: data.password || '',
        createdAt: nowIso,
        updatedAt: nowIso,
        remembered: !!data.rememberMe
      };

      databank.users.push(user);
      databank.stats.totalUsers = databank.users.length;
      databank.stats.lastUserCreated = username;
      databank.audit.push({ id: makeId('a', databank.audit.length + 1), time: nowIso, action: 'create', username, success: true });
      writeDB(databank);

      return send(res, 200, { ok: true, userAuth: { username: user.username, remembered: !!data.rememberMe } });
    }

    if (data.action === 'login') {
      const username = (data.username || '').trim();
      const nowIso = now();
      const user = databank.users.find(u => u.username === username && u.password === (data.password || ''));
      if (!user) {
        databank.stats.failedLogins += 1;
        writeDB(databank);
        return send(res, 401, { ok: false, message: 'Credenciais inválidas.' });
      }

      user.lastLoginAt = nowIso;
      user.loginCount = (user.loginCount || 0) + 1;
      user.remembered = !!data.rememberMe;
      user.updatedAt = nowIso;
      user.history.logins.push({ time: nowIso, remembered: !!data.rememberMe });

      databank.stats.totalLogins += 1;
      databank.stats.lastUserLogin = username;
      databank.audit.push({ id: makeId('a', databank.audit.length + 1), time: nowIso, action: 'login', username, success: true });
      writeDB(databank);

      return send(res, 200, { ok: true, userAuth: { username: user.username, remembered: !!data.rememberMe } });
    }

    if (data.action === 'rename') {
      const oldUsername = (data.oldUsername || '').trim();
      const newUsername = (data.newUsername || '').trim();
      if (!newUsername) return send(res, 400, { ok: false, message: 'Novo username vazio.' });
      if (databank.users.some(u => u.username === newUsername)) return send(res, 409, { ok: false, message: 'Esse username já existe.' });

      const user = databank.users.find(u => u.username === oldUsername);
      if (!user) return send(res, 404, { ok: false, message: 'Usuário não encontrado.' });

      const nowIso = now();
      user.history.renames.push({ time: nowIso, from: oldUsername, to: newUsername });
      user.username = newUsername;
      user.updatedAt = nowIso;

      databank.stats.totalRenames += 1;
      databank.stats.lastUserRename = newUsername;
      databank.audit.push({ id: makeId('a', databank.audit.length + 1), time: nowIso, action: 'rename', username: newUsername, success: true });
      writeDB(databank);

      return send(res, 200, { ok: true, user });
    }

    if (data.action === 'forget') {
      const username = (data.username || '').trim();
      const user = databank.users.find(u => u.username === username);
      if (user) {
        const nowIso = now();
        user.remembered = false;
        user.updatedAt = nowIso;
        user.history.forgets.push({ time: nowIso });
        databank.stats.totalForgets += 1;
        databank.audit.push({ id: makeId('a', databank.audit.length + 1), time: nowIso, action: 'forget', username, success: true });
        writeDB(databank);
      }
      return send(res, 200, { ok: true });
    }

    if (data.action === 'chatAdd') {
      const username = (data.username || '').trim();
      const texto = (data.texto || '').trim();
      if (!texto) return send(res, 400, { ok: false, message: 'Mensagem vazia.' });

      const nowIso = now();
      const msg = { id: Date.now(), username, texto, time: nowIso };
      databank.chat_permanente.push(msg);
      databank.stats.totalMessages += 1;
      databank.stats.lastMessageAt = nowIso;
      databank.audit.push({ id: makeId('a', databank.audit.length + 1), time: nowIso, action: 'chatAdd', username, success: true });
      writeDB(databank);

      return send(res, 200, { ok: true, message: msg });
    }

    if (data.action === 'chatDeleteOwn') {
      const id = Number(data.id);
      const username = (data.username || '').trim();
      const msg = databank.chat_permanente.find(m => m.id === id);
      if (!msg) return send(res, 404, { ok: false, message: 'Mensagem não encontrada.' });
      if (msg.username !== username) return send(res, 403, { ok: false, message: 'Você só pode apagar sua própria mensagem.' });

      databank.chat_permanente = databank.chat_permanente.filter(m => m.id !== id);
      writeDB(databank);
      return send(res, 200, { ok: true });
    }

    if (data.action === 'chatList') {
      return send(res, 200, { ok: true, messages: databank.chat_permanente });
    }

    return send(res, 400, { ok: false, message: 'Ação inválida.' });
  } catch {
    return send(res, 400, { ok: false, message: 'JSON inválido.' });
  }
});

server.listen(3000);
