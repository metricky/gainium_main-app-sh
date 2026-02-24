#!/usr/bin/env ts-node

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

/**
 * Script to sort OpenAPI YAML file:
 * - Schemas in alphabetical order
 * - Endpoints sorted by HTTP method (GET, POST, PUT, DELETE)
 * - Within each method, sort alphabetically by operation ID
 */

const YAML_FILE = path.join(__dirname, '..', 'server', 'v2', 'openapi-v2.yaml')
const METHOD_ORDER = ['get', 'post', 'put', 'delete'] as const

type HttpMethod = (typeof METHOD_ORDER)[number]

interface PathOperation {
  operationId?: string
  summary?: string
  [key: string]: any
}

interface PathObject {
  [method: string]: PathOperation
}

interface EndpointGroup {
  path: string
  pathObj: { [method: string]: PathOperation }
}

interface MethodGroups {
  [method: string]: {
    [operationId: string]: EndpointGroup[]
  }
}

interface ApiDocument {
  openapi?: string
  info?: any
  servers?: any[]
  components?: {
    schemas?: { [key: string]: any }
    [key: string]: any
  }
  paths?: { [path: string]: PathObject }
  security?: any[]
  [key: string]: any
}

function sortSchemas(schemas?: {
  [key: string]: any
}): { [key: string]: any } | undefined {
  if (!schemas) return schemas

  const sortedKeys = Object.keys(schemas).sort()
  const sortedSchemas: { [key: string]: any } = {}

  for (const key of sortedKeys) {
    sortedSchemas[key] = schemas[key]
  }

  return sortedSchemas
}

function getOperationId(pathObj: PathObject, method: string): string {
  return (
    pathObj[method]?.operationId ||
    pathObj[method]?.summary ||
    `${method}_unknown`
  )
}

function sortPaths(paths?: {
  [path: string]: PathObject
}): { [path: string]: PathObject } | undefined {
  if (!paths) return paths

  // Group endpoints by HTTP method
  const methodGroups: MethodGroups = {
    get: {},
    post: {},
    put: {},
    delete: {},
  }

  // Collect all endpoints and group by method
  for (const [path, pathObj] of Object.entries(paths)) {
    for (const method of METHOD_ORDER) {
      if (pathObj[method]) {
        const operationId = getOperationId(pathObj, method)

        if (!methodGroups[method][operationId]) {
          methodGroups[method][operationId] = []
        }

        methodGroups[method][operationId].push({
          path,
          pathObj: { [method]: pathObj[method] },
        })
      }
    }
  }

  // Sort within each method group by operation ID
  const sortedPaths: { [path: string]: PathObject } = {}

  for (const method of METHOD_ORDER) {
    const operationIds = Object.keys(methodGroups[method]).sort()

    for (const operationId of operationIds) {
      const endpoints = methodGroups[method][operationId]

      // Sort endpoints with same operation ID by path
      endpoints.sort((a, b) => a.path.localeCompare(b.path))

      for (const endpoint of endpoints) {
        if (!sortedPaths[endpoint.path]) {
          sortedPaths[endpoint.path] = {}
        }

        // Merge the method into the path object
        Object.assign(sortedPaths[endpoint.path], endpoint.pathObj)
      }
    }
  }

  // Add any remaining methods that weren't in our METHOD_ORDER
  for (const [path, pathObj] of Object.entries(paths)) {
    for (const [method, methodObj] of Object.entries(pathObj)) {
      if (!METHOD_ORDER.includes(method as HttpMethod)) {
        if (!sortedPaths[path]) {
          sortedPaths[path] = {}
        }
        sortedPaths[path][method] = methodObj
      }
    }
  }

  return sortedPaths
}

function preserveTopLevelOrder(obj: ApiDocument): ApiDocument {
  // Preserve the order of top-level keys
  const orderedKeys = [
    'openapi',
    'info',
    'servers',
    'components',
    'paths',
    'security',
  ]

  const result: ApiDocument = {}

  // Add keys in preferred order
  for (const key of orderedKeys) {
    if (obj[key] !== undefined) {
      result[key] = obj[key]
    }
  }

  // Add any remaining keys
  for (const [key, value] of Object.entries(obj)) {
    if (!orderedKeys.includes(key)) {
      result[key] = value
    }
  }

  return result
}

export function sortOpenApiFile(filePath: string = YAML_FILE): void {
  try {
    console.log('Reading OpenAPI YAML file...')
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const apiDoc = yaml.load(fileContent) as ApiDocument

    console.log('Sorting schemas alphabetically...')
    if (apiDoc.components?.schemas) {
      apiDoc.components.schemas = sortSchemas(apiDoc.components.schemas)
    }

    console.log('Sorting paths by HTTP method and operation ID...')
    if (apiDoc.paths) {
      apiDoc.paths = sortPaths(apiDoc.paths)
    }

    // Preserve top-level structure order
    const sortedApiDoc = preserveTopLevelOrder(apiDoc)

    console.log('Writing sorted YAML file...')
    const sortedYaml = yaml.dump(sortedApiDoc, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    })

    // Create backup
    const backupFile = filePath + '.backup.' + Date.now()
    fs.copyFileSync(filePath, backupFile)
    console.log(`Backup created: ${path.basename(backupFile)}`)

    // Write sorted file
    fs.writeFileSync(filePath, sortedYaml, 'utf8')

    console.log('✅ OpenAPI YAML file sorted successfully!')
    console.log('\nSorting applied:')
    console.log('- Schemas: Alphabetical order')
    console.log('- Endpoints: Grouped by HTTP method (GET, POST, PUT, DELETE)')
    console.log('- Within methods: Alphabetical by operation ID')
  } catch (error) {
    console.error('❌ Error sorting OpenAPI file:', error)
    process.exit(1)
  }
}

export { sortSchemas, sortPaths }

// Run if called directly
if (require.main === module) {
  sortOpenApiFile()
}
