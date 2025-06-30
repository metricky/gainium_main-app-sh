import { isMainThread, threadId } from 'worker_threads'
import logger from './logger'

const loggerPrefix = `${isMainThread ? 'Main thread' : `Worker ${threadId}`} |`

class DelayHelper {
  static instance: DelayHelper
  static getInstance() {
    if (!DelayHelper.instance) {
      DelayHelper.instance = new DelayHelper()
    }
    return DelayHelper.instance
  }

  private delays: Map<string, NodeJS.Timeout> = new Map()
  public setDelay(id: string, timeout: number, cb: (...args: any[]) => any) {
    const get = this.delays.get(id)
    if (get) {
      clearTimeout(get)
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    const t = setTimeout(function () {
      try {
        cb()
      } catch (e) {
        logger.error(
          `${loggerPrefix} DelayHelper error: ${e}, id: ${id}, timeout: ${timeout}`,
        )
      }
      self.delays.delete(id)
    }, timeout)
    this.delays.set(id, t)
  }
}

export function RunWithDelay(
  getId: ((...args: any[]) => string) | string,
  timeout: ((...args: any[]) => number) | number,
) {
  return (
    _target: unknown,
    _propertyKey: PropertyKey,
    descriptor: PropertyDescriptor,
  ) => {
    const fn = descriptor.value
    descriptor.value = function (...args: unknown[]) {
      const id = typeof getId === 'function' ? getId(...args) : getId
      const delay = DelayHelper.getInstance()
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this
      const cb = function () {
        fn.apply(self, args)
      }
      delay.setDelay(
        id,
        typeof timeout === 'function' ? timeout(...args) : timeout,
        cb,
      )
    }
  }
}
