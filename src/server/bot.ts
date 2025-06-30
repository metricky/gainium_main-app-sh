import BotInstance from '../bot'
import logger from '../utils/logger'
import { BotType, serviceLogRedis } from '../../types'
import RedisClient from '../db/redis'
import { BotServiceType } from '../config'
import HealthServer from '../utils/healthServer'

// Start health server
const healthServer = new HealthServer()
healthServer.start()

const Bot = BotInstance.getInstance(true)
Bot.findActiveBots()

if (BotServiceType !== BotType.grid) {
  RedisClient.getInstance().then((res) => {
    res.publish(
      serviceLogRedis,
      JSON.stringify({ restart: `botService${BotServiceType}` }),
    )
  })
}

process
  .on('unhandledRejection', (reason, p) => {
    logger.error(reason, 'Unhandled Rejection at Promise', p)
  })
  .on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught Exception thrown')
  })
