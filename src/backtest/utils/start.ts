import {
  BacktestRequestStatus,
  BotType,
  ServerSideBacktestPayload,
} from '../../../types'
import logger from '../../utils/logger'
import { updateRequest } from './backtestRequest'
import Backtester from '../process'
import {
  comboBacktestRequestDb,
  dcaBacktestRequestDb,
  gridBacktestRequestDb,
} from '../../db/dbInit'

const backteser = Backtester.getInstance()

export const checkPendingBacktests = async () => {
  const search = {
    status: {
      $in: [
        BacktestRequestStatus.loadingData,
        BacktestRequestStatus.pending,
        BacktestRequestStatus.processing,
      ],
    },
  }

  const dcaRecords = await dcaBacktestRequestDb.readData(search, {}, {}, true)
  const comboRecords = await comboBacktestRequestDb.readData(
    search,
    {},
    {},
    true,
  )
  const gridRecords = await gridBacktestRequestDb.readData(search, {}, {}, true)

  const cancelData: {
    userId: string
    requestId: string
    type: BotType
  }[] = []
  const restartData: {
    payload: ServerSideBacktestPayload
    userId: string
    requestId: string
  }[] = []
  ;[
    ...(dcaRecords.data?.result ?? []),
    ...(comboRecords.data?.result ?? []),
    ...(gridRecords.data?.result ?? []),
  ].forEach((record) => {
    if (
      record.status === BacktestRequestStatus.processing ||
      (record.restarts ?? 0) > 5
    ) {
      cancelData.push({
        userId: record.userId,
        requestId: `${record._id}`,
        type: record.type,
      })
    } else if (!!record.payload) {
      restartData.push({
        payload: record.payload,
        userId: record.userId,
        requestId: `${record._id}`,
      })
    }
  })
  logger.info(
    `SSB | Found ${cancelData.length} processing requests after restart`,
  )
  for (const d of cancelData) {
    logger.info(
      `SSB | Cancel processing request after restart ${
        d.requestId
      } ${JSON.stringify(d)}`,
    )
    await updateRequest(d.type, BacktestRequestStatus.failed, d.requestId)
  }
  logger.info(
    `SSB | Found ${restartData.length} pending and loading requests after restart`,
  )
  for (const r of restartData) {
    logger.info(
      `SSB | Restart pending and loading request after restart ${r.requestId}`,
    )
    if (r.payload.type === BotType.dca) {
      await dcaBacktestRequestDb.updateData(
        { _id: r.requestId },
        { $inc: { restarts: 1 } },
      )
    }
    if (r.payload.type === BotType.grid) {
      await gridBacktestRequestDb.updateData(
        { _id: r.requestId },
        { $inc: { restarts: 1 } },
      )
    }
    if (r.payload.type === BotType.combo) {
      await comboBacktestRequestDb.updateData(
        { _id: r.requestId },
        { $inc: { restarts: 1 } },
      )
    }
    backteser.serverSideBacktest(r)
  }
}
