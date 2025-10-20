import type { Prices } from '../../types'
import { ExchangeEnum } from '../../types'

/**
 * Sleep function
 *
 * @param {number} millisecond ms to sleep
 */
const sleep = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const getTimezoneOffset = (timeZone: string, date = new Date()) => {
  const tz = date
    .toLocaleString('en', { timeZone, timeStyle: 'long' })
    .split(' ')
    .slice(-1)[0]
  const dateString = date.toString()
  const offset =
    Date.parse(`${dateString} UTC`) - Date.parse(`${dateString} ${tz}`)

  return offset
}

/**
 * Function to generate random string, that used as order id
 *
 * @param {number} length Length of the returned string
 * @returns {string} Random string given length
 */
const id = (length: number): string => {
  let result = ''
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

const getWeek = (time: Date, timezone: string) => {
  const onejan =
    new Date(time.getFullYear(), 0, 1).getTime() + getTimezoneOffset(timezone)
  const current =
    new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime() +
    getTimezoneOffset(timezone)
  const dayOfYear = (current - onejan + 86400000) / 86400000
  return Math.ceil(dayOfYear / 7)
}

const findAsset = (base: string, quote: string) => (pr: Prices[0]) => {
  const p = pr.pair.split('_')[0]
  return (
    p === `${base}${quote}` ||
    p === `${base}-${quote}` ||
    p === `${base}/${quote}` ||
    p === `${base}Z${quote}`
  )
}

const findRate = (
  base: string,
  quote: string,
  prices: Prices,
  reverse = false,
): number | undefined => {
  const rate = prices.find(findAsset(base, quote))
  if (rate) {
    return reverse ? 1 / rate.price : rate.price
  }
  if (!reverse) {
    return findRate(quote, base, prices, true)
  }
}

const findUSDRate = (asset: string, _prices: Prices, exchange?: string) => {
  const prices = _prices.filter((p) =>
    exchange ? [exchange, 'all'].includes(p.exchange) : true,
  )
  asset = asset
    .replace('SBTC', 'BTC')
    .replace('SUSD', 'USD')
    .replace('SUSDT', 'USDT')
    .replace('UBTC', 'BTC')
  if (asset === 'USD') {
    return 1
  }
  let usdRate = Number(
    asset === 'USDT' ||
      (exchange?.toLowerCase().includes('hyperliquid') && asset === 'USDC'),
  )
  let usdtRate = Number(
    asset === 'USDT' ||
      (exchange?.toLowerCase().includes('hyperliquid') && asset === 'USDC'),
  )
  if (asset !== 'USDT') {
    const findUsdtRate =
      findRate(asset, 'USDT', prices) ||
      (exchange?.toLowerCase().includes('hyperliquid') &&
        findRate(asset, 'USDC', prices))
    if (findUsdtRate) {
      usdtRate = findUsdtRate
      usdRate = usdtRate
    } else {
      const _findUsdRate = findRate(asset, 'USD', prices)
      if (_findUsdRate) {
        return _findUsdRate
      }
      const findBtcRate = findRate(asset, 'BTC', prices)
      if (findBtcRate) {
        const findBtcUsdtRate = findRate('BTC', 'USDT', prices)
        if (findBtcUsdtRate) {
          usdtRate = findBtcRate * findBtcUsdtRate
          usdRate = usdtRate
        }
      }
    }
  }
  const findUsdtUsdRate = findRate('USDT', 'USD', prices)
  if (findUsdtUsdRate) {
    usdRate = usdtRate * findUsdtUsdRate
  }
  return usdRate
}

const getDateDiffInDays = (a: Date, b: Date) => {
  const _MS_PER_DAY = 1000 * 60 * 60 * 24
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())

  return Math.floor((utc2 - utc1) / _MS_PER_DAY)
}

const mapToArray = (initialMap: Map<string, unknown>) => {
  return Array.from(initialMap, ([key, value]) => ({ key, value }))
}

const mapToObject = <T>(initialMap: Map<string, T>): { [x: string]: T } => {
  try {
    return [...initialMap.entries()].reduce(
      (acc, v) => {
        acc[v[0]] = v[1]
        return acc
      },
      {} as { [x: string]: T },
    )
  } catch (e) {
    return {}
  }
}

const checkNumber = (num?: string) => {
  return num && num !== '' && !isNaN(+num)
}

