import ExchangeChooser from '../../exchange/exchangeChooser'
import logger from '../../utils/logger'
import { brokerCodesDb, pairDb, rateDb } from '../../db/dbInit'
import RedisClient from '../../db/redis'
import { isPaper } from '../../exchange/paper/utils'
import utils from '../user'

import { ExchangeEnum, type ClearPairsSchema, StatusEnum } from '../../../types'
import { Kraken } from 'node-kraken-api'
import axios from 'axios'

const providers = [
  ExchangeEnum.binance,
  ExchangeEnum.kucoin,
  ExchangeEnum.bybit,
  ExchangeEnum.binanceUS,
  ExchangeEnum.paperBinance,
  ExchangeEnum.paperKucoin,
  ExchangeEnum.paperBybit,
  ExchangeEnum.binanceCoinm,
  ExchangeEnum.binanceUsdm,
  ExchangeEnum.paperBinanceCoinm,
  ExchangeEnum.paperBinanceUsdm,
  ExchangeEnum.bybitCoinm,
  ExchangeEnum.bybitUsdm,
  ExchangeEnum.paperBybitCoinm,
  ExchangeEnum.paperBybitUsdm,
  ExchangeEnum.okx,
  ExchangeEnum.okxInverse,
  ExchangeEnum.okxLinear,
  ExchangeEnum.paperOkx,
  ExchangeEnum.paperOkxInverse,
  ExchangeEnum.paperOkxLinear,
  ExchangeEnum.coinbase,
  ExchangeEnum.paperCoinbase,
  ExchangeEnum.kucoinInverse,
  ExchangeEnum.kucoinLinear,
  ExchangeEnum.paperKucoinInverse,
  ExchangeEnum.paperKucoinLinear,
  ExchangeEnum.bitget,
  ExchangeEnum.paperBitget,
  ExchangeEnum.bitgetUsdm,
  ExchangeEnum.paperBitgetUsdm,
  ExchangeEnum.bitgetCoinm,
  ExchangeEnum.paperBitgetCoinm,
]

export const updateExchangeInfo = async (ec = ExchangeChooser) => {
  const updateBotMap: Map<ExchangeEnum, ClearPairsSchema[]> = new Map()
  const deleteBotMap: Map<ExchangeEnum, string[]> = new Map()
  for (const provider of providers) {
    const choose = ec.chooseExchangeFactory(provider)
    if (choose) {
      const exchange = choose('', '')
      const exchangeInfo = await exchange.getAllExchangeInfo()
      if (exchangeInfo.status === 'OK' && exchangeInfo.data.length > 1) {
        const updateMap: Map<string, ClearPairsSchema> = new Map()
        const createMap: Omit<ClearPairsSchema, '_id'>[] = []
        const deleteSet: Set<string> = new Set()
        const allDbPairs = await pairDb.readData(
          { exchange: provider },
          undefined,
          {},
          true,
          true,
        )
        if (allDbPairs.status === StatusEnum.ok) {
          for (const info of exchangeInfo.data) {
            const getPair = allDbPairs.data.result.find(
              (p) => p.pair === info.pair,
            )
            if (getPair) {
              if (
                getPair.baseAsset.name !== info.baseAsset.name ||
                getPair.baseAsset.minAmount !== info.baseAsset.minAmount ||
                getPair.baseAsset.step !== info.baseAsset.step ||
                getPair.baseAsset.maxAmount !== info.baseAsset.maxAmount ||
                getPair.baseAsset.maxMarketAmount !==
                  info.baseAsset.maxMarketAmount ||
                getPair.quoteAsset.minAmount !== info.quoteAsset.minAmount ||
                getPair.quoteAsset.name !== info.quoteAsset.name ||
                getPair.quoteAsset.precision !== info.quoteAsset.precision ||
                getPair.maxOrders !== info.maxOrders ||
                getPair.priceAssetPrecision !== info.priceAssetPrecision ||
                getPair.priceMultiplier?.decimals !==
                  info.priceMultiplier?.decimals ||
                getPair.priceMultiplier?.down !== info.priceMultiplier?.down ||
                getPair.priceMultiplier?.up !== info.priceMultiplier?.up ||
                getPair.baseAsset.multiplier !== info.baseAsset.multiplier ||
                (typeof getPair.crossAvailable === 'undefined' &&
                  typeof info.crossAvailable !== 'undefined') ||
                (typeof getPair.crossAvailable !== 'undefined' &&
                  typeof info.crossAvailable === 'undefined') ||
                getPair.crossAvailable !== info.crossAvailable
              ) {
                const _id = getPair._id.toString()
                updateMap.set(_id, {
                  ...info,
                  exchange: provider,
                  _id,
                })
              }
            }
            if (!getPair) {
              createMap.push({
                ...info,
                exchange: provider,
              })
            }
          }
          for (const old of allDbPairs.data.result) {
            const find = exchangeInfo.data.find((p) => p.pair === old.pair)
            if (!find) {
              deleteSet.add(old._id.toString())
            }
          }
          for (const [_id, data] of updateMap) {
            await pairDb
              .updateData({ _id: _id }, { $set: { ...data } })
              .then((res) => {
                if (res.status === StatusEnum.ok) {
                  logger.info(
                    `Pairs update | ${data.pair}@${data.exchange} updated`,
                  )
                }
                if (res.status === StatusEnum.notok) {
                  logger.error(
                    `Pairs update | ${data.pair}@${data.exchange} error, reason: ${res.reason}`,
                  )
                }
              })
          }

          if (updateMap.size) {
            for (const u of updateMap.values()) {
              updateBotMap.set(
                u.exchange,
                (updateBotMap.get(u.exchange) ?? []).concat(u),
              )
            }
          }
          for (const data of createMap) {
            await pairDb.createData({ ...data }).then((res) => {
              if (res.status === StatusEnum.ok) {
                logger.info(
                  `Pairs update | ${data.pair}@${data.exchange} created`,
                )
              }
              if (res.status === StatusEnum.notok) {
                logger.error(
                  `Pairs update | ${data.pair}@${data.exchange} error, reason: ${res.reason}`,
                )
              }
            })
          }
          if (deleteSet.size !== 0) {
            deleteBotMap.set(provider, [...deleteSet])
            await pairDb
              .deleteManyData({ _id: { $in: Array.from(deleteSet) } })
              .then((res) => {
                if (res.status === StatusEnum.ok) {
                  logger.info(`Pairs update | ${res.reason}`)
                }
                if (res.status === StatusEnum.notok) {
                  logger.error(
                    `Pairs update | Delete data error | reason: ${res.reason}`,
                  )
                }
              })
          }
        } else {
          logger.error(
            `Pairs update | Cannot get all pairs: ${allDbPairs.reason}`,
          )
        }
      } else {
        logger.error(
          `Pairs update | ${provider} error: ${
            exchangeInfo.reason ??
            `array length ${exchangeInfo.data?.length ?? 0}`
          }`,
        )
      }
    }
  }
  for (const [k, v] of updateBotMap.entries()) {
    if (!isPaper(k)) {
      const redis = await RedisClient.getInstance()
      redis?.publish(
        'updateexchangeInfo',
        JSON.stringify({ exchange: k, pairs: v.map((p) => p.pair) }),
      )
    }
  }
  for (const [k, v] of deleteBotMap.entries()) {
    if (!isPaper(k)) {
      const redis = await RedisClient.getInstance()
      redis?.publish(
        'updateexchangeInfo',
        JSON.stringify({ exchange: k, deletePairs: v }),
      )
    }
  }
}

