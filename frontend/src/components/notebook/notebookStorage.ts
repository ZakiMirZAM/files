// localStorage persistence for the notebook panel. All access is wrapped in
// try/catch so private-mode / blocked storage degrades to in-session state.

const OPEN_KEY = "ifed.notebook.open";
const ACTIVE_NOTE_KEY = "ifed.notebook.activeNoteId";

export function loadNotebookOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveNotebookOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // unavailable — state just won't persist
  }
}

export function loadActiveNoteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_NOTE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveNoteId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(ACTIVE_NOTE_KEY);
    } else {
      localStorage.setItem(ACTIVE_NOTE_KEY, id);
    }
  } catch {
    // unavailable — state just won't persist
  }
}
