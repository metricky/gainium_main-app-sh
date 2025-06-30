import fs from 'fs'
import express from 'express'
import rateLimit from 'express-rate-limit'
import bodyParser from 'body-parser'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import BotInstance from '../bot'
import { Resolvers, Schema } from '../graphql'
import userUtils from '../utils/user'
import { liveupdate, StatusEnum } from '../../types'
import methods from '../exchange/additionalAPIs'
import API, { middleware } from './api'
import swaggerUi from 'swagger-ui-express'
import cookieParser from 'cookie-parser'
import logger from '../utils/logger'
import saveFileHelper from '../utils/files'
import { ExchangeEnum } from '../../types'
import RedisClient from '../db/redis'
import { filesDb, userDb } from '../db/dbInit'
import { CORS_ORIGIN, GRAPH_QL_PORT, JWT_SECRET, SERVER_HOST } from '../config'
import { addHealthEndpoint } from '../utils/healthServer'
import swaggerDoc from './swagger.json'

const cors_origin = CORS_ORIGIN?.split(' ')

const Bot = BotInstance.getInstance()

interface UserRequest {
  username: string
  authorized: boolean
}

declare global {
  // eslint-disable-next-line
  namespace Express {
    interface Request {
      user?: UserRequest
    }
  }
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: false,
  legacyHeaders: true,
})

type ApolloContext = {
  token: string
  userAgent?: string
  paperContext: boolean
  ip?: string
  req: express.Request
}

