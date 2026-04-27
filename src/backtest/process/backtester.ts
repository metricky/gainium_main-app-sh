import DCABacktesting from '@gainium/backtester/dist/dca'
import GridBacktesting from '@gainium/backtester/dist/grid'
import Candles from '../data/candles'
import ExchangeChooser from '../../exchange/exchangeChooser'
import {
  ResolutionString,
  PeriodParams,
  ExchangeEnum as _ExchangeEnum,
} from '@gainium/backtester/dist/types'
import DB from '../../db'

import {
  StatusEnum,
  ExchangeEnum,
  ExchangeIntervals,
  BotStatusEnum,
} from '../../../types'

import type {
  BaseReturn,
  BotSettings,
  ClearPairsSchema,
  DCABotSettings,
  ComboBotSettings,
  UserSchema,
} from '../../../types'
import type {
  DCABacktestingResult,
  Deal,
  GridBacktestingResult,
  Prices,
} from '@gainium/backtester/dist/types'
import {
  backtestDb,
  comboBacktestDb,
  feeDb,
  gridBacktestDb,
  pairDb,
  rateDb,
} from '../../db/dbInit'

export type DCABacktestingResultFull = DCABacktestingResult & {
  settings: DCABotSettings
  symbol: { symbol: string; baseAsset: string; quoteAsset: string }[]
  initialBalance: {
    base: number
    quote: number
    symbol: string
  }[]
}
export type GridBacktestingResultFull = GridBacktestingResult & {
  settings: BotSettings
  symbol: { symbol: string; baseAsset: string; quoteAsset: string }
  initialBalance: {
    base: number
    quote: number
  }
}

export const tvToExchangeIntervalMap = {
  '1': ExchangeIntervals.oneM,
  '3': ExchangeIntervals.threeM,
  '5': ExchangeIntervals.fiveM,
  '15': ExchangeIntervals.fifteenM,
  '30': ExchangeIntervals.thirtyM,
  '60': ExchangeIntervals.oneH,
  '120': ExchangeIntervals.twoH,
  '240': ExchangeIntervals.fourH,
  '480': ExchangeIntervals.eightH,
  '1D': ExchangeIntervals.oneD,
  '1W': ExchangeIntervals.oneW,
}

class Backtester<T extends UserSchema> {
  protected gridBacktestDb = gridBacktestDb
  protected dcaBacktestDb = backtestDb
  protected comboBacktestDb = comboBacktestDb
  private pairsDb = pairDb
  private feesDb = feeDb
  private ratesDb = rateDb
  protected ec = ExchangeChooser

  private budgetMultiplier = 10

  constructor(
    private range?: {
      from?: number
      to?: number
      interval?: ExchangeIntervals
    },
    protected fromBacktest?: boolean,
    private userDb: DB<T> = userDb,
  ) {}

  protected getExchangeMultiplier(exchange: ExchangeEnum) {
    return exchange === ExchangeEnum.kucoin ? 100 : 1
  }

  protected returnReason(reason: string) {
    return {
      status: StatusEnum.notok as const,
      data: null,
      reason,
    }
  }

  protected async getPair(pairs: string[], exchange: ExchangeEnum) {
    const pair = await this.pairsDb.readData(
      {
        pair: { $in: pairs },
        exchange,
      },
      {},
      {},
      true,
    )
    if (pair.status === StatusEnum.notok) {
      return this.returnReason(
        `Cannot get pairs ${pairs.join(',')}@${exchange}, ${pair.reason}`,
      )
    }
    if (!pair.data?.result) {
      return this.returnReason(
        `Cannot find pair ${pairs.join(',')}@${exchange}`,
      )
    }
    return pair
  }

  protected async getFee(symbol: string, exchangeUUID: string, userId: string) {
    const fee = await this.feesDb.readData({
      pair: symbol,
      exchangeUUID,
      userId,
    })
    if (fee.status === StatusEnum.notok) {
      return this.returnReason(
        `Cannot get fee ${symbol}@${exchangeUUID}@${userId}, ${fee.reason}`,
      )
    }
    if (!fee.data?.result) {
      return this.returnReason(
        `Cannot find fee ${symbol}@${exchangeUUID}@${userId}`,
      )
    }
    return fee
  }

  protected async getDCABacktest(_id: string) {
    const backtest = await this.dcaBacktestDb.readData({ _id })
    if (backtest.status === StatusEnum.notok) {
      return this.returnReason(
        `Cannot get DCA backtest ${_id}, ${backtest.reason}`,
      )
    }
    if (!backtest.data?.result) {
      return this.returnReason(`Cannot find DCA backtest ${_id}`)
    }
    return backtest
  }

