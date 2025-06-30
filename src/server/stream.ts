import { Server } from 'socket.io'
import DB, { model } from '../db'
import { StatusEnum, BotType, liveupdate } from '../../types'
import http from 'http'
import logger from '../utils/logger'
import RedisClient, { RedisWrapper } from '../db/redis'

import type {
  UserSchema,
  BotData,
  DCABotData,
  MessageSocket,
  BotStats,
  BotSymbolsStats,
} from '../../types'
import type { Socket } from 'socket.io'
import { WS_PORT } from '../config'
import { HealthServer } from '../utils/healthServer'

type UserConnectinput = {
  userId: string
  userToken: string
}

type BotUpdateInput = {
  userId: string
  botId: string
  data: any
  paperContext: boolean
}

type BalanceInput = {
  userId: string
  data: {
    asset: string
    free: string
    locked: string
    exchange: string
    exchangeUUID: string
    paperContext: string
  }[]
}

type BacktestUpdate = {
  userId: string
  data: {
    shareId: string
    botType: BotType
  }
}

type BotMessageInput = {
  userId: string
  botId: string
  botType: BotType
  data: MessageSocket
  paperContext: boolean
}

type BotSettingsInput =
  | {
      userId: string
      botId: string
      data: Partial<BotData>
      botType: BotType.grid
    }
  | {
      userId: string
      botId: string
      data: Partial<DCABotData>
      botType: BotType.dca
    }

type BotProcessInput = {
  userId: string
  botId: string
  data: { step: number; total: number }
}

type BotStatsInput = {
  userId: string
  botId: string
  data: {
    stats?: BotStats
    symbolStats?: BotSymbolsStats[]
  }
}

type UserUpdateInput = {
  userId: string
  data: Partial<UserSchema>
}

