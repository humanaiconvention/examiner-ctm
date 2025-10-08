"""Caching utilities for hybrid local/Azure pipeline.

This module stores embeddings and Azure responses on disk so repeat
queries can reuse previous work. SQLite is used by default for its
portability and solid performance on fast NVMe SSDs. DuckDB is optional
and can be enabled by passing ``backend="duckdb"``.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

try:  # Optional dependency
    import duckdb  # type: ignore
except Exception:  # pragma: no cover - optional
    duckdb = None


@dataclass
class CachedResponse:
    """Container for cached Azure responses."""

    key: str
    deployment: str
    content: str
    metadata: Dict[str, Any]
    prompt_tokens: int
    completion_tokens: int
    created_at: float


class HybridCache:
    """Disk-backed cache for embeddings and model responses."""

    def __init__(
        self,
        db_path: Path | str = Path(".cache/hybrid_cache.sqlite3"),
        *,
        backend: str = "sqlite",
    ) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.backend = backend
        self._lock = threading.RLock()
        if backend == "duckdb":
            if duckdb is None:
                raise RuntimeError(
                    "DuckDB backend requested but package not installed"
                )
            self._conn = duckdb.connect(str(self.db_path))
            self._conn.execute("PRAGMA threads=4")
        else:
            self._conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                detect_types=sqlite3.PARSE_DECLTYPES,
            )
            with self._conn:
                self._conn.execute("PRAGMA journal_mode=WAL;")
        self._ensure_tables()

    # ------------------------------------------------------------------
    # Internal helpers
    def _ensure_tables(self) -> None:
        with self._lock:
            if self.backend == "duckdb":
                self._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS embeddings (
                        cache_key TEXT PRIMARY KEY,
                        model TEXT,
                        vector_json TEXT,
                        created_at DOUBLE
                    )
                    """
                )
                self._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS responses (
                        cache_key TEXT PRIMARY KEY,
                        deployment TEXT,
                        content TEXT,
                        metadata_json TEXT,
                        prompt_tokens INTEGER,
                        completion_tokens INTEGER,
                        created_at DOUBLE
                    )
                    """
                )
            else:
                with self._conn:  # type: ignore[call-arg]
                    self._conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS embeddings (
                            cache_key TEXT PRIMARY KEY,
                            model TEXT,
                            vector_json TEXT,
                            created_at REAL
                        )
                        """
                    )
                    self._conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS responses (
                            cache_key TEXT PRIMARY KEY,
                            deployment TEXT,
                            content TEXT,
                            metadata_json TEXT,
                            prompt_tokens INTEGER,
                            completion_tokens INTEGER,
                            created_at REAL
                        )
                        """
                    )

    # ------------------------------------------------------------------
    @staticmethod
    def make_key(*parts: str) -> str:
        """Generate a deterministic cache key from provided parts."""

        return "::".join(parts)

    # ------------------------------------------------------------------
    def get_embedding(self, key: str) -> Optional[List[float]]:
        with self._lock:
            cursor = self._conn.execute(
                "SELECT vector_json FROM embeddings WHERE cache_key = ?",
                (key,),
            )
            row = cursor.fetchone()
        if not row:
            return None
        return json.loads(row[0])

    async def aget_embedding(self, key: str) -> Optional[List[float]]:
        return await asyncio.to_thread(self.get_embedding, key)

    def save_embedding(
        self,
        key: str,
        model: str,
        vector: List[float],
    ) -> None:
        payload = json.dumps(vector)
        with self._lock:
            if self.backend == "duckdb":
                self._conn.execute(
                    "REPLACE INTO embeddings VALUES (?, ?, ?, ?)",
                    (key, model, payload, time.time()),
                )
            else:
                with self._conn:
                    self._conn.execute(
                        "REPLACE INTO embeddings VALUES (?, ?, ?, ?)",
                        (key, model, payload, time.time()),
                    )

    async def asave_embedding(
        self,
        key: str,
        model: str,
        vector: List[float],
    ) -> None:
        await asyncio.to_thread(self.save_embedding, key, model, vector)

    # ------------------------------------------------------------------
    def get_response(self, key: str) -> Optional[CachedResponse]:
        with self._lock:
            cursor = self._conn.execute(
                """
                SELECT cache_key, deployment, content, metadata_json,
                       prompt_tokens, completion_tokens, created_at
                FROM responses WHERE cache_key = ?
                """,
                (key,),
            )
            row = cursor.fetchone()
        if not row:
            return None
        metadata = json.loads(row[3]) if row[3] else {}
        return CachedResponse(
            key=row[0],
            deployment=row[1],
            content=row[2],
            metadata=metadata,
            prompt_tokens=row[4] or 0,
            completion_tokens=row[5] or 0,
            created_at=row[6] or 0.0,
        )

    async def aget_response(self, key: str) -> Optional[CachedResponse]:
        return await asyncio.to_thread(self.get_response, key)

    def save_response(
        self,
        key: str,
        *,
        deployment: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> None:
        metadata_json = json.dumps(metadata or {})
        with self._lock:
            if self.backend == "duckdb":
                self._conn.execute(
                    "REPLACE INTO responses VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        key,
                        deployment,
                        content,
                        metadata_json,
                        prompt_tokens,
                        completion_tokens,
                        time.time(),
                    ),
                )
            else:
                with self._conn:  # type: ignore[call-arg]
                    self._conn.execute(
                        "REPLACE INTO responses VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            key,
                            deployment,
                            content,
                            metadata_json,
                            prompt_tokens,
                            completion_tokens,
                            time.time(),
                        ),
                    )

    async def asave_response(
        self,
        key: str,
        *,
        deployment: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> None:
        await asyncio.to_thread(
            self.save_response,
            key,
            deployment=deployment,
            content=content,
            metadata=metadata,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    # ------------------------------------------------------------------
    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __del__(self) -> None:  # pragma: no cover - best effort cleanup
        try:
            self.close()
        except Exception:
            pass