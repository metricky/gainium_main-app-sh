import fs from 'fs'

import { migrationDb } from '../../dbInit'
import logger from '../../../utils/logger'

import { type MigrationJob, StatusEnum } from '../../../../types'

const getMigrations = async () => {
  logger.info('Importing migrations start')
  const data = await migrationDb.readData()
  if (data.status === StatusEnum.notok) {
    return logger.error(`Error reading migration version ${data.reason}`)
  }
  const version = data.data.result?.version ?? -1
  logger.info(`Current migration version ${version}`)
  logger.info('Reading migrations list')
  const files = fs.readdirSync(__dirname)
  logger.info(`Found ${files.length - 1} migration files`)
  const updates: MigrationJob[] = []
  for (const file of files) {
    if (file === 'index.ts' || file === 'initial') {
      continue
    }
    try {
      const def = (await import(`./${file}`))?.default as MigrationJob | null
      if (!def) {
        logger.error(`Migration ${file} does not have default export`)
        continue
      }
      if (!def.job) {
        logger.error(`Migration ${file} does not have update function`)
        continue
      }
      if (def.version > version) {
        updates.push(def)
      }
    } catch (e) {
      logger.error(`Error importing migration ${file} ${e}`)
      continue
    }
  }
  return updates.sort((a, b) => a.version - b.version)
}

export default getMigrations
