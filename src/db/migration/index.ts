import getMigrations from './list'
import logger from '../../utils/logger'
import { migrationDb } from '../dbInit'

import { StatusEnum } from '../../../types'

const start = async () => {
  logger.info('Migration start')
  const migrations = await getMigrations()
  if (!migrations) {
    return logger.error('No migrations found')
  }
  logger.info(`Found ${migrations.length} migrations`)
  for (const migration of migrations) {
    logger.info(`Migration version ${migration.version} start`)
    await migration.job()
    logger.info(`Migration version ${migration.version} end`)
  }
  if (migrations.length) {
    const highestVersion = migrations.sort((a, b) => b.version - a.version)[0]
      ?.version
    if (highestVersion) {
      await migrationDb
        .updateManyData({}, { version: highestVersion })
        .then((res) => {
          if (res.status === StatusEnum.ok) {
            logger.info(`Migration version ${highestVersion} updated`)
          } else {
            logger.error(
              `Migration version ${highestVersion} update failed ${res.reason}`,
            )
          }
        })
    }
  }
  logger.info('Migration end')
}

start().then(() => process.exit())
