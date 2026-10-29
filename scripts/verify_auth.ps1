$email = "admin@koinonia.local"
$password = "KoinoniaDevAdmin2026!"

Write-Output "=================================================="
Write-Output "LOCAL ADMIN AUTHENTICATION TEST SUITE"
Write-Output "Testing Email: $email"
Write-Output "==================================================`n"

# Test 1: Wrong password rejected
Write-Output "1. Testing: wrong password rejected..."
$test1Pass = $false
try {
  $wrong = @{ email = $email; password = "WrongPassword999!" } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/sign-in" -Method Post -ContentType "application/json" -Body $wrong
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    $test1Pass = $true
  }
}
Write-Output "   Result: wrong password rejected $(if ($test1Pass) { 'PASS' } else { 'FAIL' })`n"

# Test 2: Correct password accepted
Write-Output "2. Testing: correct local Admin password accepted..."
$test2Pass = $false
$token = $null
try {
  $correct = @{ email = $email; password = $password } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/sign-in" -Method Post -ContentType "application/json" -Body $correct
  if ($res.success -eq $true -and $res.user.role -eq 'super_admin' -and $res.token) {
    $test2Pass = $true
    $token = $res.token
  }
} catch {
  Write-Output "   Error: $($_.Exception.Message)"
}
Write-Output "   Role: $($res.user.role)"
Write-Output "   Full Name: $($res.user.fullName)"
Write-Output "   Token returned: $([bool]$token)"
Write-Output "   Result: correct local Admin password accepted $(if ($test2Pass) { 'PASS' } else { 'FAIL' })`n"

# Test 3: Admin dashboard accessible
Write-Output "3. Testing: Admin dashboard accessible..."
$test3Pass = $false
try {
  $headers = @{ Authorization = "Bearer $token" }
  $adminMe = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/me" -Method Get -Headers $headers
  $meAccess = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/me/access" -Method Get -Headers $headers
  if ($adminMe.user -or $adminMe.profile -or $meAccess.user.role -eq 'super_admin') {
    $test3Pass = $true
  }
} catch {
  Write-Output "   Error: $($_.Exception.Message)"
}
Write-Output "   Result: Admin dashboard accessible $(if ($test3Pass) { 'PASS' } else { 'FAIL' })`n"

# Test 4: Session persists
Write-Output "4. Testing: session persists on refresh..."
$test4Pass = $false
try {
  $headers = @{ Authorization = "Bearer $token" }
  $meAccess = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/me/access" -Method Get -Headers $headers
  if ($meAccess.user.email -eq $email -and $meAccess.user.role -eq 'super_admin') {
    $test4Pass = $true
  }
} catch {
  Write-Output "   Error: $($_.Exception.Message)"
}
Write-Output "   User: $($meAccess.user.email) ($($meAccess.user.role))"
Write-Output "   Result: session persists $(if ($test4Pass) { 'PASS' } else { 'FAIL' })`n"

# Test 5: Logout
Write-Output "5. Testing: logout..."
$test5Pass = $false
try {
  $headers = @{ Authorization = "Bearer $token" }
  $resLogout = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/auth/sign-out" -Method Post -Headers $headers
  if ($resLogout.success -eq $true) {
    $test5Pass = $true
  }
} catch {
  Write-Output "   Error: $($_.Exception.Message)"
}
Write-Output "   Result: logout $(if ($test5Pass) { 'PASS' } else { 'FAIL' })`n"

# Test 6: Login again
Write-Output "6. Testing: login again..."
$test6Pass = $false
try {
  $correct = @{ email = $email; password = $password } | ConvertTo-Json
  $resReLogin = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/sign-in" -Method Post -ContentType "application/json" -Body $correct
  if ($resReLogin.success -eq $true -and $resReLogin.token) {
    $test6Pass = $true
  }
} catch {
  Write-Output "   Error: $($_.Exception.Message)"
}
Write-Output "   Result: login again $(if ($test6Pass) { 'PASS' } else { 'FAIL' })`n"

# Bonus test: admin@koinonia.org login
Write-Output "Bonus Testing: admin@koinonia.org login..."
$testOrgPass = $false
try {
  $correctOrg = @{ email = "admin@koinonia.org"; password = $password } | ConvertTo-Json
  $resOrg = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/sign-in" -Method Post -ContentType "application/json" -Body $correctOrg
  if ($resOrg.success -eq $true -and $resOrg.token) {
    $testOrgPass = $true
  }
} catch {
  Write-Output "   Error: $($_.Exception.Message)"
}
Write-Output "   Result: admin@koinonia.org login $(if ($testOrgPass) { 'PASS' } else { 'FAIL' })`n"

Write-Output "=================================================="
Write-Output "SUMMARY OF TEST RESULTS:"
Write-Output "- wrong password rejected: $(if ($test1Pass) { 'PASS' } else { 'FAIL' })"
Write-Output "- correct password accepted: $(if ($test2Pass) { 'PASS' } else { 'FAIL' })"
Write-Output "- Admin dashboard accessible: $(if ($test3Pass) { 'PASS' } else { 'FAIL' })"
Write-Output "- session persists: $(if ($test4Pass) { 'PASS' } else { 'FAIL' })"
Write-Output "- logout: $(if ($test5Pass) { 'PASS' } else { 'FAIL' })"
Write-Output "- login again: $(if ($test6Pass) { 'PASS' } else { 'FAIL' })"
Write-Output "=================================================="

if ($test1Pass -and $test2Pass -and $test3Pass -and $test4Pass -and $test5Pass -and $test6Pass) {
  exit 0
} else {
  exit 1
}
