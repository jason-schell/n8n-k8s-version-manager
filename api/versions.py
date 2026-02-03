import subprocess
import re
import tempfile
import os
import logging
import yaml
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from validation import validate_namespace, validate_identifier

router = APIRouter(prefix="/api/versions", tags=["versions"])


# Pydantic models for HelmValues
class ResourceRequests(BaseModel):
    cpu: Optional[str] = None
    memory: Optional[str] = None


class ResourceLimits(BaseModel):
    cpu: Optional[str] = None
    memory: Optional[str] = None


class ResourceSpec(BaseModel):
    requests: Optional[ResourceRequests] = None
    limits: Optional[ResourceLimits] = None


class DatabaseIsolatedStorage(BaseModel):
    size: Optional[str] = None


class DatabaseIsolated(BaseModel):
    image: Optional[str] = None
    storage: Optional[DatabaseIsolatedStorage] = None


class DatabaseConfig(BaseModel):
    isolated: Optional[DatabaseIsolated] = None


class RedisConfig(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None


class N8nConfig(BaseModel):
    encryptionKey: Optional[str] = None
    timezone: Optional[str] = None
    webhookUrl: Optional[str] = None


class ResourcesConfig(BaseModel):
    main: Optional[ResourceSpec] = None
    worker: Optional[ResourceSpec] = None
    webhook: Optional[ResourceSpec] = None


class ReplicasConfig(BaseModel):
    workers: Optional[int] = None


class ServiceConfig(BaseModel):
    type: Optional[str] = None


class HelmValues(BaseModel):
    database: Optional[DatabaseConfig] = None
    redis: Optional[RedisConfig] = None
    n8nConfig: Optional[N8nConfig] = None
    resources: Optional[ResourcesConfig] = None
    replicas: Optional[ReplicasConfig] = None
    service: Optional[ServiceConfig] = None
    extraEnv: Optional[Dict[str, str]] = None
    rawYaml: Optional[str] = None


class DeployRequest(BaseModel):
    version: str
    mode: str  # "queue" or "regular"
    name: Optional[str] = None  # Optional custom namespace name
    snapshot: Optional[str] = None  # Optional snapshot name for isolated DB
    helm_values: Optional[HelmValues] = None

    @field_validator('version')
    @classmethod
    def validate_version(cls, v: str) -> str:
        import re
        if not re.match(r'^\d+\.\d+\.\d+$', v):
            raise ValueError('Version must be in format major.minor.patch (e.g., 1.85.0)')
        return v

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ('queue', 'regular'):
            raise ValueError('Mode must be "queue" or "regular"')
        return v

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        import re
        if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$', v):
            raise ValueError('Name must be valid Kubernetes namespace (lowercase, alphanumeric, hyphens)')
        return v

    @field_validator('snapshot')
    @classmethod
    def validate_snapshot(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        import re
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]*$', v):
            raise ValueError('Snapshot name must be alphanumeric with hyphens/underscores')
        return v


def deep_merge(base: dict, override: dict) -> dict:
    """Deep merge two dictionaries, override takes precedence."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def build_helm_values(helm_values: HelmValues) -> dict:
    """Convert HelmValues to Helm values dictionary."""
    values = {}

    # Database settings
    if helm_values.database:
        db = {}
        if helm_values.database.isolated:
            isolated = {}
            if helm_values.database.isolated.image:
                isolated['image'] = helm_values.database.isolated.image
            if helm_values.database.isolated.storage and helm_values.database.isolated.storage.size:
                isolated['storage'] = {'size': helm_values.database.isolated.storage.size}
            if isolated:
                db['isolated'] = isolated

        if db:
            values['database'] = db

    # Redis settings
    if helm_values.redis:
        redis = {}
        if helm_values.redis.host:
            redis['host'] = helm_values.redis.host
        if helm_values.redis.port:
            redis['port'] = helm_values.redis.port
        if redis:
            values['redis'] = redis

    # n8n config
    if helm_values.n8nConfig:
        n8n_config = {}
        if helm_values.n8nConfig.encryptionKey:
            n8n_config['encryptionKey'] = helm_values.n8nConfig.encryptionKey
        if helm_values.n8nConfig.timezone:
            n8n_config['timezone'] = helm_values.n8nConfig.timezone
        if helm_values.n8nConfig.webhookUrl:
            n8n_config['webhookUrl'] = helm_values.n8nConfig.webhookUrl
        if n8n_config:
            values['n8nConfig'] = n8n_config

    # Resources
    if helm_values.resources:
        resources = {}
        for container_name in ['main', 'worker', 'webhook']:
            container_spec = getattr(helm_values.resources, container_name, None)
            if container_spec:
                container_resources = {}
                if container_spec.requests:
                    requests = {}
                    if container_spec.requests.cpu:
                        requests['cpu'] = container_spec.requests.cpu
                    if container_spec.requests.memory:
                        requests['memory'] = container_spec.requests.memory
                    if requests:
                        container_resources['requests'] = requests
                if container_spec.limits:
                    limits = {}
                    if container_spec.limits.cpu:
                        limits['cpu'] = container_spec.limits.cpu
                    if container_spec.limits.memory:
                        limits['memory'] = container_spec.limits.memory
                    if limits:
                        container_resources['limits'] = limits
                if container_resources:
                    resources[container_name] = container_resources
        if resources:
            values['resources'] = resources

    # Replicas
    if helm_values.replicas and helm_values.replicas.workers is not None:
        values['replicas'] = {'workers': helm_values.replicas.workers}

    # Service
    if helm_values.service and helm_values.service.type:
        values['service'] = {'type': helm_values.service.type}

    # Extra env vars
    if helm_values.extraEnv:
        values['extraEnv'] = helm_values.extraEnv

    # Raw YAML override (merge last, raw takes precedence)
    if helm_values.rawYaml:
        try:
            raw_values = yaml.safe_load(helm_values.rawYaml)
            if isinstance(raw_values, dict):
                values = deep_merge(values, raw_values)
        except yaml.YAMLError:
            pass  # Invalid YAML, ignore

    return values


def get_namespace_metadata_batch() -> Dict[str, Dict[str, Any]]:
    """Fetch all n8n namespace metadata in a single kubectl call."""
    metadata = {}
    try:
        result = subprocess.run(
            ["kubectl", "get", "namespaces", "-l", "app=n8n", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            for ns in data.get('items', []):
                name = ns['metadata']['name']
                metadata[name] = {
                    'version': ns['metadata'].get('labels', {}).get('version', 'unknown'),
                    'created_at': ns['metadata'].get('creationTimestamp')
                }
    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception):
        pass
    return metadata


def get_helm_values_batch(namespaces: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetch helm values for multiple namespaces."""
    values = {}
    for ns in namespaces:
        try:
            result = subprocess.run(
                ["helm", "get", "values", ns, "-n", ns, "-o", "json"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                values[ns] = json.loads(result.stdout)
        except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception):
            values[ns] = {}
    return values


def parse_versions_output(output: str) -> List[Dict[str, Any]]:
    """Parse list-versions.sh output into structured JSON."""
    versions = []
    lines = output.strip().split('\n')

    # Pre-fetch all namespace metadata in one call
    ns_metadata = get_namespace_metadata_batch()

    # Collect namespaces first pass
    namespaces_found = []
    for line in lines:
        if line.strip().startswith('Namespace:'):
            ns = line.split(':', 1)[1].strip()
            namespaces_found.append(ns)

    # Batch fetch helm values
    helm_values_cache = get_helm_values_batch(namespaces_found)

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
                # For custom names, use pre-fetched metadata
                custom_name = namespace
                version = ns_metadata.get(namespace, {}).get('version', 'unknown')

            # Use pre-fetched creation timestamp
            created_at = ns_metadata.get(namespace, {}).get('created_at')

            # All deployments now use isolated DB
            isolated_db = True
            snapshot = None

            # Use pre-fetched helm values
            helm_values = helm_values_cache.get(namespace, {})
            if 'database' in helm_values and 'isolated' in helm_values['database']:
                snapshot_config = helm_values['database']['isolated'].get('snapshot', {})
                if snapshot_config.get('enabled'):
                    snapshot_name = snapshot_config.get('name', '')
                    snapshot = snapshot_name.replace('.sql', '') if snapshot_name else None

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
            cwd="/workspace",
            timeout=30
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
    values_file = None
    try:
        mode_flag = "--queue" if request.mode == "queue" else "--regular"
        cmd = ["/workspace/scripts/deploy-version.sh", request.version, mode_flag]

        if request.name:
            cmd.extend(["--name", request.name])

        if request.snapshot:
            cmd.extend(["--snapshot", request.snapshot])

        # Handle helm values
        if request.helm_values:
            helm_values_dict = build_helm_values(request.helm_values)
            if helm_values_dict:
                # Write to temp file
                fd, values_file = tempfile.mkstemp(suffix='.yaml', prefix='helm-values-')
                with os.fdopen(fd, 'w') as f:
                    yaml.dump(helm_values_dict, f)
                cmd.extend(["--values-file", values_file])

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace", timeout=120)

        if result.returncode != 0:
            # Combine stdout and stderr for complete error message
            error_msg = result.stderr.strip() if result.stderr.strip() else result.stdout.strip()
            if not error_msg:
                error_msg = "Deployment failed with no error message"

            # Check if this is a false-positive "namespace already exists" error
            # Helm reports this error but actually succeeds in deploying resources
            # This happens due to race condition with namespace in Terminating state
            if "already exists" in error_msg.lower() and "namespace" in error_msg.lower():
                # This is likely a false positive - deployment probably succeeded
                # Log the warning but treat as success
                logging.warning(f"Helm reported namespace error but deployment likely succeeded: {error_msg}")
            else:
                raise HTTPException(status_code=500, detail=error_msg)

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
    finally:
        # Clean up temp values file
        if values_file and os.path.exists(values_file):
            os.unlink(values_file)


@router.delete("/{namespace}")
async def remove_version(namespace: str):
    """Remove a deployed n8n version by namespace."""
    namespace = validate_namespace(namespace)

    try:
        # Check if namespace exists
        check_result = subprocess.run(
            ["kubectl", "get", "namespace", namespace],
            capture_output=True,
            text=True,
            timeout=5
        )
        if check_result.returncode != 0:
            raise HTTPException(status_code=404, detail=f"Namespace {namespace} not found")

        # Uninstall Helm release (use namespace as release name)
        helm_result = subprocess.run(
            ["helm", "uninstall", namespace, "--namespace", namespace, "--wait"],
            capture_output=True,
            text=True,
            timeout=60
        )
        # Log but don't fail if helm release doesn't exist
        if helm_result.returncode != 0 and "not found" not in helm_result.stderr.lower():
            logging.warning(f"Helm uninstall warning: {helm_result.stderr}")

        # Delete namespace with wait
        result = subprocess.run(
            ["kubectl", "delete", "namespace", namespace, "--wait=true", "--timeout=60s"],
            capture_output=True,
            text=True,
            timeout=90
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete namespace: {result.stderr}"
            )

        return {
            "success": True,
            "message": f"Namespace {namespace} removed"
        }

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Deletion timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{namespace}/status")
async def check_namespace_status(namespace: str):
    """Check if a namespace exists (for polling deletion status)."""
    namespace = validate_namespace(namespace)

    try:
        result = subprocess.run(
            ["kubectl", "get", "namespace", namespace],
            capture_output=True,
            text=True,
            timeout=5
        )

        return {
            "exists": result.returncode == 0,
            "namespace": namespace
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Status check timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{namespace}/events")
async def get_namespace_events(namespace: str, limit: int = 50):
    """Get K8s events for a namespace."""
    namespace = validate_namespace(namespace)

    try:
        result = subprocess.run(
            ["kubectl", "get", "events", "-n", namespace,
             "--sort-by=.lastTimestamp", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to get events: {result.stderr}")

        events = []
        data = json.loads(result.stdout)
        items = data.get("items", [])

        # Sort by timestamp descending (newest first) and limit
        for item in items[:limit]:
            events.append({
                "type": item.get("type"),  # Normal, Warning
                "reason": item.get("reason"),  # Scheduled, Pulled, Started, Failed
                "message": item.get("message"),
                "timestamp": item.get("lastTimestamp") or item.get("eventTime"),
                "count": item.get("count", 1),
                "object": {
                    "kind": item.get("involvedObject", {}).get("kind"),
                    "name": item.get("involvedObject", {}).get("name"),
                }
            })

        return {"events": events}

    except json.JSONDecodeError:
        return {"events": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{namespace}/pods")
async def get_namespace_pods(namespace: str):
    """Get detailed pod status for a namespace."""
    namespace = validate_namespace(namespace)

    try:
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", namespace, "-o", "json"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to get pods: {result.stderr}")

        pods = []
        data = json.loads(result.stdout)

        for item in data.get("items", []):
            containers = []
            for cs in item.get("status", {}).get("containerStatuses", []):
                state = "unknown"
                state_detail = None
                if cs.get("state", {}).get("running"):
                    state = "running"
                elif cs.get("state", {}).get("waiting"):
                    state = "waiting"
                    state_detail = cs["state"]["waiting"].get("reason")
                elif cs.get("state", {}).get("terminated"):
                    state = "terminated"
                    state_detail = cs["state"]["terminated"].get("reason")

                containers.append({
                    "name": cs.get("name"),
                    "ready": cs.get("ready", False),
                    "state": state,
                    "state_detail": state_detail,
                    "restart_count": cs.get("restartCount", 0),
                })

            pods.append({
                "name": item["metadata"]["name"],
                "phase": item.get("status", {}).get("phase"),  # Pending, Running, Succeeded, Failed
                "containers": containers,
                "created": item["metadata"].get("creationTimestamp"),
            })

        return {"pods": pods}

    except json.JSONDecodeError:
        return {"pods": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{namespace}/logs")
async def get_namespace_logs(namespace: str, pod: Optional[str] = None, container: Optional[str] = None, tail: int = 100):
    """Get logs from pods in a namespace."""
    namespace = validate_namespace(namespace)
    if pod:
        pod = validate_identifier(pod, "pod")
    if container:
        container = validate_identifier(container, "container")

    try:
        # If specific pod requested, get just that pod's logs
        if pod:
            cmd = ["kubectl", "logs", "-n", namespace, pod, f"--tail={tail}"]
            if container:
                cmd.extend(["-c", container])

            log_result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            return {
                "logs": [{
                    "pod": pod,
                    "container": container,
                    "logs": log_result.stdout,
                    "error": log_result.stderr if log_result.returncode != 0 else None
                }]
            }

        # Otherwise get logs from all pods
        pods_result = subprocess.run(
            ["kubectl", "get", "pods", "-n", namespace, "-o", "jsonpath={.items[*].metadata.name}"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if not pods_result.stdout.strip():
            return {"logs": []}

        logs = []
        for pod_name in pods_result.stdout.split():
            cmd = ["kubectl", "logs", "-n", namespace, pod_name, f"--tail={tail}"]
            if container:
                cmd.extend(["-c", container])

            log_result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            logs.append({
                "pod": pod_name,
                "container": container,
                "logs": log_result.stdout,
                "error": log_result.stderr if log_result.returncode != 0 else None
            })

        return {"logs": logs}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{namespace}/config")
async def get_namespace_config(namespace: str):
    """Get ConfigMap environment variables for a namespace."""
    namespace = validate_namespace(namespace)

    try:
        # Get the n8n-config ConfigMap directly by name
        result = subprocess.run(
            ["kubectl", "get", "configmap", "n8n-config", "-n", namespace, "-o", "json"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            return {"config": {}, "error": result.stderr}

        data = json.loads(result.stdout)
        config = data.get("data", {})

        return {"config": config}

    except json.JSONDecodeError:
        return {"config": {}}
    except Exception as e:
        return {"config": {}, "error": str(e)}
