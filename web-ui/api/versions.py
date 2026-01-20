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
    snapshot: Optional[str] = None  # Optional snapshot name for isolated DB


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
                # Set status if not already set
                if not current_deployment.get('status'):
                    current_deployment['status'] = 'pending' if pod_list else 'unknown'
                versions.append(current_deployment)
                current_deployment = {}
                pod_list = []

            # Parse namespace
            namespace = line.split(':', 1)[1].strip()
            # Extract version from namespace (n8n-v1-85-0 -> 1.85.0)
            version_match = re.search(r'n8n-v(\d+)-(\d+)-(\d+)', namespace)
            custom_name = None
            if version_match:
                version = f"{version_match.group(1)}.{version_match.group(2)}.{version_match.group(3)}"
            else:
                # For custom names, fetch version from namespace label
                custom_name = namespace  # The namespace IS the custom name
                try:
                    result = subprocess.run(
                        ["kubectl", "get", "namespace", namespace, "-o", "jsonpath={.metadata.labels.version}"],
                        capture_output=True,
                        text=True
                    )
                    version = result.stdout.strip() or "unknown"
                except:
                    version = "unknown"

            # Get namespace creation timestamp for age calculation
            created_at = None
            try:
                result = subprocess.run(
                    ["kubectl", "get", "namespace", namespace, "-o", "jsonpath={.metadata.creationTimestamp}"],
                    capture_output=True,
                    text=True
                )
                created_at = result.stdout.strip() or None
            except:
                pass

            # Get isolated_db and snapshot from Helm values
            isolated_db = False
            snapshot = None
            try:
                result = subprocess.run(
                    ["helm", "get", "values", namespace, "-n", namespace, "-o", "json"],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    import json
                    helm_values = json.loads(result.stdout)
                    isolated_db = helm_values.get('isolatedDB', False)
                    if isolated_db and 'database' in helm_values and 'isolated' in helm_values['database']:
                        snapshot_config = helm_values['database']['isolated'].get('snapshot', {})
                        if snapshot_config.get('enabled'):
                            snapshot_name = snapshot_config.get('name', '')
                            # Remove .sql extension if present
                            snapshot = snapshot_name.replace('.sql', '') if snapshot_name else None
            except:
                pass

            current_deployment = {
                'version': version,
                'namespace': namespace,
                'name': custom_name,
                'mode': '',
                'status': '',
                'url': '',
                'isolated_db': isolated_db,
                'snapshot': snapshot,
                'created_at': created_at
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
        # Set status if not already set
        if not current_deployment.get('status'):
            current_deployment['status'] = 'pending' if pod_list else 'unknown'
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

        if request.snapshot:
            cmd.extend(["--snapshot", request.snapshot])

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace")

        if result.returncode != 0:
            # Combine stdout and stderr for complete error message
            error_msg = result.stderr.strip() if result.stderr.strip() else result.stdout.strip()
            if not error_msg:
                error_msg = "Deployment failed with no error message"

            return {
                "success": False,
                "message": "Deployment failed",
                "error": error_msg,
                "output": result.stdout
            }

        # Calculate namespace and URL from version
        if request.name:
            namespace = request.name
        else:
            namespace = f"n8n-v{request.version.replace('.', '-')}"

        version_parts = request.version.split('.')
        # Include patch version in port calculation to avoid conflicts
        # Formula: 30000 + major*100 + minor*10 + patch
        # This gives unique ports for patch versions while staying within NodePort range
        port = 30000 + (int(version_parts[0]) * 100) + (int(version_parts[1]) * 10) + int(version_parts[2])
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


@router.delete("/{namespace}")
async def remove_version(namespace: str):
    """Remove a deployed n8n version by namespace."""
    try:
        # Check if namespace exists
        check_result = subprocess.run(
            ["kubectl", "get", "namespace", namespace],
            capture_output=True,
            text=True
        )
        if check_result.returncode != 0:
            return {
                "success": False,
                "message": "Namespace not found",
                "error": f"Namespace {namespace} does not exist"
            }

        # Uninstall Helm release (use namespace as release name)
        subprocess.run(
            ["helm", "uninstall", namespace, "--namespace", namespace],
            capture_output=True,
            text=True
        )

        # Delete namespace
        result = subprocess.run(
            ["kubectl", "delete", "namespace", namespace],
            capture_output=True,
            text=True
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
            "message": f"Namespace {namespace} removed",
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{namespace}/status")
async def check_namespace_status(namespace: str):
    """Check if a namespace exists (for polling deletion status)."""
    try:
        result = subprocess.run(
            ["kubectl", "get", "namespace", namespace],
            capture_output=True,
            text=True
        )

        return {
            "exists": result.returncode == 0,
            "namespace": namespace
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
