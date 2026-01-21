import subprocess
from fastapi import APIRouter

router = APIRouter(prefix="/api/infrastructure", tags=["infrastructure"])


@router.get("/status")
async def get_infrastructure_status():
    """Check Redis and backup storage health."""
    redis_healthy = False
    backup_healthy = False

    try:
        # Check Redis pod
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "n8n-system", "-l", "app=redis", "-o", "jsonpath={.items[0].status.phase}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        redis_healthy = result.returncode == 0 and result.stdout.strip() == "Running"
    except (subprocess.TimeoutExpired, Exception):
        pass

    try:
        # Check backup-storage pod
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "n8n-system", "-l", "app=backup-storage", "-o", "jsonpath={.items[0].status.phase}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        backup_healthy = result.returncode == 0 and result.stdout.strip() == "Running"
    except (subprocess.TimeoutExpired, Exception):
        pass

    return {
        "redis": {
            "healthy": redis_healthy,
            "status": "healthy" if redis_healthy else "unavailable"
        },
        "backup": {
            "healthy": backup_healthy,
            "status": "healthy" if backup_healthy else "unavailable"
        }
    }
