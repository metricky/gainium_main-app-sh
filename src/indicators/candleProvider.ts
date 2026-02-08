import { isMainThread, threadId } from 'worker_threads'
import utils from '../utils'

import { ExchangeEnum, ExchangeIntervals, StatusEnum } from '../../types'
import ExchangeChooser from '../exchange/exchangeChooser'
import logger from '../utils/logger'
import ExpirableMap from '../utils/expirableMap'
import type { CandleResponse, BaseReturn } from '../../types'
import { IdMute, IdMutex } from '../utils/mutex'
import { isOkx } from '../utils/exchange'
import RedisClient from '../db/redis'
import Rabbit from '../db/rabbit'

const { sleep } = utils

const maxSimultaneousCandleRequests = 100

const mutex = new IdMutex()
const mutexConcurrentlyCandles = new IdMutex(maxSimultaneousCandleRequests)

const loggerPrefix = `${isMainThread ? 'Main thread' : `Worker ${threadId}`} |`
const candlesChannel = 'indicatorsCandles'

type CandlesRequestMessage = {
  exchange: ExchangeEnum
  symbol: string
  interval: ExchangeIntervals
  from: number
  to: number
  count?: number
  saveResult: boolean
}

export class CandlesProvider {
  static skipListen = false
  static instance: CandlesProvider

  static getInstance(skipListen = false) {
    if (!CandlesProvider.instance) {
      CandlesProvider.skipListen = skipListen
      CandlesProvider.instance = new CandlesProvider()
    }
    return CandlesProvider.instance
  }

  protected ec = ExchangeChooser

  private rabbitClient = new Rabbit()

  constructor() {
    this.getCandles = this.getCandles.bind(this)
    if (isMainThread && !CandlesProvider.skipListen) {
      this.rabbitClient.listenWithCallback<
        CandlesRequestMessage,
        Promise<BaseReturn<CandleResponse[]>>
      >(
        candlesChannel,
        async (d) => {
          logger.debug(
            `${loggerPrefix} Received candles request ${d.exchange} ${d.symbol} ${d.interval} ${d.from} ${d.to}`,
          )
          return await this.getCandles(
            d.exchange,
            d.symbol,
            d.interval,
            d.from,
            d.to,
            d.count,
            d.saveResult,
          )
        },
        maxSimultaneousCandleRequests,
      )
    }
  }

  private handleError(...msg: unknown[]) {
    logger.error(`${loggerPrefix}`, ...msg)
  }

  private handleLog(...msg: unknown[]) {
    logger.debug(`${loggerPrefix}`, ...msg)
  }

  private historyMap: Map<string, ExpirableMap<string, CandleResponse[]>> =
    new Map()
  @IdMute(mutexConcurrentlyCandles, () => 'getCandles')
  @IdMute(
    mutex,
    (
      exchange: ExchangeEnum,
      symbol: string,
      interval: ExchangeIntervals,
      from: number,
      to: number,
      count: number,
    ) => `${exchange}${symbol}${interval}${from}${to}${count}`,
  )
  async getCandles(
    exchange: ExchangeEnum,
    symbol: string,
    interval: ExchangeIntervals,
    from: number,
    to: number,
    count?: number,
    saveResult = true,
    retryCount = 1,
  ): Promise<BaseReturn<CandleResponse[]>> {
    if (!isMainThread) {
      logger.debug(
        `${loggerPrefix} Requesting candles ${exchange} ${symbol} ${interval} ${from} ${to}`,
      )
      const result = await this.rabbitClient.sendWithCallback<
        CandlesRequestMessage,
        BaseReturn<CandleResponse[]>
      >(candlesChannel, {
        exchange,
        symbol,
        interval,
        from,
        to,
        count,
        saveResult,
      })
      if (!result?.response) {
        return {
          status: StatusEnum.notok,
          data: null,
          reason: 'No response from main thread',
        }
      }
      return result.response
    }
    if (isOkx(exchange)) {
      from = from - 1
      to = to + 1
    }
    const mapId = `${exchange}${symbol}${interval}`
    const id = `${exchange}${symbol}${interval}${from}${to}${count}`
    try {
      const client = await RedisClient.getInstance()
      if (client.isReady) {
        const result = await client.hGet('candles', `${mapId}#${id}`)
        if (result) {
          const parse = JSON.parse(result) as CandleResponse[]
          return { status: StatusEnum.ok, data: parse, reason: null }
        }
      }
    } catch (e) {
      this.handleError(`Error in getAllPrices redis cache: ${e}`)
    }

    const map = this.historyMap.get(mapId)
    if (map) {
      const d = map.get(id)
      if (d) {
        return { status: StatusEnum.ok, data: d, reason: null }
      }
    }
    const _exchange = this.ec.chooseExchangeFactory(exchange)
    const exchangeClient = _exchange('', '')
    const data = await exchangeClient.getCandles(
      symbol,
      interval,
      from,
      to,
      count,
    )
    if (!saveResult) {
      return data
    }
    if (data.status === StatusEnum.ok) {
      let set = false
      try {
        const client = await RedisClient.getInstance()
        if (client.isReady) {
          await client.hSet(
            'candles',
            `${mapId}#${id}`,
            JSON.stringify(data.data),
          )
          await client.hExpire('candles', `${mapId}#${id}`, 5 * 60)
          set = true
        }
      } catch (e) {
        this.handleError(`Error in getAllPrices redis cache: ${e}`)
      }
      if (!set) {
        if (!map) {
          this.historyMap.set(mapId, new ExpirableMap(5 * 60 * 1000))
        }
        this.historyMap.get(mapId)?.set(id, data.data)
      }
    }
    if (
      data.status === StatusEnum.notok &&
      (data.reason ?? '').includes(`Exchange connector`) &&
      retryCount <= 5
    ) {
      this.handleLog(
        `Got ${data.reason} error, retry attempts ${retryCount}, retry more in 5s`,
      )
      await sleep(5 * 1000)
      mutex.release(`${exchange}${symbol}${interval}${from}${to}${count}`)
      return this.getCandles(
        exchange,
        symbol,
        interval,
        from,
        to,
        count,
        saveResult,
        retryCount + 1,
      )
    }
    return data
  }
}
