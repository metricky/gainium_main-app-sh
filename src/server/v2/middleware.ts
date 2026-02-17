/**
 * Field Selection Middleware for API v2.0
 *
 * Express middleware that parses field selection from query parameters
 * and attaches field selection data to the request object.
 */

import type { Request, Response, NextFunction } from 'express'
import {
  parseFieldsParam,
  type FieldSelection,
  validateFields as validateFieldsFn,
  getSelectedFields,
} from './fieldUtils'
import type { EndpointType } from './fieldConfig'
import { getFieldConfig } from './fieldConfig'
import { StatusEnum } from '../../../types'

// Extend Express Request type to include field selection
declare global {
  // eslint-disable-next-line
  namespace Express {
    interface Request {
      fieldSelection?: FieldSelection
      endpointType?: EndpointType
    }
  }
}

/**
 * Create field selection middleware for a specific endpoint type
 *
 * @param endpointType - The type of endpoint (e.g., 'bots.dca', 'deals.combo')
 * @returns Express middleware function
 *
 * @example
 * app.get('/api/v2/bots/dca',
 *   fieldSelectionMiddleware('bots.dca'),
 *   (req, res) => {
 *     const fields = req.fieldSelection
 *     // Use fields to build projection
 *   }
 * )
 */
export function fieldSelectionMiddleware(endpointType: EndpointType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const fieldsParam = req.query.fields as string | undefined

    try {
      req.fieldSelection = parseFieldsParam(fieldsParam, endpointType)
      req.endpointType = endpointType
      next()
    } catch (error) {
      // If parsing fails, use minimal fields
      const config = getFieldConfig(endpointType, 'minimal')
      req.fieldSelection = config ? ([...config] as string[]) : []
      req.endpointType = endpointType
      next()
    }
  }
}

/**
 * Validate field selection middleware
 * Checks that requested fields are allowed for the endpoint
 *
 * @param allowedFields - Optional list of allowed field patterns
 * @returns Express middleware function
 */
export function validateFieldsMiddleware(allowedFields?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip validation if no fields selected (all fields) or no restrictions
    if (!req.fieldSelection || !allowedFields) {
      next()
      return
    }

    const validation = validateFieldsFn(req.fieldSelection, allowedFields)

    if (!validation.isValid) {
      res.status(400).send({
        status: StatusEnum.notok,
        reason: `Invalid fields requested: ${validation.invalidFields.join(', ')}`,
        data: null,
      })
      return
    }

    next()
  }
}

/**
 * Add response metadata middleware
 * Adds field selection info to response metadata
 *
 * @returns Express middleware function
 */
export function responseMetadataMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send.bind(res)

    // Override send function to add metadata
    res.send = function (this: Response, data: any) {
      // Only add metadata to successful JSON responses
      if (
        typeof data === 'object' &&
        data !== null &&
        data.status === StatusEnum.ok &&
        'data' in data
      ) {
        data.meta = data.meta || {}
        data.meta.fields = getSelectedFields(req.fieldSelection || null)
      }

      // Call original send
      return originalSend(data)
    } as any

    next()
  }
}

/**
 * Combined field selection middleware
 * Combines all field selection middlewares in one
 *
 * @param endpointType - The type of endpoint
 * @param allowedFields - Optional list of allowed field patterns
 * @returns Array of Express middleware functions
 *
 * @example
 * app.get('/api/v2/bots/dca',
 *   ...fieldSelectionMiddlewares('bots.dca'),
 *   (req, res) => { ... }
 * )
 */
export function fieldSelectionMiddlewares(
  endpointType: EndpointType,
  allowedFields?: string[],
) {
  return [
    fieldSelectionMiddleware(endpointType),
    validateFieldsMiddleware(allowedFields),
    responseMetadataMiddleware(),
  ]
}
