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
  private schemasPath: string

  constructor(specPath: string, outputPath: string) {
    const specContent = fs.readFileSync(specPath, 'utf8')
    this.spec = yaml.load(specContent) as OpenAPISpec
    this.outputPath = outputPath
    this.schemasPath = outputPath.replace('AI_API_GUIDE.md', 'SCHEMAS.md')
  }

  generate() {
    // Generate main lightweight guide
    const mainContent = this.buildDocumentation()
    fs.writeFileSync(this.outputPath, mainContent)
    console.log(`✅ AI documentation generated: ${this.outputPath}`)

    // Generate detailed schemas file
    const schemasContent = this.buildSchemasDocument()
    fs.writeFileSync(this.schemasPath, schemasContent)
    console.log(`✅ Schemas documentation generated: ${this.schemasPath}`)
  }

  private buildDocumentation(): string {
    const sections = [
      this.generateHeader(),
      this.generateAuthenticationSection(),
      this.generateFieldSelectionSection(),
      this.generateCommonExamples(),
      this.generateEndpointsTable(),
      this.generateErrorHandlingSection(),
      this.generatePaginationSection(),
      this.generateSchemasReference(),
    ]

    return sections.join('\n\n')
  }

  private buildSchemasDocument(): string {
    const sections = [
      this.generateSchemasHeader(),
      this.generateDetailedSchemas(),
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

  private generateEndpointsTable(): string {
    let content = `## API Endpoints

All endpoints support field selection via \`?fields=minimal|standard|extended|full\` parameter.

For detailed schema references, see [SCHEMAS.md](./SCHEMAS.md).

`

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
      content += `| Method | URL | Input Schema | Response | Description |\n`
      content += `|--------|-----|--------------|----------|-------------|\n`

      for (const endpoint of endpoints) {
        const inputSchema = this.getInputSchemaReference(endpoint)
        const responseSchema = this.getResponseSchemaReference(endpoint)

        content += `| ${endpoint.method} | \`${endpoint.path}\` | ${inputSchema} | ${responseSchema} | ${endpoint.summary} |\n`
      }

      content += '\n'
    }

    return content
  }

  private getInputSchemaReference(endpoint: EndpointInfo): string {
    if (!endpoint.requestBody) {
      const queryParams = endpoint.parameters.filter(
        (p) => p.in === 'query' && p.name !== 'fields',
      )
      if (queryParams.length === 0) return 'Query params only'
      return 'Query params'
    }

    // Try to extract schema reference from request body
    const requestBody = endpoint.requestBody
    const content = requestBody?.content?.['application/json']

    if (!content?.schema) return 'Request body'

    const schema = content.schema

    // Handle direct $ref
    if (schema.$ref) {
      const schemaName = schema.$ref.split('/').pop()
      return `[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})`
    }

    // Handle allOf constructions
    if (schema.allOf) {
      for (const item of schema.allOf) {
        if (item.$ref) {
          const schemaName = item.$ref.split('/').pop()
          return `[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})`
        }
      }
    }

    // Handle oneOf constructions
    if (schema.oneOf) {
      const refs = schema.oneOf
        .filter((item: any) => item.$ref)
        .map((item: any) => {
          const schemaName = item.$ref.split('/').pop()
          return `[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})`
        })

      if (refs.length > 0) {
        return refs.join(' | ')
      }
    }

    return 'Request body'
  }

  private getResponseSchemaReference(endpoint: EndpointInfo): string {
    const ok200 = endpoint.responses['200']
    if (!ok200?.content?.['application/json']?.schema) return 'Success response'

    const schema = ok200.content['application/json'].schema

    // Handle direct schema reference
    if (schema.$ref) {
      const schemaName = schema.$ref.split('/').pop()
      return `[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})`
    }

    // Handle schema with properties.data reference
    if (schema.properties?.data) {
      const dataSchema = schema.properties.data

      // Handle array of items with $ref
      if (dataSchema.type === 'array' && dataSchema.items?.$ref) {
        const schemaName = dataSchema.items.$ref.split('/').pop()
        return `Array<[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})>`
      }

      // Handle direct $ref on data property
      if (dataSchema.$ref) {
        const schemaName = dataSchema.$ref.split('/').pop()
        return `[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})`
      }
    }

    // Handle allOf constructions
    if (schema.allOf) {
      for (const item of schema.allOf) {
        if (item.properties?.data) {
          const dataSchema = item.properties.data

          if (dataSchema.type === 'array' && dataSchema.items?.$ref) {
            const schemaName = dataSchema.items.$ref.split('/').pop()
            return `Array<[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})>`
          }

          if (dataSchema.$ref) {
            const schemaName = dataSchema.$ref.split('/').pop()
            return `[${schemaName}](./SCHEMAS.md#${schemaName.toLowerCase()})`
          }
        }
      }
    }

    return 'Success response'
  }

  private generateSchemasReference(): string {
    return `## Schemas

For detailed schema definitions with field descriptions and examples, see [SCHEMAS.md](./SCHEMAS.md).

### Quick Schema Reference

| Schema | Purpose |
|--------|---------|
| DCABotSettings | DCA bot configuration |
| ComboBotSettings | Combo bot configuration |
| GridBotSettings | Grid bot configuration |
| BotSettings | Base bot settings |
| DealSettings | Deal configuration |
| SettingsIndicators | Technical indicators |
| MultiTP | Multiple take-profit settings |
| DCACustom | Custom DCA configuration |`
  }

  private generateSchemasHeader(): string {
    return `# Gainium API v2.0 - Schema Reference

This document contains detailed schema definitions for all API endpoints.

## Overview

All schemas include field descriptions, types, validation rules, and examples.
This documentation is automatically generated from the OpenAPI specification.

**Last Updated:** ${new Date().toISOString()}

---`
  }

  private generateDetailedSchemas(): string {
    let content = ''

    // Get all schemas from the OpenAPI spec
    const schemas = this.spec.components.schemas || {}
    const schemaNames = Object.keys(schemas).sort()

    for (const schemaName of schemaNames) {
      const schema = schemas[schemaName]
      content += this.generateDetailedSchemaSection(schemaName, schema)
      content += '\n---\n\n'
    }

    return content
  }

  private generateDetailedSchemaSection(name: string, schema: any): string {
    let section = `## ${name}\n\n`

    if (schema.description) {
      section += `${schema.description}\n\n`
    }

    if (schema.type === 'object' && schema.properties) {
      section += '### Fields\n\n'
      section += '| Field | Type | Required | Description |\n'
      section += '|-------|------|----------|-------------|\n'

      const required = schema.required || []

      for (const [fieldName, fieldSchema] of Object.entries(
        schema.properties,
      )) {
        const field = fieldSchema as any
        const isRequired = required.includes(fieldName)
        const type = this.getFieldType(field)
        const description = field.description || ''

        section += `| \`${fieldName}\` | ${type} | ${isRequired ? 'Yes' : 'No'} | ${description} |\n`
      }
      section += '\n'
    }

    // Add example if available
    const example = this.generateSchemaExample(name, schema)
    if (example) {
      section += '### Example\n\n'
      section += '```json\n'
      section += JSON.stringify(example, null, 2)
      section += '\n```\n\n'
    }

    return section
  }

  private getFieldType(field: any): string {
    if (field.$ref) {
      const refName = field.$ref.split('/').pop()
      return `[${refName}](#${refName.toLowerCase()})`
    }

    if (field.type === 'array') {
      const itemType = field.items?.$ref
        ? `[${field.items.$ref.split('/').pop()}](#${field.items.$ref.split('/').pop().toLowerCase()})`
        : field.items?.type || 'any'
      return `Array<${itemType}>`
    }

    if (field.enum) {
      return `enum: \`${field.enum.join('|')}\``
    }

    return field.type || 'any'
  }

  private generateSchemaExample(name: string, schema: any): any {
    // First check for predefined examples
    const predefinedExamples: Record<string, any> = {
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
      APIResponse: {
        status: 'OK',
        reason: null,
      },
      BalanceMinimal: {
        asset: 'BTC',
        free: '0.05123',
        locked: '0.00000',
        exchangeUUID: '550e8400-e29b-41d4-a716-446655440000',
      },
    }

    if (predefinedExamples[name]) {
      return predefinedExamples[name]
    }

    // Generate example from schema structure
    return this.generateExampleFromSchema(schema)
  }

  private generateExampleFromSchema(schema: any): any {
    if (!schema || typeof schema !== 'object')
      return { exampleField: 'example-value' }

    // Handle $ref - provide a meaningful example instead of just ref name
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()
      return this.getExampleForRefSchema(refName)
    }

    // Handle different schema types
    switch (schema.type) {
      case 'object':
        if (schema.properties) {
          const example: any = {}
          for (const [propName, propSchema] of Object.entries(
            schema.properties,
          )) {
            example[propName] = this.generateValueFromProperty(
              propName,
              propSchema as any,
            )
          }
          return example
        }
        return {}

      case 'array':
        if (schema.items) {
          const itemExample = this.generateExampleFromSchema(schema.items)
          return [itemExample]
        }
        return []

      case 'string':
        if (schema.enum) return schema.enum[0]
        if (schema.format === 'date-time') return '2024-01-15T10:30:00.000Z'
        if (schema.format === 'uuid')
          return '550e8400-e29b-41d4-a716-446655440000'
        return this.getStringExample(schema.description || '')

      case 'number':
      case 'integer':
        if (schema.enum) return schema.enum[0]
        return schema.minimum || 0

      case 'boolean':
        return true

      default:
        return { exampleField: 'example-value' }
    }
  }

  private getExampleForRefSchema(refName: string): any {
    // Provide meaningful examples for common referenced schemas
    const refExamples: Record<string, any> = {
      DCABotExtended: {
        _id: '550e8400-e29b-41d4-a716-446655440000',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        settings: {
          name: 'BTC Long Strategy',
          pair: ['BTC/USDT'],
          strategy: 'LONG',
          baseOrderSize: '100',
          tpPerc: '2.5',
        },
        status: 'active',
        exchange: 'binance',
        profit: {
          total: '125.50',
          totalUsd: '125.50',
        },
        deals: {
          active: 1,
          total: 5,
        },
      },
      DCABotStandard: {
        _id: '550e8400-e29b-41d4-a716-446655440000',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        settings: {
          name: 'BTC Long Strategy',
          pair: ['BTC/USDT'],
        },
        status: 'active',
        exchange: 'binance',
      },
      DCABotMinimal: {
        _id: '550e8400-e29b-41d4-a716-446655440000',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        settings: {
          name: 'BTC Long Strategy',
        },
        status: 'active',
      },
      DCADealExtended: {
        _id: '550e8400-e29b-41d4-a716-446655440000',
        botId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'open',
        symbol: {
          symbol: 'BTC/USDT',
        },
        profit: {
          total: '25.50',
          totalUsd: '25.50',
          percentage: '2.5',
        },
        avgPrice: '45000.00',
        cost: '1000.00',
      },
    }

    if (refExamples[refName]) {
      return refExamples[refName]
    }

    // Generate a generic example based on the schema name
    if (refName.includes('Bot')) {
      return {
        _id: '550e8400-e29b-41d4-a716-446655440000',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        settings: {
          name: 'Example Bot',
        },
        status: 'active',
        exchange: 'binance',
      }
    }

    if (refName.includes('Deal')) {
      return {
        _id: '550e8400-e29b-41d4-a716-446655440000',
        botId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'open',
        symbol: 'BTC/USDT',
        profit: {
          total: '25.50',
        },
      }
    }

    // Fallback
    return {
      _id: '550e8400-e29b-41d4-a716-446655440000',
      exampleField: `Referenced ${refName} schema`,
    }
  }

  private generateValueFromProperty(propName: string, propSchema: any): any {
    // Handle specific property name patterns
    const lowerName = propName.toLowerCase()

    if (lowerName.includes('uuid') || lowerName.includes('id')) {
      return '550e8400-e29b-41d4-a716-446655440000'
    }
    if (lowerName.includes('time') || lowerName.includes('date')) {
      return '2024-01-15T10:30:00.000Z'
    }
    if (lowerName.includes('name') || lowerName === 'symbol') {
      return 'BTC/USDT'
    }
    if (
      lowerName.includes('price') ||
      lowerName.includes('amount') ||
      lowerName.includes('balance')
    ) {
      return '1234.56'
    }
    if (lowerName.includes('status')) {
      return propSchema.enum ? propSchema.enum[0] : 'active'
    }
    if (lowerName.includes('perc') || lowerName.includes('percent')) {
      return '2.5'
    }

    // Generate from schema
    return this.generateExampleFromSchema(propSchema)
  }

  private getStringExample(description: string): string {
    const desc = description.toLowerCase()
    if (desc.includes('uuid') || desc.includes('identifier'))
      return '550e8400-e29b-41d4-a716-446655440000'
    if (desc.includes('timestamp') || desc.includes('time'))
      return '2024-01-15T10:30:00.000Z'
    if (desc.includes('symbol') || desc.includes('pair')) return 'BTC/USDT'
    if (desc.includes('name')) return 'Example Name'
    if (desc.includes('reason')) return 'Success'
    if (desc.includes('asset')) return 'BTC'
    if (desc.includes('exchange')) return 'binance'
    return 'example-string'
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
*Last updated: ${new Date().toISOString()}*  
*For detailed schemas, see [SCHEMAS.md](./SCHEMAS.md)*`
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
