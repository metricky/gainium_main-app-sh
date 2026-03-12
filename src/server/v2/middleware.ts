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

// Extend Express Request type to include field selection and paperContext
declare global {
  // eslint-disable-next-line
  namespace Express {
    interface Request {
      fieldSelection?: FieldSelection
      endpointType?: EndpointType
      paperContext?: boolean
    }
  }
}

/**
 * Paper Context Middleware
 *
 * Parses the `paper-context` header and adds it to req.paperContext
 * Defaults to false if header is not present or invalid
 */
export function paperContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const paperContextHeader = req.get('paper-context')
  req.paperContext = paperContextHeader === 'true'
  next()
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

/**
 * API Key Restrictions Middleware
 *
 * Enforces per-API-key access restrictions for paperContext and botId.
 * Must run AFTER the auth middleware (which sets req.userData with keyPaperContext / keyBotId).
 *
 * - If the key has a paperContext restriction, the request's `paper-context` header must match.
 * - If the key has a botId restriction, the request's botId (params or query) must match.
 *
 * Skipped when the key has no restriction set (undefined = no restriction).
 */
export function apiKeyRestrictionsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { keyPaperContext, keyBotId } = req.userData ?? {}

  if (keyPaperContext !== undefined && keyPaperContext !== null) {
    const requestedPaper = req.get('paper-context') === 'true'
    if (requestedPaper !== keyPaperContext) {
      res.status(403).json({
        status: StatusEnum.notok,
        reason:
          `API key is restricted to ${keyPaperContext ? 'paper' : 'real'} trading only. ` +
          `Request uses ${requestedPaper ? 'paper' : 'real'} context.`,
      })
      return
    }
  }

  if (keyBotId !== undefined && keyBotId !== null) {
    const requestBotId =
      (req.params?.botId as string | undefined) ??
      (req.query?.botId as string | undefined)
    if (requestBotId && requestBotId !== keyBotId) {
      res.status(403).json({
        status: StatusEnum.notok,
        reason:
          `API key is restricted to bot ${keyBotId} only. ` +
          `Request targets bot ${requestBotId}.`,
      })
      return
    }
  }

  next()
}
