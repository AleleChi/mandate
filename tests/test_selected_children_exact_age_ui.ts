import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NotificationProvider } from '../src/context/NotificationContext';
import { SelectedChildrenReportView } from '../src/components/admin/reports/SelectedChildrenReportView';
import { AdminReportsView } from '../src/views/admin/AdminReportsView';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MOCK_CHILDREN = [
  {
    childId: 'child-age-2-mock',
    eventEntryId: 'entry-age-2-mock',
    fullName: 'Adaeze Two',
    photoUrl: null,
    dateOfBirth: '2024-03-15',
    age: 2,
    ageGroup: '2–3',
    gender: 'Female',
    parent: { id: 'p-1', fullName: 'Parent One', phone: '+2348000000001', email: 'p1@example.com' },
    passStatus: 'pass_ready',
    attendanceStatus: 'checked_in',
    passReference: 'PASS-002'
  },
  {
    childId: 'child-age-3-mock',
    eventEntryId: 'entry-age-3-mock',
    fullName: 'Chidi Three',
    photoUrl: null,
    dateOfBirth: '2023-05-20',
    age: 3,
    ageGroup: '2–3',
    gender: 'Male',
    parent: { id: 'p-2', fullName: 'Parent Two', phone: '+2348000000002', email: 'p2@example.com' },
    passStatus: 'pass_ready',
    attendanceStatus: 'inside',
    passReference: 'PASS-003'
  },
  {
    childId: 'child-age-13-mock',
    eventEntryId: 'entry-age-13-mock',
    fullName: 'Abigail Thirteen',
    photoUrl: null,
    dateOfBirth: '2013-02-10',
    age: 13,
    ageGroup: '13–14',
    gender: 'Female',
    parent: { id: 'p-3', fullName: 'Parent Three', phone: '+2348000000003', email: 'p3@example.com' },
    passStatus: 'pass_ready',
    attendanceStatus: 'checked_in',
    passReference: 'PASS-013'
  },
  {
    childId: 'child-age-4-mock',
    eventEntryId: 'entry-age-4-mock',
    fullName: 'Blessing Four',
    photoUrl: null,
    dateOfBirth: '2022-04-10',
    age: 4,
    ageGroup: '4–6',
    gender: 'Female',
    parent: { id: 'p-4', fullName: 'Parent Four', phone: '+2348000000004', email: 'p4@example.com' },
    passStatus: 'pass_ready',
    attendanceStatus: 'inside',
    passReference: 'PASS-004'
  }
];

const MOCK_AGE_BREAKDOWN = [
  {
    ageGroup: '2–3',
    selected: 53,
    passReady: 53,
    missingPass: 0,
    ages: [
      { age: 2, selected: 21, passReady: 21, missingPass: 0 },
      { age: 3, selected: 32, passReady: 32, missingPass: 0 }
    ]
  },
  {
    ageGroup: '4–6',
    selected: 316,
    passReady: 316,
    missingPass: 0,
    ages: [
      { age: 4, selected: 100, passReady: 100, missingPass: 0 },
      { age: 5, selected: 106, passReady: 106, missingPass: 0 },
      { age: 6, selected: 110, passReady: 110, missingPass: 0 }
    ]
  }
];

