import { ExchangeEnum } from '../../types'

export const isKucoin = (exchange: ExchangeEnum) =>
  [
    ExchangeEnum.kucoin,
    ExchangeEnum.kucoinInverse,
    ExchangeEnum.kucoinLinear,
    ExchangeEnum.paperKucoin,
    ExchangeEnum.paperKucoinInverse,
    ExchangeEnum.paperKucoinLinear,
  ].includes(exchange)

export const isUsdmKucoin = (exchange: ExchangeEnum) =>
  [ExchangeEnum.kucoinLinear, ExchangeEnum.paperKucoinLinear].includes(exchange)

export const isOkx = (exchange: ExchangeEnum) =>
  [
    ExchangeEnum.okx,
    ExchangeEnum.okxInverse,
    ExchangeEnum.okxLinear,
    ExchangeEnum.paperOkx,
    ExchangeEnum.paperOkxInverse,
    ExchangeEnum.paperOkxLinear,
  ].includes(exchange)

export const isKraken = (exchange: ExchangeEnum) =>
  [
    ExchangeEnum.kraken,
    ExchangeEnum.krakenUsdm,
    ExchangeEnum.paperKraken,
    ExchangeEnum.paperKrakenUsdm,
  ].includes(exchange)
