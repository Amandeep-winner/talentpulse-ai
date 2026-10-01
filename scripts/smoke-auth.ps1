$ErrorActionPreference = "Stop"

$apiUrl = if ($env:API_URL) { $env:API_URL } else { "http://localhost:4000" }
$randSuffix = Get-Random -Minimum 1000 -Maximum 9999
$email = "smoke-admin-$randSuffix@example.com"
$password = "SecurePassword123!"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TalentPulse AI - Auth Smoke Test" -ForegroundColor Cyan
Write-Host "API URL: $apiUrl" -ForegroundColor Cyan
Write-Host "Testing with: $email" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 1. Register organization & admin
Write-Host "`n[1/5] Registering organization and admin user..." -ForegroundColor Yellow
$regBody = @{
    organizationName = "Smoke Corp $randSuffix"
    name = "Smoke Admin"
    email = $email
    password = $password
} | ConvertTo-Json

$regResp = Invoke-RestMethod -Uri "$apiUrl/api/auth/register" -Method Post -Body $regBody -ContentType "application/json" -WebSession $session
$accessToken = $regResp.data.accessToken

if (-not $accessToken) {
    Write-Error "FAIL: No access token received from registration"
}
Write-Host "SUCCESS: Registered successfully. Token received." -ForegroundColor Green

# 2. Get Me
Write-Host "`n[2/5] Calling GET /api/auth/me with Bearer token..." -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer $accessToken" }
$meResp = Invoke-RestMethod -Uri "$apiUrl/api/auth/me" -Method Get -Headers $headers -WebSession $session

if ($meResp.data.user.email -ne $email) {
    Write-Error "FAIL: Expected email $email, got $($meResp.data.user.email)"
}
Write-Host "SUCCESS: Authenticated user verified: $($meResp.data.user.email)" -ForegroundColor Green

# 3. Login
Write-Host "`n[3/5] Testing POST /api/auth/login..." -ForegroundColor Yellow
$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

$loginResp = Invoke-RestMethod -Uri "$apiUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session
if (-not $loginResp.data.accessToken) {
    Write-Error "FAIL: Login failed"
}
Write-Host "SUCCESS: Logged in successfully." -ForegroundColor Green

# 4. Refresh token
Write-Host "`n[4/5] Testing POST /api/auth/refresh with cookies..." -ForegroundColor Yellow
$refreshResp = Invoke-RestMethod -Uri "$apiUrl/api/auth/refresh" -Method Post -ContentType "application/json" -WebSession $session
if (-not $refreshResp.data.accessToken) {
    Write-Error "FAIL: Refresh failed"
}
Write-Host "SUCCESS: Token refreshed successfully via cookie rotation." -ForegroundColor Green

# 5. Logout
Write-Host "`n[5/5] Testing POST /api/auth/logout..." -ForegroundColor Yellow
$logoutResp = Invoke-RestMethod -Uri "$apiUrl/api/auth/logout" -Method Post -ContentType "application/json" -WebSession $session
Write-Host "SUCCESS: Logged out successfully: $($logoutResp.data.message)" -ForegroundColor Green

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "ALL AUTH SMOKE TESTS PASSED SUCCESSFULLY!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
