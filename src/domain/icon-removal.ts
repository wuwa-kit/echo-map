import { z } from 'zod'

export const iconRemovalResolutionSchema = z.object({
  iconId: z.string().min(1),
  replacementId: z.string().min(1),
  pointIds: z.array(z.string().min(1)),
}).strict()

export type IconRemovalResolution = z.infer<typeof iconRemovalResolutionSchema>
