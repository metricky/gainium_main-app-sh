# Developer Guide - Gainium Main Backend

This developer guide covers the core architecture and main functionality of the Gainium trading platform, focusing on bot systems, GraphQL API, and service orchestration.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Bot System Core Logic](#bot-system-core-logic)
- [GraphQL API Architecture](#graphql-api-architecture)
- [Service Orchestration](#service-orchestration)
- [Database Design](#database-design)
- [Real-time Communication](#real-time-communication)
- [Exchange Integration](#exchange-integration)
- [Deployment and Scaling](#deployment-and-scaling)

## Architecture Overview

Gainium operates as a distributed microservice system designed for high-performance cryptocurrency trading automation.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                         │
│              React Dashboard + Mobile Apps                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ GraphQL + WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│                  API Gateway                               │
│     • Authentication & Authorization                       │
│     • Rate Limiting & Request Validation                   │
│     • GraphQL Schema Stitching                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Core Services Layer                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │   Bot       │ │  GraphQL    │ │    Stream Service      ││
│  │ Orchestrator│ │   Server    │ │  (Real-time Updates)   ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ Indicators  │ │  Backtest   │ │     Cron Service       ││
│  │  Service    │ │   Engine    │ │  (Scheduled Tasks)     ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Bot Worker Pool                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────────┐│
│  │   DCA   │ │  Grid   │ │ Combo   │ │   Hedge Workers    ││
│  │Workers  │ │Workers  │ │Workers  │ │ (DCA + Combo)      ││
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────────┘│
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Data & Infrastructure                       │
│  MongoDB + Redis + RabbitMQ + Exchange APIs + Files       │
└─────────────────────────────────────────────────────────────┘
```

### Core Technology Stack

- **Backend Framework**: Node.js with TypeScript
- **API Layer**: Apollo GraphQL Server
- **Database**: MongoDB with Mongoose ODM
- **Caching**: Redis for session and market data
- **Message Queue**: RabbitMQ for inter-service communication
- **Real-time**: Socket.IO for WebSocket connections
- **Process Management**: Worker threads for bot isolation
- **External APIs**: Multiple cryptocurrency exchange integrations

## Bot System Core Logic

### Bot Orchestrator Architecture

The Bot class serves as the central orchestrator managing all trading bot operations:

```typescript
class Bot {
  // Bot collections by type
  public bots: Array<{ id: string, worker: number, userId: string, type: BotType.grid }>
  public dcaBots: Array<{ id: string, worker: number, userId: string, type: BotType.dca }>
  public comboBots: Array<{ id: string, worker: number, userId: string, type: BotType.combo }>
  public hedgeComboBots: Array<{ id: string, worker: number, userId: string, type: BotType.hedgeCombo }>
  
  // Worker thread pool management
  protected workers: Array<{
    type: BotType
    worker: Worker
    bots: number
    id: number
    limit: number
    botsByType: { dca: number, grid: number, combo: number, hedgeCombo: number, hedgeDca: number }
  }>
}
```

### Bot Types and Strategies

#### 1. DCA (Dollar Cost Averaging) Bots

**Core Logic**: Gradual position building with safety orders
```typescript
// DCA Strategy Flow
1. Initial Order → Market entry at defined price
2. Safety Orders → Additional purchases if price drops
3. Take Profit → Exit when profit target reached
4. Dynamic Adjustments → Modify strategy based on market conditions
```

**Key Features**:
- Multiple safety order levels
- Dynamic take profit calculations
- Custom technical indicator integration
- Risk management with maximum deviation limits

#### 2. Grid Trading Bots

**Core Logic**: Buy low, sell high within price ranges
```typescript
// Grid Strategy Flow
1. Grid Setup → Define price range and grid levels
2. Order Placement → Place buy/sell orders at grid levels
3. Order Execution → Fill orders as price moves through grid
4. Profit Reinvestment → Reinvest profits to expand grid
```

**Key Features**:
- Dynamic grid level adjustment
- Arithmetic and geometric grid spacing
- Upper and lower bound management
- Automated profit compounding

#### 3. Combo Bots

**Core Logic**: Hybrid DCA + Grid approach
```typescript
// Combo Strategy Flow
1. Grid Phase → Accumulate position using grid strategy
2. DCA Activation → Switch to DCA when conditions met
3. Take Profit → Multiple take profit levels
4. Strategy Switching → Dynamic strategy selection
```

**Key Features**:
- Multi-strategy approach
- Adaptive behavior based on market conditions
- Advanced profit-taking mechanisms
- Risk-adjusted position sizing

#### 4. Hedge Bots

**Core Logic**: Risk management through opposing positions
```typescript
// Hedge Strategy Flow
1. Long Position → Primary directional bet
2. Short Position → Hedge against downside risk
3. Delta Management → Balance position exposure
4. Profit Extraction → Capture profits from both sides
```

**Key Features**:
- Long/short position coordination
- Dynamic hedge ratio adjustment
- Cross-exchange arbitrage opportunities
- Advanced risk management

### Worker Thread Architecture

Each bot runs in an isolated worker thread for performance and stability:

```typescript
// Worker Creation and Management
protected async createNewBot(botId: string, botType: BotType, userId: string, exchange: ExchangeEnum) {
  // Get or create worker for bot type
  const worker = await this.getWorkerForNewBot(botType, userId)
  
  // Send bot creation message to worker
  worker.postMessage({
    do: 'create',
    botType,
    botId,
    args,
    userId,
    exchange,
  })
  
  // Track bot in orchestrator
  this.trackBot(botId, botType, worker.threadId, userId)
}

// Worker Message Handling
protected async processWorkerMessage(data: BotParentEventsDto) {
  switch (data.event) {
    case 'createBot':
      await this.processCreateBotMessage(data.botId)
      break
    case 'botClosed':
      await this.processBotClosedMessage(data.botId, data.botType)
      break
    case 'response':
      await this.processReponseBotMessage(data.responseId, data.response)
      break
  }
}
```

### Bot Lifecycle Management

```typescript
// Bot States and Transitions
enum BotStatusEnum {
  open = 'OPEN',           // Actively trading
  range = 'RANGE',         // Waiting in range
  monitoring = 'MONITORING', // Observing market
  error = 'ERROR',         // Error state
  closed = 'CLOSED'        // Terminated
}

// Lifecycle Flow
1. Creation → Validate parameters, assign worker, initialize
2. Activation → Begin market monitoring and order placement  
3. Execution → Process market data, execute trades
4. Monitoring → Track performance, adjust strategy
5. Termination → Close positions, cleanup resources
```

## GraphQL API Architecture

### Schema Organization

The GraphQL schema is modularly organized for maintainability:

```typescript
// Core Schema Structure
const schema = buildSchema([
  BasicSchema,      // Common types and interfaces
  UserSchema,       // User management and authentication
  BotSchema,        // Bot operations and queries
  TradingSchema,    // Trading-specific operations
  IndicatorSchema,  // Technical indicators
  BacktestSchema    // Backtesting functionality
])
```

### Resolver Patterns

#### Query Resolvers
```typescript
const Query = {
  // Bot Management
  getBotList: async (parent, args, context) => {
    const { user, paperContext } = context
    return Bot.getInstance().getBotList(user.id, args.type, paperContext)
  },
  
  // Trading Data
  getDealList: async (parent, args, context) => {
    const { user, paperContext } = context
    return Bot.getInstance().getDCADealListGraphQl(user, paperContext, args.filter)
  },
  
  // Market Data
  getPairInfo: async (parent, args) => {
    return ExchangeChooser.getPairInfo(args.input.pair, args.input.exchange)
  }
}
```

#### Mutation Resolvers
```typescript
const Mutation = {
  // Bot Operations
  createBot: async (parent, args, context) => {
    const { user, paperContext } = context
    return Bot.getInstance().createBot(args.input, user.id, paperContext)
  },
  
  startBot: async (parent, args, context) => {
    const { user, paperContext } = context
    return Bot.getInstance().startBot(args.botId, user.id, paperContext)
  },
  
  stopBot: async (parent, args, context) => {
    const { user, paperContext } = context
    return Bot.getInstance().stopBot(args.botId, user.id, paperContext)
  }
}
```

### Context and Authentication

```typescript
// Apollo Server Context
type ApolloContext = {
  token: string         // JWT authentication token
  userAgent?: string    // Client user agent
  paperContext: boolean // Live vs Paper trading mode
  ip?: string          // Client IP address
  req: express.Request  // Express request object
}

// Authentication Middleware
const authMiddleware = async (req: express.Request) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new Error('Authentication required')
  
  const decoded = jwt.verify(token, JWT_SECRET)
  const user = await userDb.findById(decoded.userId)
  
  return { user, paperContext: req.headers['paper-context'] === 'true' }
}
```

## Service Orchestration

### Main Services

#### 1. API Server (`npm run server`)
- **Purpose**: GraphQL API endpoint and authentication
- **Port**: Configurable via `GRAPH_QL_PORT`
- **Features**: Rate limiting, CORS, JWT authentication, file uploads

#### 2. Bot Services
- **DCA Bots** (`npm run bots:dca`): DCA strategy execution
- **Grid Bots** (`npm run bots:grid`): Grid trading strategy
- **Combo Bots** (`npm run bots:combo`): Hybrid strategies
- **Hedge Bots** (`npm run bots:hedge:*`): Risk management strategies

#### 3. Stream Service (`npm run stream`)
- **Purpose**: Real-time WebSocket connections
- **Features**: Live bot updates, market data streaming, portfolio changes

#### 4. Indicators Service (`npm run indicators`)
- **Purpose**: Technical indicator calculations
- **Features**: RSI, MACD, Moving Averages, Custom indicators

#### 5. Cron Service (`npm run cron`)
- **Purpose**: Scheduled maintenance tasks
- **Features**: Data cleanup, exchange rate updates, system health checks

### Inter-Service Communication

```typescript
// RabbitMQ Message Patterns
class BotService {
  // Publish bot events
  async publishBotEvent(botId: string, event: BotEventType, data: unknown) {
    await this.rabbit.publish('bot.events', { botId, event, data })
  }
  
  // Subscribe to market data
  async subscribeToMarketData(symbol: string, exchange: string) {
    await this.rabbit.subscribe(`market.${exchange}.${symbol}`, this.handleMarketUpdate)
  }
}
```

## Database Design

### MongoDB Collections

#### Core Bot Collections
```typescript
// Bot Schema (Grid Trading)
interface BotSchema {
  userId: string
  uuid: string
  exchange: ExchangeEnum
  status: BotStatusEnum
  settings: BotSettings
  profit: { total: number, today: number }
  orders: { total: number, filled: number }
}

// DCA Bot Schema  
interface DCABotSchema extends BotSchema {
  deals: { total: number, active: number }
  settings: DCABotSettings & {
    safetyOrders: number
    maxSafetyTrades: number
    priceDeviation: number
  }
}

// Combo Bot Schema
interface ComboBotSchema extends BotSchema {
  deals: { total: number, active: number }
  settings: ComboBotSettings & {
    gridMode: boolean
    dcaMode: boolean
    switchConditions: SwitchConditions
  }
}
```

#### Deal and Order Tracking
```typescript
// Deal Schema (DCA/Combo)
interface DealSchema {
  botId: string
  userId: string
  status: DealStatusEnum
  baseOrderSize: number
  safetyOrderSize: number
  takeProfitPercentage: number
  orders: OrderReference[]
}

// Order Schema
interface OrderSchema {
  botId: string
  dealId?: string
  exchangeOrderId: string
  status: OrderStatusType
  side: 'BUY' | 'SELL'
  amount: number
  price: number
}
```

### Aggregation Pipelines

```typescript
// Bot Performance Analytics
const botStatsAggregation = [
  { $match: { userId: ObjectId(userId) } },
  { $group: {
      _id: '$status',
      count: { $sum: 1 },
      totalProfit: { $sum: '$profit.total' }
  }},
  { $project: {
      status: '$_id',
      count: 1,
      totalProfit: 1
  }}
]
```

## Real-time Communication

### WebSocket Architecture

```typescript
// Stream Service Implementation
class StreamService {
  private io: SocketIOServer
  private userConnections = new Map<string, Socket>()
  
  // User connection management
  handleConnection(socket: Socket) {
    const userId = this.authenticateSocket(socket)
    this.userConnections.set(userId, socket)
    
    // Subscribe to user-specific events
    this.subscribeUserEvents(userId, socket)
  }
  
  // Bot update broadcasting
  broadcastBotUpdate(userId: string, botData: BotUpdateData) {
    const socket = this.userConnections.get(userId)
    if (socket) {
      socket.emit('botUpdate', botData)
    }
  }
  
  // Market data streaming
  streamMarketData(symbol: string, data: MarketData) {
    this.io.to(`market.${symbol}`).emit('marketUpdate', data)
  }
}
```

### Event Types

```typescript
// Client-Server Events
interface ClientEvents {
  'bot.subscribe': (botId: string) => void
  'market.subscribe': (symbol: string) => void
  'portfolio.subscribe': () => void
}

interface ServerEvents {
  'bot.update': (data: BotUpdateData) => void
  'market.update': (data: MarketData) => void
  'portfolio.update': (data: PortfolioData) => void
  'notification': (message: NotificationData) => void
}
```

## Exchange Integration

### Exchange Abstraction Layer

```typescript
// Exchange Interface
interface ExchangeConnector {
  createOrder(params: OrderParams): Promise<OrderResult>
  cancelOrder(orderId: string): Promise<CancelResult>
  getBalance(): Promise<BalanceInfo>
  getOrderBook(symbol: string): Promise<OrderBookData>
  subscribeToTicker(symbol: string, callback: TickerCallback): void
}

// Multi-Exchange Support
class ExchangeChooser {
  static getExchange(exchange: ExchangeEnum): ExchangeConnector {
    switch (exchange) {
      case ExchangeEnum.binance: return new BinanceConnector()
      case ExchangeEnum.coinbase: return new CoinbaseConnector()
      case ExchangeEnum.kraken: return new KrakenConnector()
      // ... other exchanges
    }
  }
}
```

### Rate Limiting and Error Handling

```typescript
// Exchange Rate Limiting
class ExchangeManager {
  private rateLimiter = new Map<ExchangeEnum, RateLimit>()
  
  async executeWithRateLimit<T>(
    exchange: ExchangeEnum, 
    operation: () => Promise<T>
  ): Promise<T> {
    await this.rateLimiter.get(exchange)?.wait()
    
    try {
      return await operation()
    } catch (error) {
      // Handle exchange-specific errors
      this.handleExchangeError(exchange, error)
      throw error
    }
  }
}
```

## Deployment and Scaling

### Service Scaling Strategy

```typescript
// Worker Pool Configuration
const botPerWorker = {
  grid: GRID_PER_WORKER || 100,
  dca: DCA_PER_WORKER || 100, 
  combo: COMBO_PER_WORKER || 50,
  hedgeCombo: HEDGE_COMBO_PER_WORKER || 25,
  hedgeDca: HEDGE_DCA_PER_WORKER || 25
}

// Horizontal Scaling
async function scaleService(serviceType: BotServiceType, load: number) {
  if (load > HIGH_LOAD_THRESHOLD) {
    await spawnAdditionalWorkers(serviceType)
  } else if (load < LOW_LOAD_THRESHOLD) {
    await terminateExcessWorkers(serviceType)
  }
}
```

### Health Monitoring

```typescript
// Service Health Checks
const healthChecks = {
  database: () => mongoose.connection.readyState === 1,
  redis: () => redisClient.ping(),
  rabbitMQ: () => rabbitConnection.isConnected(),
  workers: () => this.workers.every(w => w.check.status),
  memory: () => process.memoryUsage().heapUsed < MAX_HEAP_SIZE
}
```

### Environment Configuration

```typescript
// Service Environment Variables
const config = {
  // Database
  MONGO_URI: process.env.MONGO_URI,
  REDIS_HOST: process.env.REDIS_HOST,
  
  // API
  GRAPH_QL_PORT: process.env.GRAPH_QL_PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET,
  
  // Bot Configuration  
  BOTS_PER_WORKER: process.env.BOTS_PER_WORKER || 100,
  DCA_PER_WORKER: process.env.DCA_PER_WORKER,
  COMBO_PER_WORKER: process.env.COMBO_PER_WORKER,
  
  // Exchange APIs
  BINANCE_API_KEY: process.env.BINANCE_API_KEY,
  COINBASE_API_KEY: process.env.COINBASE_API_KEY
}
```

This developer guide provides a comprehensive overview of the Gainium main backend architecture and core functionality. The system is designed for high-performance trading automation with robust bot management, real-time communication, and scalable microservice architecture.