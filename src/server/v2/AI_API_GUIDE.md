# Gainium API v2.0 - AI Assistant Guide

This comprehensive guide provides everything needed to help users interact with the Gainium API v2.0.

## Overview

Gainium API v2.0 is a REST API for cryptocurrency trading bot management with advanced field selection capabilities that reduce payload sizes by 70-90%.

**Base URL:** `https://api.gainium.io`  
**Version:** 2.0.0  
**Authentication:** HMAC-SHA256 signatures

## Key Features

- **Field Selection**: Choose exactly which fields to return
- **Performance Optimized**: Up to 90% smaller payloads
- **Comprehensive**: Full CRUD operations for bots, deals, balances
- **Real-time**: WebSocket support (separate documentation)
- **Paper Trading**: Full simulation environment

## Authentication

All API requests require three headers:

| Header | Description | Example |
|--------|-------------|---------|
| `token` | Public API key | `your-public-key` |
| `time` | Request timestamp (ms) | `1771513334744` |
| `signature` | HMAC-SHA256 signature | `calculated-signature` |

### Signature Calculation
Signature = `base64(hmac_sha256(secret, body + method + endpoint + timestamp))`

### Python Example
```python
import hmac
import hashlib
import base64
import time
import requests

def create_signature(secret, body, method, endpoint, timestamp):
    message = body + method + endpoint + str(timestamp)
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(signature).decode('utf-8')

# Usage
secret = "your-api-secret"
body = "{}"  # JSON string
method = "GET"
endpoint = "/api/v2/bots/dca"
timestamp = int(time.time() * 1000)

signature = create_signature(secret, body, method, endpoint, timestamp)

headers = {
    "token": "your-public-key",
    "time": str(timestamp),
    "signature": signature,
    "Content-Type": "application/json"
}
```

### JavaScript/TypeScript Example
```javascript
const crypto = require('crypto');

function createSignature(secret, body, method, endpoint, timestamp) {
    const message = body + method + endpoint + timestamp;
    return crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('base64');
}

// Usage
const secret = 'your-api-secret';
const body = '{}';
const method = 'GET';
const endpoint = '/api/v2/bots/dca';
const timestamp = Date.now();

const signature = createSignature(secret, body, method, endpoint, timestamp);

const headers = {
    'token': 'your-public-key',
    'time': timestamp.toString(),
    'signature': signature,
    'Content-Type': 'application/json'
};
```

### CLI Example (curl)
```bash
# Calculate signature (requires external script or tool)
TOKEN="your-public-key"
SECRET="your-api-secret"
TIMESTAMP=$(date +%s%3N)
BODY="{}"
METHOD="GET"
ENDPOINT="/api/v2/bots/dca"

# Use online tool or script to generate HMAC-SHA256 signature
SIGNATURE="calculated-signature-here"

curl -X GET "https://api.gainium.io/api/v2/bots/dca?fields=minimal" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json"
```

## Field Selection

The most powerful feature of API v2.0 is field selection via the `fields` parameter.

### Field Presets

| Preset | Purpose | Payload Reduction |
|--------|---------|-------------------|
| `minimal` | Essential fields only | ~85% |
| `standard` | Common fields (default) | ~70% |
| `extended` | Additional useful fields | ~40% |
| `full` | All available fields | 0% |

### Custom Fields
Use dot notation for nested fields: `settings.name,profit.total,status`

### Examples

**Minimal DCA bots:**
`?fields=minimal` → Returns: `_id, uuid, settings.name, status, exchange`

**Custom selection:**
`?fields=_id,uuid,settings.name,profit.totalUsd,status` → Returns only specified fields

**Nested fields:**
`?fields=settings.name,settings.pair,profit.total,profit.totalUsd`

## Common Usage Patterns

### Get All DCA Bots (Minimal)
```python
import requests

response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={"fields": "minimal"},
    headers=headers
)
bots = response.json()["data"]
```

### Get Specific Bot Details
```python
# Get bot with full settings
response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={"fields": "extended"},
    headers=headers
)
```

### Filter Active Bots
```python
response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={
        "fields": "standard",
        "status": "open",
        "paperContext": "false"
    },
    headers=headers
)
```

### Start a Bot
```python
response = requests.post(
    "https://api.gainium.io/api/v2/bots/start",
    params={
        "botId": "550e8400-e29b-41d4-a716-446655440000",
        "type": "dca"
    },
    headers=headers
)
```

## API Endpoints

### Bots

#### GET /api/v2/bots/dca
**Get DCA Bots**