class UserStreamService {
  /** Socket IO server instance */
  private server: Server
  /** DB instance */
  private db: DB<UserSchema>
  private redisClient: RedisWrapper | null = null
  constructor() {
    /** Determine variables */
    this.db = new DB(model.user)
    /** Start server */
    const httpServer = http.createServer()

    // Add health endpoint
    new HealthServer().start()

    this.server = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    })
    const port = parseFloat(WS_PORT)
    this.server.listen(port)
    /** Set a callback on a new connection */
    this.server.on('connection', (socket) => {
      /** Set callback on user connect event */
      socket.on('user connect', (msg: UserConnectinput) =>
        this.userConnectCallback(socket, msg),
      )
      /** Set callback on bot greating event */
      socket.on('greating', () => {
        this.botGreatingCallback(socket)
      })
      /** Set callback on bot update event */
      socket.on('bot update', (msg: BotUpdateInput) => {
        this.botUpdateCallback(socket, msg)
      })
      /** Set callback on bot transaction event */
      socket.on('bot transaction update', (msg: BotUpdateInput) => {
        this.botTransactionCallback(socket, msg)
      })
      /** Set callback on bot message event */
      socket.on('bot message', (msg: BotMessageInput) => {
        this.botMessageCallback(socket, msg)
      })
      /** Set callback on bot settings update event */
      socket.on('bot settings update', (msg: BotSettingsInput) => {
        this.botSettingsUpdateCallback(socket, msg)
      })
      /** Set callback on bot start process event */
      socket.on('bot process', (msg: BotProcessInput) => {
        this.botProcessCallback(socket, msg)
      })
      /** Set callback on bot deal update event */
      socket.on('bot deal update', (msg: BotUpdateInput) => {
        this.botDealUpdateCallback(socket, msg)
      })
      socket.on('bot minigrid update', (msg: BotUpdateInput) => {
        this.botMinigridUpdateCallback(socket, msg)
      })
      socket.on('bot stats update', (msg: BotStatsInput) => {
        this.botStatsUpdateCallback(socket, msg)
      })
      /** Set callback on user balance update */
      socket.on('balance', (msg: BalanceInput) => {
        this.balanceUpdateCallback(socket, msg)
      })
      /** Set callback on user backtest update */
      socket.on('serverBacktest', (msg: BacktestUpdate) => {
        this.serverBacktestUpdateCallback(socket, msg)
      })
      /** Set callback on user update */
      socket.on('userUpdate', (msg: UserUpdateInput) => {
        this.userUpdateCallback(socket, msg)
      })
    })
    logger.info(
      `>🚀 Backend <-> Fronend stream | Socket.IO server ready on http://localhost:${port}`,
    )
    this.redisCb = this.redisCb.bind(this)
    this.initRedis = this.initRedis.bind(this)

    this.initRedis()

    if (this.redisClient) {
      this.redisClient.pSubscribe('liveupdate*', this.redisCb)
    }
  }
  private async initRedis() {
    this.redisClient = await RedisClient.getInstance()
    this.redisClient.pSubscribe('liveupdate*', this.redisCb)
  }
  private redisCb(msg: string, room: string) {
    try {
      const data = JSON.parse(msg)
      const userId = room.replace(liveupdate, '')
      if (data?.socketId) {
        this.server.sockets.sockets
          .get(data.socketId)
          ?.emit(data.event, data.data)
      } else {
        this.server.to(userId).emit(data.event, data.data)
      }
    } catch (e) {
      logger.error(`Catch error in stream update ${e}, ${room}`)
    }
  }
  /** Handle not enough data */
  private handleNotEnoughData(
    method: string,
    msg: { userId: string; botId?: string; data: any },
  ) {
    return `Not enough data: ${method}, ${
      !msg.userId
        ? 'No user id'
        : !msg.botId
          ? 'No bot id'
          : !msg.data
            ? 'No data'
            : JSON.stringify(msg)
    }`
  }
  /** Logger
   * log any message with adding date
   * @param {Socket} socket socket instance
   * @param {any} msg message to log
   * @param {boolean} [err=false] log as error or default
   * @returns {void}
   * @private
   */
  private logger(socket: Socket, msg: any, err = false) {
    if (err) {
      return logger.info(`Socket: ${socket.id} |`, msg)
    }
    return logger.info(`Socket: ${socket.id} |`, msg)
  }
  /** Prepare message to return
   * @param {StatusEnum.ok | StatusEnum.notok} status status to send
   * @param {string} [reason] reason to send
   * @return {object} {status: StatusEnum.ok | StatusEnum.notok, reason: string | undefined}
   * @private
   */
  private prepareMessage(status: StatusEnum, reason?: string) {
    return {
      status,
      reason,
    }
  }
  /** User connect callback
   * Check required fields
   * Check token && userId correct
   * Subscribe socket to userId room
   * @param {Socket} socket socket instance
   * @param {UserConnectinput} msg message from user
   * @return {void}
   * @private
   */
  private async userConnectCallback(socket: Socket, msg: UserConnectinput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.userToken) {
      socket.emit(
        'message',
        this.prepareMessage(StatusEnum.notok, 'Not enough data'),
      )
      return this.logger(socket, 'Not enough data', true)
    }
    const { userId, userToken } = msg
    /** Check if token exist on user */
    const user = await this.db.readData({
      $and: [{ tokens: { $elemMatch: { token: userToken } } }, { _id: userId }],
    })

    if (user.status === StatusEnum.notok) {
      socket.emit('message', this.prepareMessage(StatusEnum.notok, user.reason))
      return this.logger(socket, user.reason, true)
    }
    if (user.status === StatusEnum.ok && user.data && !user.data.result) {
      socket.emit(
        'message',
        this.prepareMessage(StatusEnum.notok, 'User not found'),
      )
      return this.logger(socket, 'User not found', true)
    }
    const { username } = user.data.result
    if (socket.rooms.has(userId)) {
      socket.emit(
        'message',
        this.prepareMessage(
          StatusEnum.ok,
          `Socket already subscribed to user ${username}`,
        ),
      )
    }
    /** Add socket to user id room */
    socket.join(userId)
    socket.emit(
      'message',
      this.prepareMessage(
        StatusEnum.ok,
        `Socket subscribed to user ${username}`,
      ),
    )
  }
  /** Bot greating callback
   * Send plain greating
   * @param {Socket} socket socket instance
   * @param {UserConnectinput} msg message from user
   * @return {void}
   * @private
   */
  private async botGreatingCallback(socket: Socket) {
    /** Send greating */
    socket.emit(
      'message',
      this.prepareMessage(StatusEnum.ok, `connection established`),
    )
  }
  /** Bot update callback
   * Check required fields
   * send bot update to userId room
   * @param {Socket} socket socket instance
   * @param {BotUpdateInput} msg message for user
   * @return {void}
   * @private
   */
  private async botUpdateCallback(socket: Socket, msg: BotUpdateInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botUpdateCallback', msg),
        true,
      )
    }
    const { userId, botId, data, paperContext } = msg
    /** Emit event to user id room */
    return this.server
      .to(userId)
      .emit('data update', { botId, data, paperContext })
  }
  /** Bot message callback
   * Check required fields
   * send bot message to userId room
   * @param {Socket} socket socket instance
   * @param {BotMessageInput} msg message for user
   * @return {void}
   * @private
   */
  private async botMessageCallback(socket: Socket, msg: BotMessageInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botMessageCallback', msg),
        true,
      )
    }
    const { userId, botId, data, botType, paperContext } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('bot sends message', {
      botId,
      data: { ...data, botType },
      paperContext,
    })
  }
  /** Bot settings update callback
   * Check required fields
   * send bot message to userId room
   * @param {Socket} socket socket instance
   * @param {BotSettingsInput} msg message for user
   * @return {void}
   * @private
   */
  private async botSettingsUpdateCallback(
    socket: Socket,
    msg: BotSettingsInput,
  ) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data || !msg.botType) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botSettingsUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...other } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('bot sends settings', { ...other })
  }
  /** Bot transaction update callback
   * Check required fields
   * send bot message to userId room
   * @param {Socket} socket socket instance
   * @param {BotUpdateInput} msg message for user
   * @return {void}
   * @private
   */
  private async botTransactionCallback(socket: Socket, msg: BotUpdateInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botTransactionCallback', msg),
        true,
      )
    }
    const { userId, botId, data } = msg
    /** Emit event to user id room */
    return this.server
      .to(userId)
      .emit('bot transaction update', { botId, data })
  }
  /** Bot start process update callback
   * Check required fields
   * send bot message to userId room
   * @param {Socket} socket socket instance
   * @param {BotStartInput} msg message for user
   * @return {void}
   * @private
   */
  private async botProcessCallback(socket: Socket, msg: BotProcessInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botProcessCallback', msg),
        true,
      )
    }
    const { userId, botId, data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('bot process', { botId, data })
  }
  /** Bot deal update callback
   * Check required fields
   * send bot message to userId room
   * @param {Socket} socket socket instance
   * @param {BotUpdateInput} msg message for user
   * @return {void}
   * @private
   */
  private async botDealUpdateCallback(socket: Socket, msg: BotUpdateInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botDealUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('bot deal update', { ...data })
  }

  private async botMinigridUpdateCallback(socket: Socket, msg: BotUpdateInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botMinigridUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('bot minigrid update', { ...data })
  }

  private async botStatsUpdateCallback(socket: Socket, msg: BotStatsInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.botId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('botStatsUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('bot stats update', { ...data })
  }

  private async balanceUpdateCallback(socket: Socket, msg: BalanceInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('balanceUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('balance', data)
  }

  private async serverBacktestUpdateCallback(
    socket: Socket,
    msg: BacktestUpdate,
  ) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('serverBacktestUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('serverBacktest', data)
  }

  private async userUpdateCallback(socket: Socket, msg: UserUpdateInput) {
    /** Check if message presented */
    if (!msg || !msg.userId || !msg.data) {
      return this.logger(
        socket,
        this.handleNotEnoughData('userUpdateCallback', msg),
        true,
      )
    }
    const { userId, ...data } = msg
    /** Emit event to user id room */
    return this.server.to(userId).emit('userUpdate', data)
  }
}

new UserStreamService()

process
  .on('unhandledRejection', (reason, p) => {
    logger.error(reason, 'Unhandled Rejection at Promise', p)
  })
  .on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught Exception thrown')
  })
