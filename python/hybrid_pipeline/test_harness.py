"""Connectivity test harness for Azure deployments."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict

from .azure_client import AzureClient

LOGGER = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


async def ping_deployment(client: AzureClient, name: str) -> Dict[str, object]:
    start = time.perf_counter()
    try:
        response = await client.chat_completion(
            name,
            messages=[
                {"role": "system", "content": "You are a ping diagnostic."},
                {"role": "user", "content": "Reply with a single sentence."},
            ],
            max_output_tokens=64,
        )
        elapsed = time.perf_counter() - start
        usage = response.get("usage", {})
        LOGGER.info(
            "Deployment %s responded in %.2fs | tokens: %s",
            name,
            elapsed,
            usage,
        )
        print(
            f"{name}: {response['text'][:120]} (elapsed {elapsed:.2f}s, usage {usage})"
        )
        return {
            "deployment": name,
            "success": True,
            "elapsed": elapsed,
            "usage": usage,
        }
    except Exception as exc:  # pragma: no cover - diagnostics
        elapsed = time.perf_counter() - start
        LOGGER.exception("Deployment %s failed after %.2fs", name, elapsed)
        return {
            "deployment": name,
            "success": False,
            "elapsed": elapsed,
            "error": str(exc),
        }


async def main() -> None:
    client = AzureClient()
    tasks = [
        ping_deployment(client, name) for name in client.list_deployments()
    ]
    results = await asyncio.gather(*tasks)
    print("\nSummary:")
    for result in results:
        print(result)
    await client.close()


if __name__ == "__main__":
    asyncio.run(main())
