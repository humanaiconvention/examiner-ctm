"""
Real Search API Implementation for Phase 4.0 Search-Augmented Reasoning

Supports multiple search providers:
1. DuckDuckGo (free, no API key required)
2. Brave Search (requires API key)
3. SearXNG (self-hosted or public instances)

Usage:
    search = RealSearchProvider()
    results = search.search("quantum entanglement", domain="PHYSIS")
    context = search.format_as_context(results)
"""

import requests
import os
from typing import List, Dict, Optional
from urllib.parse import quote
import json


class SearchResult:
    """Structured search result"""
    def __init__(self, title: str, url: str, snippet: str, source: str):
        self.title = title
        self.url = url
        self.snippet = snippet
        self.source = source

    def __repr__(self):
        return f"SearchResult(title='{self.title}', source='{self.source}')"


class RealSearchProvider:
    """
    Production-grade search provider with multiple backends.
    Fallback chain: Brave → DuckDuckGo → SearXNG
    """

    def __init__(self, provider: str = "auto"):
        """
        Args:
            provider: "auto" (try all), "brave", "duckduckgo", "searxng"
        """
        self.provider = provider
        self.brave_api_key = os.environ.get("BRAVE_SEARCH_API_KEY", "")
        self.searxng_instances = [
            "https://searx.be", 
            "https://searx.online", 
            "https://searx.work",
            "https://priv.au"
        ]
        self.searxng_url = os.environ.get("SEARXNG_URL", self.searxng_instances[0])
        self.cache = {}
        self.request_count = 0

    def search(self, query: str, domain: str = "LOGOS", max_results: int = 5) -> List[SearchResult]:
        """
        Execute search query with domain-aware result filtering.

        Args:
            query: Search query
            domain: Pillar domain for source filtering (LOGOS, PHYSIS, etc.)
            max_results: Maximum number of results to return

        Returns:
            List of SearchResult objects
        """
        cache_key = f"{query}:{domain}:{max_results}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        results = []

        if self.provider in ["auto", "brave"] and self.brave_api_key:
            try:
                results = self._search_brave(query, max_results)
                self.cache[cache_key] = results
                return results
            except Exception as e:
                print(f"  [Brave Search] Failed: {e}. Falling back...")

        if self.provider in ["auto", "duckduckgo"]:
            try:
                results = self._search_duckduckgo(query, max_results)
                self.cache[cache_key] = results
                return results
            except Exception as e:
                print(f"  [DuckDuckGo] Failed: {e}. Falling back...")

        if self.provider in ["auto", "searxng"]:
            try:
                results = self._search_searxng(query, max_results)
                if results:
                    self.cache[cache_key] = results
                    return results
            except Exception as e:
                print(f"  [SearXNG] Failed: {e}.")

        # Final Fallback: Synthetic results to prevent training stall
        print(f"  [Search] Web unavailable. Using synthetic {domain} grounding.")
        return self._search_synthetic(query, domain, max_results)

    def _search_synthetic(self, query: str, domain: str, max_results: int) -> List[SearchResult]:
        """Generate common-knowledge synthetic results for grounding."""
        return [
            SearchResult(
                title=f"Heuristic Grounding: {domain}",
                url="heuristic://local",
                snippet=f"Synthetic knowledge trace for '{query}'. Reasoning derived from {domain} axioms and foundational consilience principles.",
                source="heuristic"
            )
        ]

    def _search_brave(self, query: str, max_results: int) -> List[SearchResult]:
        """
        Query Brave Search API.
        Requires BRAVE_SEARCH_API_KEY environment variable.
        Free tier: 2,000 queries/month
        """
        if not self.brave_api_key:
            raise ValueError("BRAVE_SEARCH_API_KEY not set")

        url = "https://api.search.brave.com/res/v1/web/search"
        headers = {"Accept": "application/json", "X-Subscription-Token": self.brave_api_key}
        params = {"q": query, "count": max_results}

        resp = requests.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()

        data = resp.json()
        results = []

        for item in data.get("web", [])[:max_results]:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    source="brave"
                )
            )

        self.request_count += 1
        return results

    def _search_duckduckgo(self, query: str, max_results: int) -> List[SearchResult]:
        """
        Query DuckDuckGo (no API key required).
        Uses unofficial JSON endpoint (may change).
        Rate limit: Reasonable (10-20 req/min recommended)
        """
        results = []
        try:
            # Try the new ddgs library first, then the legacy one
            try:
                from ddgs import DDGS
            except ImportError:
                import duckduckgo_search
                from duckduckgo_search import DDGS
            
            ddg = DDGS()
            raw_results = ddg.text(query, max_results=max_results)

            if raw_results:
                for item in raw_results[:max_results]:
                    results.append(
                        SearchResult(
                            title=item.get("title", ""),
                            url=item.get("href", ""),
                            snippet=item.get("body", ""),
                            source="duckduckgo"
                        )
                    )
            
            self.request_count += 1
            return results
        except Exception as e:
            # DuckDuckGo may rate limit, try fallback
            print(f"    DuckDuckGo rate limited or unavailable: {e}")
            raise

        self.request_count += 1
        return results

    def _search_searxng(self, query: str, max_results: int) -> List[SearchResult]:
        """
        Query SearXNG instance (self-hosted or public).
        Completely anonymous, no rate limits enforced by default.
        """
        # Try primary URL first, then fall back to list
        urls_to_try = [self.searxng_url] + [u for u in self.searxng_instances if u != self.searxng_url]
        
        last_error = None
        for url in urls_to_try:
            try:
                search_url = f"{url}/search"
                params = {
                    "q": query,
                    "format": "json",
                    "pageno": 1,
                    "limit": max_results,
                }

                resp = requests.get(search_url, params=params, timeout=10)
                resp.raise_for_status()

                data = resp.json()
                results = []

                for item in data.get("results", [])[:max_results]:
                    results.append(
                        SearchResult(
                            title=item.get("title", ""),
                            url=item.get("url", ""),
                            snippet=item.get("content", ""),
                            source=f"searxng ({url.split('//')[-1]})"
                        )
                    )

                if results:
                    self.request_count += 1
                    return results
            except Exception as e:
                print(f"    SearXNG instance {url} failed: {e}")
                last_error = e
                continue
        
        if last_error:
            raise last_error
        return []

    def format_as_context(self, results: List[SearchResult], max_length: int = 500) -> str:
        """
        Format search results as XML context block for training.

        Returns:
            <context>...</context> block ready for VerifiableReward
        """
        if not results:
            return ""

        snippets = []
        total_length = 0

        for result in results:
            # Include title + snippet, truncate to fit max_length
            entry = f"{result.title}: {result.snippet}"
            if total_length + len(entry) > max_length:
                break
            snippets.append(entry)
            total_length += len(entry)

        context_text = " | ".join(snippets)
        return f"<context>{context_text}</context>"

    def format_with_source_links(self, results: List[SearchResult]) -> str:
        """
        Format with clickable links (for logging/display).
        """
        if not results:
            return ""

        lines = ["### Search Results\n"]
        for i, result in enumerate(results, 1):
            lines.append(f"{i}. [{result.title}]({result.url})")
            lines.append(f"   {result.snippet}\n")

        return "\n".join(lines)

    def domain_specific_search(self, query: str, domain: str, max_results: int = 5) -> List[SearchResult]:
        """
        Route search query through domain-specific filters.

        Args:
            query: Search query
            domain: Pillar domain for source filtering
            max_results: Maximum number of results to return

        Domain → Preferred Sources:
        - LOGOS: arxiv.org, mathoverflow.net, academic papers
        - PHYSIS: nature.com, sciencedirect.com, physics journals
        - BIOS: pubmed.ncbi.nlm.nih.gov, biology journals
        - NOMOS: legal databases, law reviews
        - PSYCHE: psychology journals, APA database
        - SOPHIA: philosophy journals, Stanford Encyclopedia
        - OIKOS: economics journals, financial data
        """
        domain_filters = {
            "LOGOS": ["site:arxiv.org", "site:mathoverflow.net", "site:scholar.google.com"],
            "PHYSIS": ["site:nature.com", "site:sciencedirect.com", "site:journals.aps.org"],
            "BIOS": ["site:pubmed.ncbi.nlm.nih.gov", "site:journals.plos.org"],
            "NOMOS": ["site:ssrn.com", "site:legal-database.org", "site:justia.com"],
            "PSYCHE": ["site:apa.org", "site:psychologytoday.com", "site:scholar.google.com"],
            "SOPHIA": ["site:plato.stanford.edu", "site:philosophy-journal.org"],
            "OIKOS": ["site:worldbank.org", "site:imf.org", "site:bloomberg.com"],
        }

        filters = domain_filters.get(domain, [])
        filtered_query = query
        if filters:
            filtered_query = f"{query} {filters[0]}"

        return self.search(filtered_query, domain, max_results=max_results)

    def get_stats(self) -> Dict:
        """Return usage statistics"""
        return {
            "total_requests": self.request_count,
            "cache_size": len(self.cache),
            "provider": self.provider,
            "brave_available": bool(self.brave_api_key),
        }


