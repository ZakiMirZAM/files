import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 800;
const SAVED_BADGE_MS = 1500;
// Convex documents cap at ~1MB — refuse to send anything close to that.
const MAX_CONTENT_CHARS = 900_000;

/**
 * Debounced autosave for a Tiptap editor (same cadence as ReportPage).
 * The doc is serialized at update time (not at flush time) so the pending
 * payload survives editor destruction — switching notes never drops edits.
 */
export function useDebouncedSave(
  editor: Editor | null,
  save: (json: string) => Promise<void>,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<number | null>(null);
  const badgeTimer = useRef<number | null>(null);
  const pendingJsonRef = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!editor) return;

    const commit = async (json: string) => {
      if (json.length > MAX_CONTENT_CHARS) {
        setStatus("error");
        toast.error("Note too large to save — remove some content");
        return;
      }
      try {
        await saveRef.current(json);
        setStatus("saved");
        if (badgeTimer.current) window.clearTimeout(badgeTimer.current);
        badgeTimer.current = window.setTimeout(() => setStatus("idle"), SAVED_BADGE_MS);
      } catch {
        setStatus("error");
      }
    };

    const onUpdate = () => {
      pendingJsonRef.current = JSON.stringify(editor.getJSON());
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      setStatus("saving");
      saveTimer.current = window.setTimeout(() => {
        const json = pendingJsonRef.current;
        pendingJsonRef.current = null;
        if (json !== null) void commit(json);
      }, SAVE_DELAY_MS);
    };

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (badgeTimer.current) window.clearTimeout(badgeTimer.current);
      // Flush pending edits (fire-and-forget) from the captured serialization.
      const json = pendingJsonRef.current;
      pendingJsonRef.current = null;
      if (json !== null && json.length <= MAX_CONTENT_CHARS) {
        void saveRef.current(json).catch(() => undefined);
      }
    };
  }, [editor]);

  return status;
}
