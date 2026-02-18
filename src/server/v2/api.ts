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
} from '../../db/dbInit'
import DB from '../../db'
import { buildProjection } from './fieldUtils'
import { fieldSelectionMiddlewares } from './middleware'
import { isFutures, isCoinm } from '../../utils'
import type { ResponseMeta } from './types'

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

  // Import v1 API for POST, PUT, DELETE operations
  // These operations don't use field selection, so we map them 1:1
  const v1API = allAPI(userDb, Bot)

  // Map v1 POST endpoints to v2 with /v2 prefix
  const post: APIMap = new Map()
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

  return { get, post, put, delete: deleteMap, getPublic }
}

export default v2API
