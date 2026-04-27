import fs from 'fs'
import { isMainThread, parentPort } from 'worker_threads'
import { v4 } from 'uuid'
import path from 'path'
import csv from 'csv-parser'
import {
  ExchangeEnum,
  BaseReturn,
  CandleResponse,
  StatusEnum,
  ExchangeIntervals,
  CSVCandle as CSV,
  intervalMap as timeIntervalMap,
  ReturnBad,
} from '../../../types'
import exchangeChooser from '../../exchange/exchangeChooser'
import Exchange from '../../exchange'
import { IdMute, IdMutex } from '../../utils/mutex'
import Logger from '../../utils/logger'
import { removePaperFormExchangeName } from '../../exchange/helpers'
import { isKucoin } from '../../utils/exchange'
import { DATA_PATH, CANDLES_OFFSET } from '../../config'

type GetCandlesInput = {
  symbol: string
  from: number
  to: number
  interval: ExchangeIntervals
  updateProgress?: (value: number, text: string, step?: number) => void
  index?: number
  total?: number
  needSort?: boolean
}

const mutex = new IdMutex()

class Candles {
  private exchange?: Exchange

  private dataPath = DATA_PATH

  protected exchangeName: ExchangeEnum

  /** Optional override: parent (or any consumer) can install a factory so
   *  callers via `Candles.create(...)` get a subclass — e.g. one that reads
   *  from a remote archive instead of local CSVs. Stays null in core so
   *  the default CSV behavior is unchanged when no override is registered. */
  static factory: ((exchange: ExchangeEnum) => Candles) | null = null

  static create(exchange: ExchangeEnum): Candles {
    return Candles.factory?.(exchange) ?? new Candles(exchange)
  }

  constructor(exchange: ExchangeEnum) {
    this.exchangeName = exchange
    const e = exchangeChooser.chooseExchangeFactory(
      removePaperFormExchangeName(exchange),
    )
    if (e) {
      this.exchange = e('', '')
    }
  }

  private resolvePath(_path: string) {
    return path.resolve(__dirname, CANDLES_OFFSET, _path)
  }

