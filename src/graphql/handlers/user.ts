import { userDb } from '../../db/dbInit'
import { StatusEnum } from '../../../types'
import jwt from 'jsonwebtoken'
import { encrypt } from '../../utils/crypto'
import type { ClearUserSchema } from '../../../types'
import { getFullLocationByIp } from './ip'
import { JWT_SECRET } from '../../config'

if (!JWT_SECRET) {
  throw Error('missing jwt secret')
}

export const createOrUpdateUser = async (
  user: {
    email: string
    password: string
    picture?: string
    lastName?: string
    timezone?: string
    name?: string
    weekStart?: string
  },
  userAgent?: string,
  ip?: string,
  create = false,
) => {
  const { picture, lastName, name, password, weekStart } = user
  let { email, timezone } = user
  if (timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch (e) {
      timezone = 'UTC'
    }
  }
  email = email.toLowerCase()
  const findUser = await userDb.readData({
    username: email,
  })
  if (findUser.status === StatusEnum.notok) {
    return findUser
  }
  const expire = new Date().getTime() + 30 * 24 * 60 * 60 * 1000
  const jwtToken = jwt.sign(
    {
      username: email,
      authorized: true,
    },
    JWT_SECRET,
    {
      expiresIn: expire,
    },
  )
  if (findUser.data.result) {
    const set: { [x: string]: unknown } = {
      $push: {
        tokens: [
          {
            token: jwtToken,
            createdAt: +new Date(),
            expiredAt: expire,
          },
        ],
      },
    }
    if (ip) {
      let ips = findUser.data.result.ips ?? []
      const find = ips.find((d) => d.ip === ip)
      if (find) {
        find.updated = new Date()
        ips = [...ips.filter((d) => d.ip !== find.ip), find]
        set.ips = ips
      } else {
        const location = await getFullLocationByIp(ip)
        ips.push({
          ip,
          userAgent,
          location: location
            ? { country: location.Country, city: location.City }
            : undefined,
        })
        if (ips.length > 10) {
          ips.shift()
        }
        set.ips = ips
      }
    }
    set.last_active = +new Date()
    const saveDataRequest = await userDb.updateData(
      { username: email },
      {
        ...set,
      },
      true,
    )
    if (saveDataRequest.status === StatusEnum.notok) {
      return saveDataRequest
    }
    return {
      status: StatusEnum.ok,
      reason: 'User logged in',
      data: {
        token: jwtToken,
        shouldOnBoard: saveDataRequest.data.shouldOnBoard,
        shouldOnBoardExchange: saveDataRequest.data.shouldOnBoardExchange,
      },
    }
  } else if (timezone && create) {
    const location = await getFullLocationByIp(ip)
    const userToAdd: Omit<ClearUserSchema, '_id'> = {
      username: email,
      password: encrypt(password),
      tokens: [
        {
          token: jwtToken,
          createdAt: +new Date(),
          expiredAt: expire,
        },
      ],
      exchanges: [],
      timezone,
      picture,
      name,
      lastName,
      shouldOnBoard: true,
      shouldOnBoardExchange: true,
      onboardingSteps: {
        signup: true,
        liveExchange: false,
        deployLiveBot: false,
        earnProfit: false,
      },
      displayName: name ?? null,
      ips: [
        {
          ip,
          userAgent,
          location: location
            ? { country: location?.Country, city: location?.City }
            : undefined,
        },
      ],
      weekStart: weekStart || 'm',
    }
    const createDataRequest = await userDb.createData(userToAdd)
    if (createDataRequest.status === StatusEnum.notok) {
      return createDataRequest
    }
    return {
      status: StatusEnum.ok,
      reason: 'User signed in',
      data: {
        token: jwtToken,
        shouldOnBoard: true,
        shouldOnBoardExchange: true,
      },
    }
  }
}
