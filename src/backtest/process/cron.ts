import { Types } from 'mongoose'
import fs from 'fs'
import {
  backtestDb,
  comboBacktestDb,
  filesDb,
  gridBacktestDb,
} from '../../db/dbInit'

const removeOldFiles = async () => {
  const files = await filesDb.readData(
    { created: { $lt: new Date(+new Date() - 30 * 24 * 60 * 60 * 1000) } },
    {},
    {},
    true,
  )
  const _backtestIds: string[] = []
  const deleted: Types.ObjectId[] = []
  for (const f of files.data?.result ?? []) {
    if (f.meta?.id) {
      _backtestIds.push(f.meta.id as string)
    }
    try {
      fs.unlinkSync(f.path)
    } catch {
      deleted.push(f._id)
      continue
    }
    deleted.push(f._id)
  }
  await filesDb.deleteManyData({
    _id: { $in: deleted },
  })
  const backtestIds: Types.ObjectId[] = []
  for (const b of _backtestIds.filter((b) => !!b)) {
    backtestIds.push(new Types.ObjectId(b))
  }
  if (backtestIds.length) {
    const search = { _id: { $in: backtestIds } }
    const update = { $set: { serverSide: false } }
    await backtestDb.updateManyData(search, update)
    await comboBacktestDb.updateManyData(search, update)
    await gridBacktestDb.updateManyData(search, update)
  }
}

export default removeOldFiles
