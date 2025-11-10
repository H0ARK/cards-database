#!/bin/bash

# Test the discovery endpoint
echo "Testing discovery endpoint..."
echo ""

# Test that the endpoint is accessible
echo "1. Fetching endpoint list:"
curl -s http://localhost:4000/v2/discovery/endpoints | jq '.' | head -50

echo ""
echo "2. Checking response structure:"
curl -s http://localhost:4000/v2/discovery/endpoints | jq '{apiVersion, server, totalEndpoints, supportedLanguages: .supportedLanguages}'

echo ""
echo "3. Sample endpoints:"
curl -s http://localhost:4000/v2/discovery/endpoints | jq '.endpoints[0:3]'
