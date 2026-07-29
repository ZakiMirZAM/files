"""Report (and optionally delete) books imported into the vault more than once.

The same book arrived under two directory names that differ only in punctuation or
in how far the title was truncated:

    The Little Book That Builds Wealth_ The Knockout Formula for -- Pat
    The_Little_Book_That_Builds_Wealth_The_Knockout_Formula_for_Pat

Retrieval already folds these (books.fold), so a duplicate can no longer take two
of the six passage slots in one answer. Removing the redundant directories is a
separate, optional cleanup that shrinks the index and the re-embed time.

    python find_duplicate_books.py                 # report only (default)
    python find_duplicate_books.py --delete        # move the redundant copies to a
                                                   # timestamped folder, NOT rm -rf

Nothing is deleted without --delete, and even then the directories are MOVED to a
quarantine folder beside the vault, so the action is reversible.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from datetime import datetime

from books import book_id, display_title, fold

VAULT = os.environ.get("VAULT_PATH", r"C:\Users\Zaki_Mir\Desktop\Financial Texts")


def note_count(path: str) -> int:
    return sum(1 for _root, _dirs, files in os.walk(path) for f in files if f.endswith(".md"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true",
                    help="move redundant copies into a quarantine folder beside the vault")
    args = ap.parse_args()

    books_root = os.path.join(VAULT, "Books")
    if not os.path.isdir(books_root):
        print(f"No Books directory under {VAULT}")
        return 1

    dirs = [d for d in os.listdir(books_root) if os.path.isdir(os.path.join(books_root, d))]
    canon = fold(book_id(d) for d in dirs)
    groups: dict[str, list[str]] = {}
    for d in dirs:
        groups.setdefault(canon.get(book_id(d), book_id(d)), []).append(d)

    redundant: list[str] = []
    print(f"{len(dirs)} book directories -> {len(groups)} distinct books\n")
    for _bid, spellings in sorted(groups.items()):
        if len(spellings) < 2:
            continue
        # Keep the longest spelling: it is the one that kept the most of the title.
        counted = sorted(((d, note_count(os.path.join(books_root, d))) for d in spellings),
                         key=lambda t: (-len(t[0]), t[0]))
        keep, keep_n = counted[0]
        print(f"{display_title(keep)}")
        print(f"   KEEP   {keep}  ({keep_n} notes)")
        for d, n in counted[1:]:
            print(f"   DROP   {d}  ({n} notes)")
            redundant.append(d)
        print()

    if not redundant:
        print("No duplicate imports found.")
        return 0

    print(f"{len(redundant)} redundant directories.")
    if not args.delete:
        print("Report only. Re-run with --delete to quarantine them.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    quarantine = os.path.join(os.path.dirname(VAULT.rstrip("\\/")), f"vault-duplicates-{stamp}")
    os.makedirs(quarantine, exist_ok=True)
    for d in redundant:
        shutil.move(os.path.join(books_root, d), os.path.join(quarantine, d))
        print(f"  moved {d}")
    print(f"\nMoved {len(redundant)} directories to {quarantine}")
    print("Re-run index_vault.py --rebuild to shrink the index, or delete that folder "
          "once you are satisfied nothing was lost.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
