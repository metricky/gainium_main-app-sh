export type UserBalanceResponse = {
  balance: { asset: string; free: number; locked: number }[]
}

export type CreateOrderResponse = {
  orderId: string
  status: string
}

export type PaperOrder = {
  symbol: string
  orderId: string
  clientOrderId: string
  transactTime: number
  updateTime: number
  price: string
  origQty: string
  executedQty: string
  cummulativeQuoteQty: string
  status: string
  type: string
  side: string
  fills?: {
    price: string
    qty: string
    commission: string
    commissionAsset: string
    tradeId: string
  }[]
}
