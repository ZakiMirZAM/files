"""Evaluation harness for the RAG answer-verification layer.

Phase 0-2 of the RARR plan: extract checkable atoms from an answer, grade them
against the app's own deterministic engines, and measure the baseline error rate
BEFORE any verifier exists. Nothing in this package runs in the request path.
"""
