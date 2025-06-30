import { parentPort, threadId } from 'worker_threads'
import BotHelper from '../../bot/helper'
import DCABotHelper from '../../bot/dcaHelper'
import ComboBotHelper from '../../bot/comboHelper'
import {
  BotType,
  CreateBotDto,
  MethodBotDto,
  BotWorkerDto,
  UpdateBotExchangeDto,
  ExchangeEnum,
  DeleteBotDto,
} from '../../../types'
import { IdMute, IdMutex } from '../../utils/mutex'
import logger from '../../utils/logger'
import { v4 } from 'uuid'
import HedgeBot from '../hedgeHelper'

const mutex = new IdMutex()

const mutexConcurrentely = new IdMutex(1000)

class BotOperations {
  static instance: BotOperations
  static getInstance() {
    if (!BotOperations.instance) {
      BotOperations.instance = new BotOperations()
    }
    return BotOperations.instance
  }

  private bots: {
    id: string
    b: BotHelper
    userId: string
    exchange: ExchangeEnum
  }[] = []

  private dcaBots: {
    id: string
    b: DCABotHelper
    userId: string
    exchange: ExchangeEnum
  }[] = []

  private comboBots: {
    id: string
    b: ComboBotHelper
    userId: string
    exchange: ExchangeEnum
  }[] = []

  private hedgeComboBots: {
    id: string
    b: HedgeBot
    userId: string
  }[] = []

  private hedgeDcaBots: {
    id: string
    b: HedgeBot
    userId: string
  }[] = []

  @IdMute(mutex, (data: CreateBotDto) => `createBot${data.botId}`)
  public createBot(data: CreateBotDto) {
    try {
      const { botType, botId, args, userId, exchange } = data
      let create = false
      if (botType === BotType.dca) {
        if (this.dcaBots.find((b) => b.id === botId)) {
          create = true
        } else {
          //@ts-ignore
          const bot = new DCABotHelper(...args)
          this.dcaBots.push({ id: botId, b: bot, userId, exchange })
          create = true
        }
      }
      if (botType === BotType.grid) {
        if (this.bots.find((b) => b.id === botId)) {
          create = true
        } else {
          //@ts-ignore
          const bot = new BotHelper(...args)
          this.bots.push({ id: botId, b: bot, userId, exchange })
          create = true
        }
      }
      if (botType === BotType.combo) {
        if (this.comboBots.find((b) => b.id === botId)) {
          create = true
        } else {
          //@ts-ignore
          const bot = new ComboBotHelper(...args)
          this.comboBots.push({ id: botId, b: bot, userId, exchange })
          create = true
        }
      }
      if (botType === BotType.hedgeCombo) {
        if (this.hedgeComboBots.find((b) => b.id === botId)) {
          create = true
        } else {
          //@ts-ignore
          const bot = new HedgeBot(...args)
          this.hedgeComboBots.push({ id: botId, b: bot, userId })
          create = true
        }
      }
      if (botType === BotType.hedgeDca) {
        if (this.hedgeDcaBots.find((b) => b.id === botId)) {
          create = true
        } else {
          //@ts-ignore
          const bot = new HedgeBot(...args)
          this.hedgeDcaBots.push({ id: botId, b: bot, userId })
          create = true
        }
      }
      parentPort?.postMessage({ event: 'createBot', botId, create })
    } catch (e) {
      logger.error(
        `createBot Rejection at Promise Worker ${threadId}, ${
          (e as Error)?.message ?? e
        } ${(e as Error)?.stack ?? ''}`,
      )
    }
  }

