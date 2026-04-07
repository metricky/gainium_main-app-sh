import {
  MONGO_DB_NAME,
  MONGO_DB_USERNAME,
  MONGO_DB_PASSWORD,
  MONGO_DB_PORT,
  MONGO_DB_HOST,
  MONGO_DB_CONNECTION_STRING,
} from '../config'

const getMongooseConnect = async () => {
  return (
    MONGO_DB_CONNECTION_STRING ??
    `mongodb://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@${
      MONGO_DB_HOST
    }:${MONGO_DB_PORT}/${MONGO_DB_NAME}`
  )
}

const mongo = { connection: getMongooseConnect }

export default mongo
