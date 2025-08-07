import utils from './cleanDb'
import Bot from '../../bot'
import logger from '../../utils/logger'

const bot = Bot.getInstance()

const cleanJob = async () => {
  logger.debug('Running clean job')
  await utils.clearNotUsedPaperData()
  await utils.clearPaperOldOrders()
  await utils.clearRealOldCanceledOrders()
  await utils.clearBalances()
  await utils.cleanNotUsedUserFee()
  await utils.clearOldSnapshots()
  await bot.premanenetlyDeleteBots(false)
  await utils.removeOldBotWarnings()
  await utils.removeOldRates()
  await utils.clearBotEvents()
  logger.debug('Clean job finished')
}

export default cleanJob
