import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { baseAPI, ApiError } from './base.api';
import { loginApi } from './login.api';
import { holdingsApi } from './holdings.api';
import { clearSession, getToken, saveToken, TOKEN_KEY } from '../session';
import { useAPAXStore } from '../store';

const storage = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
  storage.clear();
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    dispatchEvent: events.dispatchEvent.bind(events),
  } });
  useAPAXStore.getState().clearSession();
});
afterEach(() => {
  mock.restoreAll();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

test('login uses the full user path, excludes previous Bearer token, and preserves typed response', async () => {
  saveToken('old-token');
  const result = { success: true, token: 'new-token', user: { _id: 'id', name: 'User', email: 'user@example.test', role: 'user' } };
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.ok(url.endsWith('/user/login'));
    assert.equal(options.method, 'POST');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    assert.deepEqual(JSON.parse(String(options.body)), { email: 'user@example.test', password: 'password' });
    return Response.json(result);
  });
  assert.deepEqual(await loginApi({ email: 'user@example.test', password: 'password' }), result);
});

test('holdings use exact API path and real stored Bearer token', async () => {
  saveToken('test-token');
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.ok(url.endsWith('/api/holdings'));
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-token');
    return Response.json({ success: true, holdings: { gold: 1, silver: 2, platinum: 3 } });
  });
  assert.deepEqual((await holdingsApi()).holdings, { gold: 1, silver: 2, platinum: 3 });
});

test('zero holdings are valid; malformed amounts never become portfolio data', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ success: true, holdings: { gold: 0, silver: 0, platinum: 0 } }));
  assert.deepEqual((await holdingsApi()).holdings, { gold: 0, silver: 0, platinum: 0 });
  fetchMock.mock.mockImplementation(async () => Response.json({ success: true, holdings: { gold: -1, silver: '2', platinum: 0 } }));
  await assert.rejects(holdingsApi(), ApiError);
});

test('401 clears token, safe user, holdings, and derived personal state even with a non-JSON body', async () => {
  saveToken('expired');
  useAPAXStore.getState().setSessionUser({ _id: 'id', name: 'User', email: 'a@example.test', role: 'user' });
  useAPAXStore.getState().setUserHoldings({ goldGrams: 10, silverGrams: 20, platinumGrams: 30, apxiTokens: 0 });
  useAPAXStore.getState().calculateZakat();
  mock.method(globalThis, 'fetch', async () => new Response('<html>unauthorized</html>', { status: 401 }));
  await assert.rejects(holdingsApi(), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(getToken(), null);
  assert.equal(useAPAXStore.getState().sessionUser, null);
  assert.equal(useAPAXStore.getState().zakatCalculation, null);
  assert.equal(useAPAXStore.getState().userHoldings.goldGrams, 0);
});

test('a delayed old-session 401 cannot erase a newer login', async () => {
  saveToken('old');
  mock.method(globalThis, 'fetch', async () => {
    saveToken('new');
    return Response.json({ success: false }, { status: 401 });
  });
  await assert.rejects(holdingsApi(), ApiError);
  assert.equal(getToken(), 'new');
});

test('server internals are hidden while public login errors remain useful', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ success: false, message: 'mongodb://secret-stack' }, { status: 500 }));
  await assert.rejects(holdingsApi(), (error: unknown) => error instanceof ApiError && !error.message.includes('mongodb'));
  fetchMock.mock.mockImplementation(async () => Response.json({ success: false, message: 'Invalid Email or Password' }, { status: 401 }));
  await assert.rejects(loginApi({ email: 'a', password: 'b' }), /Invalid Email or Password/);
});

test('network errors are actionable and tokenless requests do not fabricate Authorization', async () => {
  mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    throw new Error('internal network detail');
  });
  await assert.rejects(baseAPI('/api/holdings', 'GET'), /Unable to connect to the server/);
});

test('logout removes only the auth key and resets personal state without removing demo reserves', () => {
  storage.set('unrelated', 'keep');
  saveToken('token');
  assert.deepEqual([...storage.keys()].sort(), [TOKEN_KEY, 'unrelated']);
  useAPAXStore.getState().setUserHoldings({ goldGrams: 20, silverGrams: 3, platinumGrams: 4, apxiTokens: 0 });
  const vault = useAPAXStore.getState().vaultData;
  clearSession();
  assert.equal(getToken(), null);
  assert.equal(storage.get('unrelated'), 'keep');
  assert.deepEqual(useAPAXStore.getState().userHoldings, { goldGrams: 0, silverGrams: 0, platinumGrams: 0, apxiTokens: 0 });
  assert.equal(useAPAXStore.getState().vaultData, vault);
});