function findChromeExecutable(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function runSsrTests() {
  // 1. SelectedChildrenReportView SSR renders exact-age controls and menu sections
  const reportHtml = renderToString(
    React.createElement(
      NotificationProvider,
      null,
      React.createElement(SelectedChildrenReportView, { eventId: 'event-ga-2026' })
    )
  );
  assert.ok(reportHtml.includes('aria-label="Filter by exact age"'), 'Expected exact age select in SSR');
  assert.ok(reportHtml.includes('aria-label="Filter by age range"'), 'Expected age range select in SSR');
  assert.ok(reportHtml.includes('aria-label="Sort selected children"'), 'Expected sort select in SSR');
  assert.ok(reportHtml.includes('Child name A–Z'), 'Expected Child name A–Z sort option in SSR');
  assert.ok(reportHtml.includes('All ages'), 'Expected All ages option in SSR');
  assert.ok(reportHtml.includes('Ages 2–3'), 'Expected Ages 2–3 group option in SSR');
  assert.ok(reportHtml.includes('Download report'), 'Expected Download report button in SSR');

  // 2. AdminReportsView honors window.location.search when currentRoute strips query string
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    location: {
      pathname: '/admin/reports',
      search: '?view=selected-children',
      hash: ''
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  try {
    const reportsHtml = renderToString(
      React.createElement(
        NotificationProvider,
        null,
        React.createElement(AdminReportsView, {
          onBackToOverview: () => {},
          currentRoute: '/admin/reports'
        })
      )
    );
    assert.ok(
      reportsHtml.includes('id="selected-children-operational-report"'),
      'Expected ?view=selected-children query param to open Selected Children tab directly'
    );
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = prevWindow;
    }
  }
  console.log('  [PASS] SSR assertions: exact-age controls + deep-link query activation');
}

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private listeners = new Map<string, Array<(params: any) => void>>();

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', (err) => reject(err), { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (typeof msg.id === 'number') {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) {
            entry.reject(new Error(`${msg.error.message} (${msg.error.code})`));
          } else {
            entry.resolve(msg.result);
          }
        }
      } else if (msg.method) {
        const cbs = this.listeners.get(msg.method) || [];
        for (const cb of cbs) cb(msg.params);
      }
    });
  }

  on(method: string, handler: (params: any) => void) {
    const existing = this.listeners.get(method) || [];
    existing.push(handler);
    this.listeners.set(method, existing);
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function waitFor<T>(fn: () => Promise<T | null | false>, timeoutMs = 15000, description = 'condition'): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = await fn();
    if (val) return val;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

async function runBrowserE2E(chromePath: string) {
  const legacySwSource = `
const CACHE_NAME = 'koinonia-app-shell-v5';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add('/')));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
`;
  const upgradedSwSource = fs.readFileSync(path.join(DIST_DIR, 'sw.js'), 'utf8');
  let activeSwSource = legacySwSource;

  const recordedReportUrls: string[] = [];
  const recordedPdfUrls: string[] = [];

  const handleMockApiResponse = (fullUrl: string, method: string): { status: number; headers: Record<string, string>; body: Buffer } => {
    const urlObj = new URL(fullUrl);
    if (method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type'
        },
        body: Buffer.alloc(0)
      };
    }
    if (urlObj.pathname === '/api/me/access' || urlObj.pathname === '/api/auth/access' || urlObj.pathname === '/api/auth/me') {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: Buffer.from(JSON.stringify({
          success: true,
          user: { id: 'admin-e2e', role: 'admin', email: 'e2e@example.com', fullName: 'E2E Admin' },
          access: { admin: { exists: true }, parent: { exists: false }, volunteer: { exists: false } }
        }))
      };
    }
    if (urlObj.pathname.startsWith('/api/admin/reports/selected-children/export-pdf')) {
      recordedPdfUrls.push(fullUrl);
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="mock-age-report.pdf"',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Disposition'
        },
        body: Buffer.from('%PDF-1.4\n%Mock\n')
      };
    }
    if (urlObj.pathname.startsWith('/api/admin/reports/selected-children')) {
      recordedReportUrls.push(fullUrl);
      const ageGroup = urlObj.searchParams.get('ageGroup') || 'all';
      const exactAge = urlObj.searchParams.get('exactAge') || 'all';
      const minAge = urlObj.searchParams.get('minAge');
      const maxAge = urlObj.searchParams.get('maxAge');
      const sort = urlObj.searchParams.get('sort') || 'name_asc';
      let filtered = MOCK_CHILDREN.filter((c) => {
        if (ageGroup !== 'all' && c.ageGroup !== ageGroup) return false;
        if (exactAge !== 'all' && String(c.age) !== exactAge) return false;
        if (minAge && maxAge && (c.age < Number(minAge) || c.age > Number(maxAge))) return false;
        return true;
      });
      filtered = [...filtered].sort((a, b) => {
        if (sort === 'name_desc') return b.fullName.localeCompare(a.fullName, 'en', { sensitivity: 'base' });
        if (sort === 'age_asc') return a.age - b.age || a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' });
        if (sort === 'age_desc') return b.age - a.age || a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' });
        return a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' });
      });
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: Buffer.from(JSON.stringify({
          success: true,
          event: { id: 'event-ga-2026', title: 'The General Assembly' },
          summary: { totalSelected: 369, passReady: 369, missingPass: 0, checkedIn: 20, inside: 10, pickedUp: 0 },
          ageGroups: MOCK_AGE_BREAKDOWN.map(({ ageGroup: ag, selected, passReady, missingPass }) => ({
            ageGroup: ag,
            selected,
            passReady,
            missingPass
          })),
          ageBreakdown: MOCK_AGE_BREAKDOWN,
          children: filtered,
          pagination: { totalRecords: filtered.length, totalPages: 1 }
        }))
      };
    }
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: Buffer.from(JSON.stringify({
        success: true,
        events: [{ id: 'event-ga-2026', title: 'The General Assembly', isActive: true }],
        reports: [],
        templates: [],
        notifications: [],
        unreadCount: 0,
        metrics: {}
      }))
    };
  };

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const reqPath = rawUrl.split('?')[0];
    if (reqPath.startsWith('/api/')) {
      const mock = handleMockApiResponse(`http://127.0.0.1${rawUrl}`, req.method || 'GET');
      res.writeHead(mock.status, mock.headers);
      res.end(mock.body);
      return;
    }
    if (reqPath === '/sw.js' || reqPath === '/service-worker.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=0, no-cache, no-store, must-revalidate'
      });
      res.end(activeSwSource);
      return;
    }

    const candidate = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, ''));
    const safeFile = candidate.startsWith(DIST_DIR) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(DIST_DIR, 'index.html');

    const headers: Record<string, string> = {
      'Content-Type': getContentType(safeFile),
      'Cache-Control': safeFile.endsWith('index.html')
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=31536000, immutable'
    };
    res.writeHead(200, headers);
    fs.createReadStream(safeFile).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koinonia-chrome-e2e-'));
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdp: CdpClient | null = null;
  try {
    const wsDebugEndpoint = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome DevTools port did not start')), 15000);
      let stderrBuf = '';
      chromeProc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      chromeProc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited early with code ${code}: ${stderrBuf}`));
      });
    });

    const devToolsOrigin = wsDebugEndpoint.replace(/^ws:/, 'http:').replace(/\/devtools\/.*$/, '');
    const targetsRes = await fetch(`${devToolsOrigin}/json/list`);
    const targets = await targetsRes.json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    assert.ok(pageTarget?.webSocketDebuggerUrl, 'Expected page DevTools WebSocket URL');

    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*://*/api/*', requestStage: 'Request' }]
    });

    cdp.on('Fetch.requestPaused', async (params) => {
      const { requestId, request } = params;
      const mock = handleMockApiResponse(request.url, request.method);
      const responseHeaders = Object.entries(mock.headers).map(([name, value]) => ({ name, value }));
      await cdp!.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: mock.status,
        responseHeaders,
        body: mock.body.toString('base64')
      }).catch(() => {});
    });

    // Step A: Test SW v5 -> v6 cache invalidation & safe single reload
    await cdp.send('Page.navigate', { url: `${origin}/` });
    try {
      await waitFor(async () => {
        const keys = await cdp!.evaluate(`(async () => {
          const ctrl = navigator.serviceWorker.controller;
          const cacheKeys = await caches.keys();
          return Boolean(ctrl && cacheKeys.includes('koinonia-app-shell-v5'));
        })()`);
        return keys;
      }, 25000, 'initial koinonia-app-shell-v5 SW activation');
    } catch (err) {
      const swDiag = await cdp.evaluate(`(async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        const cacheKeys = await caches.keys();
        return JSON.stringify({
          ctrl: navigator.serviceWorker.controller?.scriptURL || null,
          regs: regs.map((r) => ({ active: r.active?.state, waiting: r.waiting?.state, installing: r.installing?.state })),
          cacheKeys,
          readyState: document.readyState,
          url: window.location.href
        });
      })()`);
      throw new Error(`${(err as Error).message} | SW=${swDiag}`);
    }

    activeSwSource = upgradedSwSource;
    // Reload once as a returning visitor with active v5 controller before triggering SW v6 update
    await cdp.send('Page.reload', { ignoreCache: false });
    await waitFor(async () => {
      return await cdp!.evaluate(`Boolean(navigator.serviceWorker.controller)`);
    }, 10000, 'returning visit controlled by v5 SW');

    let loadCount = 0;
    cdp.on('Page.loadEventFired', () => {
      loadCount++;
    });

    await cdp.evaluate(`(async () => {
      localStorage.setItem('koinonia_token', 'mock-admin-token');
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    })()`);

    try {
      await waitFor(async () => {
        if (loadCount < 1) return false;
        return await cdp!.evaluate(`(async () => {
          const cacheKeys = await caches.keys();
          return !cacheKeys.includes('koinonia-app-shell-v5') && cacheKeys.includes('koinonia-app-shell-v6');
        })()`);
      }, 20000, 'koinonia-app-shell-v5 deletion, koinonia-app-shell-v6 activation, and controllerchange reload');
    } catch (err) {
      const swDiag = await cdp.evaluate(`(async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        const cacheKeys = await caches.keys();
        return JSON.stringify({
          loadCount,
          ctrl: navigator.serviceWorker.controller?.scriptURL || null,
          regs: regs.map((r) => ({ active: r.active?.state, waiting: r.waiting?.state, installing: r.installing?.state })),
          cacheKeys
        });
      })()`);
      throw new Error(`${(err as Error).message} | SW2=${swDiag}`);
    }

    assert.ok(loadCount >= 1 && loadCount <= 2, `Expected single controllerchange auto-reload (observed ${loadCount})`);
    console.log('  [PASS] SW v5 -> v6 upgrade: old cache deleted, v6 activated, clean reload');

    // Step B: Navigate to /admin/reports?view=selected-children and verify exact-age UI + API calls
    await cdp.send('Page.navigate', { url: `${origin}/admin/reports?view=selected-children` });

    try {
      await waitFor(async () => {
        return await cdp!.evaluate(`Boolean(document.querySelector('#selected-children-operational-report select[aria-label="Filter by exact age"]'))`);
      }, 15000, 'Selected Children report view rendered via ?view=selected-children');
    } catch (err) {
      const diag = await cdp.evaluate(`JSON.stringify({ url: window.location.href, text: document.body?.innerText?.slice(0, 400) })`);
      throw new Error(`${(err as Error).message} | DOM=${diag}`);
    }

    // Select "Ages 2–3" via React DOM input setter / native select event
    await cdp.evaluate(`(() => {
      const selects = Array.from(document.querySelectorAll('#selected-children-operational-report select'));
      const ageGroupSelect = selects.find((el) => Array.from(el.options).some((opt) => opt.value === '2–3'));
      if (!ageGroupSelect) throw new Error('Age group select not found');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(ageGroupSelect, '2–3');
      ageGroupSelect.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    const uiState = await waitFor(async () => {
      return await cdp!.evaluate(`(() => {
        const ageSelect = document.querySelector('select[aria-label="Filter by exact age"]');
        const drilldown = document.querySelector('[data-testid="exact-age-drilldown"]');
        if (!ageSelect || !drilldown) return null;
        const options = Array.from(ageSelect.options).map((o) => o.textContent.trim());
        const drillText = drilldown.textContent || '';
        const filterText = (ageSelect.parentElement?.textContent || '').trim();
        if (!options.includes('Age 2') || !options.includes('Age 3') || options.includes('Age 4')) return null;
        if (!drillText.includes('Ages 2–3') || !drillText.includes('Age 2') || !drillText.includes('Age 3')) return null;
        return { options, drillText, hasAgeLabel: filterText.startsWith('Age:') };
      })()`);
    }, 10000, 'Ages 2–3 exact-age dropdown options and drilldown');

    assert.deepEqual(uiState.options, ['All ages', 'Age 2', 'Age 3']);
    assert.ok(uiState.hasAgeLabel, 'Expected Age: label beside exact-age dropdown');

    const beforeCount = recordedReportUrls.length;

    // Click "View" inside the Age 2 row of exact-age-drilldown
    await cdp.evaluate(`(() => {
      const drilldown = document.querySelector('[data-testid="exact-age-drilldown"]');
      const rows = Array.from(drilldown.querySelectorAll('tbody tr'));
      const age2Row = rows.find((r) => r.textContent.includes('Age 2'));
      if (!age2Row) throw new Error('Age 2 row not found');
      const viewBtn = Array.from(age2Row.querySelectorAll('button')).find((b) => b.textContent.trim() === 'View');
      if (!viewBtn) throw new Error('Age 2 View button not found');
      viewBtn.click();
    })()`);

    await waitFor(async () => {
      const hasApiCall = recordedReportUrls.slice(beforeCount).some((u) => {
        const parsed = new URL(u);
        return parsed.searchParams.get('ageGroup') === '2–3' && parsed.searchParams.get('exactAge') === '2';
      });
      if (!hasApiCall) return false;
      return await cdp!.evaluate(`(() => {
        const root = document.querySelector('#selected-children-operational-report');
        const txt = root?.textContent || '';
        return txt.includes('Adaeze Two') && !txt.includes('Chidi Three') && txt.includes('Viewing');
      })()`);
    }, 10000, 'exactAge=2 View query and table update');

    // Click "Download" inside the Age 2 row of exact-age-drilldown
    await cdp.evaluate(`(() => {
      const drilldown = document.querySelector('[data-testid="exact-age-drilldown"]');
      const rows = Array.from(drilldown.querySelectorAll('tbody tr'));
      const age2Row = rows.find((r) => r.textContent.includes('Age 2'));
      const dlBtn = Array.from(age2Row.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Download');
      if (!dlBtn) throw new Error('Age 2 Download button not found');
      dlBtn.click();
    })()`);

    await waitFor(async () => {
      return recordedPdfUrls.some((u) => new URL(u).searchParams.get('exactAge') === '2');
    }, 10000, 'exactAge=2 PDF download request');

    // Allow download completion state updates to settle before opening popover
    await new Promise((r) => setTimeout(r, 400));

    // Step C: Custom Age Range (4–14), validation (12–4), Sort control, and Alphabetical Name List download
    const selectOptionExpression = (selector: string, val: string) => `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Select not found: ' + ${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(val)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`;

    await cdp.evaluate(selectOptionExpression('select[aria-label="Filter by age range"]', 'custom'));

    try {
      await waitFor(async () => {
        return await cdp!.evaluate(`Boolean(document.querySelector('[data-testid="age-range-popover"]'))`);
      }, 8000, 'age-range popover opened');
    } catch (err) {
      const diag = await cdp.evaluate(`(() => {
        const sel = document.querySelector('select[aria-label="Filter by age range"]');
        const root = document.querySelector('#selected-children-operational-report');
        return JSON.stringify({ hasSelect: Boolean(sel), selVal: sel?.value, htmlSnippet: root?.innerHTML?.slice(0, 500) });
      })()`);
      throw new Error(`${(err as Error).message} | RANGE_DIAG=${diag}`);
    }

    // Invalid 12-4 disables Apply and shows inline validation
    await cdp.evaluate(selectOptionExpression('select[aria-label="Age range from"]', '12'));
    await new Promise((r) => setTimeout(r, 80));
    await cdp.evaluate(selectOptionExpression('select[aria-label="Age range to"]', '4'));

    let invalidState: any;
    try {
      invalidState = await waitFor(async () => {
        return await cdp!.evaluate(`(() => {
          const popover = document.querySelector('[data-testid="age-range-popover"]');
          if (!popover) return null;
          const applyBtn = Array.from(popover.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Apply');
          const txt = popover.textContent || '';
          if (!applyBtn || !applyBtn.disabled || !txt.includes('From age cannot exceed To age')) return null;
          return { disabled: applyBtn.disabled, text: txt };
        })()`);
      }, 5000, 'Invalid 12–4 range disables Apply button and shows warning');
    } catch (err) {
      const popDiag = await cdp.evaluate(`(() => {
        const popover = document.querySelector('[data-testid="age-range-popover"]');
        const fromSel = document.querySelector('select[aria-label="Age range from"]');
        const toSel = document.querySelector('select[aria-label="Age range to"]');
        const applyBtn = popover ? Array.from(popover.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Apply') : null;
        return JSON.stringify({ exists: Boolean(popover), fromVal: fromSel?.value, toVal: toSel?.value, disabled: applyBtn?.disabled, txt: popover?.textContent });
      })()`);
      throw new Error(`${(err as Error).message} | POPOVER=${popDiag}`);
    }
    assert.equal(invalidState.disabled, true, 'Invalid 12–4 range must disable Apply button');
    assert.ok(invalidState.text.includes('From age cannot exceed To age'));

    // Valid 4–14 applies, clears Age group & Exact age, updates context/button, and sorts A–Z across ages
    const beforeRangeCount = recordedReportUrls.length;
    await cdp.evaluate(selectOptionExpression('select[aria-label="Age range from"]', '4'));
    await cdp.evaluate(selectOptionExpression('select[aria-label="Age range to"]', '14'));

    await cdp.evaluate(`(() => {
      const popover = document.querySelector('[data-testid="age-range-popover"]');
      const applyBtn = Array.from(popover.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Apply');
      if (applyBtn.disabled) throw new Error('Apply button unexpectedly disabled for 4–14');
      applyBtn.click();
    })()`);

    await waitFor(async () => {
      const hasRangeQuery = recordedReportUrls.slice(beforeRangeCount).some((u) => {
        const p = new URL(u);
        return p.searchParams.get('minAge') === '4' && p.searchParams.get('maxAge') === '14' && p.searchParams.get('sort') === 'name_asc' && !p.searchParams.get('ageGroup') && !p.searchParams.get('exactAge');
      });
      if (!hasRangeQuery) return false;
      return await cdp!.evaluate(`(() => {
        const root = document.querySelector('#selected-children-operational-report');
        const txt = root?.textContent || '';
        const dlBtn = document.querySelector('#btn-download-selected-pdf');
        const abigailIdx = txt.indexOf('Abigail Thirteen');
        const blessingIdx = txt.indexOf('Blessing Four');
        return Boolean(
          dlBtn && dlBtn.textContent.includes('Download Ages 4–14 report') &&
          txt.includes('2 selected children · Ages 4–14') &&
          !txt.includes('Adaeze Two') &&
          abigailIdx !== -1 && blessingIdx !== -1 && abigailIdx < blessingIdx
        );
      })()`);
    }, 10000, 'Ages 4–14 range filter + alphabetical A–Z order');

    // Alphabetical name list download under Download options menu
    const beforePdfCount = recordedPdfUrls.length;
    await cdp.evaluate(`(() => {
      document.querySelector('#btn-download-selected-options').click();
    })()`);
    await waitFor(async () => {
      return await cdp!.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('[role="menu"] button')).find((b) => b.textContent.includes('Alphabetical name list'));
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
    }, 5000, 'Alphabetical name list menu click');

    await waitFor(async () => {
      return recordedPdfUrls.slice(beforePdfCount).some((u) => {
        const p = new URL(u);
        return p.searchParams.get('variant') === 'name_list' && p.searchParams.get('minAge') === '4' && p.searchParams.get('maxAge') === '14' && p.searchParams.get('sort') === 'name_asc';
      });
    }, 10000, 'Alphabetical name list PDF request');

    // Sort change to Z–A
    const beforeSortCount = recordedReportUrls.length;
    await cdp.evaluate(`(() => {
      const sortSel = document.querySelector('select[aria-label="Sort selected children"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sortSel, 'name_desc');
      sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    await waitFor(async () => {
      return recordedReportUrls.slice(beforeSortCount).some((u) => new URL(u).searchParams.get('sort') === 'name_desc');
    }, 10000, 'sort=name_desc query');

    // Reset filters restores all defaults
    await cdp.evaluate(`(() => {
      const resetBtn = Array.from(document.querySelectorAll('#selected-children-operational-report button')).find((b) => b.textContent.trim() === 'Reset filters');
      if (!resetBtn) throw new Error('Reset filters button not found');
      resetBtn.click();
    })()`);

    const resetState = await waitFor(async () => {
      return await cdp!.evaluate(`(() => {
        const rangeVal = document.querySelector('select[aria-label="Filter by age range"]')?.value;
        const sortVal = document.querySelector('select[aria-label="Sort selected children"]')?.value;
        const exactVal = document.querySelector('select[aria-label="Filter by exact age"]')?.value;
        if (rangeVal !== 'all' || sortVal !== 'name_asc' || exactVal !== 'all') return null;
        return { rangeVal, sortVal, exactVal };
      })()`);
    }, 5000, 'Reset filters restored defaults');
    assert.equal(resetState.rangeVal, 'all');
    assert.equal(resetState.sortVal, 'name_asc');
    assert.equal(resetState.exactVal, 'all');

    console.log('  [PASS] Browser E2E: Exact age + Custom age range (4–14) + Validation + Sort + Name list PDF + Reset');
  } finally {
    try {
      await cdp?.send('Browser.close');
    } catch {}
    cdp?.close();
    try {
      chromeProc.kill();
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    server.closeAllConnections?.();
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

async function main() {
  console.log('================================================================');
  console.log('TEST SUITE: Selected Children Exact-Age UI & SW Upgrade');
  console.log('================================================================');

  await runSsrTests();

  const chromePath = findChromeExecutable();
  const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html')) && fs.existsSync(path.join(DIST_DIR, 'sw.js'));
  if (chromePath && hasDist) {
    await runBrowserE2E(chromePath);
  } else if (process.env.REQUIRE_BROWSER_E2E === '1') {
    throw new Error(`Browser E2E required but missing chromePath (${chromePath}) or dist (${hasDist})`);
  } else {
    console.log('  [SKIP] Browser E2E skipped (build dist or Chrome not present)');
  }

  console.log('================================================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
  });

