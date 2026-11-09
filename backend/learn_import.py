"""Flashcard import for the Learn section (slice A4).

Parses an uploaded .xlsx sheet or an Anki deck package (.apkg / .colpkg) into
plain cards: ``[{"front", "back", "tags"}]``. Stateless: nothing is stored.
CSV, TSV and Anki plain-text exports are parsed in the browser instead.

An .apkg is a zip holding ``collection.anki21`` or ``collection.anki2`` (SQLite).
Each note's ``flds`` column holds its fields split by ``\\x1f``; the first field
is the front and the second the back. HTML is reduced to readable text.
"""

from __future__ import annotations

import html
import io
import multiprocessing
import os
import re
import sqlite3
import tempfile
import threading
import time
import zipfile
from typing import Any

MAX_CARDS = 20_000
MAX_FIELD = 20_000
# Zip bomb guard: total uncompressed bytes we are willing to expand.
MAX_UNZIPPED = 64 * 1024 * 1024
# Hard wall-clock limit for one parse. The parse runs in a separate process
# (parse_upload_isolated) so a hostile file can be killed, never the API.
PARSE_TIMEOUT_S = 20.0
# At most this many parse processes at once; extra uploads wait, then fail.
MAX_PARSERS = 2
# .xlsx scan limits: only the first columns are read (a forged <dimension>
# can claim 16,384), a run of empty rows ends the sheet, and the total number
# of rows looked at is capped, empty or not.
XLSX_MAX_COL = 16
XLSX_MAX_EMPTY_RUN = 200
XLSX_MAX_SCAN_ROWS = 50_000
# SQLite VM budget for the .apkg query: a progress callback every
# SQLITE_PROGRESS_STEP instructions, aborted after SQLITE_PROGRESS_LIMIT calls.
SQLITE_PROGRESS_STEP = 1_000
SQLITE_PROGRESS_LIMIT = 50_000

TOO_SLOW = "This file took too long to read. Export a smaller or simpler file."


class ImportError_(ValueError):
    """A user-facing reason the file could not be read."""


# ── HTML to text (mirrors frontend/src/lib/learnImport.ts htmlToText) ──────

_RE_SCRIPT_OPEN = re.compile(r"<(script|style)\b", re.I)
_RE_SCRIPT_CLOSE = {
    "script": re.compile(r"</script\s*>", re.I),
    "style": re.compile(r"</style\s*>", re.I),
}
_RE_SOUND = re.compile(r"\[sound:[^\]]*\]", re.I)
_RE_BR = re.compile(r"<br\s*/?>", re.I)
_RE_LI = re.compile(r"<li\b[^>]*>", re.I)
_RE_BLOCK_END = re.compile(r"</(p|div|li|ul|ol|h[1-6]|tr|table|blockquote)\s*>", re.I)
_RE_BLOCK_START = re.compile(r"<(p|div|ul|ol|h[1-6]|tr|table|blockquote|hr)\b[^>]*>", re.I)
_RE_CELL_END = re.compile(r"</t[dh]\s*>", re.I)
_RE_TAG = re.compile(r"<[^>]*>")
_RE_SPACES = re.compile(r"[ \t]+")
_RE_BLANKS = re.compile(r"\n{2,}")
_RE_CLOZE = re.compile(r"\{\{c\d+::(.*?)(?:::(.*?))?\}\}", re.S)


def _strip_script_style(s: str) -> str:
    """Remove <script>...</script> and <style>...</style> blocks.

    Same result as the lazy regex ``<(script|style)\\b[\\s\\S]*?</\\1\\s*>``
    but linear: once a tag name has no closer left, later openers of that
    name are skipped instead of each rescanning to the end of the string.
    """
    out: list[str] = []
    pos = 0
    unclosed: set[str] = set()
    for m in _RE_SCRIPT_OPEN.finditer(s):
        if m.start() < pos:
            continue
        name = m.group(1).lower()
        if name in unclosed:
            continue
        close = _RE_SCRIPT_CLOSE[name].search(s, m.end())
        if close is None:
            unclosed.add(name)
            if len(unclosed) == 2:
                break
            continue
        out.append(s[pos:m.start()])
        pos = close.end()
    out.append(s[pos:])
    return "".join(out)


