process.env.NODE_ENV = 'testing'

import { describe, it, before } from 'mocha'
import { expect } from 'chai'
import { createRequire } from 'module'
import { ComboTpBase, ExchangeEnum, TrailingModeEnum } from '../../../types'

// Exercise the real Combo percentage calculation and tick logic without a
// database, exchange, worker or price subscription.
const loadModule = createRequire(__filename)
let Combo: any
let Dca: any
class FakeBase {
  constructor(..._args: any[]) {}
}

const makeBot = () => {
  const bot = new Combo('combo-ttp-test', ExchangeEnum.hyperliquid)
  const deal: any = {
    deal: {
      _id: 'combo-ttp-deal',
      status: 'open',
      symbol: { symbol: 'TEST-USDC' },
      initialBalances: { base: 0, quote: 100 },
      currentBalances: { base: 1, quote: 0 },
      usage: { current: { base: 1, quote: 100 }, max: { base: 1, quote: 100 } },
      profit: { total: 0, pureBase: 0, pureQuote: 0 },
      feePaid: { base: 0, quote: 0 },
      avgPrice: 100,
      settings: { useTp: true, useSl: false, tpPerc: '10' },
    },
    closeBySl: false,
  }
  bot.data = {
    settings: { name: 'Test | TTP=1 TTPperc=20', pair: ['TEST-USDC'] },
  }
  bot.isLong = true
  bot.futures = true
  bot.coinm = false
  bot.price = 120
  bot.allowedMethods = new Set(['checkDealsStopLoss'])
  bot.dealsForStopLossCombo = new Map([[deal.deal._id, { tp: 110, sl: 0 }]])
  bot.getDeal = () => deal
  bot.getLastStreamData = () => ({ price: bot.price })
  bot.getAggregatedSettings = async () => deal.deal.settings
  bot.profitBase = async () => false
  bot.comboBasedOn = async () => ComboTpBase.full
  bot.getUserFee = async () => ({ maker: 0 })
  bot.persisted = []
  bot.saveComboTrailingTpState = async (d: any) => {
    bot.persisted.push({ ...d.deal })
    bot.comboTtpPersistAt.set(d.deal._id, Date.now())
  }
  // Isolate the trailing decision from price inversion and venue closing.
  bot.getDealStopLossPriceCombo = async (d: any) => ({
    tp: 100 * (1 + d.deal.trailingLevel / 100),
    sl: 0,
  })
  bot.checkDealsPriceExtremum = () => {}
  bot.handleLog = () => {}
  bot.handleDebug = () => {}
  bot.botEventDb = { createData: () => Promise.resolve() }
  bot.closes = []
  bot.triggerStopLossCombo = async (...args: any[]) => bot.closes.push(args)
  return { bot, deal }
}

