import DCABacktester from '@gainium/backtester/dist/dca'
import loadFn from './loadFn'

import { DCABacktestingInput } from '@gainium/backtester/dist/types'

class DCABacktesting extends DCABacktester {
  constructor(
    settings: DCABacktestingInput,
    updateProgress?: (value: number, text: string, step?: number) => void,
    needSort?: boolean,
  ) {
    settings.userFee = Math.max(settings.userFee, 0)
    super({ ...settings })
    this.loadData = loadFn(updateProgress, needSort)
  }
}

export default DCABacktesting
