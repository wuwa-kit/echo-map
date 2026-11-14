import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const dist = resolve(import.meta.dirname, '../dist')

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function git(args: string[], env = process.env): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}

async function initialize(): Promise<void> {
  const branch = `page-${Date.now()}`
  const base = `https://cdn.jsdelivr.net/gh/${requiredEnv('GITHUB_REPOSITORY')}@${branch}/`
  await appendFile(requiredEnv('GITHUB_ENV'), `PAGES_BRANCH=${branch}\nCDN_BASE=${base}\n`)
}

function publish(): void {
  const branch = requiredEnv('PAGES_BRANCH')
  const env = {
    ...process.env,
    GIT_INDEX_FILE: resolve(requiredEnv('RUNNER_TEMP'), 'pages-index'),
    GIT_AUTHOR_NAME: 'github-actions[bot]',
    GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'github-actions[bot]',
    GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
  }
  git(['read-tree', '--empty'], env)
  git([`--work-tree=${dist}`, 'add', '--all'], env)
  const tree = git(['write-tree'], env)
  const commit = git(['commit-tree', tree, '-m', `Build ${branch}`], env)
  git(['push', 'origin', `${commit}:refs/heads/${branch}`])
}

function cleanup(): void {
  const current = requiredEnv('PAGES_BRANCH')
  const refs = git(['ls-remote', '--heads', 'origin', 'refs/heads/page-*'])
  const branches = Array.from(refs.matchAll(/\trefs\/heads\/(page-\d+)$/gm), match => match[1])
    .filter((branch): branch is string => branch !== undefined && branch !== current)
    .sort((a, b) => Number(b.slice(5)) - Number(a.slice(5)))
  for (const branch of branches.slice(2)) git(['push', 'origin', '--delete', branch])
}

switch (process.argv[2]) {
  case 'init':
    await initialize()
    break
  case 'publish':
    publish()
    break
  case 'cleanup':
    cleanup()
    break
  default:
    throw new Error('Usage: node scripts/deploy.ts <init|publish|cleanup>')
}
