import { balanceDb } from '../../db/dbInit'
import { StatusEnum } from '../../../types'

import type { ClearUserSchema } from '../../../types'

export const getBalances = async (
  user: ClearUserSchema,
  shouldSumBalance = true,
  assets?: string[],
  uuid?: string,
  paperContext?: boolean,
) => {
  const userId = user._id.toString()
  const search: {
    userId: string
    exchangeUUID?: string
    asset?: { $in: string[] }
    $or: Array<Record<string, { $gt: number }>>
  } = {
    userId,
    $or: [{ free: { $gt: 0 } }, { locked: { $gt: 0 } }],
  }
  if (uuid) {
    search.exchangeUUID = uuid
  }
  if (assets && assets.length > 0) {
    search.asset = { $in: assets }
  }
  const balance = await balanceDb.readData(
    { ...search, paperContext: paperContext ? { $eq: true } : { $ne: true } },
    undefined,
    {},
    true,
    true,
  )
  if (balance.status === StatusEnum.notok) {
    return balance
  }
  if (balance.data.count === 0) {
    return {
      status: StatusEnum.ok,
      reason: null,
      data: [],
    }
  }
  let final: typeof balance.data.result = []
  const userExchanges = user.exchanges.map((e) => e.uuid)
  if (shouldSumBalance) {
    balance.data.result
      .filter((b) => userExchanges.includes(b.exchangeUUID))
      .forEach((b) => {
        const find = final.find((f) => f.asset === b.asset)
        if (!find) {
          final.push(b)
        }
        if (find) {
          find.free += b.free
          find.locked += b.locked
          final = [...final.filter((f) => f.asset !== b.asset), find]
        }
      })
  } else {
    final = balance.data.result.filter((b) =>
      userExchanges.includes(b.exchangeUUID),
    )
  }
  return {
    status: StatusEnum.ok,
    reason: null,
    data: final.map((d) => ({
      asset: d.asset,
      free: `${d.free}`,
      locked: `${d.locked}`,
      exchange: shouldSumBalance ? '' : d.exchange,
      exchangeUUID: shouldSumBalance ? '' : d.exchangeUUID,
      exchangeName: shouldSumBalance
        ? ''
        : user.exchanges.find((e) => e.uuid === d.exchangeUUID)?.name ||
          d.exchange,
    })),
  }
}
