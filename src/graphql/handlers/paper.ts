import { ExcludeDoc, UserSchema, StatusEnum } from '../../../types'
import BotInstance from '../../bot'
import { paperExchanges } from '../../exchange/paper/utils'
import {
  balanceDb,
  feeDb,
  globalVarsDb,
  snapshotDb,
  userDb as _userDb,
  userProfitByHourDb,
} from '../../db/dbInit'
import userUtils from '../../utils/user'
import logger from '../../utils/logger'
import utils from '../../db/scripts/cleanDb'
import { updateRelatedBotsInVar } from '../../bot/utils'
import DB from '../../db'

export const resetPaperData = async <
  T extends UserSchema = UserSchema,
  B extends ReturnType<typeof BotInstance.getInstance> = ReturnType<
    typeof BotInstance.getInstance
  >,
>(
  userData: ExcludeDoc<UserSchema>,
  userDb: DB<T> = _userDb as unknown as DB<T>,
  Bot: B = BotInstance.getInstance() as B,
) => {
  const requests: Promise<{ status: StatusEnum } | null>[] = [
    Bot.deleteAllUserPaperBots(userData._id),
  ]
  userData.exchanges
    .filter((e) => paperExchanges.includes(e.provider))
    .forEach((e) => {
      requests.push(
        userDb.updateData(
          { _id: userData._id },
          {
            $pull: {
              exchanges: { uuid: e.uuid },
            },
          },
          true,
          true,
        ),
      )
      requests.push(
        feeDb.deleteManyData({
          exchangeUUID: e.uuid,
        }),
      )
      userUtils.disconnectUserBalance(e.uuid)
    })

  requests.push(
    balanceDb.deleteManyData({
      userId: userData._id,
      paperContext: true,
    }),
  )
  requests.push(
    snapshotDb.deleteManyData({
      userId: userData._id,
      paperContext: true,
    }),
  )
  requests.push(
    userProfitByHourDb.deleteManyData({
      userId: userData._id,
      paperContext: true,
    }),
  )
  const result = await Promise.all(requests)
    .then((res) => {
      res.forEach((r) => {
        if (r && r.status === StatusEnum.notok) {
          return {
            status: StatusEnum.notok,
            reason: 'Failed to delete all paper data. Try again later',
          }
        }
      })
      return {
        status: StatusEnum.ok,
        reason: null,
      }
    })
    .catch((e) => {
      logger.warn(e?.message || e)
      return {
        status: StatusEnum.notok,
        reason: 'Failed to delete all paper data. Try again later',
      }
    })
  await utils.clearNotUsedPaperData()
  logger.info(`Checking global vars`)
  const vars = await globalVarsDb.readData(
    { userId: `${userData._id}` },
    {},
    {},
    true,
  )
  logger.info(`Found ${vars.data?.result?.length ?? 0} global vars`)
  await updateRelatedBotsInVar((vars.data?.result ?? []).map((v) => `${v._id}`))
  return result
}
