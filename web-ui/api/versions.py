import subprocess
import re
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/versions", tags=["versions"])


class DeployRequest(BaseModel):
    version: str
    mode: str  # "queue" or "regular"
    isolated_db: bool = False
    name: Optional[str] = None  # Optional custom namespace name


def parse_versions_output(output: str) -> List[Dict[str, Any]]:
    """Parse list-versions.sh output into structured JSON."""
    versions = []
    lines = output.strip().split('\n')

    current_deployment = {}
    pod_list = []

    for line in lines:
        line = line.strip()

        # Skip header and empty lines
        if not line or '===' in line:
            continue

        # Start of new deployment
        if line.startswith('Namespace:'):
            # Save previous deployment if exists
            if current_deployment:
                current_deployment['pods'] = {
                    'ready': len([p for p in pod_list if 'Running' in p]),
                    'total': len(pod_list)
                }
                versions.append(current_deployment)
                current_deployment = {}
                pod_list = []

            # Parse namespace
            namespace = line.split(':', 1)[1].strip()
            # Extract version from namespace (n8n-v1-85-0 -> 1.85.0)
            version_match = re.search(r'n8n-v(\d+)-(\d+)-(\d+)', namespace)
            if version_match:
                version = f"{version_match.group(1)}.{version_match.group(2)}.{version_match.group(3)}"
            else:
                # For custom names, fetch version from namespace label
                try:
                    result = subprocess.run(
                        ["kubectl", "get", "namespace", namespace, "-o", "jsonpath={.metadata.labels.version}"],
                        capture_output=True,
                        text=True
                    )
                    version = result.stdout.strip() or "unknown"
                except:
                    version = "unknown"

            current_deployment = {
                'version': version,
                'namespace': namespace,
                'mode': '',
                'status': '',
                'url': ''
            }

        # Parse version (redundant, but keep for consistency)
        elif line.startswith('Version:') and current_deployment:
            pass  # Already extracted from namespace

        # Parse mode
        elif line.startswith('Mode:') and current_deployment:
            mode = line.split(':', 1)[1].strip().lower()
            current_deployment['mode'] = mode

        # Parse access URL
        elif line.startswith('Access:') and current_deployment:
            url = line.split(':', 1)[1].strip()
            current_deployment['url'] = url

        # Parse pods section
        elif line.startswith('Pods:'):
            continue  # Just a header

        # Parse individual pod lines
        elif '-' in line and current_deployment and not line.startswith('Namespace'):
            # Pod line format: "n8n-main-0 - Running"
            pod_list.append(line)
            # Set status based on pods - if any running, status is "running"
            if 'Running' in line:
                current_deployment['status'] = 'running'

    # Don't forget the last deployment
    if current_deployment:
        current_deployment['pods'] = {
            'ready': len([p for p in pod_list if 'Running' in p]),
            'total': len(pod_list)
        }
        versions.append(current_deployment)

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

        if request.name:
            cmd.extend(["--name", request.name])

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