export const getRealFutures = () => [
  ExchangeEnum.binanceCoinm,
  ExchangeEnum.binanceUsdm,
  ExchangeEnum.bybitCoinm,
  ExchangeEnum.bybitUsdm,
  ExchangeEnum.okxInverse,
  ExchangeEnum.okxLinear,
  ExchangeEnum.kucoinInverse,
  ExchangeEnum.kucoinLinear,
  ExchangeEnum.bitgetCoinm,
  ExchangeEnum.bitgetUsdm,
  ExchangeEnum.hyperliquidLinear,
]

export const getRealCoinm = () => [
  ExchangeEnum.binanceCoinm,
  ExchangeEnum.bybitCoinm,
  ExchangeEnum.okxInverse,
  ExchangeEnum.kucoinInverse,
  ExchangeEnum.bitgetCoinm,
]

export const getRealSpot = () => [
  ExchangeEnum.binance,
  ExchangeEnum.kucoin,
  ExchangeEnum.bybit,
  ExchangeEnum.okx,
  ExchangeEnum.coinbase,
  ExchangeEnum.bitget,
  ExchangeEnum.mexc,
  ExchangeEnum.hyperliquid,
]

export const isFutures = (exchange: ExchangeEnum) => {
  return [
    ExchangeEnum.binanceCoinm,
    ExchangeEnum.binanceUsdm,
    ExchangeEnum.paperBinanceCoinm,
    ExchangeEnum.paperBinanceUsdm,
    ExchangeEnum.paperBybitCoinm,
    ExchangeEnum.paperBybitUsdm,
    ExchangeEnum.bybitCoinm,
    ExchangeEnum.bybitUsdm,
    ExchangeEnum.okxInverse,
    ExchangeEnum.okxLinear,
    ExchangeEnum.paperOkxInverse,
    ExchangeEnum.paperOkxLinear,
    ExchangeEnum.kucoinInverse,
    ExchangeEnum.kucoinLinear,
    ExchangeEnum.paperKucoinInverse,
    ExchangeEnum.paperKucoinLinear,
    ExchangeEnum.bitgetCoinm,
    ExchangeEnum.paperBitgetCoinm,
    ExchangeEnum.bitgetUsdm,
    ExchangeEnum.paperBitgetUsdm,
    ExchangeEnum.hyperliquidLinear,
    ExchangeEnum.paperHyperliquidLinear,
  ].includes(exchange)
}

export const isCoinm = (exchange: ExchangeEnum) => {
  return [
    ExchangeEnum.binanceCoinm,
    ExchangeEnum.paperBinanceCoinm,
    ExchangeEnum.bybitCoinm,
    ExchangeEnum.paperBybitCoinm,
    ExchangeEnum.okxInverse,
    ExchangeEnum.paperOkxInverse,
    ExchangeEnum.paperKucoinInverse,
    ExchangeEnum.kucoinInverse,
    ExchangeEnum.bitgetCoinm,
    ExchangeEnum.paperBitgetCoinm,
  ].includes(exchange)
}

export const isPaper = (exchange: ExchangeEnum) => {
  return [
    ExchangeEnum.paperBinance,
    ExchangeEnum.paperBinanceCoinm,
    ExchangeEnum.paperBinanceUsdm,
    ExchangeEnum.paperBybit,
    ExchangeEnum.paperFtx,
    ExchangeEnum.paperKucoin,
    ExchangeEnum.paperBybitCoinm,
    ExchangeEnum.paperBybitUsdm,
    ExchangeEnum.paperOkx,
    ExchangeEnum.paperOkxInverse,
    ExchangeEnum.paperOkxLinear,
    ExchangeEnum.paperCoinbase,
    ExchangeEnum.paperKucoinInverse,
    ExchangeEnum.paperKucoinLinear,
    ExchangeEnum.paperBitget,
    ExchangeEnum.paperBitgetUsdm,
    ExchangeEnum.paperBitgetCoinm,
    ExchangeEnum.paperMexc,
    ExchangeEnum.paperHyperliquid,
    ExchangeEnum.paperHyperliquidLinear,
  ].includes(exchange)
}

export default {
  sleep,
  getTimezoneOffset,
  getWeek,
  id,
  findUSDRate,
  getDateDiffInDays,
  mapToArray,
  mapToObject,
  checkNumber,
}
