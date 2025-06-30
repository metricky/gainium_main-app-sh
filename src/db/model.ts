import { model } from 'mongoose'
import schema from './schema'
import { collections } from './config'

import {
  BalancesSchema,
  BotEventSchema,
  BotMessageSchema,
  BotSchema,
  DCABacktestingResult,
  DCABotSchema,
  DCADealsSchema,
  FeesSchema,
  GRIDBacktestingResult,
  OrderSchema,
  PairsSchema,
  RateSchema,
  SnapshotSchema,
  TransactionSchema,
  UserSchema,
  UserPeriod,
  FavoritePairsSchema,
  ComboBotSchema,
  ComboDealsSchema,
  ComboBacktestingResult,
  ComboMinigridSchema,
  ComboProfitSchema,
  ComboTransactionSchema,
  FavoriteIndicatorsSchema,
  StoreFilesSchema,
  BacktestRequestSchema,
  BotProfitChartSchema,
  UserProfitByHour,
  MigrationSchema,
  HedgeBotSchema,
  GlobalVariablesSchema,
  BrokerCodesSchema,
} from '../../types'

const models = {
  bot: model<BotSchema>(`${collections.bot}`, schema.bot),
  globalVariables: model<GlobalVariablesSchema>(
    `${collections.globalVariables}`,
    schema.globalVariables,
  ),
  user: model<UserSchema>(`${collections.user}`, schema.user),
  botEvent: model<BotEventSchema>(`${collections.botEvent}`, schema.botEvent),
  favoritePair: model<FavoritePairsSchema>(
    `${collections.favoritePairs}`,
    schema.favoritePairs,
  ),
  favoriteIndicators: model<FavoriteIndicatorsSchema>(
    `${collections.favoriteIndicators}`,
    schema.favoriteIndicators,
  ),
  order: model<OrderSchema>(`${collections.order}`, schema.order),
  transaction: model<TransactionSchema>(
    `${collections.transaction}`,
    schema.transaction,
  ),
  botMessage: model<BotMessageSchema>(
    `${collections.botMessage}`,
    schema.botMessage,
  ),
  rate: model<RateSchema>(`${collections.rate}`, schema.rate),
  pair: model<PairsSchema>(`${collections.pair}`, schema.pair),
  fee: model<FeesSchema>(`${collections.fee}`, schema.fee),
  balance: model<BalancesSchema>(`${collections.balance}`, schema.balance),
  snapshot: model<SnapshotSchema>(`${collections.snapshot}`, schema.snapshot),
  dcaBot: model<DCABotSchema>(`${collections.dcaBot}`, schema.dcaBot),
  dcaDeal: model<DCADealsSchema>(`${collections.dcaDeal}`, schema.dcaDeal),
  backtest: model<DCABacktestingResult>(
    `${collections.backtest}`,
    schema.backtest,
  ),
  gridBacktest: model<GRIDBacktestingResult>(
    `${collections.gridBacktest}`,
    schema.gridBacktest,
  ),
  userPeriod: model<UserPeriod>(`${collections.userPeriod}`, schema.userPeriod),
  paperPositions: model('paperFutures', schema.paperPositions, 'paperFutures'),
  paperOrder: model('paperPositions', schema.paperOrders, 'paperPositions'),
  paperUsers: model('paperUsers', schema.paperUser, 'paperUsers'),
  comboBot: model<ComboBotSchema>(`${collections.comboBot}`, schema.comboBot),
  comboDeal: model<ComboDealsSchema>(
    `${collections.comboDeals}`,
    schema.comdoDeal,
  ),
  comboBacktest: model<ComboBacktestingResult>(
    `${collections.comboBacktest}`,
    schema.comboBacktest,
  ),
  comboMinigrids: model<ComboMinigridSchema>(
    `${collections.comboMinigrid}`,
    schema.comboMinigrid,
  ),
  comboTransactions: model<ComboTransactionSchema>(
    `${collections.comboTransactions}`,
    schema.comboTransaction,
  ),
  comboProfit: model<ComboProfitSchema>(
    `${collections.comboProfit}`,
    schema.comdoProfit,
  ),
  paperHedge: model('paperHedge', schema.paperHedge, 'paperHedge'),
  paperLeverages: model(
    'paperLeverages',
    schema.paperLeverage,
    'paperLeverages',
  ),
  paperWallets: model('paperWallets', schema.paperWallets, 'paperWallets'),
  paperTrades: model('paperTrades', schema.paperTrades, 'paperTrades'),
  userFiles: model<StoreFilesSchema>(
    `${collections.storeFiles}`,
    schema.storeFiles,
  ),
  dcaBacktestRequest: model<BacktestRequestSchema>(
    `${collections.dcaBacktesRequest}`,
    schema.dcaBacktestRequest,
  ),
  comboBacktestRequest: model<BacktestRequestSchema>(
    `${collections.comboBacktestRequest}`,
    schema.dcaBacktestRequest,
  ),
  gridBacktestRequest: model<BacktestRequestSchema>(
    `${collections.gridBacktestRequest}`,
    schema.gridBacktestRequest,
  ),
  botProfitChart: model<BotProfitChartSchema>(
    `${collections.botProfitChart}`,
    schema.botProfitChart,
  ),
  userProfitByHour: model<UserProfitByHour>(
    `${collections.userProfitByHour}`,
    schema.userProfitByHour,
  ),
  migration: model<MigrationSchema>(
    `${collections.migration}`,
    schema.migration,
  ),
  hedgeComboBot: model<HedgeBotSchema>(
    `${collections.hedgeComboBot}`,
    schema.hedgeComboBotSchema,
  ),
  hedgeDcaBot: model<HedgeBotSchema>(
    `${collections.hedgeDCABot}`,
    schema.hedgeDcaBotSchema,
  ),
  brokerCodes: model<BrokerCodesSchema>(
    `${collections.brokerCodes}`,
    schema.brokerCodes,
  ),
}

;(async () => {
  await models.botEvent.syncIndexes()
  await models.balance.syncIndexes()
  await models.backtest.syncIndexes()
  await models.gridBacktest.syncIndexes()
  await models.comboBacktest.syncIndexes()
  await models.botMessage.syncIndexes()
  await models.bot.syncIndexes()
  await models.comboBot.syncIndexes()
  await models.comboDeal.syncIndexes()
  await models.comboMinigrids.syncIndexes()
  await models.comboProfit.syncIndexes()
  await models.dcaBot.syncIndexes()
  await models.dcaDeal.syncIndexes()
  await models.favoriteIndicators.syncIndexes()
  await models.favoritePair.syncIndexes()
  await models.fee.syncIndexes()
  await models.order.syncIndexes()
  await models.pair.syncIndexes()
  await models.snapshot.syncIndexes()
  await models.transaction.syncIndexes()
  await models.user.syncIndexes()
  await models.userFiles.syncIndexes()
  await models.dcaBacktestRequest.syncIndexes()
  await models.comboBacktestRequest.syncIndexes()
  await models.gridBacktestRequest.syncIndexes()
  await models.botProfitChart.syncIndexes()
  await models.userProfitByHour.syncIndexes()
  await models.hedgeComboBot.syncIndexes()
  await models.hedgeDcaBot.syncIndexes()
})()

export default models
