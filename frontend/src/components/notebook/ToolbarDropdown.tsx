import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export interface DropdownOption {
  key: string;
  label: ReactNode;
  active?: boolean;
  onSelect: () => void;
}

interface ToolbarDropdownProps {
  label: ReactNode;
  title: string;
  options: DropdownOption[];
  widthClass?: string;
}

// Minimal dropdown for the narrow notebook toolbar — same pattern as the
// header ApiStatusBadge popover (trigger + fixed close-catcher + panel menu).
export function ToolbarDropdown({ label, title, options, widthClass = "w-44" }: ToolbarDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-label={title}
        aria-expanded={open}
        className="inline-flex items-center gap-1 px-1.5 py-2 rounded-sm text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors text-xs"
      >
        {label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <button
            aria-label="Close"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className={cn("absolute left-0 top-full mt-1 panel p-1 z-30 shadow-xl max-h-64 overflow-y-auto", widthClass)}>
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  opt.onSelect();
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-sm text-left text-xs transition-colors",
                  opt.active ? "text-gold bg-gold/10" : "text-white/70 hover:text-white hover:bg-white/[0.04]",
                )}
              >
                <span className="truncate">{opt.label}</span>
                {opt.active && <Check className="w-3 h-3 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
