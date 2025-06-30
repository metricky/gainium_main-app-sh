import GridBacktester from '@gainium/backtester/dist/grid'
import loadFn from './loadFn'

import type { GRIDBacktestingInput } from '@gainium/backtester/dist/types'

class GridBacktesting extends GridBacktester {
  constructor(
    settings: GRIDBacktestingInput,
    updateProgress?: (value: number, text: string, step?: number) => void,
  ) {
    settings.userFee = Math.max(settings.userFee, 0)
    super({ ...settings })
    this.loadData = loadFn(updateProgress)
  }
}

export default GridBacktesting
