import getIPInfo from '../../utils/ip'

export const getLocationByIp = async (ip?: string) => {
  if (!ip || ip === '::1') {
    return ''
  }
  try {
    const res = await getIPInfo(ip)
    if (!res) {
      return ''
    }
    return `${res.City ?? ''}${res.Country ? ' ' : ''}${res.Country ?? ''}`
  } catch {
    return ''
  }
}

export const getFullLocationByIp = async (ip?: string) => {
  if (!ip || ip === '::1') {
    return null
  }
  try {
    return await getIPInfo(ip)
  } catch {
    return null
  }
}