def html_to_text(s: str) -> str:
    if not s:
        return ""
    # Clip BEFORE any regex: the output is clipped to MAX_FIELD anyway, and an
    # unbounded field would make the tag regexes below slow.
    s = s[:MAX_FIELD]
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = _strip_script_style(s)
    s = _RE_SOUND.sub("", s)
    s = _RE_BR.sub("\n", s)
    s = _RE_LI.sub("\n• ", s)
    s = _RE_BLOCK_END.sub("\n", s)
    s = _RE_BLOCK_START.sub("\n", s)
    s = _RE_CELL_END.sub("\t", s)
    s = _RE_TAG.sub("", s)
    s = html.unescape(s).replace(" ", " ")
    s = "\n".join(_RE_SPACES.sub(" ", line).strip() for line in s.split("\n"))
    s = _RE_BLANKS.sub("\n", s)
    return s.strip()


def _clip(s: str) -> str:
    return s[:MAX_FIELD]


def _card(front: str, back: str, tags: list[str] | None = None) -> dict[str, Any] | None:
    front, back = _clip(front.strip()), _clip(back.strip())
    if not front and not back:
        return None
    return {"front": front, "back": back, "tags": tags or []}


# ── Zip helpers ────────────────────────────────────────────────────────────

def _open_zip(data: bytes) -> zipfile.ZipFile:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ImportError_("This file is not a valid package (not a zip).") from exc
    total = sum(i.file_size for i in zf.infolist())
    if total > MAX_UNZIPPED:
        raise ImportError_("This file expands to more than 64 MB. Export a smaller deck.")
    return zf


# ── .apkg ──────────────────────────────────────────────────────────────────

def _open_sqlite(blob: bytes) -> sqlite3.Connection:
    """The collection, read-only, with an instruction budget on every query."""
    conn = sqlite3.connect(":memory:")
    try:
        conn.deserialize(blob)  # Python 3.11+, no temp file
    except (AttributeError, sqlite3.Error):
        conn.close()
        # Fallback: a private temp file, removed by the caller via _close_sqlite.
        fd, path = tempfile.mkstemp(suffix=".anki2")
        with os.fdopen(fd, "wb") as fh:
            fh.write(blob)
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn._learn_tmp = path  # type: ignore[attr-defined]
    try:
        # Read-only (the deserialized copy has no mode=ro), and never run SQL
        # functions named inside the untrusted schema.
        conn.execute("PRAGMA query_only = ON")
        conn.execute("PRAGMA trusted_schema = OFF")
    except sqlite3.Error:
        pass
    calls = [0]

    def _budget() -> int:
        calls[0] += 1
        return 1 if calls[0] > SQLITE_PROGRESS_LIMIT else 0  # non-zero aborts

    conn.set_progress_handler(_budget, SQLITE_PROGRESS_STEP)
    return conn


def _require_notes_table(conn: sqlite3.Connection) -> None:
    """``notes`` must be a plain table: a view can hide an endless query."""
    try:
        rows = conn.execute(
            "SELECT type, sql FROM sqlite_master WHERE lower(name) = 'notes'"
        ).fetchall()
    except sqlite3.Error as exc:
        if "interrupt" in str(exc).lower():
            raise ImportError_(TOO_SLOW) from exc
        raise ImportError_("The Anki collection inside this package could not be read.") from exc
    if (len(rows) != 1 or rows[0][0] != "table"
            or "virtual" in str(rows[0][1] or "").lower()):
        raise ImportError_("The Anki collection inside this package could not be read.")


def _close_sqlite(conn: sqlite3.Connection) -> None:
    path = getattr(conn, "_learn_tmp", None)
    conn.close()
    if path:
        try:
            os.remove(path)
        except OSError:
            pass


def _cloze_pair(field: str) -> tuple[str, str]:
    front = _RE_CLOZE.sub(lambda m: f"[{m.group(2)}]" if m.group(2) else "[...]", field)
    back = _RE_CLOZE.sub(lambda m: m.group(1), field)
    return front, back


