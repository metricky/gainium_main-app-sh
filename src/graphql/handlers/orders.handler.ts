import ExchangeChooser from '../../exchange/exchangeChooser'
import {
  BaseReturn,
  BotMarginTypeEnum,
  ExchangeInUser,
  GeneralFuture,
  GeneralOpenOrder,
  StatusEnum,
  PositionSide,
  OrderTypes,
  TypeOrderEnum,
  ExchangeEnum,
  ExcludeDoc,
  DCABotSchema,
  DCABotSettings,
} from '../../../types'
import {
  botDb,
  dcaBotDb,
  orderDb,
  pairDb,
  comboBotDb,
  dcaDealsDb,
  comboDealsDb,
} from '../../db/dbInit'
import { getFuturePositionId } from '../../exchange/helpers'
import { isFutures, isPaper } from '../../utils'
import { MathHelper } from '../../utils/math'

const math = new MathHelper()

export const getAllOpenOrders = async (
  exchanges: ExchangeInUser[],
): Promise<BaseReturn<GeneralOpenOrder[]>> => {
  const queries: Promise<any>[] = []
  for (const exchange of exchanges) {
    const exchangeFactory = ExchangeChooser.chooseExchangeFactory(
      exchange.provider,
    )
    const exchangeInstance = exchangeFactory(
      exchange.key,
      exchange.secret,
      exchange.passphrase,
      undefined,
      exchange.keysType,
      exchange.okxSource,
    )
    queries.push(
      exchangeInstance
        .getAllOpenOrders(undefined, true)
        .then((orders) => {
          if (orders.status === StatusEnum.ok) {
            return orders.data.map((order) => ({
              exchange: exchange.provider,
              exchangeUUID: exchange.uuid,
              exchangeName: exchange.name,
              created: new Date(order.updateTime),
              symbol: order.symbol,
              side: order.side,
              type: order.type,
              orderId: `${order.orderId}`,
              status: order.status,
              price: order.price,
              quantity: order.origQty,
              clientOrderId: order.clientOrderId,
              executedQty: order.executedQty,
            }))
          }
          return []
        })
        .catch(() => {
          return []
        }),
    )
  }
  const ordersFromExchanges = (await Promise.all(queries)).flat()
  if (ordersFromExchanges.length === 0) {
    return { status: StatusEnum.ok, reason: null, data: [] }
  }
  const clientOrderIds = ordersFromExchanges.map(
    ({ clientOrderId }) => clientOrderId,
  )
  const ordersFromDb = await getOrderBotData(clientOrderIds)
  if (ordersFromDb.status === StatusEnum.notok) {
    return ordersFromDb
  }
  const preparedOrders = ordersFromDb.data.result.reduce(
    (obj, item) =>
      Object.assign(obj, {
        [item.orderId]: {
          botId: item.botId,
          name: item.name,
          type: item.type,
          dealId: item.dealId,
          parentBotId: item.parentBotId,
        },
      }),
    {} as {
      [x: string | number]: {
        botId: string
        name: string
        type: string
        dealId: string
        parentBotId?: string | null
      }
    },
  )
  const pairsInfo = await pairDb.readData(
    {
      pair: { $in: ordersFromExchanges.map(({ symbol }) => symbol) },
    },
    undefined,
    undefined,
    true,
  )
  if (pairsInfo.status === StatusEnum.notok) {
    return pairsInfo
  }
  const preparedPairs: { [key: string]: { quote: string; base: string } } =
    pairsInfo.data.result.reduce(
      (obj, item) =>
        Object.assign(obj, {
          [item.pair]: {
            quote: item.quoteAsset.name,
            base: item.baseAsset.name,
          },
        }),
      {},
    )
  return {
    status: StatusEnum.ok,
    reason: null,
    data: ordersFromExchanges.map((order) => {
      if (order.exchange === ExchangeEnum.okxLinear) {
        const pair = pairsInfo.data.result.find(
          (p) =>
            p.pair === order.symbol && p.exchange === ExchangeEnum.okxLinear,
        )
        if (pair) {
          const denominator =
            pair.baseAsset.step > 1
              ? 1 / pair.baseAsset.step
              : +`1${'0'.repeat(
                  math.getPricePrecision(`${pair.baseAsset.step ?? 1}`),
                )}`
          order.quantity = order.quantity / denominator
          order.executedQty = order.executedQty / denominator
        }
      }
      return {
        exchange: order.exchange,
        exchangeUUID: order.exchangeUUID,
        exchangeName: order.exchangeName,
        created: order.created,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        botName: preparedOrders[order.orderId]?.name,
        botId:
          preparedOrders[order.orderId]?.parentBotId ||
          preparedOrders[order.orderId]?.botId,
        botType: getBotType(
          preparedOrders[order.orderId]?.type,
          preparedOrders[order.orderId]?.parentBotId,
        ),
        status: order.status,
        dealId: preparedOrders[order.orderId]?.dealId,
        price: order.price,
        quantity: order.quantity,
        baseAssetName: preparedPairs[order.symbol]?.base,
        quoteAssetName: preparedPairs[order.symbol]?.quote,
        orderId: order.orderId,
        executedQty: order.executedQty,
        clientOrderId: order.clientOrderId,
      }
    }),
  }
}

