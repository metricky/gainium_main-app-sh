import axios from 'axios'
import logger from './logger'

export type IPInfo = {
  Country?: string
  City?: string
  Continent?: string
  Zip?: string
  RegionName?: string
  ISP?: string
  Coordinates?: string
  Time?: string
  CountryCode?: string
  ipAddress?: string
  hostname?: string
  provider?: string
  ASN?: string
  lat?: string
  lon?: string
}

const getIPInfo = async (ip: string): Promise<IPInfo | null> => {
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`)
    const data = response.data
    const formattedData = {
      Country: `${data.country} (${data.countryCode})`,
      City: data?.city,
      Continent: `${data.country})`,
      Zip: data?.zip,
      RegionName: data?.regionName,
      ISP: data?.isp,
      Coordinates: `${data.lat} (lat) / ${data.lon} (long)`,
      Time: `${data.timezone}`,
      CountryCode: data.countryCode,
      ipAddress: ip,
      hostname: ip,
      provider: data.org,
      ASN: data.as,
      lat: String(data.lat),
      lon: String(data.lon),
    }
    return formattedData
  } catch (e) {
    logger.error(`Error fetching IP info for ${ip}:`, e)
    return null
  }
}

export default getIPInfo
