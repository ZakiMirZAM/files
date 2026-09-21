"""Every module-level cache in the three analysis packages is registered.

``POST /api/cache/clear`` clears whatever ``side_caches`` knows about, so a
cache that forgets to register keeps serving stale numbers for its whole
TTL. This walks ``connections/``, ``industry_structure/`` and
``company_profile/``, finds the module-level cache objects, and fails
naming any module that owns one without registering a clear.
"""

from __future__ import annotations

import importlib
import os
import pkgutil
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import side_caches
from connections._ttl_cache import TtlLruCache

PACKAGES = ("connections", "industry_structure", "company_profile")


def _module_names() -> list[str]:
    names: list[str] = []
    for pkg_name in PACKAGES:
        pkg = importlib.import_module(pkg_name)
        for info in pkgutil.iter_modules(pkg.__path__):
            if info.name.startswith("test_") or info.name == "conftest":
                continue
            names.append(f"{pkg_name}.{info.name}")
    return names


def _looks_like_a_cache(name: str, value: object) -> bool:
    if isinstance(value, TtlLruCache):
        return True
    # ranks.py keeps a plain {key: (value, timestamp)} dict.
    return isinstance(value, dict) and (
        name.startswith("_cache") or name.endswith("_cache")
    )


def _modules_owning_a_cache() -> set[str]:
    owners: set[str] = set()
    for mod_name in _module_names():
        try:
            mod = importlib.import_module(mod_name)
        except Exception:  # noqa: BLE001 — a module we cannot import owns nothing
            continue
        for attr, value in vars(mod).items():
            if attr.startswith("__"):
                continue
            if _looks_like_a_cache(attr, value):
                owners.add(mod_name)
                break
    return owners


def test_every_module_level_cache_is_registered():
    side_caches.load_cache_modules()
    owners = _modules_owning_a_cache()
    assert owners, "the walk found no caches at all; the detector is broken"
    missing = owners - side_caches.registered_names()
    assert not missing, (
        "these modules own a module-level cache but never call "
        f"register_side_cache: {sorted(missing)}"
    )


def test_the_three_known_owners_are_present():
    side_caches.load_cache_modules()
    assert {
        "connections.sector_cache",
        "connections.economy",
        "industry_structure.ranks",
    } <= side_caches.registered_names()


def test_clear_runs_only_the_matching_prefixes():
    side_caches.load_cache_modules()
    assert side_caches.clear_side_caches("econ") == ["connections.economy"]
    assert set(side_caches.clear_side_caches("")) == {
        "connections.sector_cache",
        "connections.economy",
        "industry_structure.ranks",
    }
    # A prefix nothing registered for clears nothing, and does not raise.
    assert side_caches.clear_side_caches("fx") == []


def test_a_failing_clear_does_not_stop_the_others():
    def boom() -> None:
        raise RuntimeError("no")

    side_caches.register_side_cache(("db",), boom, name="test.boom")
    try:
        cleared = side_caches.clear_side_caches("db")
        assert "test.boom" not in cleared
        assert "industry_structure.ranks" in cleared
    finally:
        side_caches.register_side_cache(
            ("db",), lambda: None, name="test.boom",
        )


def test_registering_the_same_name_twice_replaces_it():
    calls: list[int] = []
    side_caches.register_side_cache(("db",), lambda: calls.append(1), name="test.dup")
    side_caches.register_side_cache(("db",), lambda: calls.append(2), name="test.dup")
    side_caches.clear_side_caches("db")
    assert calls == [2]


@pytest.fixture(autouse=True)
def _drop_test_registrations():
    yield
    with side_caches._lock:  # noqa: SLF001 — the test owns its own entries
        side_caches._registry[:] = [
            e for e in side_caches._registry if not e[2].startswith("test.")
        ]
