import { defineComponent } from 'vue'
import type { VNode } from 'vue'

// Keep the rendered frame intact while the native dialog leaves the top layer.
export default defineComponent({
  name: 'WuDialogContent',
  props: { active: { type: Boolean, required: true } },
  setup(props, { slots }) {
    let frame: VNode[] | undefined
    return () => {
      if (props.active) frame = slots.default?.()
      return frame ?? null
    }
  },
})
