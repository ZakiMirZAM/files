import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  CaseSensitive,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Pilcrow,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { ToolbarDropdown } from "./ToolbarDropdown";
import { FONT_FAMILIES, FONT_SIZES } from "./extensions";

interface NoteToolbarProps {
  editor: Editor;
}

// Compact toolbar sized for the ~400px panel. Active states come from
// useEditorState, @tiptap/react v3 no longer re-renders on every transaction,
// so render-time editor.isActive() goes stale on selection-only changes.
export function NoteToolbar({ editor }: NoteToolbarProps) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      headingLevel: ([1, 2, 3] as const).find((l) => e.isActive("heading", { level: l })) ?? 0,
      isBold: e.isActive("bold"),
      isItalic: e.isActive("italic"),
      isBulletList: e.isActive("bulletList"),
      isOrderedList: e.isActive("orderedList"),
      isTaskList: e.isActive("taskList"),
      isBlockquote: e.isActive("blockquote"),
      fontFamily: (e.getAttributes("textStyle").fontFamily as string | undefined) ?? null,
      fontSize: (e.getAttributes("textStyle").fontSize as string | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const blockLabel = s.headingLevel === 0 ? "Text" : `H${s.headingLevel}`;
  const sizeLabel = s.fontSize ? s.fontSize.replace("px", "") : "Aa";
  const activeFont = FONT_FAMILIES.find((f) => f.value === s.fontFamily);

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 panel-soft">
      <ToolbarDropdown
        title="Block type"
        label={
          <span className="inline-flex items-center gap-1">
            <Pilcrow className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="font-mono text-[0.65rem]">{blockLabel}</span>
          </span>
        }
        widthClass="w-36"
        options={[
          {
            key: "p",
            label: "Paragraph",
            active: s.headingLevel === 0,
            onSelect: () => editor.chain().focus().setParagraph().run(),
          },
          ...([1, 2, 3] as const).map((level) => ({
            key: `h${level}`,
            label: `Heading ${level}`,
            active: s.headingLevel === level,
            onSelect: () => editor.chain().focus().toggleHeading({ level }).run(),
          })),
        ]}
      />

      <ToolbarButton
        icon={Bold}
        label="Bold"
        isActive={s.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="Italic"
        isActive={s.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />

      <Divider />

      <ToolbarButton
        icon={List}
        label="Bullet list"
        isActive={s.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Ordered list"
        isActive={s.isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={ListTodo}
        label="Task list"
        isActive={s.isTaskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <ToolbarButton
        icon={Quote}
        label="Quote"
        isActive={s.isBlockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />

      <Divider />

      <ToolbarDropdown
        title="Font family"
        label={
          <span className="inline-flex items-center gap-1">
            <CaseSensitive className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="font-mono text-[0.65rem] max-w-[4.5rem] truncate">
              {activeFont && activeFont.value ? activeFont.label : "Font"}
            </span>
          </span>
        }
        widthClass="w-48"
        options={FONT_FAMILIES.map((f) => ({
          key: f.label,
          label: <span style={f.value ? { fontFamily: f.value } : undefined}>{f.label}</span>,
          active: f.value === s.fontFamily || (f.value === null && s.fontFamily === null),
          onSelect: () => {
            if (f.value === null) {
              editor.chain().focus().unsetFontFamily().run();
            } else {
              editor.chain().focus().setFontFamily(f.value).run();
            }
          },
        }))}
      />

      <ToolbarDropdown
        title="Font size"
        label={<span className="font-mono text-[0.65rem] min-w-[1.4rem] text-center">{sizeLabel}</span>}
        widthClass="w-28"
        options={FONT_SIZES.map((f) => ({
          key: f.label,
          label: f.label,
          active: f.value === s.fontSize || (f.value === null && s.fontSize === null),
          onSelect: () => {
            if (f.value === null) {
              editor.chain().focus().unsetFontSize().run();
            } else {
              editor.chain().focus().setFontSize(f.value).run();
            }
          },
        }))}
      />

      <Divider />

      <ToolbarButton
        icon={Undo2}
        label="Undo"
        disabled={!s.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        icon={Redo2}
        label="Redo"
        disabled={!s.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}

interface ToolbarButtonProps {
  icon: typeof Bold;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, isActive, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "p-1.5 rounded-sm transition-colors",
        isActive ? "bg-gold/20 text-gold" : "text-white/55 hover:text-white hover:bg-white/[0.04]",
        disabled && "opacity-30 pointer-events-none",
      )}
    >
      <Icon className="w-4 h-4" strokeWidth={1.75} />
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-gold/10 mx-0.5" />;
}
