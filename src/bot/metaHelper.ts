import { isMainThread, threadId, parentPort } from 'worker_threads'

import {
  botDb,
  botEventDb,
  botMessageDb,
  comboBotDb,
  dcaBotDb,
} from '../db/dbInit'
import logger from '../utils/logger'
import Bot from './index'
import { IdMute, IdMutex } from '../utils/mutex'
import RedisClient, { RedisWrapper } from '../db/redis'

import {
  BotType,
  type CleanMainBot,
  StatusEnum,
  BotStatusEnum,
  CloseDCATypeEnum,
  liveupdate,
  HedgeBotSchema,
  ExcludeDoc,
  MessageTypeEnum,
} from '../../types'
import type { DataResponse, ErrorResponse } from '../db/crud'
import type DB from '../db'
import { eventMap } from './main'
import { getErrorSubType } from './utils'

export type MetaBotOptions = {
  botType: BotType
  id: string
  bots: {
    type: BotType
    id: string
  }[]
}

export const supportedMetaTypes = [BotType.combo, BotType.dca, BotType.grid]

const loggerPrefix = `${isMainThread ? 'Main thread' : `Worker ${threadId}`} |`

export type ChildBotType<T> = {
  type: BotType
  data: T
}

const mutex = new IdMutex()

class MetaBot<Schema extends HedgeBotSchema, T extends CleanMainBot> {
  public data?: ExcludeDoc<Schema>
  public bots: Map<string, ChildBotType<T>> = new Map()
  public initDone = false
  private bot = Bot.getInstance()
  public queueAfterInit: (() => Promise<void>)[] = []
  private redisDb: RedisWrapper | null = null
  private closeTimer: NodeJS.Timeout | null = null
  constructor(
    public options: MetaBotOptions,
    public db: DB<Schema>,
  ) {
    this.init()
  }

  handleLog(log: string): void {
    logger.info(
      `${loggerPrefix} Bot (${this.options.botType}) ${this.options.id} | ${log}`,
    )
  }

  handleError(
    message: string,
    setError = false,
    type = MessageTypeEnum.error,
  ): void {
    logger.error(
      `${loggerPrefix} Bot (${this.options.botType}) ${this.options.id} | ${message}`,
    )
    if (setError && this.bots.size) {
      const v = this.bots.values().next().value
      if (v) {
        const botName = v.data.settings.name
        const botId = v.data._id
        const botType = v.type
        const userId = v.data.userId
        const time = +new Date()
        botMessageDb
          .createData({
            userId,
            botId,
            botName,
            botType,
            type: type,
            message,
            time,
            subType: getErrorSubType(message),
            paperContext: !!this.data?.paperContext,
            terminal: false,
            isDeleted: false,
            showUser: true,
            fullMessage: message,
            symbol: '',
            exchange: '',
          })
          .then((res) => {
            if (res.status === StatusEnum.ok) {
              this.emit('bot message', {
                botName,
                _id: `${res.data._id}`,
                type,
                message,
                time,
                terminal: false,
                trigger: false,
                symbol: '',
                exchange: '',
              })
              if (type !== MessageTypeEnum.warning) {
                const update = { showErrorWarning: type }
                ;(botType === BotType.combo
                  ? comboBotDb
                  : botType === BotType.dca
                    ? dcaBotDb
                    : botDb
                )
                  //@ts-ignore
                  .updateData({ _id: botId }, { $set: update })
                this.emit('bot settings update', update, botId, botType)
              }
              botEventDb.createData({
                userId,
                botId,
                event: `Bot ${
                  type === MessageTypeEnum.error ? 'error' : 'warning'
                }`,
                botType,
                description: `${
                  type === MessageTypeEnum.error ? 'Error' : 'Warning'
                }: ${message}`,
                paperContext: !!this.data?.paperContext,
                type,
              })
            }
          })
      }
    }
  }

  @IdMute(mutex, (botId: string) => `${botId}runAfterInit`)
  private async runAfterInit(_botId: string) {
    const queue = this.queueAfterInit
    this.queueAfterInit = []
    for (const q of queue) {
      await q()
    }
  }

  async connectRedis() {
    this.redisDb = await RedisClient.getInstance()
  }

