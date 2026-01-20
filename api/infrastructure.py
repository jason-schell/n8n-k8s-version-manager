import subprocess
from fastapi import APIRouter

router = APIRouter(prefix="/api/infrastructure", tags=["infrastructure"])


@router.get("/status")
async def get_infrastructure_status():
    """Check PostgreSQL and Redis health."""
    postgres_healthy = False
    redis_healthy = False

    try:
        # Check Postgres pod
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "n8n-system", "-l", "app=postgres", "-o", "jsonpath={.items[0].status.phase}"],
            capture_output=True,
            text=True
        )
        postgres_healthy = result.returncode == 0 and result.stdout.strip() == "Running"
    except:
        pass

    try:
        # Check Redis pod
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "n8n-system", "-l", "app=redis", "-o", "jsonpath={.items[0].status.phase}"],
            capture_output=True,
            text=True
        )
        redis_healthy = result.returncode == 0 and result.stdout.strip() == "Running"
    except:
        pass

    return {
        "postgres": {
            "healthy": postgres_healthy,
            "status": "running" if postgres_healthy else "unavailable"
        },
        "redis": {
            "healthy": redis_healthy,
            "status": "running" if redis_healthy else "unavailable"
        }
    }
