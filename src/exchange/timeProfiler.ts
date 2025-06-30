import { ExchangeEnum, ExchangeRequestTimeProfile } from '../../types'

class TimeProfiler {
  static instance: TimeProfiler

  static getInstance() {
    if (!TimeProfiler.instance) {
      TimeProfiler.instance = new TimeProfiler()
    }
    return TimeProfiler.instance
  }

  getEmptyTimeProfile(
    requestName: string,
    exchange: ExchangeEnum,
  ): ExchangeRequestTimeProfile {
    return {
      appIncomingTime: +new Date(),
      appOutcomingTime: 0,
      appRequestEndTime: 0,
      appRequestStartTime: 0,
      appAttempts: 1,
      exchange,
      requestName,
    }
  }

  startProfilerTime(
    profiler: ExchangeRequestTimeProfile,
  ): ExchangeRequestTimeProfile {
    if (profiler.appRequestStartTime && profiler.appRequestEndTime) {
      profiler.appRequestStartTime =
        +new Date() -
        (profiler.appRequestStartTime - profiler.appRequestEndTime)
    } else {
      profiler.appRequestStartTime = +new Date()
    }

    return profiler
  }

  endProfilerTime(
    profiler: ExchangeRequestTimeProfile,
  ): ExchangeRequestTimeProfile {
    profiler.appRequestEndTime = +new Date()
    return profiler
  }
}

export default TimeProfiler
