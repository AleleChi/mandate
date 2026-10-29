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
        timeout: 10000,
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
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function run() {
  const email = 'admin@koinonia.local';
  const password = 'KoinoniaDevAdmin2026!';

  console.log('==================================================');
  console.log('TESTING LOCAL ADMIN AUTHENTICATION');
  console.log('Testing Email:', email);
  console.log('==================================================\n');

  // Test 1: Wrong password rejected
  console.log('1. Testing: wrong password rejected...');
  const resWrong = await makeRequest('/api/admin/sign-in', 'POST', {
    email,
    password: 'IncorrectPassword999!',
  });
  const test1Pass = resWrong.statusCode === 401 && resWrong.body?.code === 'INVALID_CREDENTIALS';
  console.log(`   Status: ${resWrong.statusCode}`);
  console.log(`   Response code: ${resWrong.body?.code}`);
  console.log(`   Result: wrong password rejected ${test1Pass ? 'PASS' : 'FAIL'}\n`);

  // Test 2: Correct local Admin password accepted
  console.log('2. Testing: correct local Admin password accepted...');
  const resLogin = await makeRequest('/api/admin/sign-in', 'POST', {
    email,
    password,
  });
  const test2Pass =
    resLogin.statusCode === 200 &&
    resLogin.body?.success === true &&
    resLogin.body?.user?.role === 'super_admin' &&
    Boolean(resLogin.body?.token);
  console.log(`   Status: ${resLogin.statusCode}`);
  console.log(`   User role: ${resLogin.body?.user?.role}`);
  console.log(`   Full Name: ${resLogin.body?.user?.fullName}`);
  console.log(`   Token received: ${Boolean(resLogin.body?.token)}`);
  console.log(`   Result: correct local Admin password accepted ${test2Pass ? 'PASS' : 'FAIL'}\n`);

  const token = resLogin.body?.token;

  // Test 3: Admin dashboard accessible
  console.log('3. Testing: Admin dashboard accessible...');
  const resAdminMe = await makeRequest('/api/admin/me', 'GET', undefined, token);
  const test3Pass = resAdminMe.statusCode === 200 && (resAdminMe.body?.profile || resAdminMe.body?.user);
  console.log(`   /api/admin/me Status: ${resAdminMe.statusCode}`);
  console.log(`   Admin full name: ${resAdminMe.body?.profile?.full_name || resAdminMe.body?.user?.fullName}`);
  console.log(`   Result: Admin dashboard accessible ${test3Pass ? 'PASS' : 'FAIL'}\n`);

  // Test 4: Refresh keeps valid session (simulating page reload with token in storage)
  console.log('4. Testing: refresh keeps valid session...');
  const resSessionCheck = await makeRequest('/api/me/access', 'GET', undefined, token);
  const test4Pass =
    resSessionCheck.statusCode === 200 &&
    resSessionCheck.body?.user?.role === 'super_admin' &&
    resSessionCheck.body?.user?.email === email;
  console.log(`   /api/me/access Status: ${resSessionCheck.statusCode}`);
  console.log(`   Validated User: ${resSessionCheck.body?.user?.email} (${resSessionCheck.body?.user?.role})`);
  console.log(`   Result: session persists ${test4Pass ? 'PASS' : 'FAIL'}\n`);

  // Test 5: Logout
  console.log('5. Testing: logout...');
  const resLogout = await makeRequest('/api/auth/sign-out', 'POST', undefined, token);
  const test5Pass = resLogout.statusCode === 200 && resLogout.body?.success === true;
  console.log(`   /api/auth/sign-out Status: ${resLogout.statusCode}`);
  console.log(`   Result: logout ${test5Pass ? 'PASS' : 'FAIL'}\n`);

  // Test 6: Login again
  console.log('6. Testing: login again...');
  const resReLogin = await makeRequest('/api/admin/sign-in', 'POST', {
    email,
    password,
  });
  const test6Pass =
    resReLogin.statusCode === 200 &&
    resReLogin.body?.success === true &&
    Boolean(resReLogin.body?.token);
  console.log(`   Status: ${resReLogin.statusCode}`);
  console.log(`   New Token received: ${Boolean(resReLogin.body?.token)}`);
  console.log(`   Result: login again ${test6Pass ? 'PASS' : 'FAIL'}\n`);

  // Bonus Check: verify admin@koinonia.org also works
  console.log('Bonus Check: verify admin@koinonia.org also accepts credentials...');
  const resOrg = await makeRequest('/api/admin/sign-in', 'POST', {
    email: 'admin@koinonia.org',
    password,
  });
  const orgPass = resOrg.statusCode === 200 && resOrg.body?.success === true;
  console.log(`   admin@koinonia.org login: ${orgPass ? 'PASS' : 'FAIL'}\n`);

  console.log('==================================================');
  console.log('SUMMARY OF TESTS:');
  console.log(`- wrong password rejected: ${test1Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- correct password accepted: ${test2Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- Admin dashboard accessible: ${test3Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- session persists: ${test4Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- logout: ${test5Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- login again: ${test6Pass ? 'PASS' : 'FAIL'}`);
  console.log('==================================================');

  if (test1Pass && test2Pass && test3Pass && test4Pass && test5Pass && test6Pass) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Error in verification:', err);
  process.exit(1);
});
