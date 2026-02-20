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
import {
  StatusEnum,
  BotStatusEnum,
  DCADealStatusEnum,
  BotType,
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
} from '../../../types'
import BotInstance from '../../bot'
import allAPI from '../api'
import { getBotsByGlobalVar } from '../../bot/utils'
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
import { fieldSelectionMiddlewares } from './middleware'
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
  paperContext?: boolean
  vars?: { path: string; variable: string }[]
}

export type CreateGridBotInputRaw = Partial<CreateGridBotInput> & {
  exchangeUUID?: string
  paperContext?: boolean
  vars?: { path: string; variable: string }[]
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

  /**
   * GET /api/v2/bots/dca
   *
   * List DCA bots with field selection
   *
   * Query params:
   * - fields: Field selection (minimal|standard|extended|full|custom list)
   * - status: Filter by status
   * - paperContext: Filter by paper context (true|false)
   * - page: Page number (default: 1)
   *
   * Examples:
   * - ?fields=minimal (default)
   * - ?fields=standard
   * - ?fields=id,name,status,settings.pair,profit.total
   * - ?fields=full
   */
  get.set('/api/v2/bots/dca', {
    middlewares: fieldSelectionMiddlewares('bots.dca'),
    handler: async (req, res) => {
      const {
        status,
        paperContext,
        page: _page,
      }: {
        status?: BotStatusEnum
        paperContext?: string
        page?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection

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

      // Validate paperContext
      if (
        typeof paperContext !== 'undefined' &&
        paperContext !== 'false' &&
        paperContext !== 'true'
      ) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid paperContext parameter',
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

      filter.paperContext =
        paperContext === 'true' ? { $eq: true } : { $ne: true }

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
    middlewares: fieldSelectionMiddlewares('bots.combo'),
    handler: async (req, res) => {
      const {
        status,
        paperContext,
        page: _page,
      }: {
        status?: BotStatusEnum
        paperContext?: string
        page?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection

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

      if (
        typeof paperContext !== 'undefined' &&
        paperContext !== 'false' &&
        paperContext !== 'true'
      ) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid paperContext parameter',
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

      if (typeof paperContext !== 'undefined') {
        filter.paperContext =
          paperContext === 'true' ? { $eq: true } : { $ne: true }
      }

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
   * GET /api/v2/deals
   *
   * List deals (DCA or Combo) with field selection
   *
   * Query params:
   * - fields: Field selection
   * - status: Filter by status
   * - paperContext: Filter by paper context
   * - page: Page number
   * - botId: Filter by bot ID
   * - botType: dca or combo (default: dca)
   */
  get.set('/api/v2/deals', {
    middlewares: fieldSelectionMiddlewares('deals.dca'),
    handler: async (req, res) => {
      const {
        status,
        paperContext,
        page: _page,
        botId,
        botType,
      }: {
        status?: DCADealStatusEnum
        paperContext?: string
        page?: string
        botId?: string
        botType?: BotType
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection

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

      if (
        typeof paperContext !== 'undefined' &&
        paperContext !== 'false' &&
        paperContext !== 'true'
      ) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid paperContext parameter',
          data: null,
        })
        return
      }

      const validBotTypes = [BotType.dca, BotType.combo]
      const type = botType || BotType.dca
      if (!validBotTypes.includes(type)) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid botType parameter',
          data: null,
        })
        return
      }

      const page = _page && !isNaN(+_page) ? +_page : 1

      const filter: Record<string, any> = {
        userId: user.id,
        isDeleted: { $ne: true },
      }

      if (status) {
        filter.status = status
      }

      if (botId) {
        filter.botId = botId
      }

      if (typeof paperContext !== 'undefined') {
        filter.paperContext =
          paperContext === 'true' ? { $eq: true } : { $ne: true }
      }

      const projection = buildProjection(fields || null)
      const limit = defaultPaginations.deals
      const skip = (page - 1) * limit

      try {
        const result =
          type === BotType.combo
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
    middlewares: fieldSelectionMiddlewares('balances'),
    handler: async (req, res) => {
      const {
        paperContext: _paperContext,
        page: _page,
        exchangeId: _exchangeId,
        assets: _assets,
      }: {
        paperContext?: string
        page?: string
        exchangeId?: string
        assets?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection

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

      const paperContext =
        _paperContext === 'true'
          ? true
          : _paperContext === 'false'
            ? false
            : null

      const limit = defaultPaginations.balances

      const filter: Record<string, unknown> = {
        userId: `${user.id}`,
      }

      if (exchangeId) {
        filter.exchangeUUID = exchangeId
      }

      if (paperContext !== null && !exchangeId) {
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
   * GET /api/v2/user/globalVars
   *
   * List global variables
   *
   * Query params:
   * - page: Page number (default: 1)
   */
  get.set('/api/v2/user/globalVars', {
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
    middlewares: fieldSelectionMiddlewares('bots.grid'),
    handler: async (req, res) => {
      const {
        status,
        paperContext,
        page: _page,
      }: {
        status?: BotStatusEnum
        paperContext?: string
        page?: string
      } = req.query

      const user = req.userData
      const fields = req.fieldSelection

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

      if (
        typeof paperContext !== 'undefined' &&
        paperContext !== 'false' &&
        paperContext !== 'true'
      ) {
        res.status(400).send({
          status: StatusEnum.notok,
          reason: 'Invalid paperContext parameter',
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

      if (typeof paperContext !== 'undefined') {
        filter.paperContext =
          paperContext === 'true' ? { $eq: true } : { $ne: true }
      }

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

  // POST endpoints
  const post: APIMap = new Map()

  /**
   * POST /api/v2/user/globalVars
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
  post.set('/api/v2/user/globalVars', {
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
   * POST /api/v2/createDCABot
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
  post.set('/api/v2/createDCABot', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateDCABotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input,
        user.id,
        userDb,
        res,
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

      delete (settings as any).paperContext

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
   * POST /api/v2/createComboBot
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
  post.set('/api/v2/createComboBot', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateDCABotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input,
        user.id,
        userDb,
        res,
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

      delete (settings as any).paperContext

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
   * POST /api/v2/createTerminalDeal
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
  post.set('/api/v2/createTerminalDeal', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateDCABotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input,
        user.id,
        userDb,
        res,
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

      delete (settings as any).paperContext

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
   * POST /api/v2/createGridBot
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
  post.set('/api/v2/createGridBot', {
    middlewares: [],
    handler: async (req, res) => {
      const user = req.userData
      const input = req.body as CreateGridBotInputRaw

      // Validate context (exchange, paperContext, etc.)
      const contextValidation = await validateBotCreationContext(
        input as any,
        user.id,
        userDb,
        res,
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

      delete (settings as any).paperContext
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

  // Import v1 API for POST, PUT, DELETE operations
  // These operations don't use field selection, so we map them 1:1
  const v1API = allAPI(userDb, Bot)

  // Map v1 POST endpoints to v2 with /v2 prefix
  v1API.post.forEach((handler, route) => {
    const v2Route = route.replace('/api/', '/api/v2/')
    post.set(v2Route, { handler, middlewares: [] })
  })

  // Map v1 PUT endpoints to v2 with /v2 prefix
  const put: APIMap = new Map()

  /**
   * PUT /api/v2/user/globalVars/:id
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
  put.set('/api/v2/user/globalVars/:id', {
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
    const v2Route = route.replace('/api/', '/api/v2/')
    put.set(v2Route, { handler, middlewares: [] })
  })

  // Map v1 DELETE endpoints to v2 with /v2 prefix
  const deleteMap: APIMap = new Map()

  /**
   * DELETE /api/v2/user/globalVars/:id
   *
   * Delete a global variable
   *
   * Response:
   * - 200: Global variable deleted successfully
   * - 400: Variable is used by bots (botAmount > 0)
   * - 404: Global variable not found
   * - 500: Internal server error
   */
  deleteMap.set('/api/v2/user/globalVars/:id', {
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

  v1API.delete.forEach((handler, route) => {
    const v2Route = route.replace('/api/', '/api/v2/')
    deleteMap.set(v2Route, { handler, middlewares: [] })
  })

  const getPublic: APIMap = new Map()
  v1API.getPublic.forEach((handler, route) => {
    const v2Route = route.replace('/api/', '/api/v2/')
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
