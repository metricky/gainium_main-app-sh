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
  BotVars,
  CreateDCABotInput,
  DCATypeEnum,
} from '../../../types'
import BotInstance from '../../bot'
import allAPI from '../api'
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
import { isFutures, isCoinm, isPaper } from '../../utils'
import { DCA_FORM_DEFAULTS, indicatorConfigDefaults } from './botDefaults'
import type { ResponseMeta } from './types'
import { DCABotSettings } from '../../../types'
import { validateCreateDCABotInput } from './validators'
import { Types } from 'mongoose'

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

const sortFields = <T extends Record<string, any>>(obj: T): T => {
  const sortedObj: Record<string, any> = {}
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      if (
        typeof obj[key] === 'object' &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        sortedObj[key] = sortFields(obj[key])
      }
      if (Array.isArray(obj[key])) {
        sortedObj[key] = obj[key].map((item: any) => {
          if (typeof item === 'object' && item !== null) {
            return sortFields(item)
          }
          return item
        })
      }
      sortedObj[key] = obj[key]
    })
  return sortedObj as T
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
      const paperContext = input.paperContext === true

      // 1. Validate exchangeUUID is provided FIRST (before fetching user)
      if (!input.exchangeUUID) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'exchangeUUID is required',
        })
      }

      // 2. Get user document
      const userResult = await userDb.readData({ _id: user.id })
      if (userResult.status !== StatusEnum.ok || !userResult.data?.result) {
        return res.status(500).json({
          status: StatusEnum.notok,
          reason: 'Failed to fetch user data',
        })
      }

      const userData = userResult.data.result

      // 3. Find exchange in user's exchanges
      const exchange = userData.exchanges?.find(
        (ex: any) => ex.uuid === input.exchangeUUID,
      )

      if (!exchange) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: 'Exchange not found',
        })
      }

      // 4. Verify exchange matches paper/real context using isPaper() helper
      const isExchangePaper = isPaper(exchange.provider)
      if (isExchangePaper !== paperContext) {
        return res.status(400).json({
          status: StatusEnum.notok,
          reason: paperContext
            ? 'Exchange is not a paper trading exchange'
            : 'Exchange is a paper trading exchange, use paper context',
        })
      }

      // 5. Merge defaults with user input, then override exchange-specific fields
      const settings: CreateDCABotInput = {
        ...DCA_FORM_DEFAULTS,
        ...input,
        type: DCATypeEnum.regular,
        // Override futures/coinm based on exchange provider (not user input!)
        futures: isFutures(exchange.provider),
        coinm: isCoinm(exchange.provider),
        exchange: exchange.provider,
        exchangeUUID: exchange.uuid,
        vars: (input.vars || []).reduce(
          (acc, { path, variable }) => {
            if (!acc.list.includes(variable)) {
              acc.list.push(variable)
            }
            acc.paths.push({ path, variable })
            return acc
          },
          {
            list: [],
            paths: [],
          } as BotVars,
        ),
      }

      if (settings.indicators.length) {
        settings.indicators = settings.indicators.map((indicator) => ({
          ...(indicatorConfigDefaults[indicator.type] ?? {}),
          ...indicator,
        }))
      }

      delete (settings as any).paperContext

      try {
        if (settings.vars?.paths.length) {
          const readVars = await globalVarsDb.readData(
            {
              userId: userData._id,
              _id: {
                $in: settings.vars.list.map((p) => {
                  try {
                    return new Types.ObjectId(p)
                  } catch {
                    return null
                  }
                }),
              },
            },
            { name: 1, value: 1 },
            {},
            true,
          )
          if (readVars.status === StatusEnum.ok && readVars.data?.result) {
            for (const path of settings.vars.paths) {
              const found = readVars.data.result.find(
                (v) => v._id.toString() === path.variable,
              )
              if (found) {
                if (path.path in settings) {
                  ;(settings as any)[path.path] = found.value
                }
                const split = path.path.split('.')
                if (split.length === 3) {
                  const [parent, uuid, subChild] = split
                  if (parent in settings) {
                    const child = (settings as any)[parent].find(
                      (c: any) => c.uuid === uuid,
                    )
                    if (child && subChild in child) {
                      child[subChild] = found.value
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // Ignore errors related to vars fetching/parsing, we will validate vars properly in the validator function
      }

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
  v1API.put.forEach((handler, route) => {
    const v2Route = route.replace('/api/', '/api/v2/')
    put.set(v2Route, { handler, middlewares: [] })
  })

  // Map v1 DELETE endpoints to v2 with /v2 prefix
  const deleteMap: APIMap = new Map()
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