export const getAllOpenPositions = async (
  exchanges: ExchangeInUser[],
  userId: string,
): Promise<BaseReturn<GeneralFuture[]>> => {
  const queries: Promise<any>[] = []
  for (const exchange of exchanges.filter((e) => isFutures(e.provider))) {
    const exchangeFactory = ExchangeChooser.chooseExchangeFactory(
      exchange.provider,
    )
    const exchangeInstance = exchangeFactory(
      exchange.key,
      exchange.secret,
      exchange.passphrase,
      undefined,
      exchange.keysType,
      exchange.okxSource,
    )
    queries.push(
      exchangeInstance
        .futures_getPositions()
        .then((positions) => {
          if (positions.status === StatusEnum.ok) {
            return positions.data
              .filter((p) => +p.positionAmt !== 0)
              .map((position) => ({
                exchange: exchange.provider,
                exchangeUUID: exchange.uuid,
                exchangeName: exchange.name,
                created: new Date(position.updateTime),
                symbol: position.symbol,
                side: position.positionSide,
                positionId: getFuturePositionId({
                  ...position,
                  exchange: exchange.uuid,
                  marginType: getPositionMarginType(position.isolated),
                  positionSide:
                    position.positionSide === 'BOTH'
                      ? +position.positionAmt > 0
                        ? 'LONG'
                        : 'SHORT'
                      : position.positionSide,
                  paper: isPaper(exchange.provider),
                }),
                leverage: position.leverage,
                price: position.entryPrice,
                quantity: `${Math.abs(+position.positionAmt)}`,
                marginType: getPositionMarginType(position.isolated),
              }))
          }
          return []
        })
        .catch(() => {
          return []
        }),
    )
  }
  const positionsFromExchanges = (await Promise.all(queries)).flat()
  const positionsBotInfo = await getImportedPositions(
    positionsFromExchanges.map(({ positionId }) => positionId),
    userId,
    exchanges,
  )
  if (positionsBotInfo.status === StatusEnum.notok) {
    return {
      status: StatusEnum.notok,
      reason: positionsBotInfo.reason,
      data: null,
    }
  }
  const positionsBotData = positionsBotInfo.data
  const pairsInfo = await pairDb.readData(
    {
      pair: { $in: positionsFromExchanges.map(({ symbol }) => symbol) },
    },
    undefined,
    undefined,
    true,
  )
  if (pairsInfo.status === StatusEnum.notok) {
    return pairsInfo
  }
  const preparedPairs: { [key: string]: { quote: string; base: string } } =
    pairsInfo.data.result.reduce(
      (obj, item) =>
        Object.assign(obj, {
          [item.pair]: {
            quote: item.quoteAsset.name,
            base: item.baseAsset.name,
          },
        }),
      {},
    )

  return {
    status: StatusEnum.ok,
    reason: null,
    data: positionsFromExchanges.map((position) => {
      if (position.exchange === ExchangeEnum.okxLinear) {
        const pair = pairsInfo.data.result.find(
          (p) =>
            p.pair === position.symbol && p.exchange === ExchangeEnum.okxLinear,
        )
        if (pair) {
          const denominator =
            pair.baseAsset.step > 1
              ? 1 / pair.baseAsset.step
              : +`1${'0'.repeat(
                  math.getPricePrecision(`${pair.baseAsset.step ?? 1}`),
                )}`
          position.quantity = position.quantity / denominator
        }
      }
      return {
        exchange: position.exchange,
        exchangeUUID: position.exchangeUUID,
        exchangeName: position.exchangeName,
        created: position.created,
        symbol: position.symbol,
        side: position.side,
        botName: positionsBotData[position.positionId]?.name,
        botId:
          positionsBotData[position.positionId]?.parentBotId ||
          positionsBotData[position.positionId]?.botId,
        botType: getBotType(
          positionsBotData[position.positionId]?.type,
          positionsBotData[position.positionId]?.parentBotId,
        ),
        price: position.price,
        quantity: position.quantity,
        baseAssetName: preparedPairs[position.symbol]?.base,
        quoteAssetName: preparedPairs[position.symbol]?.quote,
        positionId: position.positionId,
        leverage: position.leverage,
        marginType: position.marginType,
      }
    }),
  }
}

