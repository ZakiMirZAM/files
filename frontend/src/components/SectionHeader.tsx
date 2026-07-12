import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  /** Accepted for compatibility but intentionally not rendered — the flavor-text
   *  subtitles under section titles were removed as redundant. */
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({ eyebrow, title, actions }: SectionHeaderProps) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-3xl animate-fade-up">
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-white tracking-tight leading-[1.05]">
          {title}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
