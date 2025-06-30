import { ExchangeEnum } from '../../types'
import { createExchangeFactory } from './createExchangeFactoryUtils'
import Exchange from './exchange'
import { paperExchanges } from './paper/utils'
import PaperExchange from './paper'

/** Class for choosing exchanges. There gonna be imports from all supported exchanges, and this class will choose and return necessery one */
class ExchangeChooser {
  /** Function to choose exchange for future request
   * @return {AbstractExchange} Class based on AbstractExchange class
   */
  static chooseExchangeFactory(exchange: ExchangeEnum) {
    if (paperExchanges.includes(exchange)) {
      return createExchangeFactory(PaperExchange, exchange)
    }
    return createExchangeFactory(Exchange, exchange)
  }
}

export default ExchangeChooser
