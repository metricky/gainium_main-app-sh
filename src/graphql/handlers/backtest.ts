import axios from 'axios'
import http from 'http'
import { ServerSideBacktestPayload } from '../../../types'
import { BACKTEST_PORT, BACKTEST_SERVICE_HOST } from '../../config'

export const sendServerSideRequest = async (
  payload: ServerSideBacktestPayload,
  userId: string,
  requestId: string,
) => {
  await axios({
    url: `http://${BACKTEST_SERVICE_HOST}:${BACKTEST_PORT}/api/runServerSideBacktest`,
    method: 'post',
    data: { payload, userId, requestId },
    httpAgent: new http.Agent({ keepAlive: true }),
  })
}
