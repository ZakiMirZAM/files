import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import type { Extensions } from "@tiptap/react";

// Image node that remembers its Convex storage id alongside the resolved URL —
// needed for the PDF export CORS fallback and future orphan cleanup.
export const NotebookImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      storageId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-storage-id"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.storageId ? { "data-storage-id": attrs.storageId } : {},
      },
    };
  },
});

export function buildNotebookExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false },
    }),
    Placeholder.configure({ placeholder: "Write a note — paste images right in…" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle,
    FontFamily,
    FontSize,
    // allowBase64 stays false: images live in Convex storage, not the doc
    // (Convex documents cap at ~1MB).
    NotebookImage.configure({ inline: false, allowBase64: false }),
  ];
}

export interface FontOption {
  label: string;
  /** CSS font-family value, or null for "unset / default". */
  value: string | null;
}

export const FONT_FAMILIES: FontOption[] = [
  { label: "Default", value: null },
  { label: "DM Sans", value: '"DM Sans", ui-sans-serif, sans-serif' },
  { label: "Playfair Display", value: '"Playfair Display", Georgia, serif' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "System", value: "ui-sans-serif, system-ui, sans-serif" },
];

export const FONT_SIZES: FontOption[] = [
  { label: "Default", value: null },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
];
