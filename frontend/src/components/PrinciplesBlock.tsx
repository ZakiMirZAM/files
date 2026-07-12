import { useEffect, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { Markdown } from "./Markdown";
import { getPrinciples, type PrinciplesTopic } from "../lib/principlesContent";
import { cn } from "../lib/cn";

interface PrinciplesBlockProps {
  topic: PrinciplesTopic;
}

/** Split the leading H1 off the markdown so it can title the collapsed header. */
function splitTitle(md: string): { title: string; body: string } {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => /^#\s+/.test(l));
  if (i === -1) return { title: "Principles", body: md };
  const title = lines[i].replace(/^#\s+/, "").replace(/^Principles:\s*/i, "").trim();
  const body = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").trim();
  return { title, body };
}

/**
 * A collapsible "Principles" guide shown at the top of an analysis page. It
 * teaches the investing ideas (sourced from the vault books) that the page's
 * tools rest on. Collapsed by default so it never crowds the data; the open
 * state persists per topic so a reader's place survives navigation.
 */
export function PrinciplesBlock({ topic }: PrinciplesBlockProps) {
  const md = getPrinciples(topic);
  const storageKey = `ifed.principles.open.${topic}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // ignore
    }
  }, [open, storageKey]);

  if (!md) return null;
  const { title, body } = splitTitle(md);

  return (
    <section className="panel overflow-hidden transition-colors hover:border-gold/20">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left group"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
            open && "rotate-180 text-gold",
          )}
        />
        <BookOpen className="w-4 h-4 text-gold/60 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="eyebrow">Principles</p>
          <h2 className="font-display text-base md:text-lg font-semibold text-white leading-tight mt-0.5 truncate">
            {title}
          </h2>
        </div>
        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-white/35 shrink-0">
          {open ? "Hide" : "Read"}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-6 pt-2 border-t border-gold/10 max-h-[72vh] overflow-y-auto">
          <Markdown content={body} />
        </div>
      )}
    </section>
  );
}
