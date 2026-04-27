import Candles from '../../data/candles'
import { tvToExchangeIntervalMap } from '../backtester'
import type {
  ResolutionString,
  PeriodParams,
  ExchangeEnum as _ExchangeEnum,
} from '@gainium/backtester/dist/types'

const loadFn =
  (
    updateProgress?: (value: number, text: string, step?: number) => void,
    needSort = true,
  ) =>
  async (
    pair: string,
    _baseAsset: string,
    _quteAsset: string,
    resolution: ResolutionString,
    periodToUse: PeriodParams,
    exchange: _ExchangeEnum,
    index?: number,
    total?: number,
  ) => {
    //@ts-ignore
    const candleInstance = Candles.create(exchange)
    const candles = await candleInstance.getCandles(
      {
        symbol: pair,
        //@ts-ignore
        interval: tvToExchangeIntervalMap[resolution],
        from: periodToUse.from * 1000,
        to: periodToUse.to * 1000,
        index,
        total,
        updateProgress,
        needSort,
      },
      false,
    )
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

export default loadFn
