import { threadId } from 'worker_threads'
import { DealMonitor } from '../dealMonitor'
import { GridMonitor } from '../gridMonitor'
import {
  BotParentProcessStatsEventDto,
  BotParentRemoveStatsEventDtoDcaCombo,
  BotType,
} from '../../../types'
import logger from '../../utils/logger'
import { IdMute, IdMutex } from '../../utils/mutex'

const mutex = new IdMutex(300)

export class DealStats {
  static instance: DealStats
  static getInstance() {
    if (!DealStats.instance) {
      DealStats.instance = new DealStats()
    }
    return DealStats.instance
  }

  private dealStats = DealMonitor.getInstance()

  private gridMonitor = GridMonitor.getInstance()

  @IdMute(mutex, () => 'updateStats')
  public updateStats(data: BotParentProcessStatsEventDto) {
    try {
      if (data.botType === BotType.combo || data.botType === BotType.dca) {
        this.dealStats.addDealStats(
          data.payload.combo,
          data.payload.data,
          data.payload.usdRate,
          data.payload.deal,
          data.payload.fee,
        )
      }
      if (data.botType === BotType.grid) {
        this.gridMonitor.addBotStats(data.payload.data, data.payload.bot)
      }
    } catch (e) {
      logger.error(
        `updateStats Rejection at Promise Stats Worker ${threadId}, ${
          (e as Error)?.message ?? e
        } ${(e as Error)?.stack ?? ''}`,
      )
    }
  }

  public removeStats(data: BotParentRemoveStatsEventDtoDcaCombo) {
    try {
      this.dealStats.removeDealStats(data.dealId)
    } catch (e) {
      logger.error(
        `removeStats Rejection at Promise Stats Worker ${threadId}, ${
          (e as Error)?.message ?? e
        } ${(e as Error)?.stack ?? ''}`,
      )
    }
  }
}
