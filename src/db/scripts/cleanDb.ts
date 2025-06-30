import DB, { model } from '..'
import logger from '../../utils/logger'
import { decrypt } from '../../utils/crypto'
import { ExchangeInUser, MessageTypeEnum, StatusEnum } from '../../../types'
import { isPaper } from '../../utils'
import { resetPaperData } from '../../graphql/handlers/paper'

const usersDb = new DB(model.user)
const paperUsersDb = new DB(model.paperUsers)
const paperFuturesDb = new DB(model.paperPositions)
const paperHedgeDb = new DB(model.paperHedge)
const paperLeverageDb = new DB(model.paperLeverages)
const paperOrdersDb = new DB(model.paperOrder)
const paperTradesDb = new DB(model.paperTrades)
const paperWallets = new DB(model.paperWallets)
const balancesDb = new DB(model.balance)
const ordersDb = new DB(model.order)
const feeDb = new DB(model.fee)
const snapshotDb = new DB(model.snapshot)
const userProfitByHour = new DB(model.userProfitByHour)
const botEventDb = new DB(model.botEvent)
const rateDb = new DB(model.rate)

const removeOldRates = async () => {
  await rateDb
    .deleteManyData({
      created: {
        $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000),
      },
    })
    .then((res) => logger.info(`Delete old rates ${res.reason}`))
}

const removeOldBotWarnings = async () => {
  await botEventDb
    .deleteManyData({
      type: MessageTypeEnum.warning,
      created: { $lt: new Date(+new Date() - 14 * 24 * 60 * 60 * 1000) },
    })
    .then((res) => logger.info(`Delete old bot warnings ${res.reason}`))
}

const getUserExchanges = async (paper = false) => {
  const users = await usersDb.readData(
    { exchanges: { $not: { $size: 0 } } },
    { _id: 1, username: 1, exchanges: 1 },
    {},
    true,
  )
  if (users.status === StatusEnum.notok) {
    logger.error(`Cannot get real users ${users.reason}`)
    return []
  }
  const exchanges: ExchangeInUser[] = []
  for (const u of users.data.result) {
    u.exchanges.forEach((e) => {
      if ((paper && isPaper(e.provider)) || !paper) {
        exchanges.push({ ...e, key: decrypt(e.key) })
      }
    })
  }
  return exchanges
}

const clearNotUsedPaperData = async () => {
  logger.info('Clear not used paper data')

  const exchanges: ExchangeInUser[] = await getUserExchanges(true)

  const notUsedPaperAccounts = await paperUsersDb.readData(
    { key: { $nin: exchanges.map((e) => e.key) } },
    {},
    {},
    true,
    true,
  )
  if (notUsedPaperAccounts.status === StatusEnum.notok) {
    return logger.info(`Cannot get paper users ${notUsedPaperAccounts.reason}`)
  }
  logger.info(
    `Found ${notUsedPaperAccounts.data.count} not used paper accounts`,
  )
  const userIds = notUsedPaperAccounts.data.result.map((u) => u._id)
  await paperFuturesDb
    .deleteManyData({ user: { $in: userIds } })
    .then((res) => logger.info(`Delete futures ${res.reason}`))
  await paperHedgeDb
    .deleteManyData({ user: { $in: userIds } })
    .then((res) => logger.info(`Delete hedge ${res.reason}`))
  await paperLeverageDb
    .deleteManyData({ user: { $in: userIds } })
    .then((res) => logger.info(`Delete leverage ${res.reason}`))
  const ordersToDelete = await paperOrdersDb.readData(
    { user: { $in: userIds } },
    { _id: 1 },
    {},
    true,
    true,
  )
  if (ordersToDelete.status === StatusEnum.notok) {
    return logger.info(`Cannot get orders to delete ${ordersToDelete.reason}`)
  }
  logger.info(`Found ${ordersToDelete.data.count} orders to delete`)
  const orderIds = ordersToDelete.data.result.map((o) => o._id)
  await paperTradesDb
    .deleteManyData({ order: { $in: orderIds } })
    .then((res) => logger.info(`Delete trades ${res.reason}`))
  await paperOrdersDb
    .deleteManyData({ user: { $in: userIds } })
    .then((res) => logger.info(`Delete orders ${res.reason}`))
  await paperWallets
    .deleteManyData({ user: { $in: userIds } })
    .then((res) => logger.info(`Delete wallets ${res.reason}`))
  await paperUsersDb
    .deleteManyData({ _id: { $in: userIds } })
    .then((res) => logger.info(`Delete users ${res.reason}`))
  await userProfitByHour
    .deleteManyData({ userId: { $in: userIds } })
    .then((res) => logger.info(`Delete user profit by hour ${res.reason}`))
}

