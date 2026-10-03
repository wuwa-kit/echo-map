import { builtinEnvironments } from 'vitest/runtime'

export default {
  ...builtinEnvironments.node,
  name: 'vue-renderer',
  viteEnvironment: 'client',
}
