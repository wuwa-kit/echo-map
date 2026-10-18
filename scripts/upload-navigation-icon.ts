import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectPath } from './lib/files.ts'
import { readUploadCredentials, uploadNavigationIcon } from './lib/navigation-icon-upload.ts'

const path = process.argv[2]
if (!path) throw new Error('用法：node scripts/upload-navigation-icon.ts <128×128 PNG 路径>')
const credentials = await readUploadCredentials()
const url = await uploadNavigationIcon(await readFile(resolve(path)), credentials, projectPath('.local/icon-upload-cache'))
console.log(url)
