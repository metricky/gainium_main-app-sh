process.env.NODE_ENV = 'testing'

import { describe, it, before } from 'mocha'
import { expect } from 'chai'
import { createRequire } from 'module'
import { ComboTpBase, ExchangeEnum, TrailingModeEnum } from '../../../types'

// Exercise the real Combo percentage calculation and tick logic without a
// database, exchange, worker or price subscription.
const loadModule = createRequire(__filename)
let Combo: any
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
  bot.botEventDb = { createData: () => Promise.resolve() }
  bot.closes = []
  bot.triggerStopLossCombo = async (...args: any[]) => bot.closes.push(args)
  return { bot, deal }
}

describe('custom Combo TTP survives upstream merges', () => {
  before(function () {
    this.timeout(180000)
    Combo = loadModule('../comboHelper').default(FakeBase as any)
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
})