  @IdMute(mutex, (data: MethodBotDto) =>
    data.method === 'getStats' || data.method === 'openDealBySignal'
      ? v4()
      : data.method === 'mergeDeals'
        ? `mergeDeals${data.botId}`
        : `methodBot${data.botId}`,
  )
  @IdMute(mutexConcurrentely, () => `methodBot`)
  public async methodBot(data: MethodBotDto) {
    try {
      const { botType, botId, method, args, responseId } = data
      let response: unknown = null
      let bot:
        | typeof this.bots
        | typeof this.dcaBots
        | typeof this.comboBots
        | undefined
      if (botType === BotType.dca) {
        //@ts-ignore
        bot = this.dcaBots.find((b) => b.id === botId)
      }
      if (botType === BotType.grid) {
        //@ts-ignore
        bot = this.bots.find((b) => b.id === botId)
      }
      if (botType === BotType.combo) {
        //@ts-ignore
        bot = this.comboBots.find((b) => b.id === botId)
      }
      if (botType === BotType.hedgeCombo) {
        //@ts-ignore
        bot = this.hedgeComboBots.find((b) => b.id === botId)
      }
      if (botType === BotType.hedgeDca) {
        //@ts-ignore
        bot = this.hedgeDcaBots.find((b) => b.id === botId)
      }
      if (bot) {
        //@ts-ignore
        if (typeof bot.b[method] === 'function') {
          //@ts-ignore
          response = await bot.b[method](...args)
        } else {
          if (botType === BotType.hedgeCombo || botType === BotType.hedgeDca) {
            //@ts-ignore
            response = await bot.b.sendCommandToBotService(method, ...args)
          }
        }
      }
      if (!bot) {
        logger.info(`Worker ${threadId} bot not found ${botId} ${botType}`)
      }
      if (responseId) {
        parentPort?.postMessage({
          event: 'response',
          responseId,
          botId,
          response,
        })
      }
    } catch (e) {
      logger.error(
        `methodBot Rejection at Promise Worker ${threadId}, ${
          (e as Error)?.message ?? e
        } ${(e as Error)?.stack ?? ''}`,
      )
    }
  }

  @IdMute(mutex, (data: UpdateBotExchangeDto) => `updateBot${data.userId}`)
  public async updateBotExchange(data: UpdateBotExchangeDto) {
    try {
      const {
        exchangeUUID,
        key,
        secret,
        passphrase,
        userId,
        keysType,
        okxSource,
      } = data
      for (const b of this.bots.filter((b) => b.userId === userId)) {
        b.b.setExchangeCredentials(
          exchangeUUID,
          key,
          secret,
          passphrase,
          keysType,
          okxSource,
          true,
        )
      }
      for (const b of this.dcaBots.filter((b) => b.userId === userId)) {
        b.b.setExchangeCredentials(
          exchangeUUID,
          key,
          secret,
          passphrase,
          keysType,
          okxSource,
          true,
        )
      }
      for (const b of this.comboBots.filter((b) => b.userId === userId)) {
        b.b.setExchangeCredentials(
          exchangeUUID,
          key,
          secret,
          passphrase,
          keysType,
          okxSource,
          true,
        )
      }
    } catch (e) {
      logger.error(
        `updateBot Rejection at Promise Worker ${threadId}, ${
          (e as Error)?.message ?? e
        } ${(e as Error)?.stack ?? ''}`,
      )
    }
  }

  public deleteBot(data: DeleteBotDto) {
    const { botType, botId } = data
    if (botType === BotType.dca) {
      this.dcaBots = this.dcaBots.filter((b) => {
        if (b.id === botId) {
          //@ts-ignore
          delete b.b
          return false
        }
        return true
      })
    }
    if (botType === BotType.grid) {
      this.bots = this.bots.filter((b) => {
        if (b.id === botId) {
          //@ts-ignore
          delete b.b
          return false
        }
        return true
      })
    }
    if (botType === BotType.combo) {
      this.comboBots = this.comboBots.filter((b) => {
        if (b.id === botId) {
          //@ts-ignore
          delete b.b
          return false
        }
        return true
      })
    }
  }
}

const processMessage = (data: BotWorkerDto) => {
  if (data.do) {
    logger.info(
      `Worker ${threadId} Message ${data.do} ${
        data.do === 'exchangeInfo' ? '' : JSON.stringify(data)
      }`,
    )
  }
  if (data.do === 'create') {
    BotOperations.getInstance().createBot(data)
  }
  if (data.do === 'method') {
    BotOperations.getInstance().methodBot(data)
  }
  if (data.do === 'update') {
    BotOperations.getInstance().updateBotExchange(data)
  }
  if (data.do === 'delete') {
    BotOperations.getInstance().deleteBot(data)
  }
}

parentPort?.on('message', (data: BotWorkerDto | BotWorkerDto[]) => {
  if (Array.isArray(data)) {
    data.forEach((d) => processMessage(d))
  }
  if (data && !Array.isArray(data)) {
    processMessage(data)
  }
})

process
  .on('unhandledRejection', (reason, p) => {
    logger.error(reason, `Unhandled Rejection at Promise Worker ${threadId}`, p)
  })
  .on('uncaughtException', (err) => {
    logger.error(err, `Uncaught Exception thrown Worker ${threadId}`)
  })
