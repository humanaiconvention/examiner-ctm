"""Async Azure OpenAI client with routing for hybrid pipeline."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Dict, Iterable, Optional

from dotenv import load_dotenv
from openai import AsyncAzureOpenAI

LOGGER = logging.getLogger(__name__)

DEFAULT_DATA_API_VERSION = "2025-01-01-preview"
DEFAULT_GLOBAL_API_VERSION = "2025-04-01-preview"


@dataclass(frozen=True)
class DeploymentConfig:
    """Configuration for a named Azure deployment."""

    deployment: str
    endpoint_type: str  # "data" or "global"
    api_version: Optional[str] = None

    def resolved_api_version(self) -> str:
        if self.endpoint_type == "global":
            return self.api_version or DEFAULT_GLOBAL_API_VERSION
        return self.api_version or DEFAULT_DATA_API_VERSION


class AzureClient:
    """Route requests to Azure AI Foundry deployments based on name."""

    def __init__(
        self,
        deployments: Optional[Dict[str, DeploymentConfig]] = None,
        *,
        auto_load_env: bool = True,
    ) -> None:
        if auto_load_env:
            load_dotenv()
        key = os.getenv("AZURE_OPENAI_KEY")
        if not key:
            raise RuntimeError(
                "AZURE_OPENAI_KEY missing; set it in .env or environment"
            )
        self._endpoint_data = os.getenv("AZURE_OPENAI_ENDPOINT")
        self._endpoint_global = os.getenv("AZURE_OPENAI_GLOBAL_ENDPOINT")
        self._api_key = key
        self._deployments = deployments or self._default_deployments()
        self._clients: Dict[str, AsyncAzureOpenAI] = {}

    # ------------------------------------------------------------------
    @staticmethod
    def _default_deployments() -> Dict[str, DeploymentConfig]:
        return {
            "gpt5": DeploymentConfig("gpt-5", "data"),
            "o3": DeploymentConfig("o3", "data", "2024-12-01-preview"),
            "o3-pro": DeploymentConfig("o3-pro", "data", "2024-12-01-preview"),
            "deepresearch": DeploymentConfig("deep-research", "data"),
            "gptimage1": DeploymentConfig("gpt-image-1", "data"),
            "gpt5-codex": DeploymentConfig("gpt-5-codex", "global"),
        }

    # ------------------------------------------------------------------
    def list_deployments(self) -> Iterable[str]:
        return self._deployments.keys()

    def get_config(self, name: str) -> DeploymentConfig:
        try:
            return self._deployments[name]
        except KeyError as exc:
            raise KeyError(f"Unknown deployment '{name}'") from exc

    # ------------------------------------------------------------------
    def _get_client(
        self,
        endpoint_type: str,
        api_version: str,
    ) -> AsyncAzureOpenAI:
        cache_key = f"{endpoint_type}:{api_version}"
        if cache_key in self._clients:
            return self._clients[cache_key]
        if endpoint_type == "global":
            endpoint = self._endpoint_global
        else:
            endpoint = self._endpoint_data
        if not endpoint:
            raise RuntimeError(
                f"Endpoint for type '{endpoint_type}' not configured in"
                " environment"
            )
        client = AsyncAzureOpenAI(
            api_key=self._api_key,
            api_version=api_version,
            azure_endpoint=endpoint,
            timeout=60,
        )
        self._clients[cache_key] = client
        return client

    # ------------------------------------------------------------------
    async def chat_completion(
        self,
        deployment_name: str,
        *,
        messages: Iterable[Dict[str, str]],
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_output_tokens: int = 512,
        extra: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        config = self.get_config(deployment_name)
        api_version = config.resolved_api_version()
        client = self._get_client(config.endpoint_type, api_version)
        payload = {
            "model": config.deployment,
            "messages": list(messages),
            "temperature": temperature,
            "top_p": top_p,
            "max_output_tokens": max_output_tokens,
        }
        if extra:
            payload.update(extra)
        LOGGER.debug(
            "Azure request %s: %s",
            deployment_name,
            json.dumps(payload)[:2000],
        )
        response = await client.responses.create(**payload)
        usage = getattr(response, "usage", None)
        text = ""
        if response.output and response.output[0].content:
            first = response.output[0].content[0]
            text = getattr(first, "text", "")
        return {
            "text": text,
            "raw": response.model_dump(),
            "usage": usage.model_dump() if usage else {},
        }

    # ------------------------------------------------------------------
    async def close(self) -> None:
        await asyncio.gather(
            *[client.close() for client in self._clients.values()],
            return_exceptions=True,
        )