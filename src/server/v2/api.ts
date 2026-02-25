/**
 * API v2.0 Endpoints
 *
 * New API version with field selection support.
 * All endpoints support field selection via query parameter.
 *
 * Examples:
 * - GET /api/v2/bots/dca?fields=minimal
 * - GET /api/v2/bots/dca?fields=id,name,status,settings.pair
 * - GET /api/v2/bots/dca?fields=full
 */

import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import {
  StatusEnum,
  BotStatusEnum,
  DCADealStatusEnum,
  UserSchema,
  CreateDCABotInput,
  CreateComboBotInput,
  CreateGridBotInput,
  DCATypeEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  ScaleDcaTypeEnum,
  StartConditionEnum,
  TerminalDealTypeEnum,
  GlobalVariablesTypeEnum,
  OrderSizeTypeEnum,
  AddFundsTypeEnum,
  CloseDCATypeEnum,
  DCACloseTriggerEnum,
  CloseGRIDTypeEnum,
  PairsToSetMode,
  BaseReturn,
  ComboBotSettings,
  BotSettings,
} from '../../../types'
import BotInstance from '../../bot'
import allAPI from '../api'
import {
  getBotsByGlobalVar,
  checkDCADealSettings,
  checkDCABotSettings,
  checkPairs,
} from '../../bot/utils'
import {
  dcaBotDb,
  dcaDealsDb,
  comboBotDb,
  comboDealsDb,
  balanceDb,
  botDb,
  userDb as _userDb,
  globalVarsDb,
} from '../../db/dbInit'
import DB from '../../db'
import { buildProjection } from './fieldUtils'
import { fieldSelectionMiddlewares, paperContextMiddleware } from './middleware'
import { isFutures, isCoinm } from '../../utils'
import {
  DCA_FORM_DEFAULTS,
  COMBO_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
} from './botDefaults'
import type { ResponseMeta } from './types'
import { DCABotSettings } from '../../../types'
import {
  validateCreateDCABotInput,
  validateCreateComboBotInput,
  validateCreateTerminalDealInput,
  validateCreateGridBotInput,
} from './validators/bots'
import {
  validateBotCreationContext,
  replaceVarsInInput,
  addAditionalFields,
  addIndicatorsDefaults,
  sortFields,
} from './helpers'
import RedisClient from '../../db/redis'
import {
  ServerSideBacktestPayload,
  BacktestRequestStatus,
  BotType,
} from '../../../types'
import {
  dcaBacktestRequestDb,
  comboBacktestRequestDb,
  gridBacktestRequestDb,
} from '../../db/dbInit'
import { sendServerSideRequest } from '../../graphql/handlers/backtest'

type APIMap = Map<
  string,
  {
    handler: (req: Request, res: Response) => void
    middlewares: any[]
  }
>

const defaultPaginations = {
  bots: 10,
  deals: 20,
  balances: 100,
  globalVars: 100,
}

export type CreateDCABotInputRaw = Partial<DCABotSettings> & {
  exchangeUUID?: string
  vars?: { path: string; variable: string }[]
}

export type CreateGridBotInputRaw = Partial<CreateGridBotInput> & {
  exchangeUUID?: string
  vars?: { path: string; variable: string }[]
}

/**
 * Convert camelCase to kebab-case for URL paths
 */
