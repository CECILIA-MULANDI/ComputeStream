#!/bin/bash

# Quick API Test Script for ComputeStream
# Make sure the server is running on http://localhost:4402

BASE_URL="http://localhost:4402"

echo "Testing ComputeStream API..."
echo ""

# Test 1: Health Check
echo "1. Testing Health Check..."
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/health")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "Health check passed"
    echo "   Response: $body"
else
    echo "Health check failed (HTTP $http_code)"
    echo "   Response: $body"
fi
echo ""

# Test 2: List Providers
echo "2. Testing List Providers..."
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/providers/available")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ List providers passed"
    count=$(echo "$body" | grep -o '"count":[0-9]*' | cut -d: -f2)
    echo "   Found $count providers"
else
    echo "❌ List providers failed (HTTP $http_code)"
    echo "   Response: $body"
fi
echo ""

# Test 3: Get Min Stake
echo "3. Testing Get Min Stake..."
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/providers/min-stake")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ Get min stake passed"
    echo "   Response: $body"
else
    echo "❌ Get min stake failed (HTTP $http_code)"
fi
echo ""

# Test 4: x402 Info
echo "4. Testing x402 Info..."
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/compute/x402-info")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ x402 info endpoint passed"
    echo "   Response includes x402 integration details"
else
    echo "❌ x402 info failed (HTTP $http_code)"
fi
echo ""

# Test 5: Compute Providers
echo "5. Testing Compute Providers..."
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/compute/providers")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ Compute providers endpoint passed"
    count=$(echo "$body" | grep -o '"count":[0-9]*' | cut -d: -f2)
    echo "   Found $count providers"
else
    echo "❌ Compute providers failed (HTTP $http_code)"
fi
echo ""

# Test 6: Payment Orchestrator Status
echo "6. Testing Payment Orchestrator Status..."
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/v1/payments/stream/orchestrator/status")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ Payment orchestrator status passed"
    echo "   Response: $body"
else
    echo "❌ Payment orchestrator status failed (HTTP $http_code)"
fi
echo ""

echo "🎉 API testing complete!"
echo ""
echo "Next steps:"
echo "  - Test wallet connection in frontend (http://localhost:3000)"
echo "  - Test provider registration (requires deployed contract)"
echo "  - Test x402 payment flow (requires wallet with testnet tokens)"
