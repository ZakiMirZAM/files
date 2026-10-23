"""Relationship map (Head to Head step 2).

Ask AI builds one map per company from a FIXED question (``prompt.py``); the
answer's last json block is validated (``parse.py``) and saved as structured
data (``store.py``) so every reader sees the same map. ``build.py`` runs the
one build allowed at a time on a background thread.
"""