describe('custom Combo TTP survives upstream merges', () => {
  before(function () {
    this.timeout(180000)
    Combo = loadModule('../comboHelper').default(FakeBase as any)
    Dca = loadModule('../dcaHelper').default(FakeBase as any)
  })

  it('keeps profit-percentage levels, follows the high and closes on retrace', async () => {
    const { bot, deal } = makeBot()
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.trailingMode).to.equal(TrailingModeEnum.ttp)
    expect(deal.deal.bestPrice).to.equal(20)
    expect(deal.deal.trailingLevel).to.equal(0)
    expect(bot.closes).to.have.length(0)
    bot.price = 150
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.bestPrice).to.equal(50)
    expect(deal.deal.trailingLevel).to.equal(30)
    bot.price = 129
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.bestPrice).to.equal(50)
    expect(bot.closes).to.deep.equal([[deal.deal._id, false, true, true]])
    expect(bot.persisted).to.have.length(2)
  })

  it('does not update another symbol on this tick', async () => {
    const { bot, deal } = makeBot()
    await bot.unrealizedProfit('OTHER-USDC')
    expect(deal.deal.trailingMode).to.equal(undefined)
    expect(bot.persisted).to.have.length(0)
    expect(bot.closes).to.have.length(0)
  })

  it('never takes a stale static TP before the percentage activation target is reached', async () => {
    const { bot, deal } = makeBot()
    deal.deal.settings.tpPerc = '100'
    bot.price = 120
    bot.dealsForStopLossCombo.set(deal.deal._id, { tp: 110, sl: 0 })
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.trailingMode).to.equal(undefined)
    expect(bot.closes).to.have.length(0)
  })

  it('does not turn an unavailable capital basis into a zero-profit retracement', async () => {
    const { bot, deal } = makeBot()
    Object.assign(deal.deal, {
      trailingMode: TrailingModeEnum.ttp,
      bestPrice: 50,
      trailingLevel: 30,
    })
    deal.deal.usage.max.quote = 0
    bot.price = 120
    bot.dealsForStopLossCombo.set(deal.deal._id, { tp: 130, sl: 0 })
    await bot.unrealizedProfit('TEST-USDC')
    expect(bot.closes).to.have.length(0)
    expect(bot.persisted).to.have.length(0)
    expect(deal.deal.bestPrice).to.equal(50)
  })

  it('does not fire when a funds rebuild starts while profit is being read', async () => {
    const { bot, deal } = makeBot()
    Object.assign(deal.deal, {
      trailingMode: TrailingModeEnum.ttp,
      bestPrice: 50,
      trailingLevel: 30,
    })
    bot.dealsForStopLossCombo.set(deal.deal._id, { tp: 130, sl: 0 })
    bot.getComboPercAtPrice = async () => {
      deal.deal.comboFundsRebuild = 'concurrent-funds'
      return 0.2
    }
    await bot.unrealizedProfit('TEST-USDC')
    expect(bot.closes).to.have.length(0)
    expect(bot.persisted).to.have.length(0)
  })

  it('inverts the real percentage formula, including zero and negative targets', async () => {
    const { bot, deal } = makeBot()
    for (const percent of [-0.2, 0, 0.3]) {
      const price = await bot.findComboPriceByPerc(deal, percent)
      // The existing solver stops within 0.0001 in profit-ratio units.
      expect(price).to.be.closeTo(100 * (1 + percent), 0.01)
      expect(await bot.getComboPercAtPrice(deal, price)).to.be.closeTo(
        percent,
        0.0001,
      )
    }
  })

  it('keeps real cached exit prices for zero and negative TTP levels', async () => {
    const { bot, deal } = makeBot()
    deal.deal.initialPrice = 100
    deal.deal.fullFee = 0
    deal.deal.trailingMode = TrailingModeEnum.ttp
    bot.getDealStopLossPriceCombo = Combo.prototype.getDealStopLossPriceCombo
    for (const level of [-20, 0, 30]) {
      deal.deal.trailingLevel = level
      const exit = await bot.getDealStopLossPriceCombo(deal)
      expect(exit.tp).to.be.closeTo(100 * (1 + level / 100), 0.02)
    }
  })

  it('tracks both coins on an all-symbol pass and only the ticked coin afterwards', async () => {
    const { bot, deal } = makeBot()
    const other = JSON.parse(JSON.stringify(deal))
    other.deal._id = 'other-deal'
    other.deal.symbol.symbol = 'OTHER-USDC'
    other.deal.currentBalances.base = 10
    other.deal.avgPrice = 10
    const deals = new Map([
      [deal.deal._id, deal],
      [other.deal._id, other],
    ])
    const prices: Record<string, number> = {
      'TEST-USDC': 150,
      'OTHER-USDC': 12,
    }
    bot.getDeal = (id: string) => deals.get(id)
    bot.getLastStreamData = (symbol: string) => ({ price: prices[symbol] })
    bot.dealsForStopLossCombo.set(other.deal._id, { tp: 11, sl: 0 })
    bot.getDealStopLossPriceCombo = async (d: any) => ({
      tp: await bot.findComboPriceByPerc(d, d.deal.trailingLevel / 100),
      sl: 0,
    })
    await bot.unrealizedProfit()
    expect(deal.deal.bestPrice).to.equal(50)
    expect(other.deal.bestPrice).to.equal(20)
    expect(bot.closes).to.have.length(0)
    prices['TEST-USDC'] = 129
    prices['OTHER-USDC'] = 15
    await bot.unrealizedProfit('TEST-USDC')
    expect(bot.closes).to.deep.equal([[deal.deal._id, false, true, true]])
    expect(other.deal.bestPrice).to.equal(20)
    await bot.unrealizedProfit('OTHER-USDC')
    expect(other.deal.bestPrice).to.equal(50)
  })

  it('arms a short trail and closes only when its price rises back to the floor', async () => {
    const { bot, deal } = makeBot()
    bot.isLong = false
    deal.deal.initialBalances = { base: 1, quote: 0 }
    deal.deal.currentBalances = { base: 0, quote: 100 }
    bot.getDealStopLossPriceCombo = async (d: any) => ({
      tp: await bot.findComboPriceByPerc(d, d.deal.trailingLevel / 100),
      sl: 0,
    })
    bot.price = 80
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.bestPrice).to.equal(20)
    expect(bot.closes).to.have.length(0)
    bot.price = 60
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.trailingLevel).to.equal(20)
    bot.price = 81
    await bot.unrealizedProfit('TEST-USDC')
    expect(bot.closes).to.deep.equal([[deal.deal._id, false, true, true]])
  })

  it('keeps a restored percentage peak instead of re-arming at the restart price', async () => {
    const { bot, deal } = makeBot()
    Object.assign(deal.deal, {
      trailingMode: TrailingModeEnum.ttp,
      bestPrice: 50,
      trailingLevel: 30,
    })
    bot.price = 140
    bot.getDealStopLossPriceCombo = async (d: any) => ({
      tp: await bot.findComboPriceByPerc(d, d.deal.trailingLevel / 100),
      sl: 0,
    })
    bot.dealsForStopLossCombo.set(deal.deal._id, { tp: 130, sl: 0 })
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.bestPrice).to.equal(50)
    expect(deal.deal.trailingLevel).to.equal(30)
    expect(bot.closes).to.have.length(0)
    bot.price = 129
    await bot.unrealizedProfit('TEST-USDC')
    expect(bot.closes).to.have.length(1)
  })

  it('re-solves the exit on the final funds basis without resetting the percentage peak', async () => {
    const { bot, deal } = makeBot()
    Object.assign(deal.deal, {
      trailingMode: TrailingModeEnum.ttp,
      bestPrice: 50,
      trailingLevel: 30,
      comboFundsRebuild: 'completed-add',
      initialPrice: 100,
      fullFee: 0,
    })
    bot.dealsForStopLossCombo.set(deal.deal._id, { tp: 130, sl: 0 })
    bot.updateUsage = async () => {
      deal.deal.initialBalances.quote = 300
      deal.deal.currentBalances.base = 2
      deal.deal.avgPrice = 150
      deal.deal.usage.max.quote = 300
    }
    bot.flushComboFundsSnapshot = async () => {}
    bot.saveDeal = async () => {}
    bot.getDealStopLossPriceCombo = Combo.prototype.getDealStopLossPriceCombo
    bot.price = 200
    await bot.completeComboFundsRebuild(deal)
    expect(deal.deal.comboFundsRebuild).to.equal(null)
    expect(bot.dealsForStopLossCombo.get(deal.deal._id).tp).to.equal(0)
    await bot.unrealizedProfit('TEST-USDC')
    expect(deal.deal.bestPrice).to.equal(50)
    expect(deal.deal.trailingLevel).to.equal(30)
    expect(bot.dealsForStopLossCombo.get(deal.deal._id).tp).to.be.closeTo(
      195,
      0.02,
    )
    expect(bot.closes).to.have.length(0)
    bot.price = 194
    await bot.unrealizedProfit('TEST-USDC')
    expect(bot.closes).to.have.length(1)
  })

  for (const direction of ['add', 'reduce']) {
    it(`does not fire or advance TTP during a ${direction}-funds rebuild, then resumes`, async () => {
      const { bot, deal } = makeBot()
      Object.assign(deal.deal, {
        trailingMode: TrailingModeEnum.ttp,
        bestPrice: 50,
        trailingLevel: 30,
      })
      bot.dealsForStopLossCombo.set(deal.deal._id, { tp: 130, sl: 0 })
      deal.deal.comboFundsRebuild = `${direction}-test`
      bot.price = 120
      await bot.unrealizedProfit('TEST-USDC')
      expect(bot.closes).to.have.length(0)
      expect(bot.persisted).to.have.length(0)
      expect(deal.deal.bestPrice).to.equal(50)
      deal.deal.comboFundsRebuild = null
      await bot.unrealizedProfit('TEST-USDC')
      expect(deal.deal.bestPrice).to.equal(50)
      expect(bot.closes).to.have.length(1)
    })
  }

  for (const long of [true, false]) {
    it(`uses separate ${long ? 'long' : 'short'} trailing retracement gates per coin`, () => {
      const { bot, deal } = makeBot()
      const other = JSON.parse(JSON.stringify(deal))
      other.deal._id = 'other-deal'
      other.deal.symbol.symbol = 'OTHER-USDC'
      deal.deal.trailingMode = TrailingModeEnum.ttp
      const deals = new Map([
        [deal.deal._id, deal],
        [other.deal._id, other],
      ])
      bot.getDeal = (id: string) => deals.get(id)
      bot.isLong = long
      bot.dealsForStopLossCombo = new Map([
        [deal.deal._id, { tp: long ? 130 : 80, sl: long ? 90 : 120 }],
        [other.deal._id, { tp: long ? 15 : 8, sl: long ? 9 : 12 }],
      ])
      bot.dealsDCALevelCheck = new Map()
      bot.dealsDCAByMarket = new Map()
      bot.highestLow = new Map()
      bot.lowestHigh = new Map()
      Dca.prototype.checkDealsPriceExtremum.call(bot)
      expect(bot.highestLow.get('TEST-USDC')).to.equal(long ? 130 : 0)
      expect(bot.lowestHigh.get('TEST-USDC')).to.equal(long ? Infinity : 80)
      expect(bot.highestLow.get('OTHER-USDC')).to.equal(long ? 9 : 8)
      expect(bot.lowestHigh.get('OTHER-USDC')).to.equal(long ? 15 : 12)
    })
  }
})