def _collection_blob(zf: zipfile.ZipFile) -> bytes:
    names = set(zf.namelist())
    for name in ("collection.anki21", "collection.anki2"):
        if name in names:
            blob = zf.read(name)
            if "collection.anki21b" in names and name == "collection.anki2":
                # Newer Anki puts a stub "please update" note in the legacy file.
                break
            return blob
    if "collection.anki21b" in names:
        try:
            import zstandard  # type: ignore[import-not-found]  # noqa: PLC0415
        except ImportError as exc:
            raise ImportError_(
                "This deck uses the newest Anki format. In Anki, export again with "
                '"Support older Anki versions" ticked, or export "Notes in Plain Text".'
            ) from exc
        raw = zf.read("collection.anki21b")
        out = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(raw)).read(MAX_UNZIPPED + 1)
        if len(out) > MAX_UNZIPPED:
            raise ImportError_("This deck expands to more than 64 MB. Export a smaller deck.")
        return out
    raise ImportError_("No Anki collection found inside this package.")


def parse_apkg(data: bytes) -> list[dict[str, Any]]:
    zf = _open_zip(data)
    blob = _collection_blob(zf)
    if not blob.startswith(b"SQLite format 3\x00"):
        raise ImportError_("The Anki collection inside this package could not be read.")
    conn = _open_sqlite(blob)
    try:
        _require_notes_table(conn)
        try:
            # ORDER BY is kept: notes is a real table and the progress handler
            # caps the work.
            rows = conn.execute("SELECT flds, tags FROM notes ORDER BY id").fetchmany(MAX_CARDS + 1)
        except sqlite3.OperationalError as exc:
            if "interrupt" in str(exc).lower():
                raise ImportError_(TOO_SLOW) from exc
            raise ImportError_("The Anki collection inside this package could not be read.") from exc
        except sqlite3.Error as exc:
            raise ImportError_("The Anki collection inside this package could not be read.") from exc
    finally:
        _close_sqlite(conn)
    if len(rows) > MAX_CARDS:
        raise ImportError_(f"This deck has more than {MAX_CARDS:,} notes. Split it first.")

    cards: list[dict[str, Any]] = []
    for flds, tags in rows:
        fields = str(flds or "").split("\x1f", 2)
        # Clip before the cloze regex; html_to_text clips again.
        first = fields[0][:MAX_FIELD] if fields else ""
        second = fields[1][:MAX_FIELD] if len(fields) > 1 else ""
        if _RE_CLOZE.search(first):
            f_html, b_html = _cloze_pair(first)
            front, back = html_to_text(f_html), html_to_text(b_html)
            extra = html_to_text(second)
            if extra:
                back = f"{back}\n{extra}"
        else:
            front, back = html_to_text(first), html_to_text(second)
        card = _card(front, back, str(tags or "").split())
        if card:
            cards.append(card)
    return cards


# ── .xlsx ──────────────────────────────────────────────────────────────────

_FRONT_NAMES = {"front", "question", "term", "prompt", "q", "side 1", "word"}
_BACK_NAMES = {"back", "answer", "definition", "a", "side 2", "meaning"}
_TAG_NAMES = {"tags", "tag"}


