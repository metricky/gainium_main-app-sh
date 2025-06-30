import { BacktestRequestStatus, BotType } from '../../../types'
import DB, { model } from '../../db'

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
        ? new DB(model.dcaBacktestRequest)
        : type === BotType.combo
          ? new DB(model.comboBacktestRequest)
          : new DB(model.gridBacktestRequest)
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
