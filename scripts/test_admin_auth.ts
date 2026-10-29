import http from 'http';

function makeRequest(
  path: string,
  method: string = 'POST',
  body?: any,
  token?: string
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(data));
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode || 0, body: JSON.parse(resBody) });
          } catch {
            resolve({ statusCode: res.statusCode || 0, body: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function run() {
  console.log('==================================================');
  console.log('ADMIN LOCAL AUTH VERIFICATION SUITE');
  console.log('==================================================\n');

  // Test 1: Stale / Fake autofill credentials
  console.log('Test 1: Stale autofill credentials (owner@admitdesk.local / fake password)');
  const res1 = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'owner@admitdesk.local',
    password: 'somepassword',
  });
  console.log('  Status:', res1.statusCode);
  console.log('  Response:', JSON.stringify(res1.body));
  const test1Pass = res1.statusCode === 401 && res1.body.code === 'INVALID_CREDENTIALS';
  console.log('  Result:', test1Pass ? 'PASS' : 'FAIL');

  // Test 2: Admin email with WRONG password
  console.log('\nTest 2: Admin email with WRONG password');
  const res2 = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.org',
    password: 'IncorrectPassword123!',
  });
  console.log('  Status:', res2.statusCode);
  console.log('  Response:', JSON.stringify(res2.body));
  const test2Pass = res2.statusCode === 401 && res2.body.code === 'INVALID_CREDENTIALS';
  console.log('  Result:', test2Pass ? 'PASS' : 'FAIL');

  // Test 3: Correct local development admin login
  console.log('\nTest 3: Correct local dev admin login (admin@koinonia.org / Password123!)');
  const res3 = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.org',
    password: 'Password123!',
  });
  console.log('  Status:', res3.statusCode);
  console.log('  Success:', res3.body.success);
  console.log('  Role:', res3.body.user?.role);
  console.log('  Full Name:', res3.body.user?.fullName);
  console.log('  Token returned:', Boolean(res3.body.token));
  const test3Pass =
    res3.statusCode === 200 &&
    res3.body.success === true &&
    res3.body.user?.role === 'super_admin' &&
    Boolean(res3.body.token);
  console.log('  Result:', test3Pass ? 'PASS' : 'FAIL');

  const adminToken = res3.body.token;

  // Test 4: Admin authorization & session persistence
  console.log('\nTest 4: Admin session check (/api/me/access & /api/admin/me)');
  const meAccessRes = await makeRequest('/api/me/access', 'GET', undefined, adminToken);
  console.log('  /api/me/access Status:', meAccessRes.statusCode);
  console.log('  User Email:', meAccessRes.body.user?.email, 'Role:', meAccessRes.body.user?.role);

  const adminMeRes = await makeRequest('/api/admin/me', 'GET', undefined, adminToken);
  console.log('  /api/admin/me Status:', adminMeRes.statusCode);
  console.log('  Admin Name:', adminMeRes.body.profile?.full_name || adminMeRes.body.user?.fullName);

  const test4Pass =
    meAccessRes.statusCode === 200 &&
    meAccessRes.body.user?.role === 'super_admin' &&
    adminMeRes.statusCode === 200;
  console.log('  Result:', test4Pass ? 'PASS' : 'FAIL');

  // Test 5: Non-admin role denied admin access
  console.log('\nTest 5: Non-admin role denied admin access');
  const parentLoginRes = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'parent@koinonia.org',
    password: 'Password123!',
  });
  console.log('  Status for non-admin on /api/admin/sign-in:', parentLoginRes.statusCode);
  console.log('  Response:', JSON.stringify(parentLoginRes.body));
  const test5Pass =
    parentLoginRes.statusCode === 403 &&
    parentLoginRes.body.code === 'ADMIN_ACCESS_REQUIRED';
  console.log('  Result:', test5Pass ? 'PASS' : 'FAIL');

  // Test 6: Sign out / session invalidation
  console.log('\nTest 6: Sign out check');
  const signOutRes = await makeRequest('/api/auth/sign-out', 'POST', undefined, adminToken);
  console.log('  /api/auth/sign-out Status:', signOutRes.statusCode);
  const test6Pass = signOutRes.statusCode === 200;
  console.log('  Result:', test6Pass ? 'PASS' : 'FAIL');

  console.log('\n==================================================');
  const allPass = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass && test6Pass;
  console.log('ALL TESTS SUMMARY:', allPass ? 'ALL PASS' : 'SOME FAILED');
  console.log('==================================================');
}

run().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
