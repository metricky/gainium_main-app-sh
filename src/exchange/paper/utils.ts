import { ExchangeEnum, StatusEnum } from '../../../types'
import axios from 'axios'
import http from 'http'
import { PAPER_TRADING_API_URL } from '../../config'

export type CreateUserDto = {
  username: string
  key: string
  secret: string
  balance: {
    exchange: ExchangeEnum
    asset: string
    amount: number
  }[]
}

export const createPaperUser = async (data: CreateUserDto) => {
  return axios(`${PAPER_TRADING_API_URL}/user`, {
    method: 'post',
    data,
    headers: {
      'Content-type': 'application/json',
    },
    httpAgent: new http.Agent({ keepAlive: true }),
  })
    .then((res) => {
      if (res.status >= 400) {
        throw new Error(res.statusText)
      }
      return {
        status: StatusEnum.ok,
        reason: null,
        data: null,
      }
    })
    .catch(() => ({
      status: StatusEnum.notok,
      reason: 'Failed to create paper user',
      data: null,
    }))
}

export const topUpUserBalance = async (data: {
  key: string
  secret: string
  stablecoinBalance: number
  exchange: ExchangeEnum
  coinToTopUp: string
}) => {
  return axios(`${PAPER_TRADING_API_URL}/user/topup`, {
    method: 'put',
    data,
    headers: {
      'Content-type': 'application/json',
    },
    httpAgent: new http.Agent({ keepAlive: true }),
  })
    .then((res) => {
      if (res.status >= 400) {
        throw new Error(res.statusText)
      }
      return {
        status: StatusEnum.ok,
        reason: null,
        data: null,
      }
    })
    .catch(() => ({
      status: StatusEnum.notok,
      reason: 'Failed to top up balance',
      data: null,
    }))
}

export type PaperExchangeType =
  | ExchangeEnum.paperBinance
  | ExchangeEnum.paperFtx
  | ExchangeEnum.paperBybit
  | ExchangeEnum.paperKucoin
  | ExchangeEnum.paperBinanceCoinm
  | ExchangeEnum.paperBinanceUsdm
  | ExchangeEnum.paperBybitCoinm
  | ExchangeEnum.paperBybitUsdm
  | ExchangeEnum.paperOkx
  | ExchangeEnum.paperOkxInverse
  | ExchangeEnum.paperOkxLinear
  | ExchangeEnum.paperCoinbase
  | ExchangeEnum.paperKucoinInverse
  | ExchangeEnum.paperKucoinLinear
  | ExchangeEnum.paperBitget
  | ExchangeEnum.paperBitgetUsdm
  | ExchangeEnum.paperBitgetCoinm
  | ExchangeEnum.paperMexc
  | ExchangeEnum.paperHyperliquid
  | ExchangeEnum.paperHyperliquidLinear
  | ExchangeEnum.paperKraken
  | ExchangeEnum.paperKrakenUsdm
  | ExchangeEnum.paperKrakenCoinm

export const paperExchanges = [
  ExchangeEnum.paperBinance,
  ExchangeEnum.paperFtx,
  ExchangeEnum.paperBybit,
  ExchangeEnum.paperKucoin,
  ExchangeEnum.paperBinanceCoinm,
  ExchangeEnum.paperBinanceUsdm,
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
  ExchangeEnum.paperKraken,
  ExchangeEnum.paperKrakenUsdm,
  ExchangeEnum.paperKrakenCoinm,
]

export const mapPaperToReal = (exchange: PaperExchangeType) => {
  switch (exchange) {
    case ExchangeEnum.paperBinanceUsdm:
      return ExchangeEnum.binanceUsdm
    case ExchangeEnum.paperBinanceCoinm:
      return ExchangeEnum.binanceCoinm
    case ExchangeEnum.paperBybitUsdm:
      return ExchangeEnum.bybitUsdm
    case ExchangeEnum.paperBybitCoinm:
      return ExchangeEnum.bybitCoinm
    case ExchangeEnum.paperBinance:
      return ExchangeEnum.binance
    case ExchangeEnum.paperBybit:
      return ExchangeEnum.bybit
    case ExchangeEnum.paperFtx:
      return ExchangeEnum.ftx
    case ExchangeEnum.paperKucoin:
      return ExchangeEnum.kucoin
    case ExchangeEnum.paperOkx:
      return ExchangeEnum.okx
    case ExchangeEnum.paperOkxInverse:
      return ExchangeEnum.okxInverse
    case ExchangeEnum.paperOkxLinear:
      return ExchangeEnum.okxLinear
    case ExchangeEnum.paperCoinbase:
      return ExchangeEnum.coinbase
    case ExchangeEnum.paperKucoinInverse:
      return ExchangeEnum.kucoinInverse
    case ExchangeEnum.paperKucoinLinear:
      return ExchangeEnum.kucoinLinear
    case ExchangeEnum.paperBitget:
      return ExchangeEnum.bitget
    case ExchangeEnum.paperBitgetUsdm:
      return ExchangeEnum.bitgetUsdm
    case ExchangeEnum.paperBitgetCoinm:
      return ExchangeEnum.bitgetCoinm
    case ExchangeEnum.paperMexc:
      return ExchangeEnum.mexc
    case ExchangeEnum.paperHyperliquid:
      return ExchangeEnum.hyperliquid
    case ExchangeEnum.paperHyperliquidLinear:
      return ExchangeEnum.hyperliquidLinear
    case ExchangeEnum.paperKraken:
      return ExchangeEnum.kraken
    case ExchangeEnum.paperKrakenUsdm:
      return ExchangeEnum.krakenUsdm
    case ExchangeEnum.paperKrakenCoinm:
      return ExchangeEnum.krakenCoinm
    default:
      throw new Error(`${exchange} is not found as paper`)
  }
}

export const isPaper = (exchange: ExchangeEnum) =>
  paperExchanges.includes(exchange)
