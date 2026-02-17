#!/usr/bin/env ts-node
/**
 * AI Documentation Generator for Gainium API v2
 *
 * This script generates comprehensive AI-friendly documentation from OpenAPI spec.
 * It includes code examples in Python, JavaScript/TypeScript, and CLI.
 *
 * Usage:
 *   npm run generate:ai-docs
 *   or
 *   ts-node src/utils/generate-ai-docs.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

interface OpenAPISpec {
  openapi: string
  info: any
  paths: Record<string, Record<string, any>>
  components: {
    schemas: Record<string, any>
    parameters: Record<string, any>
  }
}

interface OpenAPIEndpoint {
  operationId?: string
  summary?: string
  description?: string
  parameters?: any[]
  requestBody?: any
  responses?: any
  tags?: string[]
}

interface EndpointInfo {
  path: string
  method: string
  operationId: string
  summary: string
  description: string
  parameters: any[]
  requestBody?: any
  responses: any
  tags: string[]
}

class AIDocGenerator {
  private spec: OpenAPISpec
  private outputPath: string

  constructor(specPath: string, outputPath: string) {
    const specContent = fs.readFileSync(specPath, 'utf8')
    this.spec = yaml.load(specContent) as OpenAPISpec
    this.outputPath = outputPath
  }

  generate() {
    const content = this.buildDocumentation()
    fs.writeFileSync(this.outputPath, content)
    console.log(`✅ AI documentation generated: ${this.outputPath}`)
  }

  private buildDocumentation(): string {
    const sections = [
      this.generateHeader(),
      this.generateAuthenticationSection(),
      this.generateFieldSelectionSection(),
      this.generateCommonExamples(),
      this.generateEndpointsSection(),
      this.generateSchemasSection(),
      this.generateErrorHandlingSection(),
      this.generatePaginationSection(),
    ]

    return sections.join('\n\n')
  }

  private generateHeader(): string {
    return `# Gainium API v2.0 - AI Assistant Guide

This comprehensive guide provides everything needed to help users interact with the Gainium API v2.0.

## Overview

Gainium API v2.0 is a REST API for cryptocurrency trading bot management with advanced field selection capabilities that reduce payload sizes by 70-90%.

**Base URL:** \`https://api.gainium.io\`  
**Version:** 2.0.0  
**Authentication:** HMAC-SHA256 signatures

## Key Features

- **Field Selection**: Choose exactly which fields to return
- **Performance Optimized**: Up to 90% smaller payloads
- **Comprehensive**: Full CRUD operations for bots, deals, balances
- **Real-time**: WebSocket support (separate documentation)
- **Paper Trading**: Full simulation environment`
  }

  private generateAuthenticationSection(): string {
    return `## Authentication

All API requests require three headers:

| Header | Description | Example |
|--------|-------------|---------|
| \`token\` | Public API key | \`your-public-key\` |
| \`time\` | Request timestamp (ms) | \`${Date.now()}\` |
| \`signature\` | HMAC-SHA256 signature | \`calculated-signature\` |

### Signature Calculation
Signature = \`base64(hmac_sha256(secret, body + method + endpoint + timestamp))\`

### Python Example
\`\`\`python
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
\`\`\`

### JavaScript/TypeScript Example
\`\`\`javascript
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
\`\`\`

### CLI Example (curl)
\`\`\`bash
# Calculate signature (requires external script or tool)
TOKEN="your-public-key"
SECRET="your-api-secret"
TIMESTAMP=$(date +%s%3N)
BODY="{}"
METHOD="GET"
ENDPOINT="/api/v2/bots/dca"

# Use online tool or script to generate HMAC-SHA256 signature
SIGNATURE="calculated-signature-here"

curl -X GET "https://api.gainium.io/api/v2/bots/dca?fields=minimal" \\
  -H "token: $TOKEN" \\
  -H "time: $TIMESTAMP" \\
  -H "signature: $SIGNATURE" \\
  -H "Content-Type: application/json"
\`\`\``
  }

  private generateFieldSelectionSection(): string {
    return `## Field Selection

The most powerful feature of API v2.0 is field selection via the \`fields\` parameter.

### Field Presets

| Preset | Purpose | Payload Reduction |
|--------|---------|-------------------|
| \`minimal\` | Essential fields only | ~85% |
| \`standard\` | Common fields (default) | ~70% |
| \`extended\` | Additional useful fields | ~40% |
| \`full\` | All available fields | 0% |

### Custom Fields
Use dot notation for nested fields: \`settings.name,profit.total,status\`

### Examples

**Minimal DCA bots:**
\`?fields=minimal\` → Returns: \`_id, uuid, settings.name, status, exchange\`

**Custom selection:**
\`?fields=_id,uuid,settings.name,profit.totalUsd,status\` → Returns only specified fields

**Nested fields:**
\`?fields=settings.name,settings.pair,profit.total,profit.totalUsd\``
  }

  private generateCommonExamples(): string {
    return `## Common Usage Patterns

### Get All DCA Bots (Minimal)
\`\`\`python
import requests

response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={"fields": "minimal"},
    headers=headers
)
bots = response.json()["data"]
\`\`\`

### Get Specific Bot Details
\`\`\`python
# Get bot with full settings
response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={"fields": "extended"},
    headers=headers
)
\`\`\`

### Filter Active Bots
\`\`\`python
response = requests.get(
    "https://api.gainium.io/api/v2/bots/dca",
    params={
        "fields": "standard",
        "status": "open",
        "paperContext": "false"
    },
    headers=headers
)
\`\`\`

### Start a Bot
\`\`\`python
response = requests.post(
    "https://api.gainium.io/api/v2/bots/start",
    params={
        "botId": "550e8400-e29b-41d4-a716-446655440000",
        "type": "dca"
    },
    headers=headers
)
\`\`\``
  }

  private generateEndpointsSection(): string {
    let content = `## API Endpoints\n\n`

    // Group endpoints by tag
    const endpointsByTag: Record<string, EndpointInfo[]> = {}

    for (const [path, methods] of Object.entries(this.spec.paths)) {
      for (const [method, endpoint] of Object.entries(methods)) {
        const endpointData = endpoint as OpenAPIEndpoint
        if (
          endpointData &&
          typeof endpointData === 'object' &&
          endpointData.tags
        ) {
          const tag = endpointData.tags[0] || 'Other'
          if (!endpointsByTag[tag]) {
            endpointsByTag[tag] = []
          }
          endpointsByTag[tag].push({
            path,
            method: method.toUpperCase(),
            operationId: endpointData.operationId || '',
            summary: endpointData.summary || '',
            description: endpointData.description || '',
            parameters: endpointData.parameters || [],
            requestBody: endpointData.requestBody,
            responses: endpointData.responses || {},
            tags: endpointData.tags,
          })
        }
      }
    }

    for (const [tag, endpoints] of Object.entries(endpointsByTag)) {
      content += `### ${tag}\n\n`

      for (const endpoint of endpoints) {
        content += this.generateEndpointExample(endpoint)
      }
    }

    return content
  }

  private generateEndpointExample(endpoint: EndpointInfo): string {
    const hasBody = endpoint.requestBody !== undefined

    let example = `#### ${endpoint.method} ${endpoint.path}\n`
    example += `**${endpoint.summary}**\n\n`

    if (endpoint.description) {
      example += `${endpoint.description}\n\n`
    }

    // Python example
    example += `**Python:**\n\`\`\`python\n`

    if (hasBody) {
      example += this.generatePythonPostExample(endpoint)
    } else {
      example += this.generatePythonGetExample(endpoint)
    }

    example += `\`\`\`\n\n`

    // JavaScript example
    example += `**JavaScript/TypeScript:**\n\`\`\`javascript\n`

    if (hasBody) {
      example += this.generateJsPostExample(endpoint)
    } else {
      example += this.generateJsGetExample(endpoint)
    }

    example += `\`\`\`\n\n`

    // CLI example
    example += `**CLI (curl):**\n\`\`\`bash\n`
    example += this.generateCurlExample(endpoint)
    example += `\`\`\`\n\n---\n\n`

    return example
  }

  private generatePythonGetExample(endpoint: EndpointInfo): string {
    const url = `"https://api.gainium.io${endpoint.path}"`
    const params = endpoint.parameters
      .filter((p) => p.in === 'query' && p.name !== 'fields')
      .slice(0, 2) // Limit examples
      .map((p) => `"${p.name}": "example-value"`)
      .join(', ')

    if (params) {
      return `response = requests.get(
    ${url},
    params={${params.length > 0 ? params + ', ' : ''}"fields": "standard"},
    headers=headers
)
data = response.json()["data"]`
    } else {
      return `response = requests.get(
    ${url},
    params={"fields": "standard"},
    headers=headers
)
data = response.json()["data"]`
    }
  }

  private generatePythonPostExample(endpoint: EndpointInfo): string {
    const url = `"https://api.gainium.io${endpoint.path}"`
    const queryParams = endpoint.parameters
      .filter((p) => p.in === 'query')
      .slice(0, 2)
      .map((p) => `"${p.name}": "example-value"`)
      .join(', ')

    let example = `payload = {
    "exampleField": "exampleValue"
}

response = requests.post(
    ${url},`

    if (queryParams) {
      example += `\n    params={${queryParams}},`
    }

    example += `
    json=payload,
    headers=headers
)
result = response.json()`

    return example
  }

  private generateJsGetExample(endpoint: EndpointInfo): string {
    const url = `'https://api.gainium.io${endpoint.path}'`
    const params = endpoint.parameters
      .filter((p) => p.in === 'query' && p.name !== 'fields')
      .slice(0, 2)
      .map((p) => `${p.name}: 'example-value'`)
      .join(', ')

    return `const params = new URLSearchParams({
    ${params}${params ? ', ' : ''}fields: 'standard'
});

const response = await fetch(\`${url}?\${params}\`, {
    method: 'GET',
    headers
});
const data = await response.json();`
  }

  private generateJsPostExample(endpoint: EndpointInfo): string {
    const url = `'https://api.gainium.io${endpoint.path}'`

    return `const payload = {
    exampleField: 'exampleValue'
};

const response = await fetch(${url}, {
    method: '${endpoint.method}',
    headers: {
        ...headers,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
});
const result = await response.json();`
  }

  private generateCurlExample(endpoint: EndpointInfo): string {
    let curl = `curl -X ${endpoint.method} "https://api.gainium.io${endpoint.path}`

    const queryParams = endpoint.parameters
      .filter((p) => p.in === 'query')
      .slice(0, 2)
      .map((p) => `${p.name}=example-value`)
      .join('&')

    if (queryParams) {
      curl += `?${queryParams}&fields=standard"`
    } else {
      curl += `?fields=standard"`
    }

    curl += ` \\
  -H "token: $TOKEN" \\
  -H "time: $TIMESTAMP" \\
  -H "signature: $SIGNATURE"`

    if (endpoint.requestBody) {
      curl += ` \\
  -H "Content-Type: application/json" \\
  -d '{"exampleField": "exampleValue"}'`
    }

    return curl
  }

  private generateSchemasSection(): string {
    let content = `## Key Data Schemas\n\n`

    // Get important schemas
    const importantSchemas = [
      'DCABotSettings',
      'ComboBotSettings',
      'BotSettings',
      'SettingsIndicators',
      'MultiTP',
      'DCACustom',
    ]

    for (const schemaName of importantSchemas) {
      const schema = this.spec.components.schemas[schemaName]
      if (schema) {
        content += this.generateSchemaExample(schemaName, schema)
      }
    }

    return content
  }

  private generateSchemaExample(name: string, _schema: any): string {
    // Since these are references to external generated schemas,
    // we'll create representative examples
    const examples: Record<string, any> = {
      DCABotSettings: {
        name: 'BTC Long Strategy',
        pair: ['BTC/USDT'],
        strategy: 'LONG',
        baseOrderSize: '100',
        tpPerc: '2.5',
        step: '1.5',
        ordersCount: 5,
        useDca: true,
        useTp: true,
      },
      ComboBotSettings: {
        gridLevel: '5',
        newBalance: false,
        feeOrder: true,
      },
      BotSettings: {
        pair: 'BTC/USDT',
        topPrice: 55000,
        lowPrice: 45000,
        levels: 10,
        budget: 10000,
      },
      SettingsIndicators: {
        type: 'RSI',
        indicatorLength: 14,
        indicatorValue: '70',
        indicatorCondition: 'gt',
      },
    }

    const example = examples[name] || {
      example: 'field',
      value: 'sample-value',
    }

    return `### ${name}\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\`\n\n`
  }

  private generateErrorHandlingSection(): string {
    return `## Error Handling

### Response Structure
\`\`\`json
{
  "status": "NOTOK",
  "reason": "Error description"
}
\`\`\`

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
\`\`\`python
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
\`\`\``
  }

  private generatePaginationSection(): string {
    return `## Pagination

All list endpoints support pagination:

| Parameter | Default | Description |
|-----------|---------|-------------|
| \`page\` | 1 | Page number (1-based) |

### Response Structure
\`\`\`json
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
\`\`\`

### Python Pagination Example
\`\`\`python
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
\`\`\`

---

*This documentation is automatically generated from the OpenAPI specification.*
*Last updated: ${new Date().toISOString()}*`
  }
}

// Main execution
const main = () => {
  const specPath = path.join(__dirname, '../server/v2/openapi-v2.yaml')
  const outputPath = path.join(__dirname, '../server/v2/AI_API_GUIDE.md')

  const generator = new AIDocGenerator(specPath, outputPath)
  generator.generate()
}

// Execute if this file is run directly
main()
