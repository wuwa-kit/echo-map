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
  const tag = `0.0.0-page.${Date.now()}`
  const base = `https://cdn.jsdelivr.net/gh/${requiredEnv('GITHUB_REPOSITORY')}@${tag}/`
  await appendFile(requiredEnv('GITHUB_ENV'), `PAGES_TAG=${tag}\nCDN_BASE=${base}\n`)
}

function publish(): void {
  const tag = requiredEnv('PAGES_TAG')
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
  const commit = git(['commit-tree', tree, '-m', `Build ${tag}`], env)
  git(['push', 'origin', `${commit}:refs/tags/${tag}`])
}

function cleanup(): void {
  const current = `refs/tags/${requiredEnv('PAGES_TAG')}`
  const refs = git(['ls-remote', '--refs', 'origin', 'refs/tags/0.0.0-page.*', 'refs/heads/page-*'])
  const builds = Array.from(
    refs.matchAll(/\t(refs\/(?:tags\/0\.0\.0-page\.|heads\/page-)(\d+))$/gm),
    ([, ref = '', timestamp]) => ({ ref, timestamp: Number(timestamp) }),
  )
  const oldRefs = builds.filter(({ ref }) => ref !== current)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(2)
    .map(({ ref }) => ref)
  if (oldRefs.length) git(['push', 'origin', '--delete', ...oldRefs])
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