Retrieve a list of DCA (Dollar Cost Averaging) bots with optional field selection.

**Field Presets:**
- `minimal`: _id, uuid, settings.name, status, exchange, exchangeUUID, paperContext
- `standard`: minimal + settings.pair, profit.*, deals.*, createdAt, updatedAt
- `extended`: standard + settings.baseOrderSize, cost, workingTimeNumber, profitToday, statusReason
- `full`: All available fields

**Performance:** Using `minimal` reduces response size by ~85%, `standard` by ~70%


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={"status": "example-value", "paperContext": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    status: 'example-value', paperContext: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/bots/dca'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/bots/dca?status=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### GET /api/v2/bots/combo
**Get Combo Bots**

Retrieve a list of Combo (Long/Short) bots with optional field selection.

**Field Presets:**
- `minimal`: _id, uuid, settings.name, status, exchange, exchangeUUID, paperContext
- `standard`: minimal + settings.pair, profit.*, deals.*, createdAt, updatedAt
- `extended`: standard + settings configuration, cost, workingTimeNumber, profitToday, dealsStatsForBot
- `full`: All available fields


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/bots/combo",
    params={"status": "example-value", "paperContext": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    status: 'example-value', paperContext: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/bots/combo'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/bots/combo?status=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### GET /api/v2/bots/grid
**Get Grid Bots**

Retrieve a list of Grid bots with optional field selection.

**Field Presets:**
- `minimal`: _id, uuid, settings.name, status, exchange, exchangeUUID, paperContext
- `standard`: minimal + settings.symbol, profit.*, levels.*, createdAt, updatedAt
- `extended`: standard + grid configuration (gridLevels, lowerPrice, upperPrice), cost, prices
- `full`: All available fields


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/bots/grid",
    params={"status": "example-value", "paperContext": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    status: 'example-value', paperContext: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/bots/grid'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/bots/grid?status=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### POST /api/v2/createDCABot
**Create a new DCA bot**

Create a new DCA (Dollar Cost Averaging) bot with specified settings.

Requires write permission of API keys.


**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/createDCABot",
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/createDCABot', {
    method: 'POST',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/createDCABot?fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### POST /api/v2/updateDCABot
**Update DCA bot settings**

Requires write permission of API keys.

**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/updateDCABot",
    params={"botId": "example-value", "paperContext": "example-value"},
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/updateDCABot', {
    method: 'POST',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/updateDCABot?botId=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### POST /api/v2/updateComboBot
**Update Combo bot settings**

Requires write permission of API keys.

**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/updateComboBot",
    params={"botId": "example-value", "paperContext": "example-value"},
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/updateComboBot', {
    method: 'POST',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/updateComboBot?botId=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### POST /api/v2/changeBotPairs
**Change bot pairs**

Requires write permission of API keys. Format of the pair is {base}_{quote}, example BTC_USDT

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/changeBotPairs",
    params={"botId": "example-value", "botName": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botId: 'example-value', botName: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/changeBotPairs'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/changeBotPairs?botId=example-value&botName=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### POST /api/v2/startBot
**Start bot**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/startBot",
    params={"botId": "example-value", "type": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botId: 'example-value', type: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/startBot'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/startBot?botId=example-value&type=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### POST /api/v2/restoreBot
**Restore bot from archive**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/restoreBot",
    params={"botId": "example-value", "type": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botId: 'example-value', type: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/restoreBot'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/restoreBot?botId=example-value&type=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### PUT /api/v2/cloneComboBot
**Clone Combo bot settings**

Requires write permission of API keys.

**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/cloneComboBot",
    params={"botId": "example-value", "paperContext": "example-value"},
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/cloneComboBot', {
    method: 'PUT',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X PUT "https://api.gainium.io/api/v2/cloneComboBot?botId=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### PUT /api/v2/cloneDCABot
**Clone DCA bot**

Requires write permission of API keys.

**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/cloneDCABot",
    params={"botId": "example-value", "paperContext": "example-value"},
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/cloneDCABot', {
    method: 'PUT',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X PUT "https://api.gainium.io/api/v2/cloneDCABot?botId=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### DELETE /api/v2/stopBot
**Stop bot**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/stopBot",
    params={"botId": "example-value", "botType": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botId: 'example-value', botType: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/stopBot'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X DELETE "https://api.gainium.io/api/v2/stopBot?botId=example-value&botType=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### DELETE /api/v2/archiveBot
**Archive bot**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/archiveBot",
    params={"botId": "example-value", "botType": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botId: 'example-value', botType: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/archiveBot'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X DELETE "https://api.gainium.io/api/v2/archiveBot?botId=example-value&botType=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

### Deals

#### GET /api/v2/deals
**Get Deals**

Retrieve a list of deals (both DCA and Combo) with optional field selection.

**Query Parameters:**
- `type`: Filter by deal type (`dca` or `combo`)
- `status`: Filter by status (`open`, `closed`, `start`, `error`, `canceled`)
- `botId`: Filter by bot UUID
- `terminal`: Filter by deal type (false for regular, true for terminal)
- `paperContext`: Filter by paper/real trading context

**Field Presets:**
- `minimal`: _id, botId, status, symbol.symbol, profit.*, createTime
- `standard`: minimal + exchange info, avgPrice, lastPrice, levels, cost, value, timestamps
- `extended`: standard + settings, balances, feePaid, usage, stats, strategy
- `full`: All available fields


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/deals",
    params={"type": "example-value", "status": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    type: 'example-value', status: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/deals'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/deals?type=example-value&status=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### POST /api/v2/updateDCADeal
**Update DCA deal settings**

Requires write permission of API keys.

**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/updateDCADeal",
    params={"dealId": "example-value", "paperContext": "example-value"},
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/updateDCADeal', {
    method: 'POST',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/updateDCADeal?dealId=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### POST /api/v2/updateComboDeal
**Update deal settings**

Requires write permission of API keys.

**Python:**
```python
payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    "https://api.gainium.io/api/v2/updateComboDeal",
    params={"dealId": "example-value", "paperContext": "example-value"},
    json=payload,
    headers=headers
)
result = response.json()```

**JavaScript/TypeScript:**
```javascript
const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch('https://api.gainium.io/api/v2/updateComboDeal', {
    method: 'POST',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/updateComboDeal?dealId=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{"exampleField": "exampleValue"}'```

---

#### POST /api/v2/addFunds
**Add funds to deal**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/addFunds",
    params={"dealId": "example-value", "botId": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    dealId: 'example-value', botId: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/addFunds'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/addFunds?dealId=example-value&botId=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### POST /api/v2/reduceFunds
**Reduce funds from deal**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/reduceFunds",
    params={"dealId": "example-value", "botId": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    dealId: 'example-value', botId: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/reduceFunds'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/reduceFunds?dealId=example-value&botId=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### POST /api/v2/startDeal
**Start bot deal**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/startDeal",
    params={"botId": "example-value", "symbol": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botId: 'example-value', symbol: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/startDeal'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X POST "https://api.gainium.io/api/v2/startDeal?botId=example-value&symbol=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### DELETE /api/v2/closeDeal/{dealId}
**Close deal**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/closeDeal/{dealId}",
    params={"type": "example-value", "botType": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    type: 'example-value', botType: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/closeDeal/{dealId}'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X DELETE "https://api.gainium.io/api/v2/closeDeal/{dealId}?type=example-value&botType=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### DELETE /api/v2/cancelDeal/{dealId}
**Cancel deal**

Requires write permission of API keys.

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/cancelDeal/{dealId}",
    params={"botType": "example-value", "paperContext": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    botType: 'example-value', paperContext: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/cancelDeal/{dealId}'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X DELETE "https://api.gainium.io/api/v2/cancelDeal/{dealId}?botType=example-value&paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

### User

#### GET /api/v2/user/balances
**Get User Balances**

Retrieve user balances across all exchanges with optional field selection.

**Query Parameters:**
- `exchangeId`: Filter by exchange connection ID  
- `asset`: Filter by specific asset (e.g., BTC, USDT)
- `assets`: Filter by multiple assets (comma-separated)
- `paperContext`: Filter by paper/real trading context

**Field Presets:**
- `minimal`: asset, free, locked, exchangeUUID
- `standard`: minimal + exchange, paperContext
- `full`: All available fields (same as standard for balances)


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/user/balances",
    params={"exchangeId": "example-value", "asset": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    exchangeId: 'example-value', asset: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/user/balances'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/user/balances?exchangeId=example-value&asset=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### GET /api/v2/user/globalVars
**Get Global Variables**

Retrieve user's global variables with pagination.

**Query Parameters:**
- `page`: Page number (default: 1)

Global variables are user-defined values that can be referenced in bot configurations.


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/user/globalVars",
    params={"page": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    page: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/user/globalVars'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/user/globalVars?page=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### GET /api/v2/user/exchanges
**Get User Exchanges**

Retrieve user's connected exchanges with optional filtering

**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/user/exchanges",
    params={"paperContext": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    paperContext: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/user/exchanges'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/user/exchanges?paperContext=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

### General

#### GET /api/v2/exchanges
**Get supported exchanges**

A list of supported exchanges


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/exchanges",
    params={"fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/exchanges'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/exchanges?fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---

#### GET /api/v2/screener
**Get Crypto Screener Data**

Retrieve crypto screening data with market metrics and optional field selection.

**Query Parameters:**
- `category`: Filter by category (e.g., "Layer 1", "DeFi")
- `minMarketCap`: Minimum market cap filter
- `maxMarketCap`: Maximum market cap filter
- `minVolume`: Minimum 24h volume filter
- `sort`: Sort field (default: marketCapRank)
- `order`: Sort order (`asc` or `desc`, default: asc)

**Field Presets:**
- `minimal`: symbol, name, currentPrice, priceChangePercentage24h, totalVolume, marketCap, marketCapRank
- `standard`: minimal + 1h/7d price changes, volume change, market cap change, volatility, liquidity, category
- `extended`: standard + 30d/1y changes, ATH/ATL data, multi-day volatility, exchanges, sparkline
- `full`: All available fields

**Note:** Requires active subscription with screener access.


**Python:**
```python
response = requests.get(
    "https://api.gainium.io/api/v2/screener",
    params={"category": "example-value", "minMarketCap": "example-value", "fields": "standard"},
    headers=headers
)
data = response.json()["data"]```

**JavaScript/TypeScript:**
```javascript
const params = new URLSearchParams({
    category: 'example-value', minMarketCap: 'example-value', fields: 'standard'
});

const response = await fetch(`'https://api.gainium.io/api/v2/screener'?${params}`, {
    method: 'GET',
    headers
});
const data = await response.json();```

**CLI (curl):**
```bash
curl -X GET "https://api.gainium.io/api/v2/screener?category=example-value&minMarketCap=example-value&fields=standard" \
  -H "token: $TOKEN" \
  -H "time: $TIMESTAMP" \
  -H "signature: $SIGNATURE"```

---



## Key Data Schemas

### DCABotSettings
```json
{
  "name": "BTC Long Strategy",
  "pair": [
    "BTC/USDT"
  ],
  "strategy": "LONG",
  "baseOrderSize": "100",
  "tpPerc": "2.5",
  "step": "1.5",
  "ordersCount": 5,
  "useDca": true,
  "useTp": true
}
```

### ComboBotSettings
```json
{
  "gridLevel": "5",
  "newBalance": false,
  "feeOrder": true
}
```

### BotSettings
```json
{
  "pair": "BTC/USDT",
  "topPrice": 55000,
  "lowPrice": 45000,
  "levels": 10,
  "budget": 10000
}
```

### SettingsIndicators
```json
{
  "type": "RSI",
  "indicatorLength": 14,
  "indicatorValue": "70",
  "indicatorCondition": "gt"
}
```

### MultiTP
```json
{
  "example": "field",
  "value": "sample-value"
}
```

### DCACustom
```json
{
  "example": "field",
  "value": "sample-value"
}
```



## Error Handling

### Response Structure
```json
{
  "status": "NOTOK",
  "reason": "Error description"
}
```

### Common HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad Request | Check parameters and request format |
| 401 | Unauthorized | Verify authentication headers |
| 403 | Forbidden | Check API key permissions |
| 404 | Not Found | Verify endpoint URL and resource ID |
| 429 | Rate Limited | Implement backoff and retry |
| 500 | Server Error | Contact support if persists |

### Python Error Handling
```python
try:
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    
    if data["status"] == "NOTOK":
        print(f"API Error: {data['reason']}")
    else:
        return data["data"]
        
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
```

## Pagination

All list endpoints support pagination:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number (1-based) |

### Response Structure
```json
{
  "status": "OK",
  "reason": null,
  "data": [...],
  "meta": {
    "page": 1,
    "total": 150,
    "count": 150,
    "onPage": 10,
    "fields": ["_id", "uuid", "settings.name"]
  }
}
```

### Python Pagination Example
```python
def get_all_bots():
    all_bots = []
    page = 1
    
    while True:
        response = requests.get(
            "https://api.gainium.io/api/v2/bots/dca",
            params={"page": page, "fields": "minimal"},
            headers=headers
        )
        data = response.json()
        
        all_bots.extend(data["data"])
        
        # Check if we have more pages
        if len(data["data"]) < 10:  # Fixed page size
            break
        page += 1
    
    return all_bots
```

---

*This documentation is automatically generated from the OpenAPI specification.*
*Last updated: 2026-02-19T15:02:14.745Z*