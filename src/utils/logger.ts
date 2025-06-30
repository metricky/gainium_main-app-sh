import { isMainThread } from 'worker_threads'

const log = (type: 'error' | 'info' | 'warn', ...msg: any[]) => {
  const pid = isMainThread ? process.pid : process.ppid
  const time = new Date()
  const separator = ' | '
  const fn =
    type === 'error'
      ? console.error
      : type === 'warn'
        ? console.warn
        : console.log
  fn(`[${pid}] -`, time, separator, ...msg)
}

const logger = {
  warn: (...msg: any[]) => log('warn', ...msg),
  error: (...msg: any[]) => log('error', ...msg),
  info: (...msg: any[]) => log('info', ...msg),
}

export default logger