  private checkAndCreateDir(_path: string) {
    const resolved = this.resolvePath(_path)
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved)
    }
  }

  private checkAndCreateRecursivePath(_path: string) {
    let tempPath = ''
    for (const p of _path.split('/')) {
      const _p = `${tempPath === '' ? p : `${tempPath}/${p}`}`
      this.checkAndCreateDir(_p)
      tempPath = tempPath === '' ? p : `${tempPath}/${p}`
    }
  }

  private getPath(symbol: string, interval: ExchangeIntervals): string {
    return `${this.dataPath}/${removePaperFormExchangeName(
      this.exchangeName,
    )}/${symbol}/${interval}`
  }

  private getLocalFiles(symbol: string, interval: ExchangeIntervals): string[] {
    const _path = this.getPath(symbol, interval)
    this.checkAndCreateRecursivePath(_path)
    const resolved = this.resolvePath(_path)
    const files = fs.readdirSync(resolved)
    return files.map((f) => `${_path}/${f}`)
  }

  private convertCandleToCSV(data: CandleResponse[]) {
    return `o;h;l;c;v;t\n${data
      .map(
        (d) => `${d.open};${d.high};${d.low};${d.close};${d.volume};${d.time}`,
      )
      .join('\n')}`
  }

  protected async saveLocal(
    symbol: string,
    interval: ExchangeIntervals,
    candles: CandleResponse[],
  ) {
    if (!candles.length) {
      return
    }
    const old = this.getLocalFiles(symbol, interval)
    const _path = this.getPath(symbol, interval)
    const local = await this.getLocal({
      symbol,
      interval,
      from: 0,
      to: Infinity,
    })
    const concat =
      candles.length > local.length
        ? (() => {
            local.forEach((l) => candles.push(l))
            return candles
          })()
        : (() => {
            candles.forEach((l) => local.push(l))
            return local
          })()
    const all = concat.sort((a, b) => a.time - b.time)
    const chunkSize = 10 * 10000
    const chunks = all.reduce((acc, el, i) => {
      const ch = Math.floor(i / chunkSize)
      if (!acc[ch]) {
        acc[ch] = []
      }
      acc[ch].push(el)
      acc[ch] = acc[ch]
      return acc
    }, [] as CandleResponse[][])
    try {
      for (const o of old) {
        const resolved = this.resolvePath(`${o}`)
        fs.unlinkSync(resolved)
      }
      for (const chunk of chunks) {
        const fileName = `${this.exchangeName}_${symbol}_${interval}-${
          chunk[0].time
        }_${chunk[chunk.length - 1].time}.csv`

        const resolved = this.resolvePath(`${_path}/${fileName}`)
        fs.writeFileSync(resolved, this.convertCandleToCSV(chunk), 'utf-8')
      }
    } catch (e) {
      Logger.error((e as Error).message)
    }
  }

  protected async getLocal({
    symbol,
    interval,
    from: _from,
    to: _to,
  }: GetCandlesInput): Promise<CandleResponse[]> {
    const files = this.getLocalFiles(symbol, interval)
    const data: CandleResponse[] = []
    const step = timeIntervalMap[interval]
    const from = _from - step
    const to = _to + step
    for (const file of files) {
      try {
        await new Promise((resolve, reject) => {
          fs.createReadStream(file)
            .pipe(csv({ separator: ';' }))
            .on(
              'data',
              (csvData: CSV) =>
                +csvData.t >= from &&
                +csvData.t <= to &&
                data.push({
                  open: csvData.o,
                  high: csvData.h,
                  low: csvData.l,
                  close: csvData.c,
                  time: +csvData.t,
                  volume: csvData.v,
                  symbol,
                }),
            )
            .on('error', (e: unknown) =>
              reject(`${file} | ${(e as Error).message}`),
            )
            .on('end', async () => {
              resolve('end')
            })
        })
      } catch (e) {
        Logger.error(file, (e as Error).message)
        return []
      }
    }
    return data.sort((a, b) => a.time - b.time)
  }

  @IdMute(mutex, (input: GetCandlesInput) => `getCandles@${input.symbol}`)
  async getCandles(
    {
      symbol,
      from,
      to,
      interval,
      updateProgress,
      index,
      total,
      needSort = true,
    }: GetCandlesInput,
    skipCheck = true,
  ): Promise<BaseReturn<CandleResponse[]>> {
    const key = `${removePaperFormExchangeName(
      this.exchangeName,
    )}_${symbol}_${interval}`

    try {
      if (!skipCheck) {
        await new Promise((resolve) => {
          const responseId = v4()
          if (!isMainThread) {
            const handler = (msg: { event: string }) => {
              if (msg.event === responseId) {
                parentPort?.removeListener('message', handler)
                resolve('end')
              }
            }
            parentPort?.on('message', handler)
            parentPort?.postMessage({
              event: 'queueCandle',
              key,
              responseId,
            })
          }
        })
      }
      const local = await this.getLocal({ symbol, interval, from, to })
      const step = timeIntervalMap[interval]
      let required = local
      const requiredHasSet: Set<number> = new Set()
      const missed: { from: number; to: number }[] = []
      required.forEach((r, i) => {
        if (i !== 0) {
          if (r.time - required[i - 1].time > step) {
            missed.push({ from: required[i - 1].time, to: r.time })
          }
        }
      })
      if (!required.length) {
        missed.push({ from, to })
      } else {
        const first = required[0]
        const last = required[required.length - 1]
        if (first.time > from) {
          missed.push({ from, to: first.time })
        }
        if (last.time < to) {
          missed.push({ from: last.time, to })
        }
      }
      const toSave: CandleResponse[] = []
      for (const int of missed) {
        const result = await this.getCandlesFromExchange({
          symbol,
          from: int.from,
          to: int.to,
          interval,
          updateProgress,
          index,
          total,
        })
        if (result.status === StatusEnum.notok) {
          return result
        }
        result.data.forEach((d) => {
          if (!requiredHasSet.has(d.time)) {
            required.push(d)
            toSave.push(d)
            requiredHasSet.add(d.time)
          }
        })
      }
      await this.saveLocal(symbol, interval, toSave)
      const map: Map<number, CandleResponse> = new Map(
        required.map((r) => [r.time, r]),
      )
      required = Array.from(map.values())
      if (!skipCheck) {
        parentPort?.postMessage({
          event: 'unQueueCandle',
          key,
        })
      }
      return {
        status: StatusEnum.ok,
        reason: null,
        data: needSort ? required.sort((a, b) => a.time - b.time) : required,
      }
    } catch (e) {
      if (!skipCheck) {
        parentPort?.postMessage({
          event: 'unQueueCandle',
          key,
        })
      }
      return {
        status: StatusEnum.notok,
        reason: `Error while getting candles for ${symbol}@${interval}@${
          this.exchangeName
        }: ${(e as Error).message ?? e}`,
        data: null,
      }
    }
  }

  private async getCandlesFromExchange({
    symbol,
    from,
    to,
    interval,
    updateProgress,
    index,
    total,
  }: GetCandlesInput): Promise<BaseReturn<CandleResponse[]>> {
    Logger.info(
      `${this.exchangeName} | ${symbol} | ${interval} | Load candles from exchange from: ${from}, to: ${to}`,
    )
    const instance = this.exchange
    if (!instance) {
      return {
        status: StatusEnum.notok,
        reason: `Exchange ${this.exchangeName} not found`,
        data: null,
      }
    }
    const requestStep =
      this.exchangeName === ExchangeEnum.binance ||
      this.exchangeName === ExchangeEnum.binanceUS ||
      this.exchangeName === ExchangeEnum.paperBinance ||
      this.exchangeName === ExchangeEnum.mexc ||
      this.exchangeName === ExchangeEnum.paperMexc
        ? 1000
        : this.exchangeName === ExchangeEnum.bybit ||
            this.exchangeName === ExchangeEnum.bybitCoinm ||
            this.exchangeName === ExchangeEnum.bybitUsdm ||
            this.exchangeName === ExchangeEnum.paperBybit ||
            this.exchangeName === ExchangeEnum.paperBybitCoinm ||
            this.exchangeName === ExchangeEnum.paperBybitUsdm
          ? 999
          : this.exchangeName === ExchangeEnum.binanceUsdm ||
              this.exchangeName === ExchangeEnum.binanceCoinm ||
              this.exchangeName === ExchangeEnum.kucoin ||
              this.exchangeName === ExchangeEnum.paperBinanceUsdm ||
              this.exchangeName === ExchangeEnum.paperBinanceCoinm ||
              this.exchangeName === ExchangeEnum.paperKucoin
            ? 1500
            : this.exchangeName === ExchangeEnum.okx ||
                this.exchangeName === ExchangeEnum.okxInverse ||
                this.exchangeName === ExchangeEnum.okxLinear ||
                this.exchangeName === ExchangeEnum.paperOkx ||
                this.exchangeName === ExchangeEnum.paperOkxInverse ||
                this.exchangeName === ExchangeEnum.paperOkxLinear
              ? 100
              : this.exchangeName === ExchangeEnum.hyperliquid ||
                  this.exchangeName === ExchangeEnum.hyperliquidLinear ||
                  this.exchangeName === ExchangeEnum.paperHyperliquid ||
                  this.exchangeName === ExchangeEnum.paperHyperliquidLinear
                ? 4999
                : this.exchangeName === ExchangeEnum.kraken ||
                    this.exchangeName === ExchangeEnum.paperKraken
                  ? 720
                  : this.exchangeName === ExchangeEnum.krakenUsdm ||
                      this.exchangeName === ExchangeEnum.paperKrakenUsdm ||
                      this.exchangeName === ExchangeEnum.krakenCoinm ||
                      this.exchangeName === ExchangeEnum.paperKrakenCoinm
                    ? 2000
                    : 200
    try {
      const step = timeIntervalMap[interval]
      const count = Math.ceil((to - from) / step / requestStep)
      const data: CandleResponse[] = []
      const dataHasSet: Set<number> = new Set()
      const requests: (() => Promise<void>)[][] = []
      let ind = 0
      let chunkIndex = 0
      let currentIndex = 0
      const maxRequestInChunk = 100
      for (const request of [...Array(count).keys()]) {
        currentIndex++
        if (!requests[chunkIndex]) {
          requests[chunkIndex] = []
        }
        requests[chunkIndex].push(async () => {
          const fromThis =
            request === 0
              ? from - step
              : Math.min(from + request * step * requestStep, to)
          const toThis = Math.min(from + (request + 1) * step * requestStep, to)

          const result = await instance.getCandles(
            symbol,
            interval,
            fromThis,
            toThis,
            isKucoin(this.exchangeName) ? undefined : requestStep,
          )

          if (result.status === StatusEnum.notok) {
            throw result
          }

          const candles = result.data
          candles.forEach((d, i) => {
            const obj = [d]
            if (i !== 0) {
              const prevCandle = candles[i - 1]
              if (d.time - prevCandle.time > step) {
                const missed = Math.ceil((d.time - prevCandle.time) / step)
                for (const m of [...Array(missed).keys()]) {
                  const time = prevCandle.time + step * (m + 1)
                  if (!obj.find((o) => o.time === time)) {
                    obj.push({
                      open: prevCandle.close,
                      high: prevCandle.close,
                      low: prevCandle.close,
                      close: prevCandle.close,
                      volume: '0',
                      time,
                      symbol: prevCandle.symbol,
                    })
                  }
                }
              }
            }
            obj.forEach((o) => {
              if (!dataHasSet.has(o.time)) {
                data.push(o)
                dataHasSet.add(o.time)
              }
            })
          })
          ind++
          if (updateProgress) {
            const add = (index ?? 0) / (total ?? 1)
            const mult = 1 / (total ?? 1)
            updateProgress(
              (ind / count) * mult + add,
              `Loading ${symbol}@${interval} period from ${new Date(
                fromThis,
              ).toUTCString()} to ${new Date(toThis).toUTCString()}`,
            )
          } else {
            Logger.info(
              `${
                this.exchangeName
              } | ${symbol} | ${interval} | Got candles from exchange from: ${
                candles[0]?.time
              }, to: ${candles[candles.length - 1]?.time}`,
            )
          }
        })
        if (currentIndex >= maxRequestInChunk) {
          chunkIndex++
          currentIndex = 0
        }
      }
      for (const chunk of requests) {
        await Promise.all(chunk.map((r) => r()))
      }
      return {
        status: StatusEnum.ok,
        data: data.sort((a, b) => a.time - b.time),
        reason: null,
      }
    } catch (e) {
      if ((e as ReturnBad)?.status === StatusEnum.notok) {
        return e as ReturnBad
      }
      return {
        status: StatusEnum.notok,
        data: null,
        reason: `${(e as Error)?.message ?? e}`,
      }
    }
  }
}

export default Candles