async function start() {
  userUtils.connectUserBalance()
  const port = GRAPH_QL_PORT

  const app = express()

  if (!SERVER_HOST) {
    throw 'Missed server host'
  }

  app.use(
    '/api/docs',
    //@ts-ignore
    swaggerUi.serve,
    swaggerUi.setup(swaggerDoc, {
      customJs:
        'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/crypto-js.min.js',
      swaggerOptions: {
        requestInterceptor: (request: any) => {
          const secret = request.headers.secret
          if (secret) {
            const time = new Date().getTime()
            const endpoint = request.url.replace(window.location.origin, '')
            let body = ''
            try {
              body = request.body
                ? JSON.stringify(JSON.parse(request.body))
                : ''
              if (body.length === 2) {
                body = ''
              }
            } catch {
              body = ''
            }
            const signatureResult = window.CryptoJS.HmacSHA256(
              body + request.method + endpoint + time,
              secret,
            ).toString(CryptoJS.enc.Base64)
            delete request.headers.secret
            request.headers.time = time
            request.headers.signature = signatureResult
          }
          return request
        },
      },
    }),
  )

  app.use(cors({ origin: cors_origin, credentials: true }))

  app.use('/api/serverSideBacktestSaveFile', bodyParser.json({ limit: '2gb' }))

  app.use('/', bodyParser.json({ limit: '512kb' }))

  // Add health endpoint
  addHealthEndpoint(app)

  API.get.forEach((fn, r) => app.get(r, apiLimiter, middleware, fn))

  API.put.forEach((fn, r) => app.put(r, apiLimiter, middleware, fn))

  API.getPublic.forEach((fn, r) => app.get(r, apiLimiter, fn))

  API.post.forEach((fn, r) => app.post(r, apiLimiter, middleware, fn))

  API.delete.forEach((fn, r) => app.delete(r, apiLimiter, middleware, fn))

  app.get('/datafeed_ws', async (_req, res) => {
    const result = await methods.getWSKucoin()
    res.send(result)
  })
  app.get('/tickers', async (req, res) => {
    const exchange = req.query.exchange as ExchangeEnum | undefined
    if (!exchange) {
      res.send({
        data: null,
        reason: `Exchange is required`,
        status: StatusEnum.notok,
      })
      return
    }
    res.send(await methods.getPrices(exchange))
  })
  app.get('/candles', async (req, res) => {
    const exchange = req.query.exchange as ExchangeEnum | undefined
    const type = req.query.type as string
    const startAt = req.query.startAt as string
    const endAt = req.query.endAt as string
    const symbol = req.query.symbol as string
    const limit = req.query.limit as string
    if (!exchange || !type || !startAt || !endAt || !symbol) {
      res.send({
        data: null,
        reason: `Missing required param`,
        status: StatusEnum.notok,
      })
      return
    }
    res.send(
      await methods.getCandles({
        type,
        startAt,
        endAt,
        symbol,
        exchange,
        limit,
      }),
    )
  })
  app.post('/trade_signal', async (req, res) => {
    const result = (await Bot.webhookProcess(req.body)) as {
      status?: StatusEnum
    }
    if (result && result.status && result.status === StatusEnum.notok) {
      res.status(400)
    }
    res.send(result)
  })

  app.post('/api/serverSideBacktest', async (req, res) => {
    const { userId, backtestData } = req.body
    if (backtestData.shareId) {
      const data = {
        shareId: backtestData.shareId,
        botType: backtestData.type,
      }

      const redis = await RedisClient.getInstance()
      redis?.publish(
        `${liveupdate}${userId}`,
        JSON.stringify({ data: { data }, event: 'serverBacktest' }),
      )
    }
    res.sendStatus(200)
  })

  app.post('/api/serverSideBacktestSaveFile', async (req, res) => {
    const { data, name, resolution, path } = req.body

    try {
      const fileResult = saveFileHelper(
        JSON.stringify(data),
        name,
        resolution,
        path,
      )
      res.send(fileResult)
    } catch (e) {
      console.log(`Cannot save file ${e}`)
      res.sendStatus(400)
    }
  })

  app.get('/api/loadBacktestDetails/:backtestId', async (req, res) => {
    const token = req.headers.token as string
    if (!token) {
      res.status(403).send('Not authorized to load backtest')
      return
    }
    const { backtestId } = req.params
    if (!backtestId) {
      res.status(400).send('Backtest id is required')
      return
    }
    const userFind = await userDb.readData({
      tokens: { $elemMatch: { token } },
    })
    if (userFind.status === StatusEnum.notok) {
      res.status(400).send(`User read error ${userFind.reason}`)
      return
    }
    if (!userFind.data?.result) {
      res.status(400).send('User not found')
      return
    }
    const file = await filesDb.readData({
      userId: `${userFind.data.result._id}`,
      'meta.id': backtestId,
    })
    if (file.status === StatusEnum.notok) {
      res.status(400).send(`File read error ${file.reason}`)
      return
    }
    if (!file.data?.result) {
      res.status(400).send('File not found')
      return
    }
    const path = file.data.result.path
    const exist = fs.existsSync(path)
    if (!exist) {
      res.status(400).send('File not found')
      return
    }
    res.status(200).sendFile(path)
  })

  if (!JWT_SECRET) {
    throw Error('Missing jwt secret')
  }

  const authenticateJWT = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const token = req.headers.token as string

    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.json({
            errors: [
              {
                message: 'Session is expired, please login again',
              },
            ],
          })
        }
        req.user = user as UserRequest
        next()
      })
    } else {
      next()
    }
  }
  app.all('/api{/*path}', (_, res) => {
    res.status(404).send('Not found')
  })
  app.use(authenticateJWT)
  app.use(cookieParser())

  const apolloServer = new ApolloServer<ApolloContext>({
    typeDefs: Schema,
    resolvers: Resolvers,
    plugins: [ApolloServerPluginLandingPageDisabled()],
  })

  await apolloServer.start()

  app.use(
    '/',
    cors<cors.CorsRequest>({
      origin: cors_origin,
      credentials: true,
    }),
    (req, _res, next) => {
      if (!req.body) {
        req.body = {}
      }
      next()
    },
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        return {
          token: (req.headers.token as string) || '',
          userAgent: req.headers['user-agent'],
          paperContext: req.headers['paper-context'] === 'true',
          ip:
            (req.headers['x-forwarded-for'] as string) ||
            req.socket.remoteAddress,
          req: req as unknown as express.Request,
        } as ApolloContext
      },
    }) as unknown as express.RequestHandler,
  )

  app.listen(port, () => {
    logger.info(`>🚀 GraphQl ready on http://localhost:${port}`)
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
