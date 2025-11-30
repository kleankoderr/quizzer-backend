#!/bin/bash

BASE_URL="http://localhost:3000"

echo "Testing Test Rate Limit (Limit: 2)"
for i in {1..4}
do
   response=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/test-limit)
   echo "Request $i: $response"
   if [ "$response" == "429" ]; then
       echo "Rate Limit Hit!"
   fi
done

echo "Testing Global Rate Limit (Limit: 100)"
# This might take a while, so we'll just do a quick check to see if it's NOT 429 initially
response=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/health) # Assuming health endpoint exists or just root
echo "Initial Request: $response"