  protected async getGridBacktest(_id: string) {
    const backtest = await this.gridBacktestDb.readData({ _id })
    if (backtest.status === StatusEnum.notok) {
      return this.returnReason(
        `Cannot get grid backtest ${_id}, ${backtest.reason}`,
      )
    }
    if (!backtest.data?.result) {
      return this.returnReason(`Cannot find grid backtest ${_id}`)
    }
    return backtest
  }

  protected async getComboBacktest(_id: string) {
    const backtest = await this.comboBacktestDb.readData({ _id })
    if (backtest.status === StatusEnum.notok) {
      return this.returnReason(
        `Cannot get combo backtest ${_id}, ${backtest.reason}`,
      )
    }
    if (!backtest.data?.result) {
      return this.returnReason(`Cannot find combo backtest ${_id}`)
    }
    return backtest
  }

  protected async getPrice(
    exchange: ExchangeEnum,
  ): Promise<BaseReturn<Prices>> {
    const exchangeInstance = this.ec.chooseExchangeFactory(exchange)
    if (exchangeInstance) {
      const e = exchangeInstance('', '')
      const prices = await e.getAllPrices()
      if (prices.status === StatusEnum.notok) {
        return this.returnReason(
          `Cannot get prices on ${exchange}, ${prices.reason}`,
        )
      }
      if (!prices.data || !prices.data.length) {
        return this.returnReason(`No prices on ${exchange}`)
      }
      const usdRequest = await this.ratesDb.readData(
        {},
        {},
        {
          limit: 1,
          sort: { created: -1 },
        },
      )
      if (usdRequest.status === StatusEnum.notok) {
        return this.returnReason(`Cannot get usd price, ${usdRequest.reason}`)
      }
      if (!usdRequest.data?.result) {
        return this.returnReason(`No usd price`)
      }
      return {
        ...prices,
        data: [
          ...prices.data.map((p) => ({
            symbol: p.pair,
            price: p.price,
            exchange,
          })),
          {
            symbol: 'USDTZUSD',
            price: usdRequest.data.result.usdRate,
            exchange: 'all',
          },
        ],
        reason: null,
      }
    }
    return this.returnReason(`Not found exchange instance ${exchange}`)
  }

  protected async getUserWithExchange(userId: string, exchangeUUID: string) {
    const user = await this.userDb.readData({
      _id: userId,
      'exchanges.uuid': exchangeUUID,
    })
    if (user.status === StatusEnum.notok) {
      return this.returnReason(`Cannot get user ${userId}, ${user.reason}`)
    }
    if (!user.data?.result) {
      return this.returnReason(`User not found ${userId}`)
    }
    return user
  }

  private updateDCASettings(settings: DCABotSettings, pair: ClearPairsSchema) {
    if (!this.fromBacktest) {
      const orderSize = `${
        pair.quoteAsset.minAmount *
        5 *
        this.budgetMultiplier *
        this.getExchangeMultiplier(pair.exchange)
      }`
      settings.orderSize = orderSize
      settings.baseOrderSize = orderSize
    }

    return settings
  }

  private updateComboSettings(
    settings: ComboBotSettings,
    pair: ClearPairsSchema,
  ) {
    if (!this.fromBacktest) {
      settings.pair = [pair.pair]
      const orderSize = `${
        pair.quoteAsset.minAmount *
        1.1 *
        +(settings.gridLevel ?? '1') *
        this.budgetMultiplier *
        this.getExchangeMultiplier(pair.exchange)
      }`
      settings.orderSize = orderSize
      settings.baseOrderSize = orderSize
    }

    return settings
  }

  private updateGridSettings(
    settings: BotSettings,
    pair: ClearPairsSchema,
    fee: number,
  ) {
    if (!this.fromBacktest) {
      settings.pair = pair.pair
      const minQuote = Math.max(
        pair.quoteAsset.minAmount,
        pair.baseAsset.minAmount * +settings.topPrice,
      )
      settings.budget =
        minQuote *
        +settings.levels *
        1.1 *
        this.budgetMultiplier *
        this.getExchangeMultiplier(pair.exchange)
      settings.sellDisplacement = fee * 2
    }

    return settings
  }

