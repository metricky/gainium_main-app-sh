import {
  comboBacktestRequestDb,
  dcaBacktestRequestDb,
  gridBacktestRequestDb,
} from '../../db/dbInit'
import { BacktestRequestStatus, BotType } from '../../../types'

export const updateRequest = async (
  type: BotType,
  status: BacktestRequestStatus,
  requestId?: string,
  backtestId?: string,
  statusReason?: string,
) => {
  if (requestId) {
    const instance =
      type === BotType.dca
        ? dcaBacktestRequestDb
        : type === BotType.combo
          ? comboBacktestRequestDb
          : gridBacktestRequestDb
    const $set: Record<string, unknown> = { status }
    if (backtestId) {
      $set.backtestId = backtestId
    }
    if (statusReason) {
      $set.statusReason = statusReason
    }
    await instance.updateData(
      { _id: requestId },
      {
        $set,
        $push: { statusHistory: { status, time: +new Date() } },
      },
    )
  }
}
