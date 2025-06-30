import {
  MONGO_DB_NAME,
  MONGO_DB_USERNAME,
  MONGO_DB_PASSWORD,
  MONGO_DB_PORT,
  MONGO_DB_HOST,
} from '../config'

const getMongooseConnect = async () => {
  return `mongodb://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${
    MONGO_DB_HOST ?? 'localhost'
  }:${MONGO_DB_PORT}/${MONGO_DB_NAME}`
}

const mongo = { connection: getMongooseConnect }

export default mongo
