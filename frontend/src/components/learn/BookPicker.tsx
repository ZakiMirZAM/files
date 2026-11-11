// Pick a book from the owner's Books folder for the AI to read (local site
// only). Renders nothing on the live site, where neither the Books folder nor
// the local AI routes exist.

import { useEffect, useId, useState } from "react";
import { fetchLocalBooks, type LocalBook } from "../../lib/localBooks";
import { localAiAvailable, type BookSource } from "../../lib/localAi";

let shelf: Promise<LocalBook[] | null> | null = null;

/** The Books folder list when the local AI can read it, else null. Loaded once. */
export function useLocalShelf(): LocalBook[] | null {
  const [books, setBooks] = useState<LocalBook[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!shelf) {
      shelf = localAiAvailable().then((ok) => (ok ? fetchLocalBooks() : null));
    }
    void shelf.then((b) => alive && setBooks(b && b.length > 0 ? b : null));
    return () => {
      alive = false;
    };
  }, []);
  return books;
}

export function bookLabel(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

interface BookPickerProps {
  books: LocalBook[];
  value: BookSource | null;
  onChange: (book: BookSource | null) => void;
  /** Show the "Pages or chapter" box (decks and tests). */
  withPages?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export function BookPicker({ books, value, onChange, withPages, disabled, compact }: BookPickerProps) {
  const listId = useId();
  const [text, setText] = useState(value ? bookLabel(value.name) : "");

  useEffect(() => {
    setText(value ? bookLabel(value.name) : "");
  }, [value?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (t: string) => {
    setText(t);
    const hit = books.find((b) => bookLabel(b.name).toLowerCase() === t.trim().toLowerCase());
    if (hit) onChange({ id: hit.id, name: hit.name, pages: value?.pages });
    else if (!t.trim()) onChange(null);
  };

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      <label className={compact ? "flex min-w-0 flex-1 items-center gap-2" : "block space-y-1"}>
        <span className={compact ? "text-[0.7rem] text-white/45 shrink-0" : "label block"}>
          {compact ? "Book" : "Book on this computer (optional)"}
        </span>
        <input
          list={listId}
          className={compact ? "field py-1.5 text-sm min-w-0 flex-1" : "field"}
          value={text}
          disabled={disabled}
          onChange={(e) => pick(e.target.value)}
          placeholder="Type to search your Books folder"
          aria-label="Book for the AI to read"
        />
        <datalist id={listId}>
          {books.map((b) => (
            <option key={b.id} value={bookLabel(b.name)} />
          ))}
        </datalist>
      </label>
      {value && (
        <button
          type="button"
          className="text-[0.7rem] text-white/40 hover:text-white/70"
          disabled={disabled}
          onClick={() => {
            setText("");
            onChange(null);
          }}
        >
          Clear book
        </button>
      )}
      {withPages && value && (
        <label className="block space-y-1">
          <span className="label block">Pages or chapter (optional)</span>
          <input
            className="field"
            value={value.pages ?? ""}
            disabled={disabled}
            maxLength={60}
            onChange={(e) => onChange({ ...value, pages: e.target.value })}
            placeholder="For example: Chapter 1, or pages 1-40"
          />
        </label>
      )}
    </div>
  );
}
