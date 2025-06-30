import CryptoJs from 'crypto-js'

const key = '4d01d0f4-af0c-4f60-b7f7-6396ad7823f4'

export const encrypt = (str: string, k = key) =>
  CryptoJs.AES.encrypt(str, k).toString()

export const decrypt = (str: string, k = key) => {
  try {
    const result = CryptoJs.AES.decrypt(str, k).toString(CryptoJs.enc.Utf8)
    return result
  } catch {
    return str
  }
}
