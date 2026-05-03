const API = '/C&C.js';
const AUTH_KEY = 'auth_user';

function defaultUsername() {
  return 'username_' + new Date().toUTCString().replace(/:/g, '_').replace(/\s+/g, '_');
}

function getAuth() {
  return JSON.parse(localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY) || 'null');
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

function setAuth(user, rememberMe) {
  clearAuth();
  (rememberMe ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(user));
}

async function api(action, data = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data })
  });
  return await r.json();
}

async function createUser(usernameInput, password, rememberMe = false) {
  const username = (usernameInput || '').trim() || defaultUsername();
  const res = await api('create', { username, password, rememberMe });
  if (res.ok) setAuth(res.userAuth, rememberMe);
  return res;
}

async function loginUser(usernameInput, password, rememberMe = false) {
  const username = (usernameInput || '').trim();
  const res = await api('login', { username, password, rememberMe });
  if (res.ok) setAuth(res.userAuth, rememberMe);
  return res;
}

async function renameUser(newUsernameInput) {
  const auth = getAuth();
  if (!auth) return { ok: false, message: 'Nenhum usuário autenticado.' };

  const newUsername = (newUsernameInput || '').trim();
  const res = await api('rename', { oldUsername: auth.username, newUsername });
  if (!res.ok) return res;

  const updatedAuth = { ...auth, username: res.user.username };
  if (localStorage.getItem(AUTH_KEY)) localStorage.setItem(AUTH_KEY, JSON.stringify(updatedAuth));
  if (sessionStorage.getItem(AUTH_KEY)) sessionStorage.setItem(AUTH_KEY, JSON.stringify(updatedAuth));
  return res;
}

async function forgetMe() {
  const auth = getAuth();
  if (!auth) return { ok: false, message: 'Nenhum usuário salvo.' };

  const res = await api('forget', { username: auth.username });
  clearAuth();
  return res;
}

async function getCurrentUser() {
  const auth = getAuth();
  if (!auth) return null;
  const res = await api('get', { username: auth.username });
  return res.ok ? res.user : null;
}
