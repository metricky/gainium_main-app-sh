/**
 * Test Examples for API v2.0 Field Selection
 *
 * This file demonstrates how to test the field selection functionality.
 * You can use these examples with any HTTP client (curl, Postman, etc.)
 */

/**
 * Test 1: Default behavior (no fields parameter)
 * Expected: Returns minimal preset fields
 */
const test1 = {
  url: '/api/v2/bots/dca',
  expected:
    'Returns: id, uuid, settings.name, status, exchange, exchangeUUID, paperContext',
}

/**
 * Test 2: Minimal preset
 * Expected: Same as test 1
 */
const test2 = {
  url: '/api/v2/bots/dca?fields=minimal',
  expected:
    'Returns: id, uuid, settings.name, status, exchange, exchangeUUID, paperContext',
}

/**
 * Test 3: Standard preset
 * Expected: Returns standard fields including profit and deals
 */
const test3 = {
  url: '/api/v2/bots/dca?fields=standard',
  expected:
    'Returns: minimal fields + settings.pair, profit.total, profit.totalUsd, deals.all, deals.active, createdAt, updatedAt',
}

/**
 * Test 4: Extended preset
 * Expected: Returns extended fields including full settings
 */
const test4 = {
  url: '/api/v2/bots/dca?fields=extended',
  expected:
    'Returns: standard fields + settings (full), cost, workingTimeNumber, profitToday, statusReason',
}

/**
 * Test 5: All fields (wildcard)
 * Expected: Returns all available fields
 */
const test5 = {
  url: '/api/v2/bots/dca?fields=full',
  expected: 'Returns: All fields from database',
}

/**
 * Test 6: Custom field list - simple
 * Expected: Returns only requested fields
 */
const test6 = {
  url: '/api/v2/bots/dca?fields=id,name,status',
  expected: 'Returns: _id, name, status (note: id converted to _id)',
}

/**
 * Test 7: Custom field list - nested
 * Expected: Returns nested fields
 */
const test7 = {
  url: '/api/v2/bots/dca?fields=id,settings.name,settings.pair,profit.total',
  expected: 'Returns: _id, settings.name, settings.pair, profit.total',
}

/**
 * Test 8: Custom field list - complex
 * Expected: Returns mix of top-level and nested fields
 */
const test8 = {
  url: '/api/v2/bots/dca?fields=id,uuid,status,exchange,settings.pair,settings.orderSize,profit.total,profit.totalUsd,deals.active,deals.all',
  expected: 'Returns: All specified fields',
}

/**
 * Test 9: Deals endpoint with custom fields
 * Expected: Returns deal-specific fields
 */
const test9 = {
  url: '/api/v2/deals?botType=dca&fields=id,botId,status,profit.total,avgPrice,lastPrice',
  expected: 'Returns: _id, botId, status, profit.total, avgPrice, lastPrice',
}

/**
 * Test 10: Balances endpoint with minimal fields
 * Expected: Returns balance essentials
 */
const test10 = {
  url: '/api/v2/user/balances?assets=BTC,ETH,USDT&fields=asset,free,locked',
  expected: 'Returns: asset, free, locked for BTC, ETH, USDT',
}

/**
 * Test 11: Combined with other filters
 * Expected: Field selection works with status filter
 */
const test11 = {
  url: '/api/v2/bots/dca?status=open&paperContext=false&fields=id,name,status,profit.total',
  expected: 'Returns: Only open, non-paper bots with specified fields',
}

/**
 * Test 12: Pagination with field selection
 * Expected: Field selection works with pagination
 */
const test12 = {
  url: '/api/v2/bots/dca?page=2&fields=minimal',
  expected: 'Returns: Page 2 with minimal fields',
}

/**
 * cURL Examples
 * Replace YOUR_TOKEN, YOUR_TIME, and YOUR_SIGNATURE with actual values
 */

export const curlExamples = `
# Test 1: Default (minimal)
curl -X GET "http://localhost:3000/api/v2/bots/dca" \\
  -H "token: YOUR_TOKEN" \\
  -H "time: YOUR_TIME" \\
  -H "signature: YOUR_SIGNATURE"

# Test 2: Standard preset
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=standard" \\
  -H "token: YOUR_TOKEN" \\
  -H "time: YOUR_TIME" \\
  -H "signature: YOUR_SIGNATURE"

# Test 3: Custom fields
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=id,name,status,settings.pair,profit.total" \\
  -H "token: YOUR_TOKEN" \\
  -H "time: YOUR_TIME" \\
  -H "signature: YOUR_SIGNATURE"

# Test 4: All fields
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=full" \\
  -H "token: YOUR_TOKEN" \\
  -H "time: YOUR_TIME" \\
  -H "signature: YOUR_SIGNATURE"

# Test 5: Deals with custom fields
curl -X GET "http://localhost:3000/api/v2/deals?botType=dca&fields=id,botId,status,profit.total" \\
  -H "token: YOUR_TOKEN" \\
  -H "time: YOUR_TIME" \\
  -H "signature: YOUR_SIGNATURE"

# Test 6: Balances with filters and fields
curl -X GET "http://localhost:3000/api/v2/user/balances?assets=BTC,ETH&fields=asset,free" \\
  -H "token: YOUR_TOKEN" \\
  -H "time: YOUR_TIME" \\
  -H "signature: YOUR_SIGNATURE"
`

/**
 * JavaScript/TypeScript Test Examples
 */

