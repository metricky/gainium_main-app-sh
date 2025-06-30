import axios from 'axios'
import http from 'http'
import { ExchangeEnum, StatusEnum, ExchangeIntervals } from '../../types'
import logger from '../utils/logger'
import ExchangeChooser from './exchangeChooser'
import { EXCHANGE_SERVICE_API_URL } from '../config'

export type GetCandlesRequest = {
  symbol: string
  type: string
  startAt: number
  endAt: number
}

export const getWSKucoin = async () => {
  return axios(`${EXCHANGE_SERVICE_API_URL}/kucoin/ws`, {
    method: 'get',
    httpAgent: new http.Agent({ keepAlive: true }),
  })
    .then((res) => {
      delete res.data['timeProfile']
      return res.data
    })
    .catch((res) => {
      logger.error(
        `Additional API | Catch code:${res.response?.status}, status:${res.response?.statusText}, method: getWSKucoin`,
      )
      return []
    })
}

export const getPrices = async (exchange: ExchangeEnum) => {
  const ex = ExchangeChooser.chooseExchangeFactory(exchange)
  if (ex) {
    const v = await ex('', '').getAllPrices(true)
    delete v['timeProfile']
    return v
  }
  return {
    status: StatusEnum.notok,
    data: null,
    reason: `Cannot get tickers. Please try again later`,
  }
}

export const getCandles = async (params: {
  symbol: string
  type: string
  startAt: string
  endAt: string
  exchange: ExchangeEnum
  limit?: string
}) => {
  const { symbol, type, startAt, endAt, exchange, limit } = params
  const ex = ExchangeChooser.chooseExchangeFactory(exchange)
  if (ex) {
    const v = await ex('', '').getCandles(
      symbol,
      type as ExchangeIntervals,
      +startAt,
      +endAt,
      limit ? +limit : undefined,
    )
    delete v['timeProfile']
    return v
  }
  return {
    status: StatusEnum.notok,
    data: null,
    reason: `Cannot get candles. Please try again later`,
  }
}

const methods = {
  getWSKucoin,
  getPrices,
  getCandles,
}

export default methods
