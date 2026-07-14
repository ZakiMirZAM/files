import { useMemo, useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

interface ImageUploadHandlers {
  /** Keep this pointed at the live editor instance. */
  editorRef: React.MutableRefObject<Editor | null>;
  handlePaste: (view: EditorView, event: ClipboardEvent) => boolean;
  handleDrop: (view: EditorView, event: DragEvent, slice: unknown, moved: boolean) => boolean;
}

/**
 * Clipboard/drag image uploads: file → Convex storage → image node with the
 * resolved URL (plus storageId for the PDF export fallback). Non-image
 * pastes/drops fall through to Tiptap's defaults.
 */
export function useImageUpload(): ImageUploadHandlers {
  const generateUploadUrl = useMutation(api.notes.generateUploadUrl);
  const registerImage = useMutation(api.notes.registerImage);
  const editorRef = useRef<Editor | null>(null);

  return useMemo(() => {
    const uploadAndInsert = async (file: File, pos?: number) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        toast.error("Only PNG, JPEG, GIF, or WebP images can be added");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("Image is larger than 5MB, resize it and try again");
        return;
      }

      const toastId = toast.loading("Uploading image…");
      try {
        const postUrl = await generateUploadUrl();
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        const src = await registerImage({ storageId });

        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) throw new Error("Editor closed");

        const node = { type: "image", attrs: { src, storageId } };
        if (pos !== undefined) {
          editor.chain().focus().insertContentAt(pos, node).run();
        } else {
          editor.chain().focus().insertContent(node).run();
        }
        toast.success("Image added", { id: toastId });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Image upload failed";
        toast.error(message, { id: toastId });
      }
    };

    const handlePaste = (_view: EditorView, event: ClipboardEvent): boolean => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length === 0) return false; // normal paste, let Tiptap handle it
      event.preventDefault();
      files.forEach((f) => void uploadAndInsert(f));
      return true;
    };

    const handleDrop = (
      view: EditorView,
      event: DragEvent,
      _slice: unknown,
      moved: boolean,
    ): boolean => {
      if (moved) return false; // internal node drag, let Tiptap handle it
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      files.forEach((f) => void uploadAndInsert(f, pos));
      return true;
    };

    return { editorRef, handlePaste, handleDrop };
  }, [generateUploadUrl, registerImage]);
}
