import { z } from 'zod'

export const MEETINGS_MAX_TAGS = 10
export const MEETINGS_MAX_TAG_CHARS = 40

// Trimmed, inner whitespace collapsed, and deduplicated ignoring case (the
// first spelling wins).
export const meetingsTagsInput = z
  .array(z.string().transform(t => t.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1).max(MEETINGS_MAX_TAG_CHARS)))
  .transform((tags) => {
    const seen = new Set<string>()
    return tags.filter((t) => {
      const key = t.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })
  .pipe(z.array(z.string()).max(MEETINGS_MAX_TAGS))
