import { parentPort } from 'worker_threads'
import axios from 'axios'
import {
  BacktestWorkerDto,
  BacktestServerSideWorkerDto,
  type WorkerUpdateDto,
} from '../../../types'
import http from 'http'
import BacktestWrapper from './backtestWrapper/wrapper'
import { GRAPH_QL_PORT, MAIN_SERVICE_HOST } from '../../config'

class BacktestOperations {
  public async serverSide(data: BacktestServerSideWorkerDto['data']) {
    const { payload, userId, requestId, encryptedToken } = data
    const instance = new BacktestWrapper(payload, userId, requestId)
    const result = await instance.run()
    if (result) {
      for (const r of result) {
        await axios({
          url: `http://${MAIN_SERVICE_HOST}:${GRAPH_QL_PORT}/api/serverSideBacktest`,
          method: 'post',
          data: { backtestData: r, userId, encryptedToken },
          httpAgent: new http.Agent({ keepAlive: true }),
        })
      }
    }
    parentPort?.postMessage({ event: 'end' } as WorkerUpdateDto)
  }
}

parentPort?.on('message', async (data: BacktestWorkerDto) => {
  if (data.do === 'serverSide') {
    await new BacktestOperations().serverSide(data.data)
  }
})