const getPositionMarginType = (isolated: boolean) => {
  return isolated ? BotMarginTypeEnum.isolated : BotMarginTypeEnum.cross
}

export const cancelOrderOnExchange = async (
  exchange: ExchangeInUser,
  orderId: string,
  symbol: string,
) => {
  const exchangeFactory = ExchangeChooser.chooseExchangeFactory(
    exchange.provider,
  )
  const exchangeInstance = exchangeFactory(
    exchange.key,
    exchange.secret,
    exchange.passphrase,
    undefined,
    exchange.keysType,
    exchange.okxSource,
  )
  const result = await exchangeInstance.cancelOrderByOrderIdAndSymbol({
    orderId,
    symbol,
  })
  return result
}

export const placeOrderOnExchange = async (
  exchange: ExchangeInUser,
  order: {
    symbol: string
    side: OrderTypes
    quantity: number
    price: number
    newClientOrderId?: string
    type?: 'LIMIT' | 'MARKET'
    reduceOnly?: boolean
    positionSide?: PositionSide
    leverage?: number
  },
) => {
  const exchangeFactory = ExchangeChooser.chooseExchangeFactory(
    exchange.provider,
  )
  const exchangeInstance = exchangeFactory(
    exchange.key,
    exchange.secret,
    exchange.passphrase,
    undefined,
    exchange.keysType,
    exchange.okxSource,
  )
  const result = await exchangeInstance.openOrder(order)
  return result
}

