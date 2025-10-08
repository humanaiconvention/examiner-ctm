"""Hybrid pipeline orchestrating local preprocessing and Azure calls."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from .azure_client import AzureClient
from .cache import HybridCache
from .local_preprocess import LocalProcessor

LOGGER = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Result object returned from :class:`HybridPipeline`."""

    deployment: str
    output_text: str
    summaries: List[str]
    embeddings: List[List[float]]
    cached: bool
    usage: Dict[str, int]


class HybridPipeline:
    """Coordinate local preprocessing, caching, and Azure inference."""

    def __init__(
        self,
        local: Optional[LocalProcessor] = None,
        cache: Optional[HybridCache] = None,
        azure: Optional[AzureClient] = None,
    ) -> None:
        self.local = local or LocalProcessor()
        self.cache = cache or HybridCache()
        self.azure = azure or AzureClient()

    # ------------------------------------------------------------------
    async def run(
        self,
        text: str,
        *,
        deployment: str,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> PipelineResult:
        summaries, embeddings = await self.local.summarize_and_embed(text)
        if not summaries:
            summaries = [text[:512]] if text else [""]
        cache_key = self.cache.make_key(deployment, summaries[0][:64])
        cached = await self.cache.aget_response(cache_key)
        if cached:
            LOGGER.info("Cache hit for deployment %s", deployment)
            return PipelineResult(
                deployment=deployment,
                output_text=cached.content,
                summaries=summaries,
                embeddings=embeddings,
                cached=True,
                usage={
                    "prompt_tokens": cached.prompt_tokens,
                    "completion_tokens": cached.completion_tokens,
                },
            )
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if user_prompt:
            user_content = (
                f"Summary:\n{summaries[0]}\n\nOriginal:\n{text[:1000]}"
            )
        else:
            user_content = text or summaries[0]
        messages.append(
            {"role": "user", "content": user_prompt or user_content}
        )
        response = await self.azure.chat_completion(
            deployment,
            messages=messages,
            temperature=temperature,
            top_p=top_p,
        )
        usage = response.get("usage", {})
        await self.cache.asave_response(
            cache_key,
            deployment=deployment,
            content=response["text"],
            metadata={"messages": messages},
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
        )
        return PipelineResult(
            deployment=deployment,
            output_text=response["text"],
            summaries=summaries,
            embeddings=embeddings,
            cached=False,
            usage={
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
            },
        )

    # ------------------------------------------------------------------
    async def batch_run(
        self,
        items: Iterable[str],
        *,
        deployment: str,
        concurrency: int = 2,
    ) -> List[PipelineResult]:
        semaphore = asyncio.Semaphore(concurrency)
        results: List[PipelineResult] = []

        async def _worker(text: str) -> None:
            async with semaphore:
                result = await self.run(text, deployment=deployment)
                results.append(result)

        await asyncio.gather(*[_worker(text) for text in items])
        return results


def build_default_pipeline() -> HybridPipeline:
    return HybridPipeline()
