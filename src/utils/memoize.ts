const getKeyDefault = (...args: unknown[]): string =>
  args.map((arg) => JSON.stringify(arg)).join('|')

export interface CacheMap {
  get(key: string): unknown
  set(key: string, value: unknown): CacheMap
}

export interface MemoizeConfig {
  cacheMap?: CacheMap
  getKey?: (...args: any[]) => string
}

export function Memoize(config: MemoizeConfig = {}) {
  const { cacheMap = new Map(), getKey = getKeyDefault } = config
  return (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    const accessor = getAccessor(descriptor)
    const fn = descriptor[accessor]
    descriptor[accessor] = function (...args: unknown[]) {
      const key = getKey(...args)
      const cached = cacheMap.get(key)
      if (cached) {
        return cached
      }
      const result = fn.apply(this, args)
      cacheMap.set(key, result)
      return result
    }
  }
}

function getAccessor(descriptor: PropertyDescriptor) {
  const allowedAccessors: ('get' | 'value')[] = ['value', 'get']

  const accessor = allowedAccessors.find((a) => descriptor[a])
  if (!accessor)
    throw new Error('Memoization is allowed only on methods and getters')

  return accessor
}