  public async init() {
    this.handleLog('Init')
    this.handleLog('Load bot data')
    this.data = (
      await this.db.readData({ _id: this.options.id } as any)
    )?.data?.result
    if (!this.data) {
      this.handleError('Error reading bot data')
      return
    }
    await this.connectRedis()
    for (const bot of this.options.bots) {
      if (!supportedMetaTypes.includes(bot.type)) {
        this.handleError(`Bot type ${bot.type} not supported in meta`)
        continue
      }
      let read: DataResponse<{ result: T }> | ErrorResponse | undefined
      if (bot.type === BotType.combo) {
        read = await comboBotDb.readData({ _id: bot.id })
      }
      if (bot.type === BotType.dca) {
        read = await dcaBotDb.readData({ _id: bot.id })
      }
      if (bot.type === BotType.grid) {
        read = await botDb.readData({ _id: bot.id })
      }
      if (!read || read.status === StatusEnum.notok) {
        this.handleError(`Error reading bot ${bot.id} ${bot.type}`)
      } else {
        this.bots.set(bot.id, {
          type: bot.type,
          data: read.data.result as unknown as T,
        })
      }
    }
    this.initDone = true
    await this.runAfterInit(this.options.id)
  }

  public async sendMessageToBotService<T>(
    method: string,
    botType: BotType,
    ...agrs: unknown[]
  ) {
    return await this.bot.callFunctionFromMeta<T>(method, botType, ...agrs)
  }

  public async sendCommandToBotService<T>(method: string, ...agrs: unknown[]) {
    return (
      await Promise.all(
        [...this.bots.values()].map(
          async (bot) =>
            await this.bot.callBotFunctionFromMeta<T>(
              bot.data._id,
              bot.type,
              method,
              ...agrs,
            ),
        ),
      )
    )[0]
  }

  public async getBotWorkerId(botId: string, botType: BotType) {
    return await this.bot.getWorkerIdByBot(botId, botType)
  }

  emit(event: string, data: any, id?: string, type?: BotType) {
    if (data.stats && event === 'bot sends settings') {
      data = { ...data }
      delete data.stats
    }
    const fullData = {
      botId: id ?? this.options.id,
      data,
      botType: type ?? this.options.botType,
      paperContext: !!this.data?.paperContext,
    }
    this.redisDb?.publish(
      `${liveupdate}${this.data?.userId}`,
      JSON.stringify({ data: fullData, event: eventMap[event] ?? event }),
    )
  }

  private updateBotData(data: Record<string, unknown>) {
    this.db.updateData({ _id: this.options.id } as any, { $set: data })
    this.emit('bot settings update', data)
  }

  @IdMute(mutex, (botId: string) => `setStatusBot${botId}`)
  async setStatus(
    _botId: string,
    status: BotStatusEnum,
    closeType?: CloseDCATypeEnum,
    serverRestart?: boolean,
  ) {
    if (!this.initDone) {
      this.queueAfterInit.push(() =>
        this.setStatus.bind(this)(_botId, status, closeType, serverRestart),
      )
      return
    }
    if (status === BotStatusEnum.open) {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer)
        this.closeTimer = null
        this.handleLog(`Clear close timer`)
      }
    }
    this.handleLog(`Set status to ${status}`)
    for (const bot of this.bots.values()) {
      if (!bot.data) {
        continue
      }
      if (!serverRestart) {
        await this.sendMessageToBotService(
          'changeStatus',
          bot.type,
          bot.data.userId,
          {
            status,
            id: bot.data._id,
            closeType,
            type: bot.type,
          },
          bot.data.paperContext,
          serverRestart,
        )
      }
    }

    this.updateBotData({ status })
    if (
      status === BotStatusEnum.closed &&
      closeType !== CloseDCATypeEnum.leave
    ) {
      this.sendBotClosed()
    }
  }
  async sendBotClosed(process = false) {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
    }
    if (!process) {
      this.handleLog(`Set timer 10s to send close bot signal`)
      this.closeTimer = setTimeout(
        () => this.sendBotClosed.bind(this)(true),
        10 * 1000,
      )
      return
    }
    if (
      this.data?.status !== BotStatusEnum.closed &&
      this.data?.status !== BotStatusEnum.archive
    ) {
      this.handleLog(`Bot closed signal, status ${this.data?.status}`)
      return
    }
    if (!isMainThread) {
      parentPort?.postMessage({
        event: 'botClosed',
        botId: this.options.id,
        botType: this.options.botType,
      })
    }
  }
  @IdMute(mutex, (botId: string) => `stopFromChildBot${botId}`)
  public stopFromChildBot(_botId: string) {
    this.handleLog(`Stop from child bot`)
    this.updateBotData({ status: BotStatusEnum.closed })
    this.sendBotClosed()
  }

  @IdMute(mutex, (botId: string) => `reload${botId}`)
  public async reload(botId: string) {
    this.handleLog(`Reload`)
    this.initDone = false
    await this.init()
    await this.setStatus(
      botId,
      this.data?.status ?? BotStatusEnum.open,
      undefined,
      false,
    )
  }
}

export default MetaBot
