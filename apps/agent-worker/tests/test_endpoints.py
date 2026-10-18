from collections.abc import Callable

import pytest

from sotto_worker.config.endpoints import EndpointRejected, check_endpoint

DNS: dict[str, list[str]] = {
    "api.groq.com": ["104.18.1.1"],
    "evil.example": ["169.254.169.254"],
    "rebind.example": ["8.8.8.8", "10.0.0.5"],
    "localhost": ["127.0.0.1"],
}


def resolve(host: str) -> list[str]:
    return DNS.get(host, [])


Resolver = Callable[[str], list[str]]


@pytest.mark.parametrize("url", ["https://api.groq.com/openai/v1", "https://104.18.1.1/v1"])
def test_public_https_endpoints_are_allowed_in_the_cloud(url: str) -> None:
    check_endpoint(url, deployment="cloud", resolve=resolve)


@pytest.mark.parametrize(
    ("url", "why"),
    [
        ("http://api.groq.com/v1", "https"),
        ("https://evil.example/v1", "private"),
        ("https://rebind.example/v1", "private"),
        ("https://10.1.2.3/v1", "private"),
        ("https://[::1]/v1", "private"),
        ("https://localhost:11434/v1", "private"),
        ("https://nowhere.example/v1", "resolve"),
        ("ftp://api.groq.com", "https"),
        ("https://user:pw@api.groq.com/v1", "credentials"),
    ],
)
def test_cloud_rejects_unsafe_endpoints(url: str, why: str) -> None:
    with pytest.raises(EndpointRejected, match=why):
        check_endpoint(url, deployment="cloud", resolve=resolve)


def test_local_deployment_allows_a_local_ollama() -> None:
    check_endpoint("http://localhost:11434/v1", deployment="local", resolve=resolve)
    check_endpoint("http://127.0.0.1:11434/v1", deployment="local", resolve=resolve)