const clearPaperOldOrders = async () => {
  logger.info('Clear paper canceled paper orders')
  await paperOrdersDb
    .deleteManyData({
      updatedAt: { $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000) },
      status: { $in: ['CANCELED', 'EXPIRED'] },
    })
    .then((res) => logger.info(`Delete paper CANCELED orders ${res.reason}`))
  await paperOrdersDb
    .deleteManyData({
      updatedAt: { $lt: new Date(+new Date() - 60 * 24 * 60 * 60 * 1000) },
      status: 'FILLED',
    })
    .then((res) => logger.info(`Delete paper FILLED orders ${res.reason}`))
}

const clearRealOldCanceledOrders = async () => {
  logger.info('Clear real canceled paper orders')
  await ordersDb
    .deleteManyData({
      updated: { $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000) },
      exchange: { $ne: 'bybit' },
      status: { $in: ['CANCELED', 'EXPIRED'] },
    })
    .then((res) =>
      logger.info(`Delete real not bybit CANCELED orders ${res.reason}`),
    )
  await ordersDb
    .deleteManyData({
      updated: { $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000) },
      exchange: { $eq: 'bybit' },
      executedQty: {
        $in: [
          '0',
          '0.0',
          '0.00',
          '0.000',
          '0.0000',
          '0.00000',
          '0.000000',
          '0.0000000',
          '0.00000000',
        ],
      },
      status: 'CANCELED',
    })
    .then((res) =>
      logger.info(`Delete real bybit CANCELED orders ${res.reason}`),
    )
}

const clearBalances = async () => {
  logger.info(`Start clean balances`)
  const exchanges: ExchangeInUser[] = await getUserExchanges()
  if (exchanges.length) {
    await balancesDb
      .deleteManyData({
        exchangeUUID: { $nin: exchanges.map((e) => e.uuid) },
      })
      .then((res) => logger.info(`Delete balances ${res.reason}`))
  }
}

const clearOldUserPaperData = async () => {
  logger.info('Clear old user paper data')
  const users = await usersDb.readData(
    {
      exchanges: { $not: { $size: 0 } },
      $or: [
        { last_active: { $exists: false } },
        {
          last_active: {
            $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      ],
      username: { $ne: 'hello@gainium.io' },
    },
    {},
    {},
    true,
    true,
  )
  if (users.status === StatusEnum.notok) {
    return logger.error(`Cannot get real users ${users.reason}`)
  }
  const filter = users.data.result.filter(
    (u) => u.exchanges.filter((e) => isPaper(e.provider)).length,
  )
  logger.info(`Found ${filter.length} users with old paper`)
  for (const u of filter) {
    await resetPaperData(u).then((res) =>
      logger.info(`Reset paper for user ${u._id} ${u.username} ${res.reason}`),
    )
  }
  await clearNotUsedPaperData()
}

const cleanNotUsedUserFee = async () => {
  logger.info('Clean not used fee start')
  const exchanges = await getUserExchanges()

  await feeDb
    .deleteManyData({
      exchangeUUID: { $nin: exchanges.map((e) => e.uuid) },
    })
    .then((res) => {
      logger.info(`Clean not used fee ${res.reason}`)
    })

  logger.info('Clean not used fee end')
}

const clearOldSnapshots = async () => {
  logger.info('Clean old snapshots ')

  await snapshotDb
    .deleteManyData({
      created: { $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000) },
    })
    .then((res) => {
      logger.info(`Clean old snapshots ${res.reason}`)
    })

  logger.info('Clean old snapshots end')
}

const clearBotEvents = async () => {
  logger.info('Clean old bot events ')

  await botEventDb
    .deleteManyData({
      created: { $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000) },
    })
    .then((res) => {
      logger.info(`Clean old bot events ${res.reason}`)
    })

  logger.info('Clean old bot events end')
}

const utils = {
  clearNotUsedPaperData,
  clearPaperOldOrders,
  clearRealOldCanceledOrders,
  clearBalances,
  clearOldUserPaperData,
  cleanNotUsedUserFee,
  clearOldSnapshots,
  removeOldBotWarnings,
  removeOldRates,
  clearBotEvents,
}

export default utils
