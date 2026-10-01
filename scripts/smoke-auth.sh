#!/usr/bin/env bash
set -e

API_URL="${API_URL:-http://localhost:4000}"
COOKIE_JAR="$(mktemp)"
RAND_SUFFIX="$RANDOM"
EMAIL="smoke-admin-${RAND_SUFFIX}@example.com"
PASSWORD="SecurePassword123!"

echo "=================================================="
echo "TalentPulse AI - Auth Smoke Test"
echo "API URL: $API_URL"
echo "Testing with: $EMAIL"
echo "=================================================="

# 1. Register organization & admin
echo ""
echo "[1/5] Registering organization and admin user..."
REG_RESP=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d "{
    \"organizationName\": \"Smoke Corp $RAND_SUFFIX\",
    \"name\": \"Smoke Admin\",
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

ACCESS_TOKEN=$(echo "$REG_RESP" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "FAIL: Could not extract access token from registration response: $REG_RESP"
  exit 1
fi
echo "SUCCESS: Registered successfully. Token received."

# 2. Get Me
echo ""
echo "[2/5] Calling GET /api/auth/me with Bearer token..."
ME_RESP=$(curl -s -X GET "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

ME_EMAIL=$(echo "$ME_RESP" | grep -o '"email":"[^"]*' | cut -d'"' -f4)
if [ "$ME_EMAIL" != "$EMAIL" ]; then
  echo "FAIL: Expected email $EMAIL, got: $ME_RESP"
  exit 1
fi
echo "SUCCESS: Authenticated user verified: $ME_EMAIL"

# 3. Login
echo ""
echo "[3/5] Testing POST /api/auth/login..."
LOGIN_RESP=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

LOGIN_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
if [ -z "$LOGIN_TOKEN" ]; then
  echo "FAIL: Login failed: $LOGIN_RESP"
  exit 1
fi
echo "SUCCESS: Logged in successfully."

# 4. Refresh token
echo ""
echo "[4/5] Testing POST /api/auth/refresh with cookies..."
REFRESH_RESP=$(curl -s -X POST "$API_URL/api/auth/refresh" \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR")

NEW_TOKEN=$(echo "$REFRESH_RESP" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
if [ -z "$NEW_TOKEN" ]; then
  echo "FAIL: Refresh failed: $REFRESH_RESP"
  exit 1
fi
echo "SUCCESS: Token refreshed successfully via cookie rotation."

# 5. Logout
echo ""
echo "[5/5] Testing POST /api/auth/logout..."
LOGOUT_RESP=$(curl -s -X POST "$API_URL/api/auth/logout" \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR")

echo "$LOGOUT_RESP" | grep -q "Logged out successfully"
if [ $? -eq 0 ]; then
  echo "SUCCESS: Logged out successfully."
else
  echo "FAIL: Logout response: $LOGOUT_RESP"
  exit 1
fi

rm -f "$COOKIE_JAR"
echo ""
echo "=================================================="
echo "ALL AUTH SMOKE TESTS PASSED SUCCESSFULLY!"
echo "=================================================="
