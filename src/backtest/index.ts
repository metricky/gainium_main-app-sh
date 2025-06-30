import express from 'express'
import logger from '../utils/logger'
import { BacktestServerSideWorkerDto } from '../../types'
import Backtester from './process'
import bodyParser from 'body-parser'
import { checkPendingBacktests } from './utils/start'
import fs from 'fs'
import path from 'path'
import { BACKTEST_PORT } from '../config'
import { addHealthEndpoint } from '../utils/healthServer'

const tmpDir = path.join(__dirname, '../../tmp-backtester')

if (fs.existsSync(tmpDir)) {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

const backteser = Backtester.getInstance()

async function start() {
  checkPendingBacktests()
  const app = express()
  const port = parseFloat(BACKTEST_PORT)
  app.use(bodyParser.json())

  // Add health endpoint
  addHealthEndpoint(app)

  app.listen(port, () => {
    logger.info(`>🚀 Backtester ready on http://localhost:${port}`)
  })

  app.post('/api/runServerSideBacktest', async (req, res) => {
    const { payload, userId, requestId } = req.body
    const p = payload as BacktestServerSideWorkerDto['data']['payload']
    backteser.serverSideBacktest({ payload: p, userId, requestId })
    res.sendStatus(200)
  })
}

process
  .on('unhandledRejection', (reason, p) => {
    logger.error(reason, 'Unhandled Rejection at Promise', p)
  })
  .on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught Exception thrown')
  })

start()