  private async loadFn(
    pair: string,
    _baseAsset: string,
    _quteAsset: string,
    resolution: ResolutionString,
    periodToUse: PeriodParams,
    exchange: _ExchangeEnum,
    _index?: number,
    _total?: number,
  ) {
    //@ts-ignore
    const candleInstance = Candles.create(exchange)
    const candles = await candleInstance.getCandles({
      symbol: pair,
      //@ts-ignore
      interval: tvToExchangeIntervalMap[resolution],
      from: periodToUse.from * 1000,
      to: periodToUse.to * 1000,
    })
    return (candles.data ?? []).map((c) => ({
      time: +c.time,
      open: +c.open,
      high: +c.high,
      low: +c.low,
      close: +c.close,
      volume: +c.volume,
      symbol: pair,
    }))
  }

  public async runDcaBacktestFromPresets(
    _id: string,
    userId: string,
    exchangeUUID: string,
    exchange: ExchangeEnum,
  ): Promise<BaseReturn<DCABacktestingResultFull>> {
    const user = await this.getUserWithExchange(userId, exchangeUUID)
    if (user.status === StatusEnum.notok) {
      return user
    }
    const preset = await this.getDCABacktest(_id)
    if (preset.status === StatusEnum.notok) {
      return preset
    }
    if (preset.data.result.multi) {
    }
    const pair = await this.getPair(preset.data.result.settings.pair, exchange)
    if (pair.status === StatusEnum.notok) {
      return pair
    }
    const symbol = pair.data.result[0]?.pair
    const fee = await this.getFee(symbol, exchangeUUID, userId)
    if (fee.status === StatusEnum.notok) {
      return fee
    }
    const settings = this.updateDCASettings(
      preset.data.result.settings,
      pair.data.result[0],
    )
    const prices = await this.getPrice(exchange)
    if (prices.status === StatusEnum.notok) {
      return prices
    }
    const now = +new Date()
    const backtester = new DCABacktesting({
      settings: {
        ...settings,
        stopStatus:
          settings.stopStatus === BotStatusEnum.monitoring
            ? 'monitoring'
            : 'closed',
      },
      userFee: fee.data.result.maker,
      symbols: pair.data.result,
      prices: prices.data,
      exchange,
      interval: this.range?.interval ?? ExchangeIntervals.oneM,
      from: this.range?.from ?? now - 30 * 24 * 60 * 60 * 1000,
      to: this.range?.to ?? now,
      multi: preset.data.result.multi,
      fullResult: true,
      useFile: this.fromBacktest,
    })

    backtester.loadData = this.loadFn
    const result = await backtester.test()
    if (result) {
      return {
        status: StatusEnum.ok,
        data: {
          ...result,
          settings,
          symbol: pair.data.result.map((r) => ({
            symbol: r.pair,
            baseAsset: r.baseAsset.name,
            quoteAsset: r.quoteAsset.name,
          })),
          initialBalance: pair.data.result.map((r) => ({
            base:
              Math.max(
                ...(result.deals as Deal[])
                  .filter((d) => d.symbol.pair === r.pair)
                  .map((d) => d.initialBalance.base),
              ) *
              (preset.data.result.multi
                ? +(settings.maxDealsPerPair ?? '1')
                : +(settings.maxNumberOfOpenDeals ?? '1')),
            quote:
              Math.max(
                ...(result.deals as Deal[])
                  .filter((d) => d.symbol.pair === r.pair)
                  .map((d) => d.initialBalance.quote),
              ) *
              (preset.data.result.multi
                ? +(settings.maxDealsPerPair ?? '1')
                : +(settings.maxNumberOfOpenDeals ?? '1')),
            symbol: r.pair,
          })),
        },
        reason: null,
      }
    }
    return this.returnReason(`Not enough data to return result`)
  }