export const jsExamples = `
// Helper function to generate signature (use your actual implementation)
function generateSignature(body, method, endpoint, time, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(body + method + endpoint + time)
    .digest('base64')
}

// Test function
async function testFieldSelection() {
  const apiKey = 'YOUR_API_KEY'
  const apiSecret = 'YOUR_API_SECRET'
  const baseUrl = 'http://localhost:3000'
  
  // Test 1: Minimal fields
  const time1 = Date.now().toString()
  const signature1 = generateSignature('', 'GET', '/api/v2/bots/dca?fields=minimal', time1, apiSecret)
  
  const response1 = await fetch(baseUrl + '/api/v2/bots/dca?fields=minimal', {
    headers: {
      'token': apiKey,
      'time': time1,
      'signature': signature1,
    }
  })
  
  const data1 = await response1.json()
  console.log('Minimal fields:', data1.meta.fields)
  
  // Test 2: Custom fields
  const time2 = Date.now().toString()
  const signature2 = generateSignature('', 'GET', '/api/v2/bots/dca?fields=id,name,status', time2, apiSecret)
  
  const response2 = await fetch(baseUrl + '/api/v2/bots/dca?fields=id,name,status', {
    headers: {
      'token': apiKey,
      'time': time2,
      'signature': signature2,
    }
  })
  
  const data2 = await response2.json()
  console.log('Custom fields:', data2.meta.fields)
  console.log('First bot:', data2.data[0])
  
  // Test 3: All fields
  const time3 = Date.now().toString()
  const signature3 = generateSignature('', 'GET', '/api/v2/bots/dca?fields=full', time3, apiSecret)

  const response3 = await fetch(baseUrl + '/api/v2/bots/dca?fields=full', {
    headers: {
      'token': apiKey,
      'time': time3,
      'signature': signature3,
    }
  })
  
  const data3 = await response3.json()
  console.log('All fields:', data3.meta.fields)
}
`

/**
 * Python Test Examples
 */

export const pythonExamples = `
import requests
import time
import hmac
import hashlib
import base64

def generate_signature(body, method, endpoint, timestamp, secret):
    message = body + method + endpoint + timestamp
    signature = hmac.new(
        secret.encode(),
        message.encode(),
        hashlib.sha256
    ).digest()
    return base64.b64encode(signature).decode()

def test_field_selection():
    api_key = 'YOUR_API_KEY'
    api_secret = 'YOUR_API_SECRET'
    base_url = 'http://localhost:3000'
    
    # Test 1: Minimal fields
    timestamp = str(int(time.time() * 1000))
    endpoint = '/api/v2/bots/dca?fields=minimal'
    signature = generate_signature('', 'GET', endpoint, timestamp, api_secret)
    
    response = requests.get(
        base_url + endpoint,
        headers={
            'token': api_key,
            'time': timestamp,
            'signature': signature
        }
    )
    
    data = response.json()
    print('Minimal fields:', data['meta']['fields'])
    
    # Test 2: Custom fields
    timestamp = str(int(time.time() * 1000))
    endpoint = '/api/v2/bots/dca?fields=id,name,status,profit.total'
    signature = generate_signature('', 'GET', endpoint, timestamp, api_secret)
    
    response = requests.get(
        base_url + endpoint,
        headers={
            'token': api_key,
            'time': timestamp,
            'signature': signature
        }
    )
    
    data = response.json()
    print('Custom fields:', data['meta']['fields'])
    print('First bot:', data['data'][0])

if __name__ == '__main__':
    test_field_selection()
`

/**
 * Expected Response Formats
 */

export const expectedResponses = {
  minimal: {
    status: 'ok',
    reason: null,
    data: [
      {
        _id: '507f1f77bcf86cd799439011',
        uuid: 'uuid-123',
        settings: {
          name: 'My Bot',
        },
        status: 'open',
        exchange: 'binance',
        exchangeUUID: 'exchange-uuid',
        paperContext: false,
      },
    ],
    meta: {
      page: 1,
      total: 1,
      count: 1,
      onPage: 1,
      fields: [
        '_id',
        'uuid',
        'settings.name',
        'status',
        'exchange',
        'exchangeUUID',
        'paperContext',
      ],
    },
  },

  custom: {
    status: 'ok',
    reason: null,
    data: [
      {
        _id: '507f1f77bcf86cd799439011',
        settings: {
          name: 'My Bot',
          pair: ['BTC_USDT', 'ETH_USDT'],
        },
        profit: {
          total: 125.5,
        },
      },
    ],
    meta: {
      page: 1,
      total: 1,
      count: 1,
      onPage: 1,
      fields: ['_id', 'settings.name', 'settings.pair', 'profit.total'],
    },
  },
}

/**
 * Performance Testing
 *
 * Compare response sizes between different field selections
 */

export const performanceTest = `
# Test response sizes
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=minimal" -w "Size: %{size_download} bytes\\n"
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=standard" -w "Size: %{size_download} bytes\\n"
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=extended" -w "Size: %{size_download} bytes\\n"
curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=full" -w "Size: %{size_download} bytes\\n"

# Expected results (100 bots):
# minimal:  ~45 KB
# standard: ~120 KB
# extended: ~280 KB
# all:      ~450 KB
`

export default {
  test1,
  test2,
  test3,
  test4,
  test5,
  test6,
  test7,
  test8,
  test9,
  test10,
  test11,
  test12,
  curlExamples,
  jsExamples,
  pythonExamples,
  expectedResponses,
  performanceTest,
}
