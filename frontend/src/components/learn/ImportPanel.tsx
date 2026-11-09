// Import cards from a file into a new deck (Learn slice A4).
// CSV, TSV and Anki text exports are read here; .xlsx and .apkg go to the backend.
// The user sees a preview, picks the front/back columns and names the deck before saving.

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  chunk,
  deckNameFromFile,
  importKind,
  parseOnServer,
  parseTextImport,
  tableToCards,
  type ImportCard,
  type ParsedTable,
} from "../../lib/learnImport";

/** Cards per Convex call when saving; keeps each request small. */
const SAVE_CHUNK = 300;
const PREVIEW_ROWS = 5;

interface ImportPanelProps {
  onClose: () => void;
  onImported: (deckId: Id<"learnDecks">) => void;
}

type Loaded =
  | { kind: "text"; fileName: string; table: ParsedTable }
  | { kind: "backend"; fileName: string; cards: ImportCard[] };

export function ImportPanel({ onClose, onImported }: ImportPanelProps) {
  const createDeck = useMutation(api.learn.createDeckWithCards);
  const appendCards = useMutation(api.learn.appendCards);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cols, setCols] = useState({ frontCol: 0, backCol: 1, tagsCol: -1 });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const cards = useMemo<ImportCard[]>(() => {
    if (!loaded) return [];
    if (loaded.kind === "backend") return loaded.cards;
    return tableToCards({ ...loaded.table, ...cols });
  }, [loaded, cols]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setLoaded(null);
    const kind = importKind(file.name);
    if (!kind) {
      setError("Choose a .csv, .tsv, .txt (Anki text export), .xlsx or .apkg file.");
      return;
    }
    setReading(true);
    try {
      if (kind === "text") {
        const table = parseTextImport(await file.text(), file.name);
        setCols({ frontCol: table.frontCol, backCol: table.backCol, tagsCol: table.tagsCol });
        setLoaded({ kind: "text", fileName: file.name, table });
      } else {
        setLoaded({ kind: "backend", fileName: file.name, cards: await parseOnServer(file) });
      }
      setName(deckNameFromFile(file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!loaded || cards.length === 0) return;
    const deckName = name.trim() || deckNameFromFile(loaded.fileName);
    const parts = chunk(cards, SAVE_CHUNK);
    setProgress({ done: 0, total: cards.length });
    try {
      const deckId = await createDeck({
        name: deckName,
        source: "import",
        description: `Imported from ${loaded.fileName}`,
        cards: parts[0],
      });
      let done = parts[0].length;
      setProgress({ done, total: cards.length });
      for (const part of parts.slice(1)) {
        await appendCards({ deckId, cards: part });
        done += part.length;
        setProgress({ done, total: cards.length });
      }
      toast.success(`Saved ${cards.length} cards to "${deckName}"`);
      onImported(deckId);
    } catch {
      toast.error("Could not save every card. Check the deck and try again.");
    } finally {
      setProgress(null);
    }
  };

  const colOptions =
    loaded?.kind === "text"
      ? Array.from({ length: loaded.table.columnCount }, (_, i) => ({
          value: i,
          label: loaded.table.header?.[i]?.trim() || `Column ${i + 1}`,
        }))
      : [];

  return (
    <section className="panel p-4 md:p-5 space-y-4" aria-label="Import cards">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-white">Import cards</h2>
        <button type="button" onClick={onClose} className="btn-ghost min-h-[44px]" aria-label="Close import">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-white/55">
        CSV, TSV, an Anki text export (.txt), a spreadsheet (.xlsx) or an Anki deck (.apkg, up to 255 KB).
      </p>

      <label className="btn-outline min-h-[44px] cursor-pointer w-fit">
        <FileUp className="w-4 h-4" />
        {reading ? "Reading..." : "Choose a file"}
        {/* No `accept`: iPad Safari greys out .apkg and .tsv files it has no type for. */}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          disabled={reading || progress !== null}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </label>

      {error && <p className="text-sm text-loss">{error}</p>}

      {loaded && (
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            <span className="text-gold font-semibold">{cards.length.toLocaleString()}</span> cards found in{" "}
            {loaded.fileName}
            {loaded.kind === "text" && ` (${loaded.table.separatorName} separated${loaded.table.html ? ", HTML turned into text" : ""})`}.
          </p>

          {loaded.kind === "text" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <ColumnSelect
                label="Front"
                value={cols.frontCol}
                options={colOptions}
                onChange={(v) => setCols((c) => ({ ...c, frontCol: v }))}
              />
              <ColumnSelect
                label="Back"
                value={cols.backCol}
                options={colOptions}
                onChange={(v) => setCols((c) => ({ ...c, backCol: v }))}
              />
              <ColumnSelect
                label="Tags"
                value={cols.tagsCol}
                options={[{ value: -1, label: "None" }, ...colOptions]}
                onChange={(v) => setCols((c) => ({ ...c, tagsCol: v }))}
              />
            </div>
          )}

          {cards.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="label py-2 pr-3 w-1/2">Front</th>
                    <th className="label py-2 pr-3">Back</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.slice(0, PREVIEW_ROWS).map((c, i) => (
                    <tr key={i} className="border-t border-gold/10 align-top">
                      <td className="py-2 pr-3 text-white/85 whitespace-pre-wrap">
                        <Clamp text={c.front} />
                      </td>
                      <td className="py-2 pr-3 text-white/60 whitespace-pre-wrap">
                        <Clamp text={c.back} />
                        {c.tags && c.tags.length > 0 && (
                          <p className="text-[0.7rem] text-white/35 mt-1">{c.tags.join(" ")}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cards.length > PREVIEW_ROWS && (
                <p className="text-xs text-white/40 mt-2">
                  Showing the first {PREVIEW_ROWS} of {cards.length.toLocaleString()}.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="flex-1 space-y-1.5">
              <span className="label">Deck name</span>
              <input
                className="field"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                placeholder="Deck name"
              />
            </label>
            <button
              type="button"
              className="btn-gold min-h-[44px]"
              disabled={cards.length === 0 || progress !== null}
              onClick={() => void save()}
            >
              {progress
                ? `Saving ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}...`
                : `Save ${cards.length.toLocaleString()} cards`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ColumnSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="label">{label}</span>
      <select
        className="field min-h-[44px] py-2"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-800">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Clamp({ text }: { text: string }) {
  const short = text.length > 240 ? `${text.slice(0, 240)}...` : text;
  return <>{short || <span className="text-white/30">(empty)</span>}</>;
}