  public async runComboBacktestFromPresets(
    _id: string,
    userId: string,
    exchangeUUID: string,
    exchange: ExchangeEnum,
  ): Promise<BaseReturn<DCABacktestingResultFull>> {
    const user = await this.getUserWithExchange(userId, exchangeUUID)
    if (user.status === StatusEnum.notok) {
      return user
    }
    const preset = await this.getComboBacktest(_id)
    if (preset.status === StatusEnum.notok) {
      return preset
    }
    const pair = await this.getPair(preset.data.result.settings.pair, exchange)
    if (pair.status === StatusEnum.notok) {
      return pair
    }
    const symbol = pair.data.result[0].pair
    const fee = await this.getFee(symbol, exchangeUUID, userId)
    if (fee.status === StatusEnum.notok) {
      return fee
    }
    const settings = this.updateComboSettings(
      preset.data.result.settings,
      pair.data.result[0],
    )
    const prices = await this.getPrice(exchange)
    if (prices.status === StatusEnum.notok) {
      return prices
    }
    const now = +new Date()
    const backtester = new DCABacktesting({
      settings: {
        ...settings,
        stopStatus:
          settings.stopStatus === BotStatusEnum.monitoring
            ? 'monitoring'
            : 'closed',
      },
      userFee: fee.data.result.maker,
      symbols: pair.data.result,
      prices: prices.data,
      exchange,
      interval: this.range?.interval ?? ExchangeIntervals.oneM,
      from: this.range?.from ?? now - 30 * 24 * 60 * 60 * 1000,
      to: this.range?.to ?? now,
      combo: true,
      fullResult: true,
      useFile: this.fromBacktest,
    })

    backtester.loadData = this.loadFn
    const result = await backtester.test()
    if (result) {
      return {
        status: StatusEnum.ok,
        data: {
          ...result,
          settings,
          symbol: pair.data.result.map((r) => ({
            symbol: r.pair,
            baseAsset: r.baseAsset.name,
            quoteAsset: r.quoteAsset.name,
          })),
          initialBalance: pair.data.result.map((r) => ({
            base:
              Math.max(
                ...(result.deals as Deal[])
                  .filter((d) => d.symbol.pair === r.pair)
                  .map((d) => d.initialBalance.base),
              ) *
              (preset.data.result.multi
                ? +(settings.maxDealsPerPair ?? '1')
                : +(settings.maxNumberOfOpenDeals ?? '1')),
            quote:
              Math.max(
                ...(result.deals as Deal[])
                  .filter((d) => d.symbol.pair === r.pair)
                  .map((d) => d.initialBalance.quote),
              ) *
              (preset.data.result.multi
                ? +(settings.maxDealsPerPair ?? '1')
                : +(settings.maxNumberOfOpenDeals ?? '1')),
            symbol: r.pair,
          })),
        },
        reason: null,
      }
    }
    return this.returnReason(`Not enough data to return result`)
  }

  public async runGridBacktestFromPresets(
    _id: string,
    userId: string,
    exchangeUUID: string,
    exchange: ExchangeEnum,
  ): Promise<BaseReturn<GridBacktestingResultFull>> {
    const user = await this.getUserWithExchange(userId, exchangeUUID)
    if (user.status === StatusEnum.notok) {
      return user
    }
    const preset = await this.getGridBacktest(_id)
    if (preset.status === StatusEnum.notok) {
      return preset
    }
    const pair = await this.getPair(
      [preset.data.result.settings.pair],
      exchange,
    )
    if (pair.status === StatusEnum.notok) {
      return pair
    }
    const symbol = pair.data.result[0].pair
    const fee = await this.getFee(symbol, exchangeUUID, userId)
    if (fee.status === StatusEnum.notok) {
      return fee
    }
    const settings = this.updateGridSettings(
      preset.data.result.settings,
      pair.data.result[0],
      fee.data.result.maker,
    )
    const prices = await this.getPrice(exchange)
    if (prices.status === StatusEnum.notok) {
      return prices
    }
    const now = +new Date()
    const backtester = new GridBacktesting({
      settings: {
        ...settings,
        sellDisplacement: settings.sellDisplacement * 100,
      },
      userFee: fee.data.result.maker,
      symbols: pair.data.result,
      prices: prices.data,
      exchange,
      interval: this.range?.interval ?? ExchangeIntervals.oneM,
      from: this.range?.from ?? now - 30 * 24 * 60 * 60 * 1000,
      to: this.range?.to ?? now,
      fullResult: true,
      useFile: this.fromBacktest,
    })
    backtester.loadData = this.loadFn
    const result = await backtester.test()
    if (result) {
      return {
        status: StatusEnum.ok,
        data: {
          ...result,
          settings,
          symbol: {
            symbol: pair.data.result[0].pair,
            baseAsset: pair.data.result[0].baseAsset.name,
            quoteAsset: pair.data.result[0].quoteAsset.name,
          },
          initialBalance: {
            base: +result.financial.initialBalancesByAsset.base,
            quote: +result.financial.initialBalancesByAsset.quote,
          },
        },
        reason: null,
      }
    } else {
      return this.returnReason(`Not enough data to return result`)
    }
  }
}

export default Backtester
