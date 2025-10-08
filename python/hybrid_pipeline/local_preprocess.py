"""Local preprocessing utilities leveraging lightweight LLMs and embeddings.

The module aims to operate entirely on the user's workstation. Summaries are
created with a small model (Phi-3 or similar) through Hugging Face Transformers
or an Ollama server if available. Embeddings use sentence-transformers to avoid
remote calls and respect data locality constraints.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, List, Optional

import numpy as np

try:
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import torch
except Exception:  # pragma: no cover - optional dependency
    AutoModelForCausalLM = None  # type: ignore
    AutoTokenizer = None  # type: ignore
    torch = None  # type: ignore

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - optional
    SentenceTransformer = None  # type: ignore

try:
    import ollama
except Exception:  # pragma: no cover - optional
    ollama = None

LOGGER = logging.getLogger(__name__)


@dataclass
class LocalProcessorConfig:
    """Configuration values for :class:`LocalProcessor`."""

    llm_model: str = "phi3"
    embedding_model: str = "all-MiniLM-L6-v2"
    chunk_size: int = 512
    chunk_overlap: int = 64
    use_ollama: bool = False


class LocalProcessor:
    """Handle chunking, summarization, and embedding generation locally."""

    def __init__(self, config: Optional[LocalProcessorConfig] = None) -> None:
        self.config = config or LocalProcessorConfig()

    # ------------------------------------------------------------------
    def chunk_text(self, text: str) -> List[str]:
        tokens = text.split()
        chunk_size = self.config.chunk_size
        overlap = self.config.chunk_overlap
        chunks = []
        start = 0
        while start < len(tokens):
            end = min(len(tokens), start + chunk_size)
            chunk = " ".join(tokens[start:end])
            chunks.append(chunk)
            if end == len(tokens):
                break
            start = max(end - overlap, start + 1)
        return chunks

    # ------------------------------------------------------------------
    async def summarize(self, text: str) -> str:
        if self.config.use_ollama and ollama is not None:
            return await asyncio.to_thread(self._summarize_ollama, text)
        if AutoModelForCausalLM is not None and torch is not None:
            return await asyncio.to_thread(self._summarize_transformers, text)
        LOGGER.warning(
            "No local summarizer available; returning truncated text"
        )
        return text[:512]

    def _summarize_ollama(self, text: str) -> str:
        response = ollama.generate(  # type: ignore
            model=self.config.llm_model,
            prompt=f"Summarize:\n{text}",
        )
        return response.get("response", "")

    @lru_cache(maxsize=1)
    def _load_local_model(self):  # type: ignore[override]
        tokenizer = AutoTokenizer.from_pretrained(self.config.llm_model)
        model = AutoModelForCausalLM.from_pretrained(self.config.llm_model)
        if torch.cuda.is_available():
            model = model.to("cuda")
        model.eval()
        return tokenizer, model

    def _summarize_transformers(self, text: str) -> str:
        tokenizer, model = self._load_local_model()
        inputs = tokenizer(text, return_tensors="pt", truncation=True)
        if torch.cuda.is_available():
            inputs = {k: v.to("cuda") for k, v in inputs.items()}
        summary_ids = model.generate(**inputs, max_new_tokens=128)
        output = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        return output

    # ------------------------------------------------------------------
    async def embed(self, documents: Iterable[str]) -> List[List[float]]:
        model = await asyncio.to_thread(self._load_embedding_model)
        return await asyncio.to_thread(
            lambda: model.encode(list(documents)).tolist()
        )

    @lru_cache(maxsize=1)
    def _load_embedding_model(self):  # type: ignore[override]
        if SentenceTransformer is None:
            raise RuntimeError(
                "sentence-transformers package not installed; cannot generate"
                " embeddings"
            )
        return SentenceTransformer(self.config.embedding_model)

    # ------------------------------------------------------------------
    async def summarize_chunks(self, chunks: Iterable[str]) -> List[str]:
        tasks = [self.summarize(chunk) for chunk in chunks]
        return await asyncio.gather(*tasks)

    async def summarize_and_embed(self, text: str):
        chunks = self.chunk_text(text)
        summaries = await self.summarize_chunks(chunks)
        embeddings = await self.embed(summaries)
        return summaries, embeddings

    # ------------------------------------------------------------------
    @staticmethod
    def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        a = np.array(vec_a)
        b = np.array(vec_b)
        if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
            return 0.0
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))