const getRate = async () => {
  const exchangeKraken = new Kraken()
  const ticker = await exchangeKraken
    .ticker({ pair: 'USDTUSD' })
    .then((res) => ({ status: 'OK', result: res }))
    .catch((e: Error) => ({
      status: 'NOTOK',
      result: e.message,
    }))
  if (
    ticker.status === 'OK' &&
    ticker.result &&
    typeof ticker.result !== 'string' &&
    ticker.result.USDTZUSD &&
    ticker.result.USDTZUSD.c
  ) {
    return {
      status: 'OK',
      usdRate: parseFloat(ticker.result.USDTZUSD.c[0]),
      reason: null,
    }
  }
  return { status: 'NOTOK', usdRate: 0, reason: ticker.result }
}

const updateRate = async (): Promise<number> => {
  const rate = await getRate()
  if (rate.status === StatusEnum.ok) {
    return rate.usdRate
  } else {
    logger.error(`Get USD Rate reason: ${rate.reason}`)
    const newRes = await updateRate()
    return newRes
  }
}

export const saveRate = async () => {
  const usdRate = await updateRate()
  rateDb
    .createData({ usdRate })
    .then((r) =>
      r.status === StatusEnum.notok
        ? logger.error(`Save USD rate reason: ${r.reason}`)
        : null,
    )
}

const updateBrokerCodes = async () => {
  await axios
    .get<{ exchange: ExchangeEnum; code: string }[]>(
      'https://api.gainium.io/broker-codes',
    )
    .then(async (res) => {
      if (res.data?.length) {
        for (const item of res.data) {
          await brokerCodesDb
            .updateData({ ...item }, { ...item }, false, true, true)
            .then((r) => {
              logger.info(
                `updateBrokerCodes | ${item.exchange} code updated: ${item.code}, result: ${r.status}`,
              )
            })
        }
      }
    })
    .catch((e) => logger.error(`updateBrokerCodes | Error: ${e.message}`))
}

export const exchangeFullUpdate = () =>
  updateBrokerCodes()
    .then(() => updateExchangeInfo())
    .then(() => utils.updateUserFee())
