// Converts between Markdown and a meeting's shared-notes Yjs fragment with the
// same Tiptap schema the notes editor (Nuxt UI's UEditor) builds, so text
// written on the server opens in the editor as if it had been typed there.
import { getSchema, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Code from '@tiptap/extension-code'
import { MarkdownManager } from '@tiptap/markdown'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'

// The Collaboration extension's default field, which the notes editor binds to.
export const MEETINGS_DOC_FIELD = 'default'

let editorKit: { schema: Schema, markdown: MarkdownManager } | null = null

function kit() {
  if (!editorKit) {
    const extensions = [
      StarterKit.configure({ undoRedo: false, code: false }),
      Code.extend({ excludes: 'code' })
    ]
    editorKit = {
      schema: getSchema(extensions),
      markdown: new MarkdownManager({ extensions, markedOptions: { gfm: true } })
    }
  }
  return editorKit
}

export function meetingsMarkdownToBlocks(markdown: string): JSONContent[] {
  return kit().markdown.parse(markdown).content ?? []
}

export function meetingsFragmentBlocks(fragment: Y.XmlFragment): JSONContent[] {
  return (yXmlFragmentToProseMirrorRootNode(fragment, kit().schema).toJSON() as JSONContent).content ?? []
}

export function meetingsFragmentToMarkdown(fragment: Y.XmlFragment): string {
  return kit().markdown.serialize({ type: 'doc', content: meetingsFragmentBlocks(fragment) })
}

// Rewrites the fragment to hold exactly `blocks`. Yjs diffs against what is
// there, so blocks that are unchanged keep their identity for live editors.
export function setMeetingsFragmentBlocks(fragment: Y.XmlFragment, blocks: JSONContent[]): void {
  const content = blocks.length > 0 ? blocks : [{ type: 'paragraph' }]
  prosemirrorJSONToYXmlFragment(kit().schema, { type: 'doc', content }, fragment)
}