def _cell(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def parse_xlsx(data: bytes) -> list[dict[str, Any]]:
    _open_zip(data)  # size guard before openpyxl expands it
    try:
        from openpyxl import load_workbook  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - listed in requirements.txt
        raise ImportError_("Spreadsheet import is not available on this server.") from exc
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 - openpyxl raises many types on bad input
        raise ImportError_("This spreadsheet could not be read.") from exc
    try:
        ws = wb.worksheets[0] if wb.worksheets else None
        if ws is None:
            return []
        # A forged <dimension ref="A1:XFD200000"/> would pad every row to
        # 16,384 cells; forget it and read only the first XLSX_MAX_COL columns.
        try:
            ws.reset_dimensions()
        except AttributeError:  # pragma: no cover - not a read-only sheet
            pass
        rows: list[list[str]] = []
        empty_run = 0
        for scanned, r in enumerate(ws.iter_rows(max_col=XLSX_MAX_COL, values_only=True), start=1):
            cells = [_cell(v) for v in r]
            if any(c.strip() for c in cells):
                rows.append([c[:MAX_FIELD] for c in cells])
                empty_run = 0
            else:
                empty_run += 1
                if empty_run >= XLSX_MAX_EMPTY_RUN:
                    break  # a long gap ends the sheet
            if len(rows) > MAX_CARDS + 1:
                raise ImportError_(f"This sheet has more than {MAX_CARDS:,} rows. Split it first.")
            if scanned >= XLSX_MAX_SCAN_ROWS:
                break
    finally:
        wb.close()
    if not rows:
        return []

    front_i, back_i, tags_i = 0, 1, -1
    head = [c.strip().lower() for c in rows[0]]
    if any(h in _FRONT_NAMES for h in head) and any(h in _BACK_NAMES for h in head):
        front_i = next(i for i, h in enumerate(head) if h in _FRONT_NAMES)
        back_i = next(i for i, h in enumerate(head) if h in _BACK_NAMES)
        tags_i = next((i for i, h in enumerate(head) if h in _TAG_NAMES), -1)
        rows = rows[1:]

    cards: list[dict[str, Any]] = []
    for r in rows:
        def get(i: int) -> str:
            return r[i] if 0 <= i < len(r) else ""
        front, back = get(front_i), get(back_i)
        front = html_to_text(front) if "<" in front else front
        back = html_to_text(back) if "<" in back else back
        card = _card(front, back, get(tags_i).split() if tags_i >= 0 else [])
        if card:
            cards.append(card)
    return cards


# ── Entry point ────────────────────────────────────────────────────────────

def parse_upload(filename: str, data: bytes) -> list[dict[str, Any]]:
    """Cards from an uploaded file. Raises ImportError_ with a user-facing reason."""
    ext = os.path.splitext(filename or "")[1].lower()
    if not data:
        raise ImportError_("The file is empty.")
    if ext in (".apkg", ".colpkg"):
        return parse_apkg(data)
    if ext == ".xlsx":
        return parse_xlsx(data)
    raise ImportError_("Upload an .apkg or .xlsx file. CSV, TSV and text files are read in the browser.")


# ── Isolated entry point (used by the API route) ───────────────────────────

_PARSER_SLOTS = threading.BoundedSemaphore(MAX_PARSERS)


def _parse_child(conn: Any, filename: str, data: bytes) -> None:
    """Runs in the child process. Module-level so the spawn start method can import it."""
    try:
        try:
            result: tuple[str, Any] = ("ok", parse_upload(filename, data))
        except ImportError_ as exc:
            result = ("err", str(exc))
        except Exception:  # noqa: BLE001 - any crash is a file we can't read
            result = ("err", "This file could not be read.")
        conn.send(result)
    finally:
        conn.close()


def parse_upload_isolated(
    filename: str,
    data: bytes,
    timeout: float = PARSE_TIMEOUT_S,
    _target: Any = None,
) -> list[dict[str, Any]]:
    """parse_upload in a separate process, killed after ``timeout`` seconds.

    Blocking: call it from a worker thread (that thread only waits on a pipe,
    so it does not hold the GIL). ``_target`` lets tests swap the child function.
    Raises ImportError_ with a user-facing reason, including on timeout.
    """
    started = time.monotonic()
    if not _PARSER_SLOTS.acquire(timeout=timeout):
        raise ImportError_("The importer is busy. Try again in a minute.")
    try:
        ctx = multiprocessing.get_context("spawn")
        recv_end, send_end = ctx.Pipe(duplex=False)
        proc = ctx.Process(
            target=_target or _parse_child,
            args=(send_end, filename, data),
            daemon=True,
        )
        proc.start()
        send_end.close()  # the child holds its own copy
        answered = False
        try:
            remaining = max(0.1, timeout - (time.monotonic() - started))
            if not recv_end.poll(remaining):
                raise ImportError_(TOO_SLOW)
            try:
                status, payload = recv_end.recv()
                answered = True
            except (EOFError, OSError) as exc:  # child died without answering
                raise ImportError_("This file could not be read.") from exc
        finally:
            recv_end.close()
            proc.join(2 if answered else 0)
            if proc.is_alive():
                proc.kill()
                proc.join(5)
    finally:
        _PARSER_SLOTS.release()
    if status != "ok":
        raise ImportError_(str(payload))
    return payload