const getOrderBotData = (clientOrderIds: string[]) => {
  return orderDb.aggregate<{
    botId: string
    orderId: string | number
    name: string
    type: string
    dealId: string
    typeOrder: TypeOrderEnum
    parentBotId?: string | null
  }>([
    {
      $match: {
        clientOrderId: {
          //@ts-ignore
          $in: clientOrderIds,
        },
      },
    },
    {
      $group: {
        _id: '$botId',
        orders: { $push: '$$ROOT' },
      },
    },
    {
      $lookup: {
        from: 'dcabots',
        as: 'dcab',
        let: { bId: { $toObjectId: '$_id' } },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$$bId', '$_id'] },
                  {
                    $not: { $eq: ['$isDeleted', true] },
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              'settings.name': 1,
              'settings.type': 1,
              parentBotId: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: 'bots',
        as: 'gridb',
        let: { bId: { $toObjectId: '$_id' } },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$$bId', '$_id'] },
                  {
                    $not: { $eq: ['$isDeleted', true] },
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              'settings.name': 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: 'combobots',
        as: 'combob',
        let: { bId: { $toObjectId: '$_id' } },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$$bId', '$_id'] },
                  {
                    $not: { $eq: ['$isDeleted', true] },
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              'settings.name': 1,
              parentBotId: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$dcab',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: '$gridb',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: '$combob',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: '$orders',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $project: {
        botId: {
          $cond: {
            if: '$dcab._id',
            then: '$_id',
            else: {
              $cond: {
                if: '$gridb._id',
                then: '$_id',
                else: {
                  $cond: {
                    if: '$combob._id',
                    then: '$_id',
                    else: '',
                  },
                },
              },
            },
          },
        },
        orderId: '$orders.orderId',
        name: {
          $cond: {
            if: '$dcab.settings.name',
            then: '$dcab.settings.name',
            else: {
              $cond: {
                if: '$gridb.settings.name',
                then: '$gridb.settings.name',
                else: '$combob.settings.name',
              },
            },
          },
        },
        type: {
          $cond: {
            if: '$dcab.settings.type',
            then: '$dcab.settings.type',
            else: {
              $cond: {
                if: '$combob.settings.name',
                then: 'combo',
                else: '',
              },
            },
          },
        },
        dealId: '$orders.dealId',
        _id: 0,
        parentBotId: {
          $cond: {
            if: '$dcab._id',
            then: '$dcab.parentBotId',
            else: {
              $cond: {
                if: '$gridb._id',
                then: '$gridb.parentBotId',
                else: {
                  $cond: {
                    if: '$combob._id',
                    then: '$combob.parentBotId',
                    else: '',
                  },
                },
              },
            },
          },
        },
      },
    },
  ])
}

const getImportedPositions = async (
  postionIds: string[],
  userId: string,
  exchanges?: ExchangeInUser[],
) => {
  const dealSearch: { [x: string]: unknown } = {
    userId,
    'settings.futures': true,
    isDeleted: { $ne: true },
    status: 'open',
  }
  if (exchanges) {
    const filter = exchanges.filter((e) => isFutures(e.provider))
    dealSearch['exchangeUUID'] = { $in: filter.map((e) => e.uuid) }
  }
  const usersDcaDeals = await dcaDealsDb.readData(
    dealSearch,
    undefined,
    undefined,
    true,
  )
  if (usersDcaDeals.status === StatusEnum.notok) {
    return usersDcaDeals
  }
  const usersComboDeals = await comboDealsDb.readData(
    dealSearch,
    undefined,
    undefined,
    true,
  )
  if (usersComboDeals.status === StatusEnum.notok) {
    return usersComboDeals
  }
  const usersGridBots = await botDb.readData(
    {
      userId,
      'position.qty': { $gt: 0 },
      'settings.futures': true,
      isDeleted: { $ne: true },
    },
    undefined,
    undefined,
    true,
  )
  if (usersGridBots.status === StatusEnum.notok) {
    return usersGridBots
  }
  const positionsBotsInfo: {
    [key: string]: {
      botId: string
      name: string
      type: string
      parentBotId?: string | null
    }
  } = {}
  const bots: ExcludeDoc<DCABotSchema<DCABotSettings>>[] = []
  for (const dcadeal of usersDcaDeals.data.result) {
    if (
      dcadeal.settings.futures &&
      dcadeal.settings.marginType &&
      dcadeal.settings.leverage
    ) {
      const botPositionId = getFuturePositionId({
        symbol: dcadeal.symbol.symbol,
        marginType:
          dcadeal.settings.marginType === BotMarginTypeEnum.inherit
            ? BotMarginTypeEnum.isolated
            : isPaper(dcadeal.exchange as ExchangeEnum)
              ? BotMarginTypeEnum.isolated
              : dcadeal.settings.marginType,
        leverage:
          dcadeal.settings.marginType === BotMarginTypeEnum.inherit
            ? '1'
            : `${dcadeal.settings.leverage}`,
        positionSide: dcadeal.strategy,
        exchange: dcadeal.exchangeUUID,
        paper: !!dcadeal.paperContext,
      })
      const find = bots.find((b) => b._id.toString() === dcadeal.botId)
      const bot =
        find || (await dcaBotDb.readData({ _id: dcadeal.botId }))?.data?.result
      if (!find && bot) {
        bots.push(bot)
      }
      const positionId = postionIds.find(
        (id) =>
          botPositionId.includes(id) || bot?.settings.importFrom?.includes(id),
      )
      if (positionId && bot) {
        positionsBotsInfo[positionId] = {
          botId: bot._id.toString(),
          name: bot.settings.name,
          type: bot.settings.type || '',
          parentBotId: bot.parentBotId,
        }
      }
    }
  }
  const combobots: ExcludeDoc<DCABotSchema<DCABotSettings>>[] = []
  for (const combodeal of usersComboDeals.data.result) {
    if (
      combodeal.settings.futures &&
      combodeal.settings.marginType &&
      combodeal.settings.leverage
    ) {
      const botPositionId = getFuturePositionId({
        symbol: combodeal.symbol.symbol,
        marginType:
          combodeal.settings.marginType === BotMarginTypeEnum.inherit
            ? BotMarginTypeEnum.isolated
            : isPaper(combodeal.exchange as ExchangeEnum)
              ? BotMarginTypeEnum.isolated
              : combodeal.settings.marginType,
        leverage:
          combodeal.settings.marginType === BotMarginTypeEnum.inherit
            ? '1'
            : `${combodeal.settings.leverage}`,
        positionSide: combodeal.strategy,
        exchange: combodeal.exchangeUUID,
        paper: !!combodeal.paperContext,
      })
      const find = combobots.find((b) => b._id.toString() === combodeal.botId)
      const bot =
        find ||
        (await comboBotDb.readData({ _id: combodeal.botId }))?.data?.result
      if (!find && bot) {
        combobots.push(bot)
      }
      const positionId = postionIds.find(
        (id) =>
          botPositionId.includes(id) || bot?.settings.importFrom?.includes(id),
      )
      if (positionId && bot) {
        positionsBotsInfo[positionId] = {
          botId: bot._id.toString(),
          name: bot.settings.name,
          type: 'combo',
          parentBotId: bot.parentBotId,
        }
      }
    }
  }
  for (const gridbot of usersGridBots.data.result) {
    if (
      gridbot.settings.futures &&
      gridbot.settings.marginType &&
      gridbot.settings.leverage &&
      gridbot.position.qty > 0
    ) {
      const botPositionId = getFuturePositionId({
        symbol: gridbot.settings.pair,
        marginType:
          gridbot.settings.marginType === BotMarginTypeEnum.inherit
            ? BotMarginTypeEnum.isolated
            : isPaper(gridbot.exchange)
              ? BotMarginTypeEnum.isolated
              : gridbot.settings.marginType,
        leverage:
          gridbot.settings.marginType === BotMarginTypeEnum.inherit
            ? '1'
            : `${gridbot.settings.leverage}`,
        positionSide: gridbot.position.side,
        exchange: gridbot.exchangeUUID,
        paper: !!gridbot.paperContext,
      })
      const positionId = postionIds.find((id) => botPositionId.includes(id))
      if (positionId) {
        positionsBotsInfo[positionId] = {
          botId: gridbot._id.toString(),
          name: gridbot.settings.name,
          type: '',
        }
      }
    }
  }
  return {
    status: StatusEnum.ok,
    reason: null,
    data: positionsBotsInfo,
  }
}

const getBotType = (
  type?: string,
  parentBotId?: string | null,
): 'terminal' | 'dca' | 'grid' | 'combo' | 'hedgeDca' | 'hedgeCombo' => {
  if (type === 'terminal') {
    return type
  }
  if (type === 'regular') {
    if (parentBotId) {
      return 'hedgeDca'
    }
    return 'dca'
  }
  if (type === 'combo') {
    if (parentBotId) {
      return 'hedgeCombo'
    }
    return 'combo'
  }
  return 'grid'
}
