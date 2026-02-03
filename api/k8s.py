"""
Kubernetes async client wrapper.
Provides typed, async access to K8s API without subprocess overhead.
"""
from typing import Optional, List, Dict, Any
from kubernetes_asyncio import client, config
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.exceptions import ApiException
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

# Global client - initialized on first use
_api_client: Optional[ApiClient] = None


async def get_client() -> ApiClient:
    """Get or create the shared API client."""
    global _api_client
    if _api_client is None:
        try:
            # Try in-cluster config first (when running in K8s)
            config.load_incluster_config()
        except config.ConfigException:
            # Fall back to kubeconfig (local development)
            await config.load_kube_config()
        _api_client = ApiClient()
    return _api_client


async def close_client():
    """Close the API client (call on shutdown)."""
    global _api_client
    if _api_client:
        await _api_client.close()
        _api_client = None


def handle_api_exception(e: ApiException, resource: str = "resource") -> None:
    """Convert K8s API exceptions to FastAPI HTTPExceptions."""
    if e.status == 404:
        raise HTTPException(status_code=404, detail=f"{resource} not found")
    elif e.status == 409:
        raise HTTPException(status_code=409, detail=f"{resource} conflict: {e.reason}")
    else:
        logger.error(f"K8s API error: {e.status} {e.reason}")
        raise HTTPException(status_code=500, detail=f"Kubernetes error: {e.reason}")
