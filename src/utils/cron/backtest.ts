import { Types } from 'mongoose'
import fs from 'fs'
import {
  backtestDb,
  comboBacktestDb,
  filesDb,
  gridBacktestDb,
} from '../../db/dbInit'

export const checkBacktests = async () => {
  const search = {
    time: { $lt: new Date().getTime() - 30 * 24 * 60 * 60 * 1000 },
    savePermanent: { $ne: true },
  }
  const _ids: string[] = []
  ;(
    (await backtestDb.readData(search, {}, {}, true)).data?.result ?? []
  ).forEach((b) => _ids.push(`${b._id}`))
  ;(
    (await comboBacktestDb.readData(search, {}, {}, true)).data?.result ?? []
  ).forEach((b) => _ids.push(`${b._id}`))
  ;(
    (await gridBacktestDb.readData(search, {}, {}, true)).data?.result ?? []
  ).forEach((b) => _ids.push(`${b._id}`))
  const findFiles = await filesDb.readData(
    { 'meta.id': { $in: _ids } },
    {},
    {},
    true,
  )
  const deleted: Types.ObjectId[] = []
  for (const f of findFiles.data?.result ?? []) {
    try {
      fs.unlinkSync(f.path)
    } catch {
      deleted.push(f._id)
      continue
    }
    deleted.push(f._id)
  }
  await filesDb.deleteManyData({ _id: { $in: deleted } })
  await backtestDb.deleteManyData(search)
  await comboBacktestDb.deleteManyData(search)
  await gridBacktestDb.deleteManyData(search)
}
