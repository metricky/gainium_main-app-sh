import fs from 'fs'
import path from 'path'
import { v4 } from 'uuid'

const userFilesDir = 'user-files'

const resolvePath = (_path: string, dirDepth: string) => {
  return path.resolve(__dirname, dirDepth, _path)
}

const saveFile = (
  data: string,
  name: string,
  resolution?: string,
  _path?: string,
  dirDepth = '../../../',
) => {
  const pathToUse = _path ? `${userFilesDir}/${_path}` : userFilesDir
  const fullPath = resolvePath(pathToUse, dirDepth)
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true })
  }
  const fileName = `${name}-${v4()}.${resolution}`
  const pathWithName = `${fullPath}/${fileName}`
  fs.writeFileSync(`${pathWithName}`, data, 'utf-8')
  const size = fs.statSync(`${pathWithName}`).size
  return { path: pathWithName, name: fileName, size }
}

export default saveFile