# Integration wrapper for SearchInterface
def get_real_search_provider(provider: str = "auto") -> RealSearchProvider:
    """Factory function for creating search provider"""
    return RealSearchProvider(provider=provider)


if __name__ == "__main__":
    # Test the search provider
    print("Testing RealSearchProvider...\n")

    provider = RealSearchProvider(provider="auto")

    # Test 1: Basic search
    print("[Test 1] Basic search (LOGOS)")
    results = provider.search("quantum entanglement", domain="LOGOS", max_results=3)
    for result in results:
        print(f"  - {result.title}")
        print(f"    URL: {result.url}")
        print(f"    Source: {result.source}\n")

    # Test 2: Context formatting
    print("\n[Test 2] Context formatting")
    context = provider.format_as_context(results)
    print(context)

    # Test 3: Domain-specific search
    print("\n[Test 3] Domain-specific search (PHYSIS)")
    physics_results = provider.domain_specific_search("gravitational waves", "PHYSIS")
    for result in physics_results[:2]:
        print(f"  - {result.title}")

    # Test 4: Statistics
    print("\n[Test 4] Provider statistics")
    stats = provider.get_stats()
    print(f"  Total requests: {stats['total_requests']}")
    print(f"  Cache size: {stats['cache_size']}")
    print(f"  Provider: {stats['provider']}")
    print(f"  Brave available: {stats['brave_available']}")
