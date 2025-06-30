import logger from '../utils/logger'
import Indicators from '../indicators'
import Rabbit from '../db/rabbit'
import RedisClient, { RedisWrapper } from '../db/redis'
import HealthServer from '../utils/healthServer'

import { BotType, rabbitIndicatorsKey, serviceLogRedis } from '../../types'
import type {
  BotParentIndicatorEventDto,
  BotParentUnsubscribeIndicatorEventDto,
  IndicatorHistory,
} from '../../types'
import { IdMute, IdMutex } from '../utils/mutex'

const mutex = new IdMutex()
const cbMutex = new IdMutex(1000)

type RequestMessage =
  | BotParentIndicatorEventDto
  | BotParentUnsubscribeIndicatorEventDto

class IndicatorsService {
  private rabbitClient: Rabbit | null = null
  private redisClient: RedisWrapper | null = null
  private redisSubClient: RedisWrapper | null = null
  private redisChannels: Set<string> = new Set()
  private rabbitIdRoomsMapDca: Map<string, string> = new Map()
  private rabbitIdRoomsMapCombo: Map<string, string> = new Map()
  private indicatorsFactory = Indicators.getInstance()
  constructor() {
    this.redisServiceLogListener = this.redisServiceLogListener.bind(this)
    this.initRedis = this.initRedis.bind(this)

    // Start health server
    const healthServer = new HealthServer()
    healthServer.start()

    this.rabbitClient = new Rabbit()
    this.initRedis()

    this.requestCallback = this.requestCallback.bind(this)
    this.getRedisCb = this.getRedisCb.bind(this)

    logger.info(`>🔬 Indicators service ready in ${rabbitIndicatorsKey} queue`)
  }

  private async initRedis() {
    this.redisClient = await RedisClient.getInstance(false, 'indicators')
    this.redisSubClient = await RedisClient.getInstance(true, 'indicators')
    this.rabbitListener()
    this.redisClient.publish(
      serviceLogRedis,
      JSON.stringify({ restart: 'indicators' }),
    )
    this.redisSubClient.subscribe(serviceLogRedis, this.redisServiceLogListener)
  }

  @IdMute(mutex, (channel: string) => `${channel}getRedisCb`)
  @IdMute(cbMutex, () => 'getRedisCb')
  private getRedisCb(channel: string, payload: Record<string, unknown>) {
    const data = JSON.stringify(payload)
    this.redisClient?.publish(channel, data)
  }

  private redisServiceLogListener(msg: string) {
    try {
      const parse = JSON.parse(msg) as { restart: string }
      if (parse.restart.startsWith('botService')) {
        const type = parse.restart.replace('botService', '')
        logger.info(
          `Bot service restarted, remove indicator callbacks for ${type}`,
        )
        const map =
          type === BotType.dca
            ? this.rabbitIdRoomsMapDca
            : this.rabbitIdRoomsMapCombo
        for (const [k, v] of map) {
          this.indicatorsFactory.removeCallback(k)
          map.delete(k)
          this.redisChannels.delete(v)
        }
      }
    } catch (e) {
      logger.error(`Failed to parse message: ${msg}, ${e}`)
    }
  }

  private rabbitListener() {
    this.rabbitClient?.listenWithCallback<
      RequestMessage,
      Promise<
        | {
            id: string
            status: boolean
            room: string
            message?: string
            data?: IndicatorHistory[]
            lastPrice?: number
          }
        | boolean
        | undefined
        | null
      >
    >(
      rabbitIndicatorsKey,
      async (msg) => {
        const result = await this.requestCallback(msg)
        if (typeof result === 'object' || typeof result === 'boolean') {
          return result
        }
      },
      200,
    )
  }

  private logger(err = false, ...msg: any[]) {
    if (err) {
      return logger.error(...msg)
    }
    return logger.info(...msg)
  }

  @IdMute(
    mutex,
    (msg: BotParentIndicatorEventDto) =>
      `${msg.responseParams.uuid}@${msg.responseParams.symbol}`,
  )
  private async subscribeIndicatorEvent(msg: BotParentIndicatorEventDto) {
    try {
      const subscriptionResult = await this.indicatorsFactory.subscribe(
        msg.data.indicatorConfig,
        msg.data.exchange,
        msg.data.symbol,
        msg.data.interval,
        (data, price) => cb(data, price),
        msg.data.test,
        msg.data.limitMultiplier,
        msg.data.load1d,
      )
      if (!subscriptionResult) {
        logger.error(`Failed to subscribe indicator: ${JSON.stringify(msg)}`)
        return null
      }
      const { room, id, message, data, lastPrice } = subscriptionResult
      const fullRoom = `${room}@${msg.responseParams.uuid}@${msg.responseParams.symbol}`
      let cb = (_data: unknown[], _price: number) => {
        return
      }
      if (this.redisChannels.has(fullRoom) && msg.data.load1d) {
        cb = (data: unknown[], price: number) => {
          this.getRedisCb(fullRoom, { data, price })
          cb = (_data: unknown[], _price: number) => {
            return
          }
        }
      }
      if (!this.redisChannels.has(fullRoom)) {
        this.logger(false, 'Create room:', fullRoom, 'room', room, 'id', id)
        this.redisChannels.add(fullRoom)
        const map =
          msg.type === BotType.dca
            ? this.rabbitIdRoomsMapDca
            : this.rabbitIdRoomsMapCombo
        map.set(id, fullRoom)
        cb = (data: unknown[], price: number) =>
          this.getRedisCb(fullRoom, { data, price })
      }
      if (id && room) {
        this.logger(false, 'Subscribed:', 'room', room, 'id', id)
      }
      if (this.rabbitClient) {
        return { id, status: !!id && !!room, room, message, data, lastPrice }
      }
    } catch (e) {
      logger.error(`Failed to subscribe indicator: ${JSON.stringify(msg)}`, e)
      return null
    }
  }

  @IdMute(mutex, (msg: BotParentUnsubscribeIndicatorEventDto) => `${msg.id}`)
  private async unsubscribeIndicatorEvent(
    msg: BotParentUnsubscribeIndicatorEventDto,
  ) {
    const { id } = msg
    await this.indicatorsFactory.unsubscribe(id)

    const map =
      msg.type === BotType.dca
        ? this.rabbitIdRoomsMapDca
        : this.rabbitIdRoomsMapCombo
    const get = map.get(id)
    if (get) {
      this.redisChannels.delete(get)
    }
    return true
  }
  private async requestCallback(msg: RequestMessage) {
    this.logger(false, 'Request:', msg.event)
    if (msg.event === 'subscribeIndicator') {
      return await this.subscribeIndicatorEvent(msg)
    }
    if (msg.event === 'unsubscribeIndicator') {
      return await this.unsubscribeIndicatorEvent(msg)
    }
  }
}

new IndicatorsService()

process
  .on('unhandledRejection', (reason, p) => {
    logger.error(reason, 'Unhandled Rejection at Promise', p)
  })
  .on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught Exception thrown')
  })
