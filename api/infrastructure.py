from fastapi import APIRouter
import k8s

router = APIRouter(prefix="/api/infrastructure", tags=["infrastructure"])


@router.get("/status")
async def get_infrastructure_status():
    """Check Redis and backup storage health."""
    redis_phase = await k8s.get_pod_phase(
        namespace="n8n-system",
        label_selector="app=redis"
    )
    backup_phase = await k8s.get_pod_phase(
        namespace="n8n-system",
        label_selector="app=backup-storage"
    )

    return {
        "redis": {
            "status": "healthy" if redis_phase == "Running" else "unavailable"
        },
        "backup": {
            "status": "healthy" if backup_phase == "Running" else "unavailable"
        }
    }