const camelToKebab = (str: string): string => {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Transform v1 API route to v2 with kebab-case
 */
const transformV1RouteToV2 = (route: string): string => {
  // Replace /api/ with /api/v2/
  const v2Route = route.replace('/api/', '/api/v2/')

  // Split by / and convert each segment to kebab-case
  return v2Route
    .split('/')
    .map((segment) => camelToKebab(segment))
    .join('/')
}

/**
 * Validate global variable value matches its type
 */
const validateGlobalVariableValue = (
  value: string,
  type: GlobalVariablesTypeEnum,
): { valid: boolean; error?: string } => {
  if (type === GlobalVariablesTypeEnum.int) {
    const parsed = parseInt(value, 10)
    if (isNaN(parsed) || parsed.toString() !== value) {
      return {
        valid: false,
        error: 'Value must be a valid integer',
      }
    }
  } else if (type === GlobalVariablesTypeEnum.float) {
    const parsed = parseFloat(value)
    if (isNaN(parsed)) {
      return {
        valid: false,
        error: 'Value must be a valid float number',
      }
    }
  } else if (type === GlobalVariablesTypeEnum.text) {
    if (typeof value !== 'string') {
      return {
        valid: false,
        error: 'Value must be a string',
      }
    }
  }
  return { valid: true }
}

const v2API = <R extends UserSchema = UserSchema>(
  userDb: DB<R> = _userDb as unknown as DB<R>,
  Bot: BotInstance = BotInstance.getInstance(),
) => {
  const get: APIMap = new Map()
  const post: APIMap = new Map()
  const put: APIMap = new Map()
  const deleteMap: APIMap = new Map()

  /**
   * GET /api/v2/bots/dca
   *
   * List DCA bots with field selection
   *
   * Query params:
   * - fields: Field selection (minimal|standard|extended|full|custom list)
   * - status: Filter by status
   * - page: Page number (default: 1)
   *
   * Headers:
   * - paper-context: true|false (optional, defaults to false)
   *
   * Examples:
   * - ?fields=minimal (default)
   * - ?fields=standard
   * - ?fields=id,name,status,settings.pair,profit.total
   * - ?fields=full
   */
  get.set('/api/v2/bots/dca', {
    middlewares: [
      paperContextMiddleware,
      ...fieldSelectionMiddlewares('bots.dca'),
    ],
    handler: async (req, res) => {
      const {
        status,
        page: _page,
      }: {
        status?: BotStatusEnum
        page?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection
      const paperContext = req.paperContext || false

      // Validate status
      const validStatuses = [
        BotStatusEnum.closed,
        BotStatusEnum.error,
        BotStatusEnum.open,
        BotStatusEnum.archive,
        BotStatusEnum.range,
        BotStatusEnum.monitoring,
      ]
      if (status && !validStatuses.includes(status)) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid status parameter',
          data: null,
        })
        return
      }

      // Validate and parse page
      const page = _page && !isNaN(+_page) ? +_page : 1

      // Build MongoDB filter
      const filter: Record<string, any> = {
        userId: user.id,
        isDeleted: { $ne: true },
        exchangeUnassigned: { $ne: true },
      }

      if (status) {
        filter.status = status
      }

      filter.paperContext = paperContext ? { $eq: true } : { $ne: true }

      // Build MongoDB projection from selected fields
      const projection = buildProjection(fields || null)

      // Query database with projection
      const limit = defaultPaginations.bots
      const skip = (page - 1) * limit

      try {
        const result = await dcaBotDb.readData(
          filter,
          projection,
          { sort: { createdAt: -1 }, skip, limit },
          true, // returnArray
          true, // count
        )

        if (result.status === StatusEnum.notok) {
          res.status(500).send(result)
          return
        }

        const meta: ResponseMeta = {
          page,
          total: Math.ceil(result.data.count / limit),
          count: result.data.count,
          onPage: result.data.result.length,
          // fields will be added by middleware
        }

        res.send({
          status: StatusEnum.ok,
          reason: null,
          data: result.data.result,
          meta,
        })
      } catch (error) {
        res.status(500).send({
          status: StatusEnum.notok,
          reason: 'Internal server error',
          data: null,
        })
      }
    },
  })

  /**
   * GET /api/v2/bots/combo
   *
   * List Combo bots with field selection
   */
  get.set('/api/v2/bots/combo', {
    middlewares: [
      paperContextMiddleware,
      ...fieldSelectionMiddlewares('bots.combo'),
    ],
    handler: async (req, res) => {
      const {
        status,
        page: _page,
      }: {
        status?: BotStatusEnum
        page?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection
      const paperContext = req.paperContext || false

      const validStatuses = [
        BotStatusEnum.closed,
        BotStatusEnum.error,
        BotStatusEnum.open,
        BotStatusEnum.archive,
        BotStatusEnum.range,
        BotStatusEnum.monitoring,
      ]
      if (status && !validStatuses.includes(status)) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid status parameter',
          data: null,
        })
        return
      }

      const page = _page && !isNaN(+_page) ? +_page : 1

      const filter: Record<string, any> = {
        userId: user.id,
        isDeleted: { $ne: true },
        exchangeUnassigned: { $ne: true },
      }

      if (status) {
        filter.status = status
      }

      filter.paperContext = paperContext ? { $eq: true } : { $ne: true }

      const projection = buildProjection(fields || null)
      const limit = defaultPaginations.bots
      const skip = (page - 1) * limit

      try {
        const result = await comboBotDb.readData(
          filter,
          projection,
          { sort: { createdAt: -1 }, skip, limit },
          true,
          true,
        )

        if (result.status === StatusEnum.notok) {
          res.status(500).send(result)
          return
        }

        const meta: ResponseMeta = {
          page,
          total: Math.ceil(result.data.count / limit),
          count: result.data.count,
          onPage: result.data.result.length,
        }

        res.send({
          status: StatusEnum.ok,
          reason: null,
          data: result.data.result,
          meta,
        })
      } catch (error) {
        res.status(500).send({
          status: StatusEnum.notok,
          reason: 'Internal server error',
          data: null,
        })
      }
    },
  })

  /**
   * GET /api/v2/deals/:dealType
   *
   * List deals with field selection (DCA, Combo, or Terminal)
   *
   * URL params:
   * - dealType: Type of deals to retrieve (dca, combo, terminal)
   *
   * Query params:
   * - fields: Field selection
   * - status: Filter by status
   * - paperContext: Filter by paper context
   * - page: Page number
   * - botId: Filter by bot ID
   */
  get.set('/api/v2/deals/:dealType', {
    middlewares: [
      paperContextMiddleware,
      ...fieldSelectionMiddlewares('deals.dca'),
    ],
    handler: async (req, res) => {
      const { dealType } = req.params
      const {
        status,
        page: _page,
        botId,
      }: {
        status?: DCADealStatusEnum
        page?: string
        botId?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection
      const paperContext = req.paperContext || false

      // Validate dealType
      if (!['dca', 'combo', 'terminal'].includes(dealType)) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid deal type. Must be one of: dca, combo, terminal',
          data: null,
        })
        return
      }

      const validStatuses = [
        DCADealStatusEnum.closed,
        DCADealStatusEnum.error,
        DCADealStatusEnum.open,
        DCADealStatusEnum.start,
        DCADealStatusEnum.canceled,
      ]

      if (status && !validStatuses.includes(status)) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid status parameter',
          data: null,
        })
        return
      }

      const page = _page && !isNaN(+_page) ? +_page : 1

      const filter: Record<string, any> = {
        userId: user.id,
        isDeleted: { $ne: true },
      }

      // Apply deal type specific filters
      if (dealType === 'dca') {
        filter.terminal = { $ne: true }
      } else if (dealType === 'terminal') {
        filter.terminal = { $eq: true }
      }
      // combo has no terminal filter

      if (status) {
        filter.status = status
      }

      if (botId) {
        filter.botId = botId
      }

      filter.paperContext = paperContext ? { $eq: true } : { $ne: true }

      const projection = buildProjection(fields || null)
      const limit = defaultPaginations.deals
      const skip = (page - 1) * limit

      try {
        // Select appropriate database based on deal type
        const result =
          dealType === 'combo'
            ? await comboDealsDb.readData(
                filter,
                projection,
                { sort: { createTime: -1 }, skip, limit },
                true,
                true,
              )
            : await dcaDealsDb.readData(
                filter,
                projection,
                { sort: { createTime: -1 }, skip, limit },
                true,
                true,
              )

        if (result.status === StatusEnum.notok) {
          res.status(500).send(result)
          return
        }

        const meta: ResponseMeta = {
          page,
          total: Math.ceil(result.data.count / limit),
          count: result.data.count,
          onPage: result.data.result.length,
        }

        res.send({
          status: StatusEnum.ok,
          reason: null,
          data: result.data.result,
          meta,
        })
      } catch (error) {
        res.status(500).send({
          status: StatusEnum.notok,
          reason: 'Internal server error',
          data: null,
        })
      }
    },
  })

  /**
   * GET /api/v2/user/balances
   *
   * List user balances with field selection
   *
   * Query params:
   * - fields: Field selection
   * - paperContext: Filter by paper context
   * - page: Page number
   * - exchangeId: Filter by exchange UUID
   * - assets: Comma-separated list of assets to filter
   */
  get.set('/api/v2/user/balances', {
    middlewares: [
      paperContextMiddleware,
      ...fieldSelectionMiddlewares('balances'),
    ],
    handler: async (req, res) => {
      const {
        page: _page,
        exchangeId: _exchangeId,
        assets: _assets,
      }: {
        page?: string
        exchangeId?: string
        assets?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection
      const paperContext = req.paperContext || false

      // Parse assets filter
      let assets: string[] = []
      if (typeof _assets !== 'undefined' && _assets) {
        if (typeof _assets === 'string') {
          assets = _assets.split(',').map((a) => `${a}`.trim())
        } else {
          res.status(400).send({
            status: StatusEnum.notok,
            reason: 'Assets should be a comma-separated string',
            data: null,
          })
          return
        }
      }
      assets = [...new Set(assets)]

      const exchangeId = _exchangeId ? `${_exchangeId}`.trim() : ''
      let page = _page ? +_page : 1
      if (isNaN(page) || page <= 0 || !isFinite(page)) {
        page = 1
      }

      const limit = defaultPaginations.balances

      const filter: Record<string, unknown> = {
        userId: `${user.id}`,
      }

      if (exchangeId) {
        filter.exchangeUUID = exchangeId
      }

      if (!exchangeId) {
        filter.paperContext = paperContext ? { $eq: true } : { $ne: true }
      }

      if (assets.length > 0) {
        filter.asset = { $in: assets }
      }

      const projection = buildProjection(fields || null)

      try {
        const balances = await balanceDb.readData(
          filter,
          projection,
          { sort: { asset: 1 }, skip: (page - 1) * limit, limit },
          true,
          true,
        )

        if (balances.status === StatusEnum.notok) {
          res.status(500).send(balances)
          return
        }

        const result = (balances.data?.result ?? []).map((b: any) => {
          return {
            ...b,
            exchangeMarket: isFutures(b.exchange) ? 'futures' : 'spot',
            exchangeType: isFutures(b.exchange)
              ? isCoinm(b.exchange)
                ? 'inverse'
                : 'linear'
              : undefined,
          }
        })

        const meta: ResponseMeta = {
          page,
          total: Math.ceil(balances.data.count / limit),
          count: balances.data.count,
          onPage: balances.data.result.length,
        }

        res.send({
          status: StatusEnum.ok,
          reason: null,
          data: result,
          meta,
        })
      } catch (error) {
        res.status(500).send({
          status: StatusEnum.notok,
          reason: 'Internal server error',
          data: null,
        })
      }
    },
  })

  /**
   * GET /api/v2/user/global-vars
   *
   * List global variables
   *
   * Query params:
   * - page: Page number (default: 1)
   */
  get.set('/api/v2/user/global-vars', {
    middlewares: [],
    handler: async (req, res) => {
      const { page: _page }: { page?: string } = req.query
      const user = req.userData

      const page = _page && !isNaN(+_page) ? +_page : 1

      const filter: Record<string, any> = {
        userId: user.id,
      }

      const limit = defaultPaginations.globalVars
      const skip = (page - 1) * limit

      try {
        const result = await globalVarsDb.readData(
          filter,
          {},
          { sort: { createdAt: -1 }, skip, limit },
          true,
          true,
        )

        if (result.status === StatusEnum.notok) {
          res.status(500).send(result)
          return
        }

        const meta: ResponseMeta = {
          page,
          total: Math.ceil(result.data.count / limit),
          count: result.data.count,
          onPage: result.data.result.length,
        }

        res.send({
          status: StatusEnum.ok,
          reason: null,
          data: result.data.result,
          meta,
        })
      } catch (error) {
        res.status(500).send({
          status: StatusEnum.notok,
          reason: 'Internal server error',
          data: null,
        })
      }
    },
  })

  /**
   * GET /api/v2/bots/grid
   *
   * List Grid bots with field selection
   *
   * Query params:
   * - fields: Field selection (minimal|standard|extended|full|custom list)
   * - status: Filter by status
   * - paperContext: Filter by paper context (true|false)
   * - page: Page number (default: 1)
   */
  get.set('/api/v2/bots/grid', {
    middlewares: [
      paperContextMiddleware,
      ...fieldSelectionMiddlewares('bots.grid'),
    ],
    handler: async (req, res) => {
      const {
        status,
        page: _page,
      }: {
        status?: BotStatusEnum
        page?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection
      const paperContext = req.paperContext || false

      const validStatuses = [
        BotStatusEnum.closed,
        BotStatusEnum.error,
        BotStatusEnum.open,
        BotStatusEnum.archive,
        BotStatusEnum.range,
        BotStatusEnum.monitoring,
      ]
      if (status && !validStatuses.includes(status)) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid status parameter',
          data: null,
        })
        return
      }

      const page = _page && !isNaN(+_page) ? +_page : 1

      const filter: Record<string, any> = {
        userId: user.id,
        isDeleted: { $ne: true },
        exchangeUnassigned: { $ne: true },
      }

      if (status) {
        filter.status = status
      }

      filter.paperContext = paperContext ? { $eq: true } : { $ne: true }

      const projection = buildProjection(fields || null)
      const limit = defaultPaginations.bots
      const skip = (page - 1) * limit

      try {
        const result = await botDb.readData(
          filter,
          projection,
          { sort: { createdAt: -1 }, skip, limit },
          true,
          true,
        )

        if (result.status === StatusEnum.notok) {
          res.status(500).send(result)
          return
        }

        const meta: ResponseMeta = {
          page,
          total: Math.ceil(result.data.count / limit),
          count: result.data.count,
          onPage: result.data.result.length,
        }

        res.send({
          status: StatusEnum.ok,
          reason: null,
          data: result.data.result,
          meta,
        })
      } catch (error) {
        res.status(500).send({
          status: StatusEnum.notok,
          reason: 'Internal server error',
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/user/global-vars
   *
   * Create a new global variable
   *
   * Body: { name: string, type: GlobalVariablesTypeEnum, value: string }
   *
   * Response:
   * - 200: Global variable created successfully
   * - 400: Validation error
   * - 500: Internal server error
   */
  post.set('/api/v2/user/global-vars', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { name, type, value } = req.body as {
        name?: string
        type?: GlobalVariablesTypeEnum
        value?: string
      }

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Name is required and must be a non-empty string',
        })
      }

      if (
        !type ||
        !Object.values(GlobalVariablesTypeEnum).includes(type as any)
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: `Type is required and must be one of: ${Object.values(GlobalVariablesTypeEnum).join(', ')}`,
        })
      }

      if (value === undefined || value === null) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Value is required',
        })
      }

      // Validate value matches type
      const valueValidation = validateGlobalVariableValue(value, type)
      if (!valueValidation.valid) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: valueValidation.error,
        })
      }

      try {
        const result = await globalVarsDb.createData({
          name: name.trim(),
          type,
          value,
          botAmount: 0,
          userId: user.id,
        })

        if (result.status === StatusEnum.notok) {
          return res.status(500).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            id: result.data._id?.toString(),
            name: result.data.name,
            type: result.data.type,
            value: result.data.value,
            botAmount: result.data.botAmount,
          },
        })
      } catch (error) {
        console.error('Error creating global variable:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create global variable',
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/dca
   *
   * Create a new DCA bot
   *
   * Body: CreateDCABotInput (DCABotSettings + exchangeUUID + vars)
   * Query: ?paperContext=true|false (optional, defaults to false for real trading)
   *
   * Response:
   * - 200: Bot created successfully with botId and uuid
   * - 400: Validation error (missing exchangeUUID, exchange not found, etc.)
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/dca', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateDCABotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input,
        user.id,
        userDb,
        res,
        req.paperContext || false,
      )
      if (!contextValidation.valid) return

      const { userData, exchange, paperContext } = contextValidation

      // 5. Merge defaults with user input, then override exchange-specific fields
      let settings: CreateDCABotInput = {
        ...DCA_FORM_DEFAULTS,
        ...input,
        type: DCATypeEnum.regular,
        // Override futures/coinm based on exchange provider (not user input!)
        ...addAditionalFields(input, exchange),
      }

      settings = addIndicatorsDefaults(settings)

      settings = await replaceVarsInInput(settings, userData._id.toString())

      const validate = await validateCreateDCABotInput(
        settings,
        input,
        userData._id,
      )
      if (!validate.valid) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Validation error',
          errors: validate.errors,
        })
      }
      // 7. Call Bot.createDCABot
      try {
        const bot = await Bot.createDCABot(
          userData._id.toString(),
          validate.data,
          paperContext,
        )

        // Check if bot creation was successful
        if (bot.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: bot.reason || 'Failed to create DCA bot',
          })
        }

        // Extract bot data from response
        const botData = bot.data

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            botId: botData._id.toString(),
            uuid: botData.uuid,
            message: 'DCA bot created successfully',
            settings: sortFields(botData.settings),
          },
        })
      } catch (error: unknown) {
        console.error('Error creating DCA bot:', error)

        // Return error message directly in reason
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error ? error.message : 'Failed to create DCA bot',
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/combo
   *
   * Create a new Combo bot
   *
   * Body: CreateComboBotInput (ComboBotSettings + exchangeUUID + vars)
   * Query: ?paperContext=true|false (optional, defaults to false for real trading)
   *
   * Response:
   * - 200: Bot created successfully with botId and uuid
   * - 400: Validation error (missing exchangeUUID, exchange not found, etc.)
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/combo', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateDCABotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input,
        user.id,
        userDb,
        res,
        req.paperContext || false,
      )
      if (!contextValidation.valid) return

      const { userData, exchange, paperContext } = contextValidation

      // 5. Merge defaults with user input, then override exchange-specific fields
      let settings: CreateComboBotInput = {
        ...COMBO_FORM_DEFAULTS,
        ...input,
        dealCloseCondition: CloseConditionEnum.tp,
        dealCloseConditionSL: CloseConditionEnum.tp,
        dcaCondition: DCAConditionEnum.percentage,
        scaleDcaType: ScaleDcaTypeEnum.percentage,
        type: DCATypeEnum.regular,
        // Override futures/coinm based on exchange provider (not user input!)
        ...addAditionalFields(input, exchange),
      }

      settings = addIndicatorsDefaults(settings)

      settings = await replaceVarsInInput(settings, userData._id.toString())

      const validate = await validateCreateComboBotInput(
        settings,
        input,
        userData._id,
      )
      if (!validate.valid) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Validation error',
          errors: validate.errors,
        })
      }
      // 7. Call Bot.createComboBot
      try {
        const bot = await Bot.createComboBot(
          userData._id.toString(),
          validate.data as CreateComboBotInput,
          paperContext,
        )

        // Check if bot creation was successful
        if (bot.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: bot.reason || 'Failed to create Combo bot',
          })
        }

        // Extract bot data from response
        const botData = bot.data

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            botId: botData._id.toString(),
            uuid: botData.uuid,
            message: 'Combo bot created successfully',
            settings: sortFields(botData.settings),
          },
        })
      } catch (error: unknown) {
        console.error('Error creating Combo bot:', error)

        // Return error message directly in reason
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create Combo bot',
        })
      }
    },
  })

  /**
   * POST /api/v2/deals/terminal
   *
   * Create a new Terminal Deal (one-time trade)
   *
   * Body: CreateDCABotInput with type=terminal and terminalDealType
   * Query: ?paperContext=true|false (optional, defaults to false for real trading)
   *
   * Response:
   * - 200: Deal created successfully with botId and uuid
   * - 400: Validation error (missing exchangeUUID, exchange not found, etc.)
   * - 500: Internal server error
   */
  post.set('/api/v2/deals/terminal', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateDCABotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input,
        user.id,
        userDb,
        res,
        req.paperContext || false,
      )
      if (!contextValidation.valid) return

      const { userData, exchange, paperContext } = contextValidation

      // 5. Merge defaults with user input, then override exchange-specific fields
      let settings: CreateDCABotInput = {
        ...DCA_FORM_DEFAULTS,
        ...input,
        dcaCondition: DCAConditionEnum.percentage,
        scaleDcaType: ScaleDcaTypeEnum.percentage,
        startCondition: StartConditionEnum.asap,
        terminalDealType: input.terminalDealType ?? TerminalDealTypeEnum.smart,
        type: DCATypeEnum.terminal,
        // Override futures/coinm based on exchange provider (not user input!)
        ...addAditionalFields(input, exchange, true),
      }

      settings = addIndicatorsDefaults(settings)

      const validate = await validateCreateTerminalDealInput(
        settings,
        input,
        userData._id,
      )
      if (!validate.valid) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Validation error',
          errors: validate.errors,
        })
      }
      // 7. Call Bot.createDCABot with terminal type
      try {
        const bot = await Bot.createDCABot(
          userData._id.toString(),
          validate.data,
          paperContext,
        )

        // Check if bot creation was successful
        if (bot.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: bot.reason || 'Failed to create Terminal deal',
          })
        }

        // Extract bot data from response
        const botData = bot.data

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            botId: botData._id.toString(),
            uuid: botData.uuid,
            message:
              'Terminal deal created successfully and scheduled for execution',
          },
        })
      } catch (error: unknown) {
        console.error('Error creating Terminal deal:', error)

        // Return error message directly in reason
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create Terminal deal',
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/grid
   *
   * Create a new Grid bot
   *
   * Body: CreateGridBotInput (BotSettings + exchangeUUID + vars)
   * Query: ?paperContext=true|false (optional, defaults to false for real trading)
   *
   * Response:
   * - 200: Bot created successfully with botId and uuid
   * - 400: Validation error (missing exchangeUUID, exchange not found, etc.)
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/grid', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateGridBotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input as any,
        user.id,
        userDb,
        res,
        req.paperContext || false,
      )
      if (!contextValidation.valid) return

      const { userData, exchange, paperContext } = contextValidation

      // Merge defaults with user input, then override exchange-specific fields
      const settings: CreateGridBotInput = {
        ...GRID_FORM_DEFAULTS,
        ...input,
        // Override futures/coinm based on exchange provider (not user input!)
        ...addAditionalFields(input, exchange),
      }

      delete (settings as any).vars

      const validate = await validateCreateGridBotInput(
        settings as any,
        input as any,
      )
      if (!validate.valid) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Validation error',
          errors: validate.errors,
        })
      }

      // Call Bot.createBot (for grid bots)
      try {
        const bot = await Bot.createBot(
          userData._id.toString(),
          validate.data as any,
          paperContext,
        )

        // Check if bot creation was successful
        if (bot.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: bot.reason || 'Failed to create grid bot',
          })
        }

        // Extract bot data from response
        const botData = bot.data

        const botId = botData?.botId?.toString() || ''

        if (!botId) {
          return res.status(500).json({
            status: StatusEnum.notok,
            reason: 'Failed to retrieve created bot ID',
          })
        }

        const findBot = await botDb.readData({
          _id: botId,
          userId: userData._id.toString(),
        })

        if (findBot.status === StatusEnum.notok || !findBot.data) {
          return res.status(500).json({
            status: StatusEnum.notok,
            reason: 'Failed to retrieve created bot from database',
          })
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            botId,
            message: 'Grid bot created successfully',
            settings: sortFields(findBot.data.result.settings),
          },
        })
      } catch (error: unknown) {
        console.error('Error creating grid bot:', error)

        // Return error message directly in reason
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create grid bot',
        })
      }
    },
  })

  /**
   * POST /api/v2/deals/terminal/:dealId/add-funds
   *
   * Add funds to a terminal deal
   *
   * Body: { qty: string, asset?: OrderSizeTypeEnum, symbol?: string, type?: AddFundsTypeEnum }
   *
   * Response:
   * - 200: Funds added successfully
   * - 400: Validation error or deal not found
   * - 500: Internal server error
   */
  post.set('/api/v2/deals/terminal/:dealId/add-funds', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { dealId } = req.params
      const { qty, asset, symbol, type } = req.body as {
        qty?: string
        asset?: OrderSizeTypeEnum
        symbol?: string
        type?: AddFundsTypeEnum
      }

      if (!dealId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Deal ID is required',
        })
      }

      const fundsType = type || AddFundsTypeEnum.fixed

      if (!qty || (fundsType === AddFundsTypeEnum.fixed && !asset)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Missing required parameters',
        })
      }

      if (
        typeof qty !== 'string' ||
        (asset &&
          (typeof asset !== 'string' ||
            ![OrderSizeTypeEnum.base, OrderSizeTypeEnum.quote].includes(
              asset,
            ))) ||
        (symbol && typeof symbol !== 'string') ||
        (type &&
          ![AddFundsTypeEnum.fixed, AddFundsTypeEnum.perc].includes(type))
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid parameters',
        })
      }

      try {
        // Fetch the terminal deal to get botId
        const deal = await dcaDealsDb.readData({
          _id: dealId,
          userId: user.id,
          terminal: { $eq: true },
          status: {
            $nin: [DCADealStatusEnum.closed, DCADealStatusEnum.canceled],
          },
        })

        if (deal.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: deal.reason,
          })
        }

        if (!deal.data.result) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: 'Terminal deal not found',
          })
        }

        const botId = deal.data.result.botId

        // Call the Bot method with botId
        const result = await Bot.addDealFundsFromPublicApi(
          user.id,
          botId,
          qty,
          asset!,
          symbol,
          fundsType,
          dealId,
        )

        return res.status(200).json(result)
      } catch (error) {
        console.error('Error adding funds to terminal deal:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to add funds to terminal deal',
        })
      }
    },
  })

  /**
   * POST /api/v2/deals/terminal/:dealId/reduce-funds
   *
   * Reduce funds from a terminal deal
   *
   * Body: { qty: string, asset?: OrderSizeTypeEnum, symbol?: string, type?: AddFundsTypeEnum }
   *
   * Response:
   * - 200: Funds reduced successfully
   * - 400: Validation error or deal not found
   * - 500: Internal server error
   */
  post.set('/api/v2/deals/terminal/:dealId/reduce-funds', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { dealId } = req.params
      const { qty, asset, symbol, type } = req.body as {
        qty?: string
        asset?: OrderSizeTypeEnum
        symbol?: string
        type?: AddFundsTypeEnum
      }

      if (!dealId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Deal ID is required',
        })
      }

      const fundsType = type || AddFundsTypeEnum.fixed

      if (!qty || (fundsType === AddFundsTypeEnum.fixed && !asset)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Missing required parameters',
        })
      }

      if (
        typeof qty !== 'string' ||
        (asset &&
          (typeof asset !== 'string' ||
            ![OrderSizeTypeEnum.base, OrderSizeTypeEnum.quote].includes(
              asset,
            ))) ||
        (symbol && typeof symbol !== 'string') ||
        (type &&
          ![AddFundsTypeEnum.fixed, AddFundsTypeEnum.perc].includes(type))
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid parameters',
        })
      }

      try {
        // Fetch the terminal deal to get botId
        const deal = await dcaDealsDb.readData({
          _id: dealId,
          userId: user.id,
          terminal: { $eq: true },
          status: {
            $nin: [DCADealStatusEnum.closed, DCADealStatusEnum.canceled],
          },
        })

        if (deal.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: deal.reason,
          })
        }

        if (!deal.data.result) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: 'Terminal deal not found',
          })
        }

        const botId = deal.data.result.botId

        // Call the Bot method with botId
        const result = await Bot.reduceDealFundsFromPublicApi(
          user.id,
          botId,
          qty,
          asset!,
          symbol,
          fundsType,
          dealId,
        )

        return res.status(200).json(result)
      } catch (error) {
        console.error('Error reducing funds from terminal deal:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to reduce funds from terminal deal',
        })
      }
    },
  })

  /**
   * PUT /api/v2/bots/:botType/:botId
   *
   * Update bot settings (DCA or Combo)
   *
   * URL params:
   * - botType: Type of bot (dca, combo)
   * - botId: ID of the bot to update
   *
   * Body: Partial bot settings to update
   *
   * Response:
   * - 200: Bot updated successfully
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  put.set('/api/v2/bots/:botType/:botId', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params
      const settings = req.body

      // Validate botType
      if (!['dca', 'combo'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo',
        })
      }

      if (!botId || !settings) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Missing required parameters',
        })
      }

      if (typeof botId !== 'string' || typeof settings !== 'object') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid parameters',
        })
      }

      try {
        //  Fetch bot based on type
        const bot =
          botType === 'combo'
            ? await comboBotDb.readData({ _id: botId, userId: user.id })
            : await dcaBotDb.readData({ _id: botId, userId: user.id })

        if (bot.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: bot.reason,
          })
        }

        if (!bot.data.result) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: 'Bot not found',
          })
        }

        const check = checkDCABotSettings(
          bot.data.result.settings,
          settings,
          botType === 'combo',
        )
        if (check.status === StatusEnum.notok) {
          return res.status(400).json(check)
        }

        const { pair, ...rest } = settings
        let pairToUse = pair

        if (pair?.length) {
          const updatePairs = await Bot.changeDCABotPairs(
            user.id,
            botId,
            '',
            undefined,
            pair,
            PairsToSetMode.replace,
            true,
          )
          if (updatePairs.status === StatusEnum.notok) {
            if (updatePairs.reason === 'Nothing changed') {
              pairToUse = undefined
            } else {
              return res.status(400).json(updatePairs)
            }
          } else {
            pairToUse = updatePairs.data.current
          }
        }

        const updateMethod =
          botType === 'combo' ? Bot.changeComboBot : Bot.changeDCABot
        const result = await updateMethod(
          {
            ...rest,
            pair: pairToUse,
            id: botId,
            vars: bot.data.result.vars,
          },
          user.id,
          !!bot.data.result.paperContext,
        )

        if (result && result.status === StatusEnum.notok) {
          return res.status(400).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: 'Settings updated',
        })
      } catch (error) {
        console.error(`Error updating ${botType} bot:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to update ${botType} bot`,
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/:botType/:botId/start
   *
   * Start a bot (DCA, Combo, or Grid)
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   * - botId: ID of the bot to start
   *
   * Query: ?paperContext=true|false (optional)
   *
   * Response:
   * - 200: Bot scheduled to start
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/:botType/:botId/start', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params
      const paperContext = req.paperContext || false

      // Validate botType
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo, grid',
          data: null,
        })
      }

      if (!botId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID is required',
          data: null,
        })
      }

      if (typeof botId !== 'string') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot ID',
          data: null,
        })
      }

      try {
        const result = await Bot.changeStatus(
          user.id,
          {
            status: BotStatusEnum.open,
            id: botId,
            type: botType as any,
          },
          paperContext,
        )

        if (result && result.status === StatusEnum.notok) {
          return res.status(400).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: 'Bot scheduled to start',
        })
      } catch (error) {
        console.error(`Error starting ${botType} bot:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to start ${botType} bot`,
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/:botType/:botId/stop
   *
   * Stop a bot (DCA, Combo, or Grid)
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   * - botId: ID of the bot to stop
   *
   * Query params:
   * - paperContext: true|false (optional)
   * - cancelPartiallyFilled: true|false (optional)
   * - closeType: cancel|closeByLimit|closeByMarket|leave (for DCA/Combo)
   * - closeGridType: cancel|closeByLimit|closeByMarket (for Grid)
   *
   * Response:
   * - 200: Bot scheduled to stop
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/:botType/:botId/stop', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params
      const paperContext = req.paperContext || false
      const { cancelPartiallyFilled, closeType, closeGridType } = req.query as {
        cancelPartiallyFilled?: string
        closeType?: CloseDCATypeEnum
        closeGridType?: CloseGRIDTypeEnum
      }

      // Validate botType
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo, grid',
          data: null,
        })
      }

      if (!botId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID is required',
          data: null,
        })
      }

      if (typeof botId !== 'string') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot ID',
          data: null,
        })
      }

      try {
        const result = await Bot.changeStatus(
          user.id,
          {
            status: BotStatusEnum.closed,
            id: botId,
            type: botType as any,
            cancelPartiallyFilled: cancelPartiallyFilled === 'true',
            closeType: closeType ?? CloseDCATypeEnum.leave,
            closeGridType,
          },
          paperContext,
        )

        if (result && result.status === StatusEnum.notok) {
          return res.status(400).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: 'Bot scheduled to stop',
        })
      } catch (error) {
        console.error(`Error stopping ${botType} bot:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to stop ${botType} bot`,
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/:botType/:botId/restore
   *
   * Restore an archived bot
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   * - botId: ID of the bot to restore
   *
   * Response:
   * - 200: Bot restored successfully
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/:botType/:botId/restore', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params

      // Validate botType
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo, grid',
          data: null,
        })
      }

      if (!botId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID is required',
          data: null,
        })
      }

      if (typeof botId !== 'string') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot ID',
          data: null,
        })
      }

      try {
        const result = await Bot.setArchiveStatus(
          user.id,
          botType as any,
          [botId],
          false,
        )

        if (result.status === StatusEnum.notok) {
          return res.status(400).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: 'Bot restored',
        })
      } catch (error) {
        console.error(`Error restoring ${botType} bot:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to restore ${botType} bot`,
          data: null,
        })
      }
    },
  })

  /**
   * DELETE /api/v2/bots/:botType/:botId
   *
   * Archive a bot
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   * - botId: ID of the bot to archive
   *
   * Response:
   * - 200: Bot archived successfully
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  deleteMap.set('/api/v2/bots/:botType/:botId', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params

      // Validate botType
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo, grid',
          data: null,
        })
      }

      if (!botId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID is required',
          data: null,
        })
      }

      if (typeof botId !== 'string') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot ID',
          data: null,
        })
      }

      try {
        const result = await Bot.setArchiveStatus(
          user.id,
          botType as any,
          [botId],
          true,
        )

        if (result.status === StatusEnum.notok) {
          return res.status(400).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: 'Bot archived',
        })
      } catch (error) {
        console.error(`Error archiving ${botType} bot:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to archive ${botType} bot`,
          data: null,
        })
      }
    },
  })

  /**
   * PUT /api/v2/bots/:botType/:botId/pairs
   *
   * Change bot trading pairs
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   * - botId: ID of the bot
   *
   * Body: { pairsToChange?: { add?: string[], remove?: string[] }, pairsToSet?: string[], pairsToSetMode?: PairsToSetMode }
   *
   * Response:
   * - 200: Pairs updated successfully
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  put.set('/api/v2/bots/:botType/:botId/pairs', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params
      const { pairsToChange, pairsToSet, pairsToSetMode } = req.body as {
        pairsToChange?: { add?: string[]; remove?: string[] }
        pairsToSet?: string[]
        pairsToSetMode?: PairsToSetMode
      }

      // Validate botType
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo, grid',
        })
      }

      if (!botId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID is required',
        })
      }

      if (!pairsToChange && !pairsToSet) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Either pairsToChange or pairsToSet must be provided',
        })
      }

      if (
        typeof botId !== 'string' ||
        (pairsToChange && typeof pairsToChange !== 'object') ||
        (pairsToSet && typeof pairsToSet !== 'object') ||
        (pairsToSetMode &&
          (typeof pairsToSetMode !== 'string' ||
            !Object.values(PairsToSetMode)
              .filter((v) => isNaN(+v))
              .includes(pairsToSetMode)))
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid parameters',
        })
      }

      if (pairsToSet && !pairsToSet.length) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Pairs cannot be empty',
        })
      }

      if (
        pairsToChange &&
        ((!pairsToChange.add && !pairsToChange.remove) ||
          (!(pairsToChange.add ?? []).length &&
            !(pairsToChange.remove ?? []).length))
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Pairs cannot be empty',
        })
      }

      try {
        const result = await Bot.changeDCABotPairs(
          user.id,
          botId,
          '',
          pairsToChange,
          pairsToSet,
          pairsToSetMode,
        )

        if (result.status === StatusEnum.notok) {
          return res.status(400).json(result)
        }

        return res.status(200).json(result)
      } catch (error) {
        console.error(`Error changing ${botType} bot pairs:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to change ${botType} bot pairs`,
        })
      }
    },
  })

  /**
   * POST /api/v2/bots/:botType/:botId/clone
   *
   * Clone a bot with optional setting overrides
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   * - botId: ID of the bot to clone
   *
   * Query: ?paperContext=true|false (optional)
   * Body: Partial bot settings to override (all optional)
   *
   * Response:
   * - 200: Bot cloned successfully with botId
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  post.set('/api/v2/bots/:botType/:botId/clone', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const { botId, botType } = req.params
      const paperContext = req.paperContext || false
      const settingsOverrides = req.body

      // Validate botType
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be one of: dca, combo, grid',
        })
      }

      if (!botId || typeof botId !== 'string') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Missing or invalid botId parameter',
        })
      }

      try {
        // Fetch the existing bot based on bot type
        const existingBot =
          botType === 'grid'
            ? await botDb.readData({
                _id: botId,
                userId: user.id,
                paperContext: paperContext ? { $eq: true } : { $ne: true },
                isDeleted: { $ne: true },
                exchangeUnassigned: { $ne: true },
              })
            : botType === 'combo'
              ? await comboBotDb.readData({
                  _id: botId,
                  userId: user.id,
                  paperContext: paperContext ? { $eq: true } : { $ne: true },
                  isDeleted: { $ne: true },
                  exchangeUnassigned: { $ne: true },
                })
              : await dcaBotDb.readData({
                  _id: botId,
                  userId: user.id,
                  paperContext: paperContext ? { $eq: true } : { $ne: true },
                  isDeleted: { $ne: true },
                  exchangeUnassigned: { $ne: true },
                })

        if (
          existingBot.status === StatusEnum.notok ||
          !existingBot.data.result
        ) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: `${botType.toUpperCase()} bot not found`,
          })
        }

        const sourceBot = existingBot.data.result

        // Get user data for validation
        const userData = await userDb.readData({
          _id: new Types.ObjectId(user.id),
        })

        if (userData.status === StatusEnum.notok || !userData.data.result) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: 'User not found',
          })
        }

        // Find the exchange
        const exchange = userData.data.result.exchanges.find(
          (ex) => ex.uuid === sourceBot.exchangeUUID,
        )

        if (!exchange) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: 'Exchange not found',
          })
        }

        const { pair: _pair, ...rest } = settingsOverrides ?? {}
        let pair = _pair

        // Validate pair if provided (skip for grid bots as they have different settings type)
        const check =
          Object.keys(rest ?? {}).length > 0 && botType !== 'grid'
            ? checkDCABotSettings(
                sourceBot.settings as any,
                rest ?? {},
                botType === 'combo',
              )
            : { status: StatusEnum.ok }

        if (check.status === StatusEnum.notok) {
          return res.status(400).json(check)
        }

        if (pair?.length) {
          const pairsValidation = await Bot.checkPairs(sourceBot.exchange, pair)
          if (pairsValidation.status === StatusEnum.notok) {
            return res.status(400).json({
              status: StatusEnum.notok,
              reason: `Invalid pair: ${pair}`,
            })
          }
          pair =
            botType === 'grid'
              ? pair
              : (pairsValidation.data?.map((p) => p.pair) ?? [])
        }

        // Combine settings: source bot + overrides
        const symbol = sourceBot.symbol as any
        const combinedSettings = {
          ...sourceBot.settings,
          ...(settingsOverrides ?? {}),
          pair: pair?.length
            ? pair
            : botType === 'grid'
              ? `${symbol.baseAsset}_${symbol.quoteAsset}`
              : sourceBot.settings.pair,
        }

        // Auto-append (clone) to name if not overridden
        if (sourceBot.settings.name && !settingsOverrides?.name) {
          combinedSettings.name = `${sourceBot.settings.name} (clone)`
        }

        const vars = sourceBot.vars
        if (rest && vars) {
          vars.paths = vars.paths.filter((p: any) => !(p.path in rest))
          const v = vars.paths.map((p: any) => p.variable)
          vars.list = vars.list.filter((l: any) => v.includes(l))
        }

        // Create the cloned bot using appropriate method
        let result

        if (botType === 'grid') {
          delete (combinedSettings as any).vars
          delete combinedSettings.updatedBudget
          delete combinedSettings.newProfit
          delete combinedSettings.newBalance
          delete (combinedSettings as any)._id

          const finalSettings = {
            ...combinedSettings,
            ...addAditionalFields(combinedSettings, exchange),
          }

          result = await Bot.createBot(
            userData.data.result._id.toString(),
            finalSettings as any,
            paperContext,
          )
        } else {
          const createMethod =
            botType === 'combo' ? Bot.createComboBot : Bot.createDCABot

          result = await createMethod(
            userData.data.result._id.toString(),
            {
              ...Bot.removeNullableValuesFromSettings(combinedSettings),
              exchange: sourceBot.exchange,
              exchangeUUID: sourceBot.exchangeUUID,
              vars,
            } as any,
            paperContext,
          )
        }

        if (result.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: result.reason || `Failed to clone ${botType} bot`,
          })
        }

        if (!result.data) {
          return res.status(500).json({
            status: StatusEnum.notok,
            reason: 'Failed to retrieve cloned bot data',
          })
        }

        const clonedBotId =
          botType === 'grid'
            ? (result.data as any).botId?.toString()
            : (result.data as any)._id.toString()

        if (!clonedBotId) {
          return res.status(500).json({
            status: StatusEnum.notok,
            reason: 'Failed to retrieve cloned bot ID',
          })
        }

        // For grid bots, fetch the created bot details
        if (botType === 'grid') {
          const findBot = await botDb.readData({
            _id: clonedBotId,
            userId: userData.data.result._id.toString(),
          })

          if (findBot.status === StatusEnum.notok || !findBot.data) {
            return res.status(500).json({
              status: StatusEnum.notok,
              reason: 'Failed to retrieve cloned bot from database',
            })
          }
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            botId: clonedBotId,
            message: `${botType.toUpperCase()} bot cloned successfully`,
          },
        })
      } catch (error) {
        console.error(`Error cloning ${botType} bot:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to clone ${botType} bot`,
        })
      }
    },
  })

  /**
   * PUT /api/v2/deals/:dealType/:dealId
   *
   * Update deal settings (DCA or Combo)
   *
   * URL params:
   * - dealType: Type of deal (dca, combo, terminal)
   * - dealId: ID of the deal to update
   *
   * Body: Partial deal settings to update
   *
   * Response:
   * - 200: Deal updated successfully
   * - 400: Validation error or deal not found
   * - 500: Internal server error
   */
  put.set('/api/v2/deals/:dealType/:dealId', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { dealId, dealType } = req.params
      const settings = req.body

      // Validate dealType
      if (!['dca', 'combo', 'terminal'].includes(dealType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid deal type. Must be one of: dca, combo, terminal',
        })
      }

      if (!dealId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Deal ID is required',
        })
      }

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Settings must be provided as an object',
        })
      }

      try {
        // Check if deal exists, belongs to user, and is not closed/canceled
        const deal =
          dealType === 'combo'
            ? await comboDealsDb.readData({
                _id: dealId,
                userId: user.id,
                status: {
                  $nin: [DCADealStatusEnum.closed, DCADealStatusEnum.canceled],
                },
              })
            : await dcaDealsDb.readData({
                _id: dealId,
                userId: user.id,
                ...(dealType === 'terminal' ? { terminal: { $eq: true } } : {}),
                status: {
                  $nin: [DCADealStatusEnum.closed, DCADealStatusEnum.canceled],
                },
              })

        if (deal.status === StatusEnum.notok) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: deal.reason,
          })
        }

        if (!deal.data.result) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: `${dealType} deal not found`,
          })
        }

        // Validate settings
        const check = checkDCADealSettings(
          deal.data.result.settings,
          settings,
          dealType === 'combo',
        )

        if (check.status === StatusEnum.notok) {
          return res.status(400).json(check)
        }

        // Update deal settings
        const updateMethod =
          dealType === 'combo'
            ? Bot.updateComboDealSettings
            : Bot.updateDCADealSettings

        const result = await updateMethod(user.id, '', dealId, settings)

        return res.status(200).json(result)
      } catch (error) {
        console.error(`Error updating ${dealType} deal settings:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to update ${dealType} deal settings`,
        })
      }
    },
  })

  /**
   * POST /api/v2/deals/:dealType/:dealId/start
   *
   * Start a new deal (for DCA or Combo bots)
   *
   * URL params:
   * - dealType: Type of deal (dca, combo)
   * - dealId: Bot ID to start deal for
   *
   * Body: { symbol?: string }
   *
   * Response:
   * - 200: Deal started successfully
   * - 400: Validation error or bot not found
   * - 500: Internal server error
   */
  post.set('/api/v2/deals/:dealType/:dealId/start', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { dealId: botId, dealType } = req.params
      const { symbol } = req.body as { symbol?: string }

      // Validate dealType
      if (!['dca', 'combo'].includes(dealType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid deal type. Must be one of: dca, combo',
          data: null,
        })
      }

      if (!botId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID is required',
          data: null,
        })
      }

      if (typeof botId !== 'string') {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot ID',
          data: null,
        })
      }

      try {
        let convertedSymbol = symbol

        if (typeof symbol !== 'undefined') {
          const convertedPairs = await checkPairs(
            botId,
            user.id,
            dealType as any,
            symbol,
          )
          if (convertedPairs.status === StatusEnum.notok) {
            return res.status(400).json(convertedPairs)
          }
          convertedSymbol = convertedPairs.data
        }

        const result =
          dealType === 'combo'
            ? await Bot.openComboDeal(user.id, botId, convertedSymbol)
            : await Bot.openDCADeal(user.id, botId, convertedSymbol)

        return res.status(200).json(result)
      } catch (error) {
        console.error(`Error starting ${dealType} deal:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to start ${dealType} deal`,
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/deals/dca/add-funds
   *
   * Add funds to a deal (works for all deal types)
   *
   *
   * Body: { qty: string, asset?: OrderSizeTypeEnum, symbol?: string, type?: AddFundsTypeEnum, }
   *
   * Response:
   * - 200: Funds added successfully
   * - 400: Validation error or deal not found
   * - 500: Internal server error
   */
  post.set('/api/v2/deals/dca/add-funds', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { qty, asset, symbol, type } = req.body as {
        qty?: string
        asset?: OrderSizeTypeEnum
        symbol?: string
        type?: AddFundsTypeEnum
      }

      const { botId, dealId } = req.query as { botId?: string; dealId?: string }

      if (!botId && !dealId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID or Deal ID required',
        })
      }

      const fundsType = type || AddFundsTypeEnum.fixed

      if (!qty || (fundsType === AddFundsTypeEnum.fixed && !asset)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Missing required parameters',
        })
      }

      if (
        (typeof botId !== 'undefined' && typeof botId !== 'string') ||
        (typeof dealId !== 'undefined' && typeof dealId !== 'string') ||
        typeof qty !== 'string' ||
        (asset &&
          (typeof asset !== 'string' ||
            ![OrderSizeTypeEnum.base, OrderSizeTypeEnum.quote].includes(
              asset,
            ))) ||
        (symbol && typeof symbol !== 'string') ||
        (type &&
          ![AddFundsTypeEnum.fixed, AddFundsTypeEnum.perc].includes(type))
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid parameters',
        })
      }

      try {
        const result = await Bot.addDealFundsFromPublicApi(
          user.id,
          botId,
          qty,
          asset!,
          symbol,
          fundsType,
          dealId,
        )

        return res.status(200).json(result)
      } catch (error) {
        console.error('Error adding funds to deal:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to add funds to deal',
        })
      }
    },
  })

  /**
   * POST /api/v2/deals/dca/reduce-funds
   *
   * Reduce funds from a deal (works for all deal types)
   *
   * Body: { qty: string, asset?: OrderSizeTypeEnum, symbol?: string, type?: AddFundsTypeEnum }
   *
   * Response:
   * - 200: Funds reduced successfully
   * - 400: Validation error or deal not found
   * - 500: Internal server error
   */
  post.set('/api/v2/deals/dca/reduce-funds', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { qty, asset, symbol, type } = req.body as {
        qty?: string
        asset?: OrderSizeTypeEnum
        symbol?: string
        type?: AddFundsTypeEnum
      }

      const { botId, dealId } = req.query as { botId?: string; dealId?: string }

      if (!botId && !dealId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Bot ID of deal ID required',
        })
      }

      const fundsType = type || AddFundsTypeEnum.fixed

      if (!qty || (fundsType === AddFundsTypeEnum.fixed && !asset)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Missing required parameters',
        })
      }

      if (
        (typeof botId !== 'undefined' && typeof botId !== 'string') ||
        (typeof dealId !== 'undefined' && typeof dealId !== 'string') ||
        typeof qty !== 'string' ||
        (asset &&
          (typeof asset !== 'string' ||
            ![OrderSizeTypeEnum.base, OrderSizeTypeEnum.quote].includes(
              asset,
            ))) ||
        (symbol && typeof symbol !== 'string') ||
        (type &&
          ![AddFundsTypeEnum.fixed, AddFundsTypeEnum.perc].includes(type))
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid parameters',
        })
      }

      try {
        const result = await Bot.reduceDealFundsFromPublicApi(
          user.id,
          botId,
          qty,
          asset!,
          symbol,
          fundsType,
          dealId,
        )

        return res.status(200).json(result)
      } catch (error) {
        console.error('Error reducing funds from deal:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to reduce funds from deal',
        })
      }
    },
  })

  // Import v1 API for POST, PUT, DELETE operations
  // These operations don't use field selection, so we map them 1:1
  const v1API = allAPI(userDb, Bot)

  // DO NOT auto-map v1 endpoints that we've explicitly defined as REST above
  const excludedV1Routes = [
    '/api/updateDCABot',
    '/api/updateComboBot',
    '/api/startBot',
    '/api/stopBot',
    '/api/restoreBot',
    '/api/archiveBot',
    '/api/changeBotPairs',
    '/api/cloneDCABot',
    '/api/cloneComboBot',
    '/api/updateDCADeal',
    '/api/updateComboDeal',
    '/api/startDeal',
    '/api/addFunds',
    '/api/reduceFunds',
  ]

  /**
   * Create Server Side Backtest request
   */
  const createServerSideBacktestRequest = async (
    userId: string,
    botType: BotType,
    payload: ServerSideBacktestPayload,
    symbols: { pair: string; baseAsset: string; quoteAsset: string }[],
  ): Promise<BaseReturn<string>> => {
    try {
      // Apply default settings based on bot type, same pattern as create endpoints
      let enhancedPayload = { ...payload }

      if (botType === BotType.dca) {
        let settings: CreateDCABotInput = {
          ...DCA_FORM_DEFAULTS,
          ...(payload.data.settings as DCABotSettings),
          type: DCATypeEnum.regular,
          exchange: payload.data.exchange,
          exchangeUUID: payload.data.exchangeUUID,
        }
        settings = addIndicatorsDefaults(settings)

        enhancedPayload = {
          ...payload,
          type: BotType.dca,
          data: {
            ...payload.data,
            settings: settings as DCABotSettings,
          },
        }
      } else if (botType === BotType.combo) {
        let settings: CreateComboBotInput = {
          ...COMBO_FORM_DEFAULTS,
          ...(payload.data.settings as ComboBotSettings),
          dealCloseCondition: CloseConditionEnum.tp,
          dealCloseConditionSL: CloseConditionEnum.tp,
          dcaCondition: DCAConditionEnum.percentage,
          scaleDcaType: ScaleDcaTypeEnum.percentage,
          type: DCATypeEnum.regular,
          exchange: payload.data.exchange,
          exchangeUUID: payload.data.exchangeUUID,
        }
        settings = addIndicatorsDefaults(settings)

        enhancedPayload = {
          ...payload,
          type: BotType.combo,
          data: {
            ...payload.data,
            settings: settings as ComboBotSettings,
          },
        }
      } else if (botType === BotType.grid) {
        const settings: CreateGridBotInput = {
          ...GRID_FORM_DEFAULTS,
          ...(payload.data.settings as BotSettings),
          exchange: payload.data.exchange,
          exchangeUUID: payload.data.exchangeUUID,
        }

        enhancedPayload = {
          ...payload,
          type: BotType.grid,
          data: {
            ...payload.data,
            settings: settings as BotSettings,
          },
        }
      }

      let requestId = ''
      const baseRequestData = {
        userId,
        status: BacktestRequestStatus.pending,
        exchange: enhancedPayload.data.exchange,
        exchangeUUID: enhancedPayload.data.exchangeUUID,
        symbols,
        statusHistory: [
          { status: BacktestRequestStatus.pending, time: +new Date() },
        ],
        cost: 0,
      }

      if (botType === BotType.dca) {
        const dcaRequest = await dcaBacktestRequestDb.createData({
          ...baseRequestData,
          type: BotType.dca,
          payload: enhancedPayload as ServerSideBacktestPayload,
        })
        if (dcaRequest.status === StatusEnum.notok) {
          return dcaRequest
        }
        requestId = `${dcaRequest.data._id}`
      } else if (botType === BotType.combo) {
        const comboRequest = await comboBacktestRequestDb.createData({
          ...baseRequestData,
          type: BotType.combo,
          payload: enhancedPayload as ServerSideBacktestPayload,
        })
        if (comboRequest.status === StatusEnum.notok) {
          return comboRequest
        }
        requestId = `${comboRequest.data._id}`
      } else if (botType === BotType.grid) {
        const gridRequest = await gridBacktestRequestDb.createData({
          ...baseRequestData,
          type: BotType.grid,
          payload: enhancedPayload as ServerSideBacktestPayload,
        })
        if (gridRequest.status === StatusEnum.notok) {
          return gridRequest
        }
        requestId = `${gridRequest.data._id}`
      } else {
        return {
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be dca, combo, or grid.',
          data: null,
        }
      }

      await sendServerSideRequest(
        enhancedPayload as ServerSideBacktestPayload,
        userId,
        requestId,
      )
      return {
        status: StatusEnum.ok,
        data: requestId,
        reason: null,
      }
    } catch (e: any) {
      let message = `${(e as Error)?.message || e}`
      if (message.includes('ECONNREFUSED') || message.includes('connect')) {
        message = 'Server is not available. Please try again later'
      }
      return {
        status: StatusEnum.notok,
        data: null,
        reason: `Request not sent: ${message}`,
      }
    }
  }

  /**
   * POST /api/v2/backtest/:botType/request
   *
   * Request Server Side Backtest for specific bot type
   *
   * URL params:
   * - botType: Type of bot (dca, combo, grid)
   *
   * Body: { payload: Omit<ServerSideBacktestPayload, 'type'>, symbols: BacktestSymbol[] }
   *
   * Headers:
   * - paper-context: true|false (optional, defaults to false)
   *
   * Response:
   * - 200: Backtest request submitted successfully
   * - 400: Validation error
   * - 401: Unauthorized
   * - 500: Internal server error
   */
  post.set('/api/v2/backtest/:botType/request', {
    middlewares: [paperContextMiddleware],
    handler: async (req, res) => {
      const user = req.userData
      const { botType } = req.params
      const {
        payload,
      }: {
        payload: Omit<ServerSideBacktestPayload, 'type'>
      } = req.body

      // Validate bot type from URL
      if (!['dca', 'combo', 'grid'].includes(botType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid bot type. Must be dca, combo, or grid',
          data: null,
        })
      }

      // Validate required fields
      if (!payload) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload is required',
          data: null,
        })
      }

      // Validate pairs in settings
      if (
        !payload.data?.settings?.pair ||
        !Array.isArray(payload.data.settings.pair)
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload must include settings with pair array',
          data: null,
        })
      }

      // Validate at least one pair
      if (payload.data.settings.pair.length === 0) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'At least one trading pair is required',
          data: null,
        })
      }

      // Validate payload.data structure
      if (
        !payload.data ||
        !payload.data.exchange ||
        !payload.data.exchangeUUID
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload must include data with exchange and exchangeUUID',
          data: null,
        })
      }

      try {
        // Build symbols array from pairs and exchange
        const symbols = payload.data.settings.pair.map((pair: string) => {
          const [baseAsset, quoteAsset] = pair.split('/')
          return {
            pair,
            baseAsset,
            quoteAsset,
          }
        })

        const result = await createServerSideBacktestRequest(
          user.id,
          botType as BotType,
          payload as ServerSideBacktestPayload,
          symbols,
        )

        if (result.status === StatusEnum.ok) {
          return res.status(200).json({
            status: StatusEnum.ok,
            reason: null,
            data: {
              message: `${botType.toUpperCase()} backtest request submitted successfully`,
              requestId: result.data,
            },
          })
        } else {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: result.reason || 'Failed to submit backtest request',
            data: null,
          })
        }
      } catch (error) {
        console.error(`Error submitting ${botType} backtest request:`, error)

        let errorMessage = 'Failed to submit backtest request'
        if (error instanceof Error) {
          if (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('connect')
          ) {
            errorMessage =
              'Backtest service is not available. Please try again later'
          } else {
            errorMessage = error.message
          }
        }

        return res.status(500).json({
          status: StatusEnum.notok,
          reason: errorMessage,
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/backtest/dca/estimate-cost
   *
   * Estimate DCA Server Side Backtest Cost
   *
   * Body: { payload: Omit<ServerSideBacktestPayload, 'type'> }
   *
   * Response:
   * - 200: Cost estimation completed successfully (always 0 for core docker)
   * - 400: Validation error
   * - 500: Internal server error
   */
  post.set('/api/v2/backtest/dca/estimate-cost', {
    middlewares: [],
    handler: async (req, res) => {
      const {
        payload,
      }: {
        payload: Omit<ServerSideBacktestPayload, 'type'>
      } = req.body

      // Validate required fields
      if (!payload) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload is required',
          data: null,
        })
      }

      // Validate pairs in settings
      if (
        !payload.data?.settings?.pair ||
        !Array.isArray(payload.data.settings.pair)
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload must include settings with pair array',
          data: null,
        })
      }

      // Validate at least one pair
      if (payload.data.settings.pair.length === 0) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'At least one trading pair is required',
          data: null,
        })
      }

      try {
        // For core docker installation, cost estimation is always 0
        const symbolCount = payload.data.settings.pair.length
        const estimatedCredits = 0

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            estimatedCredits,
            estimatedTimeMinutes: 1,
            symbolCount,
            botType: 'dca',
            factors: {
              baseCredits: 0,
              symbolMultiplier: 0,
              complexityMultiplier: 1,
              additionalCredits: 0,
            },
          },
        })
      } catch (error) {
        console.error('Error estimating DCA backtest cost:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to estimate DCA backtest cost',
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/backtest/combo/estimate-cost
   *
   * Estimate Combo Server Side Backtest Cost
   *
   * Body: { payload: Omit<ServerSideBacktestPayload, 'type'> }
   *
   * Response:
   * - 200: Cost estimation completed successfully (always 0 for core docker)
   * - 400: Validation error
   * - 500: Internal server error
   */
  post.set('/api/v2/backtest/combo/estimate-cost', {
    middlewares: [],
    handler: async (req, res) => {
      const {
        payload,
      }: {
        payload: Omit<ServerSideBacktestPayload, 'type'>
      } = req.body

      // Validate required fields
      if (!payload) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload is required',
          data: null,
        })
      }

      // Validate pairs in settings
      if (
        !payload.data?.settings?.pair ||
        !Array.isArray(payload.data.settings.pair)
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload must include settings with pair array',
          data: null,
        })
      }

      // Validate at least one pair
      if (payload.data.settings.pair.length === 0) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'At least one trading pair is required',
          data: null,
        })
      }

      try {
        // For core docker installation, cost estimation is always 0
        const symbolCount = payload.data.settings.pair.length
        const estimatedCredits = 0

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            estimatedCredits,
            estimatedTimeMinutes: 1,
            symbolCount,
            botType: 'combo',
            factors: {
              baseCredits: 0,
              symbolMultiplier: 0,
              complexityMultiplier: 1,
              additionalCredits: 0,
            },
          },
        })
      } catch (error) {
        console.error('Error estimating Combo backtest cost:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to estimate Combo backtest cost',
          data: null,
        })
      }
    },
  })

  /**
   * POST /api/v2/backtest/grid/estimate-cost
   *
   * Estimate Grid Server Side Backtest Cost
   *
   * Body: { payload: Omit<ServerSideBacktestPayload, 'type'> }
   *
   * Response:
   * - 200: Cost estimation completed successfully (always 0 for core docker)
   * - 400: Validation error
   * - 500: Internal server error
   */
  post.set('/api/v2/backtest/grid/estimate-cost', {
    middlewares: [],
    handler: async (req, res) => {
      const {
        payload,
      }: {
        payload: Omit<ServerSideBacktestPayload, 'type'>
      } = req.body

      // Validate required fields
      if (!payload) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload is required',
          data: null,
        })
      }

      // Validate pairs in settings
      if (
        !payload.data?.settings?.pair ||
        !Array.isArray(payload.data.settings.pair)
      ) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Payload must include settings with pair array',
          data: null,
        })
      }

      // Validate at least one pair
      if (payload.data.settings.pair.length === 0) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'At least one trading pair is required',
          data: null,
        })
      }

      try {
        // For core docker installation, cost estimation is always 0
        const symbolCount = payload.data.settings.pair.length
        const estimatedCredits = 0

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
          data: {
            estimatedCredits,
            estimatedTimeMinutes: 1,
            symbolCount,
            botType: 'grid',
            factors: {
              baseCredits: 0,
              symbolMultiplier: 0,
              complexityMultiplier: 1,
              additionalCredits: 0,
            },
          },
        })
      } catch (error) {
        console.error('Error estimating Grid backtest cost:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to estimate Grid backtest cost',
          data: null,
        })
      }
    },
  })

  // Map v1 POST endpoints to v2 with /v2 prefix and kebab-case (excluding REST endpoints)
  v1API.post.forEach((handler, route) => {
    if (!excludedV1Routes.includes(route)) {
      const v2Route = transformV1RouteToV2(route)
      post.set(v2Route, { handler, middlewares: [] })
    }
  })

  /**
   * PUT /api/v2/user/global-vars/:id
   *
   * Update an existing global variable
   *
   * Body: { name?: string, type?: GlobalVariablesTypeEnum, value?: string }
   *
   * Response:
   * - 200: Global variable updated successfully
   * - 400: Validation error
   * - 404: Global variable not found
   * - 500: Internal server error
   */
  put.set('/api/v2/user/global-vars/:id', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { id } = req.params
      const { name, type, value } = req.body as {
        name?: string
        type?: GlobalVariablesTypeEnum
        value?: string
      }

      if (!id) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Variable ID is required',
        })
      }

      try {
        // Check if variable exists and belongs to user
        const existing = await globalVarsDb.readData({
          _id: id,
          userId: user.id,
        })

        if (existing.status === StatusEnum.notok || !existing.data.result) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: 'Variable not found',
          })
        }

        const updateFields: any = {}

        // Validate name if provided
        if (name !== undefined) {
          if (typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({
              status: StatusEnum.notok,
              reason: 'Name must be a non-empty string',
            })
          }
          updateFields.name = name.trim()
        }

        // Validate type if provided
        if (type !== undefined) {
          if (!Object.values(GlobalVariablesTypeEnum).includes(type as any)) {
            return res.status(400).json({
              status: StatusEnum.notok,
              reason: `Type must be one of: ${Object.values(GlobalVariablesTypeEnum).join(', ')}`,
            })
          }
          updateFields.type = type
        }

        // Validate value if provided
        if (value !== undefined) {
          const finalType = type || existing.data.result.type
          const valueValidation = validateGlobalVariableValue(value, finalType)
          if (!valueValidation.valid) {
            return res.status(400).json({
              status: StatusEnum.notok,
              reason: valueValidation.error,
            })
          }
          updateFields.value = value
        }

        if (Object.keys(updateFields).length === 0) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: 'At least one field (name, type, value) must be provided',
          })
        }

        const valueChanged =
          value !== undefined && existing.data.result.value !== value

        const result = await globalVarsDb.updateData(
          { _id: id, userId: user.id },
          { $set: updateFields },
        )

        if (result.status === StatusEnum.notok) {
          return res.status(500).json(result)
        }

        // Notify bots if value changed and bots are using this variable
        if (valueChanged && existing.data.result.botAmount > 0) {
          const redis = await RedisClient.getInstance()
          redis.publish('updateglobalVars', JSON.stringify({ _id: `${id}` }))
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
        })
      } catch (error) {
        console.error('Error updating global variable:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to update global variable',
        })
      }
    },
  })

  v1API.put.forEach((handler, route) => {
    if (!excludedV1Routes.includes(route)) {
      const v2Route = transformV1RouteToV2(route)
      put.set(v2Route, { handler, middlewares: [] })
    }
  })

  /**
   * DELETE /api/v2/user/global-vars/:id
   *
   * Delete a global variable
   *
   * Response:
   * - 200: Global variable deleted successfully
   * - 400: Variable is used by bots (botAmount > 0)
   * - 404: Global variable not found
   * - 500: Internal server error
   */
  deleteMap.set('/api/v2/user/global-vars/:id', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { id } = req.params

      if (!id) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Variable ID is required',
        })
      }

      try {
        // Check if variable exists and belongs to user
        const existing = await globalVarsDb.readData({
          _id: id,
          userId: user.id,
        })

        if (existing.status === StatusEnum.notok || !existing.data.result) {
          return res.status(404).json({
            status: StatusEnum.notok,
            reason: 'Variable not found',
          })
        }

        // Check if variable is used by any bots
        const botCount = await getBotsByGlobalVar(id)
        if (botCount > 0) {
          return res.status(400).json({
            status: StatusEnum.notok,
            reason: `Variable is used in ${botCount} bot(s). Please remove it from all bots before deleting.`,
          })
        }

        const result = await globalVarsDb.deleteData({
          _id: id,
          userId: user.id,
        })

        if (result.status === StatusEnum.notok) {
          return res.status(500).json(result)
        }

        return res.status(200).json({
          status: StatusEnum.ok,
          reason: null,
        })
      } catch (error) {
        console.error('Error deleting global variable:', error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to delete global variable',
        })
      }
    },
  })

  /**
   * DELETE /api/v2/deals/:dealType/:dealId
   *
   * Close a deal (DCA, Combo, or Terminal)
   *
   * URL params:
   * - dealType: Type of deal (dca, combo, terminal)
   * - dealId: ID of the deal to close
   *
   * Query params:
   * - type: Close type (cancel, closeByLimit, closeByMarket, leave)
   *
   * Response:
   * - 200: Deal closed successfully
   * - 400: Validation error or deal not found
   * - 500: Internal server error
   */
  deleteMap.set('/api/v2/deals/:dealType/:dealId', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const { dealId, dealType } = req.params
      const { type } = req.query as { type?: CloseDCATypeEnum }

      // Validate dealType
      if (!['dca', 'combo', 'terminal'].includes(dealType)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid deal type. Must be one of: dca, combo, terminal',
          data: null,
        })
      }

      if (!dealId) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Deal ID is required',
          data: null,
        })
      }

      if (!type) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Close type is required',
          data: null,
        })
      }

      const validTypes = [
        CloseDCATypeEnum.cancel,
        CloseDCATypeEnum.closeByLimit,
        CloseDCATypeEnum.closeByMarket,
        CloseDCATypeEnum.leave,
      ]

      if (!validTypes.includes(type)) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Invalid close type',
          data: null,
        })
      }

      try {
        // Select appropriate close method based on deal type
        const result =
          dealType === 'combo'
            ? await Bot.closeComboDeal(
                user.id,
                '',
                dealId,
                type,
                undefined,
                undefined,
                DCACloseTriggerEnum.api,
              )
            : await Bot.closeDCADeal(
                user.id,
                '',
                dealId,
                type,
                undefined,
                undefined,
                DCACloseTriggerEnum.api,
              )

        return res.status(200).json(result)
      } catch (error) {
        console.error(`Error closing ${dealType} deal:`, error)
        return res.status(500).json({
          status: StatusEnum.notok,
          reason:
            error instanceof Error
              ? error.message
              : `Failed to close ${dealType} deal`,
          data: null,
        })
      }
    },
  })

  v1API.delete.forEach((handler, route) => {
    const v2Route = transformV1RouteToV2(route)
    deleteMap.set(v2Route, { handler, middlewares: [] })
  })

  const getPublic: APIMap = new Map()
  v1API.getPublic.forEach((handler, route) => {
    const v2Route = transformV1RouteToV2(route)
    getPublic.set(v2Route, { handler, middlewares: [] })
  })

  v1API.get.forEach((handler, route) => {
    if (route === '/api/user/exchanges') {
      const v2Route = route.replace('/api/', '/api/v2/')
      get.set(v2Route, {
        handler,
        middlewares: [],
      })
    }
  })

  return { get, post, put, delete: deleteMap, getPublic }
}

export default v2API
