import {
  BacktestRequestStatus,
  BacktestServerSideWorkerDto,
  type WorkerUpdateDto,
} from '../../../types'
import { Worker } from 'worker_threads'
import { IdMute, IdMutex } from '../../utils/mutex'
import logger from '../../utils/logger'
import { updateRequest } from '../utils/backtestRequest'

const serverSideBacktestWorkers = 2

const serverSideBacktestMutex = new IdMutex(serverSideBacktestWorkers)

class Backtester {
  protected static instance: Backtester

  public static getInstance(): Backtester {
    if (!Backtester.instance) {
      Backtester.instance = new Backtester()
    }
    return Backtester.instance
  }

  private requestCandleMap: Map<
    string,
    { locked: boolean; cb: (() => void)[] }
  > = new Map()

  public async queueCandle(key: string, cb: () => void) {
    const get = this.requestCandleMap.get(key)
    if (get && get.locked) {
      this.requestCandleMap.set(key, {
        locked: true,
        cb: [...(this.requestCandleMap.get(key)?.cb ?? []), cb],
      })
    } else {
      this.requestCandleMap.set(key, { locked: true, cb: [] })
      cb()
    }
  }

  public async unQueueCandle(key: string) {
    const get = this.requestCandleMap.get(key)
    if (get && get.locked) {
      const cb = get.cb.shift()
      if (cb) {
        cb()
      }
      if (get.cb.length === 0) {
        this.requestCandleMap.delete(key)
      }
    }
  }

  @IdMute(serverSideBacktestMutex, () => 'serverSideBacktest')
  public async serverSideBacktest(
    data: Omit<BacktestServerSideWorkerDto['data'], 'encryptedToken'>,
  ) {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(`${__dirname}/worker.js`)
      const keys = new Set<string>()
      worker.on('message', (msg: WorkerUpdateDto) => {
        if (msg.event === 'end') {
          worker.terminate()
          resolve([])
        }
        if (msg.event === 'queueCandle') {
          keys.add(msg.key)
          logger.info(`Queue candle ${msg.key}`)
          const cb = () => worker.postMessage({ event: msg.responseId })

          new Promise((resolve) => {
            this.queueCandle(msg.key, () => resolve(''))
          })
            .then(cb)
            .catch(cb)
        }
        if (msg.event === 'unQueueCandle') {
          keys.delete(msg.key)
          logger.info(`Unqueue candle ${msg.key}`)
          this.unQueueCandle(msg.key)
        }
      })
      worker.on('error', (err) => {
        const msg = (err as Error).message ?? err
        logger.error(`Server side worker error ${msg}`)
        console.error(err)
        for (const key of keys) {
          logger.info(`Unqueue candle ${key} due to error`)
          this.unQueueCandle(key)
        }
        updateRequest(
          data.payload.type,
          BacktestRequestStatus.failed,
          data.requestId,
          undefined,
          typeof msg === 'string' ? msg : undefined,
        )
        worker.terminate()
        reject([])
      })
      worker.postMessage({
        do: 'serverSide',
        data: { ...data },
      } as BacktestServerSideWorkerDto)
    })
  }
}

export default Backtester
