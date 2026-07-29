def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "live: needs the real vault.db and a running Ollama; skipped when either is absent",
    )
