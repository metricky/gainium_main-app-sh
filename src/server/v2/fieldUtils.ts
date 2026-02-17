/**
 * Field Selection Utilities for API v2.0
 *
 * Provides utilities for parsing field selection queries and building
 * MongoDB projections to only return requested fields.
 */

import {
  getFieldConfig,
  type EndpointType,
  type FieldPreset,
  FIELD_PRESETS,
} from './fieldConfig'

export type FieldSelection = string[] | null // null means all fields

/**
 * Parse fields parameter from query string
 *
 * Supports:
 * - No parameter: returns minimal preset fields
 * - Presets: "minimal", "standard", "extended", "full"
 * - Custom comma-separated list: "id,name,status"
 * - Nested fields with dot notation: "settings.name,settings.pair"
 * - Mixed: "id,settings.pair,profit.total"
 *
 * Note: 'id' is automatically converted to '_id' for MongoDB compatibility
 *
 * @param fieldsParam - Raw fields parameter from query
 * @param endpoint - Endpoint type for preset resolution
 * @returns Array of field names or null for all fields
 *
 * @example
 * parseFieldsParam('id,name,status', 'bots.dca')
 * // Returns: ['_id', 'name', 'status']
 *
 * @example
 * parseFieldsParam('minimal', 'bots.dca')
 * // Returns: ['_id', 'uuid', 'settings.name', ...]
 *
 * @example
 * parseFieldsParam('id,settings.pair,profit.total', 'bots.dca')
 * // Returns: ['_id', 'settings.pair', 'profit.total']
 */
export function parseFieldsParam(
  fieldsParam: string | undefined,
  endpoint: EndpointType,
): FieldSelection {
  // No fields specified - use minimal preset
  if (!fieldsParam) {
    const config = getFieldConfig(endpoint, 'minimal')
    return config ? normalizeFieldNames([...config] as string[]) : []
  }

  // Check if it's a preset
  if (fieldsParam in FIELD_PRESETS) {
    const preset = fieldsParam as FieldPreset
    if (preset === 'full') {
      return null // return all fields
    }
    const config = getFieldConfig(endpoint, preset)
    return config ? normalizeFieldNames([...config] as string[]) : []
  }

  // Parse custom comma-separated field list
  const fields = fieldsParam
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0)

  // Validate no empty strings after trimming
  if (fields.length === 0) {
    const config = getFieldConfig(endpoint, 'minimal')
    return config ? normalizeFieldNames([...config] as string[]) : []
  }

  // Normalize field names (convert id to _id for MongoDB)
  return normalizeFieldNames(fields)
}

/**
 * Build MongoDB projection object from field selection
 *
 * Converts array of field names into MongoDB projection format.
 * Handles nested fields with dot notation.
 * Automatically normalizes 'id' to '_id' for MongoDB.
 *
 * @param fields - Array of field names or null for all fields
 * @returns MongoDB projection object or empty object for all fields
 *
 * @example
 * buildProjection(['_id', 'name', 'settings.pair'])
 * // Returns: { _id: 1, name: 1, 'settings.pair': 1 }
 *
 * @example
 * buildProjection(['settings.name', 'profit.total', 'profit.totalUsd'])
 * // Returns: { 'settings.name': 1, 'profit.total': 1, 'profit.totalUsd': 1 }
 *
 * @example
 * buildProjection(null)
 * // Returns: undefined (MongoDB returns all fields)
 */
export function buildProjection(
  fields: FieldSelection,
): Record<string, 1> | undefined {
  if (!fields) {
    return undefined // undefined projection returns all fields in MongoDB
  }

  const projection: Record<string, 1> = {}

  for (const field of fields) {
    projection[field] = 1
  }

  return projection
}

/**
 * Filter object to only include selected fields
 *
 * Used for post-processing when MongoDB projection is not available.
 * Handles nested fields with dot notation.
 *
 * @param obj - Object to filter
 * @param fields - Array of field names or null for all fields
 * @returns Filtered object
 */
export function filterFields<T extends Record<string, any>>(
  obj: T,
  fields: FieldSelection,
): Partial<T> {
  if (!fields) {
    return obj // return all fields
  }

  const result: any = {}

  for (const field of fields) {
    const value = getNestedValue(obj, field)
    if (value !== undefined) {
      setNestedValue(result, field, value)
    }
  }

  return result
}

/**
 * Filter array of objects to only include selected fields
 *
 * @param array - Array of objects to filter
 * @param fields - Array of field names or null for all fields
 * @returns Array of filtered objects
 */
export function filterFieldsArray<T extends Record<string, any>>(
  array: T[],
  fields: FieldSelection,
): Partial<T>[] {
  if (!fields) {
    return array // return all fields
  }

  return array.map((obj) => filterFields(obj, fields))
}

/**
 * Get nested value from object using dot notation
 *
 * @param obj - Object to get value from
 * @param path - Dot-separated path (e.g., "settings.name")
 * @returns Value at path or undefined
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[part]
  }

  return current
}

/**
 * Set nested value in object using dot notation
 *
 * @param obj - Object to set value in
 * @param path - Dot-separated path (e.g., "settings.name")
 * @param value - Value to set
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.')
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current)) {
      current[part] = {}
    }
    current = current[part]
  }

  current[parts[parts.length - 1]] = value
}

/**
 * Normalize field names to handle _id vs id
 * MongoDB uses _id internally, but API accepts both 'id' and '_id'
 *
 * @param fields - Array of field names
 * @returns Normalized field names with _id instead of id
 *
 * @example
 * normalizeFieldNames(['id', 'name', 'botId'])
 * // Returns: ['_id', 'name', 'botId']
 *
 * @example
 * normalizeFieldNames(['settings.id', 'user.id'])
 * // Returns: ['settings._id', 'user._id']
 */
export function normalizeFieldNames(fields: string[]): string[] {
  return fields.map((field) => {
    // Convert 'id' to '_id' for MongoDB
    if (field === 'id') {
      return '_id'
    }
    // Handle nested id fields (e.g., 'settings.id' -> 'settings._id')
    if (field.endsWith('.id')) {
      return field.slice(0, -3) + '._id'
    }
    // Handle id in middle of path (e.g., 'parent.id.name' -> 'parent._id.name')
    if (field.includes('.id.')) {
      return field.replace(/\.id\./g, '._id.')
    }
    return field
  })
}

/**
 * Get list of fields that were selected
 * Useful for including in API response metadata
 *
 * @param fields - Field selection
 * @returns Array of field names that were selected
 */
export function getSelectedFields(fields: FieldSelection): string[] | 'all' {
  if (!fields) {
    return 'all'
  }
  return fields
}

/**
 * Validate that requested fields are allowed
 * Prevents users from requesting sensitive internal fields
 *
 * @param fields - Requested fields
 * @param allowedFields - List of allowed field patterns
 * @returns Object with isValid flag and invalid fields
 */
export function validateFields(
  fields: string[],
  allowedFields?: string[],
): { isValid: boolean; invalidFields: string[] } {
  // If no allowed fields specified, all are allowed
  if (!allowedFields) {
    return { isValid: true, invalidFields: [] }
  }

  const invalidFields: string[] = []

  for (const field of fields) {
    const isAllowed = allowedFields.some((allowed) => {
      // Exact match
      if (field === allowed) return true

      // Wildcard match (e.g., "settings.*")
      if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1)
        return field.startsWith(prefix)
      }

      return false
    })

    if (!isAllowed) {
      invalidFields.push(field)
    }
  }

  return {
    isValid: invalidFields.length === 0,
    invalidFields,
  }
}
