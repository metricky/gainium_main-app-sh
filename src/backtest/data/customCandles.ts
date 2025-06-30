import type { CandleResponse } from '../../../types'

class Candle {
  private period: number
  private start: number
  private end: number
  private buffer: number[]
  private l: number
  private h: number
  private bufferV: number
  private hist: CandleResponse[]
  constructor(period: number) {
    this.period = period
    this.start = 0
    this.end = 0
    this.buffer = []
    this.bufferV = 0
    this.l = 0
    this.h = 0
    this.hist = []
  }

  /** Push data to candles */
  push(
    p: number,
    v: number,
    t: number,
    symbol: string,
  ): CandleResponse | undefined {
    if (this.start === 0) {
      const mod = t % this.period
      const delta = mod === 0 ? t : t - mod
      this.start = delta + this.period
      this.end = this.start + this.period - 1
    }
    if (t >= this.start && t < this.end) {
      this.buffer.push(p)
      if (this.l > p) {
        this.l = p
      }
      if (this.h < p) {
        this.h = p
      }
      this.bufferV += v
    } else if (t >= this.end) {
      if (this.buffer.length > 0) {
        const o = this.buffer[0]
        const c = this.buffer[this.buffer.length - 1]
        const l = this.l
        const h = this.h
        const res: CandleResponse = {
          open: `${o}`,
          high: `${h}`,
          low: `${l}`,
          close: `${c}`,
          time: this.start,
          volume: `${this.bufferV}`,
          symbol,
        }
        if (this.hist.length >= 3) {
          this.hist.shift()
        }
        this.hist.push(res)
        this.buffer = [p]
        this.bufferV = v
        this.start = this.end + 1
        this.end = this.start + this.period - 1
        this.l = p
        this.h = p
        return res
      }
    }
  }
}

export default Candle
