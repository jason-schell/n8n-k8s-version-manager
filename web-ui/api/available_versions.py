import requests
from fastapi import APIRouter
from datetime import datetime, timedelta
from typing import List, Dict

router = APIRouter(prefix="/api", tags=["versions"])

# Simple in-memory cache (5 minute TTL)
_cache: Dict[str, any] = {"versions": [], "expires": None}

@router.get("/versions/available")
async def get_available_versions():
    """Fetch recent n8n releases from GitHub API."""
    now = datetime.utcnow()

    # Return cache if fresh
    if _cache["expires"] and now < _cache["expires"]:
        return {"versions": _cache["versions"]}

    try:
        # Fetch from GitHub
        response = requests.get(
            "https://api.github.com/repos/n8n-io/n8n/releases",
            headers={"Accept": "application/vnd.github+json"},
            timeout=5
        )

        if response.status_code == 200:
            releases = response.json()
            # Extract tag_name, strip 'n8n@' prefix and 'v' prefix
            versions = [
                r["tag_name"].replace("n8n@", "").replace("v", "")
                for r in releases[:20]  # Top 20 releases
                if not r.get("draft", False) and not r.get("prerelease", False)
            ]

            # Update cache
            _cache["versions"] = versions
            _cache["expires"] = now + timedelta(minutes=5)

            return {"versions": versions}
    except Exception as e:
        # Log error but don't fail
        print(f"GitHub API error: {e}")

    # Fallback: return cached even if expired, or empty
    return {"versions": _cache["versions"]}
