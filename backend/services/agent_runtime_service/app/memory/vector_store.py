"""Memoria semantica minima en fase 1: backed by in-memory dict.

CrewAI ya integra ChromaDB internamente cuando se habilita memory=True en el Crew.
Aqui exponemos una capa simple para guardar contexto que el orchestrator puede
consultar sin levantar ChromaDB explicito. Fase 2 puede reemplazar por Chroma.
"""
from __future__ import annotations

from collections import defaultdict


class InMemoryVectorStore:
    def __init__(self) -> None:
        self._docs: dict[str, list[str]] = defaultdict(list)

    def save(self, namespace: str, content: str) -> None:
        self._docs[namespace].append(content)

    def search(self, namespace: str, query: str, top_k: int = 5) -> list[str]:
        docs = self._docs.get(namespace, [])
        query_lower = query.lower()
        scored = sorted(
            docs,
            key=lambda d: sum(1 for word in query_lower.split() if word in d.lower()),
            reverse=True,
        )
        return scored[:top_k]


store = InMemoryVectorStore()
