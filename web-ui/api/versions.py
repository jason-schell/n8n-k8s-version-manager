import subprocess
import re
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/versions", tags=["versions"])


class DeployRequest(BaseModel):
    version: str
    mode: str  # "queue" or "regular"
    isolated_db: bool = False


def parse_versions_output(output: str) -> List[Dict[str, Any]]:
    """Parse list-versions.sh output into structured JSON."""
    versions = []
    lines = output.strip().split('\n')

    for line in lines:
        # Skip header and separator lines
        if 'NAMESPACE' in line or '---' in line or not line.strip():
            continue

        # Parse format: n8n-v1-85-0  queue    Running  4/4   http://localhost:30185
        parts = line.split()
        if len(parts) >= 4:
            namespace = parts[0]
            mode = parts[1]
            status = parts[2]
            pods = parts[3]
            url = parts[4] if len(parts) > 4 else ""

            # Extract version from namespace (n8n-v1-85-0 -> 1.85.0)
            version_match = re.search(r'n8n-v(\d+)-(\d+)-(\d+)', namespace)
            if version_match:
                version = f"{version_match.group(1)}.{version_match.group(2)}.{version_match.group(3)}"

                # Parse pods (4/4 -> ready=4, total=4)
                pod_parts = pods.split('/')
                pods_ready = int(pod_parts[0]) if len(pod_parts) > 0 else 0
                pods_total = int(pod_parts[1]) if len(pod_parts) > 1 else 0

                versions.append({
                    "version": version,
                    "namespace": namespace,
                    "mode": mode.lower(),
                    "status": status.lower(),
                    "pods": {
                        "ready": pods_ready,
                        "total": pods_total
                    },
                    "url": url
                })

    return versions


@router.get("")
async def list_versions():
    """List all deployed n8n versions."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/list-versions.sh"],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to list versions: {result.stderr}")

        versions = parse_versions_output(result.stdout)
        return {"versions": versions}

    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="list-versions.sh script not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def deploy_version(request: DeployRequest):
    """Deploy a new n8n version."""
    try:
        mode_flag = "--queue" if request.mode == "queue" else "--regular"
        cmd = ["/workspace/scripts/deploy-version.sh", request.version, mode_flag]

        if request.isolated_db:
            cmd.append("--isolated-db")

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace")

        if result.returncode != 0:
            return {
                "success": False,
                "message": "Deployment failed",
                "error": result.stderr,
                "output": result.stdout
            }

        # Calculate namespace and URL from version
        namespace = f"n8n-v{request.version.replace('.', '-')}"
        version_parts = request.version.split('.')
        port = 30000 + (int(version_parts[0]) * 100) + int(version_parts[1])
        url = f"http://localhost:{port}"

        return {
            "success": True,
            "message": "Deployment initiated",
            "namespace": namespace,
            "url": url,
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{version}")
async def remove_version(version: str):
    """Remove a deployed n8n version."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/remove-version.sh", version],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            return {
                "success": False,
                "message": "Removal failed",
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": f"Version {version} removed",
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
