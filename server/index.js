import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8787);
const directory = dirname(fileURLToPath(import.meta.url));
const storePath = resolve(directory, 'store.json');

async function readStore() {
  const store = JSON.parse(await readFile(storePath, 'utf8'));
  if (!Array.isArray(store.users)) {
    store.users = [{
      id: 'user-alex',
      email: 'alex@example.com',
      passwordHash: hashPassword('closetiq'),
      profile: store.profile,
      wardrobeIds: store.wardrobeIds,
      savedIds: store.savedIds,
      feedback: store.feedback
    }];
  }
  if (!store.sessions || typeof store.sessions !== 'object') store.sessions = {};
  return store;
}

async function writeStore(store) {
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function findProduct(store, productId) {
  return store.products.find((product) => product.id === Number(productId));
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derivedKey = scryptSync(password, salt, 64);
  return timingSafeEqual(derivedKey, Buffer.from(key, 'hex'));
}

function publicUser(user) {
  return { id: user.id, email: user.email, profile: user.profile };
}

function createSession(store, user) {
  const token = randomBytes(32).toString('hex');
  store.sessions[token] = { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  return token;
}

function getAuthenticatedUser(request, store) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token ? store.sessions[token] : null;
  if (!session || session.expiresAt < Date.now()) return null;
  return store.users.find((user) => user.id === session.userId) || null;
}

function getUserState(store, user) {
  return {
    profile: user.profile,
    wardrobeIds: user.wardrobeIds || store.wardrobeIds,
    savedIds: user.savedIds || [],
    feedback: user.feedback || []
  };
}

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const store = await readStore();

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok', service: 'closetiq-api' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    const { name, email, password } = await readBody(request);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!name?.trim() || !normalizedEmail || !password || password.length < 6) return sendJson(response, 400, { error: 'Name, email, and a password of at least 6 characters are required' });
    if (store.users.some((user) => user.email === normalizedEmail)) return sendJson(response, 409, { error: 'An account with that email already exists' });
    const initials = name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const user = {
      id: `user-${randomBytes(8).toString('hex')}`,
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      profile: { ...store.profile, name: name.trim(), initials },
      wardrobeIds: [],
      savedIds: [],
      feedback: []
    };
    store.users.push(user);
    const token = createSession(store, user);
    await writeStore(store);
    sendJson(response, 201, { token, user: publicUser(user) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const { email, password } = await readBody(request);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = store.users.find((candidate) => candidate.email === normalizedEmail);
    if (!user || !verifyPassword(String(password || ''), user.passwordHash)) return sendJson(response, 401, { error: 'Email or password is incorrect' });
    const token = createSession(store, user);
    await writeStore(store);
    sendJson(response, 200, { token, user: publicUser(user) });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getAuthenticatedUser(request, store);
    if (!user) return sendJson(response, 401, { error: 'Session expired' });
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) delete store.sessions[token];
    await writeStore(store);
    sendJson(response, 200, { signedOut: true });
    return;
  }

  const user = getAuthenticatedUser(request, store);
  if (url.pathname.startsWith('/api/') && !user && !['/api/health', '/api/auth/login', '/api/auth/register'].includes(url.pathname)) {
    sendJson(response, 401, { error: 'Authentication required' });
    return;
  }

  if (request.method === 'PATCH' && url.pathname === '/api/profile') {
    const { name, styleSignal } = await readBody(request);
    if (!name?.trim()) return sendJson(response, 400, { error: 'Name is required' });
    user.profile = { ...user.profile, name: name.trim(), initials: name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), styleSignal: styleSignal?.trim() || user.profile.styleSignal };
    await writeStore(store);
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const category = url.searchParams.get('category') || 'All pieces';
    const state = getUserState(store, user);
    const dismissedIds = new Set(state.feedback.filter((item) => item.action === 'dismiss').map((item) => item.productId));
    const products = store.products.filter((product) => {
      const matchesCategory = category === 'All pieces' || product.category === category;
      const searchable = `${product.name} ${product.category} ${product.style} ${product.color}`.toLowerCase();
      return !dismissedIds.has(product.id) && matchesCategory && searchable.includes(query);
    });
    const wardrobe = state.wardrobeIds.map((id) => findProduct(store, id)).filter(Boolean);
    sendJson(response, 200, { profile: state.profile, email: user.email, products, wardrobe, savedIds: state.savedIds });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/products') {
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const category = url.searchParams.get('category') || 'All pieces';
    const state = getUserState(store, user);
    const dismissedIds = new Set(state.feedback.filter((item) => item.action === 'dismiss').map((item) => item.productId));
    const products = store.products.filter((product) => {
      const matchesCategory = category === 'All pieces' || product.category === category;
      return !dismissedIds.has(product.id) && matchesCategory && `${product.name} ${product.category} ${product.style} ${product.color}`.toLowerCase().includes(query);
    });
    sendJson(response, 200, { products });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/saved') {
    const { productId } = await readBody(request);
    const product = findProduct(store, productId);
    if (!product) return sendJson(response, 404, { error: 'Product not found' });
    const id = product.id;
    user.savedIds = user.savedIds.includes(id) ? user.savedIds.filter((savedId) => savedId !== id) : [...user.savedIds, id];
    await writeStore(store);
    sendJson(response, 200, { saved: user.savedIds.includes(id), savedIds: user.savedIds });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/feedback') {
    const { productId, action } = await readBody(request);
    const product = findProduct(store, productId);
    if (!product || !['like', 'dismiss'].includes(action)) return sendJson(response, 400, { error: 'Invalid feedback' });
    user.feedback.push({ productId: product.id, action, createdAt: new Date().toISOString() });
    await writeStore(store);
    sendJson(response, 201, { accepted: true });
    return;
  }

  sendJson(response, 404, { error: 'Route not found' });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  });
});

server.listen(port, () => console.log(`ClosetIQ API listening on http://127.0.0.1:${port}`));
