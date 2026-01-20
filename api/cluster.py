import subprocess
import json
from fastapi import APIRouter
from typing import Dict, List

router = APIRouter(prefix="/api/cluster", tags=["cluster"])

# Memory requirements (in Mi)
QUEUE_MODE_MEMORY = 1792  # main(512) + webhook(256) + 2*worker(512)
REGULAR_MODE_MEMORY = 512  # main only
ISOLATED_DB_MEMORY = 512  # postgres when using isolated DB

@router.get("/resources")
async def get_cluster_resources():
    """Get cluster resource availability and usage."""

    try:
        # Get cluster allocatable memory (in Mi)
        nodes_result = subprocess.run(
            ["kubectl", "get", "nodes", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if nodes_result.returncode != 0:
            return {
                "error": "Failed to query cluster nodes",
                "memory": None,
                "can_deploy": {"queue_mode": False, "regular_mode": False},
                "deployments": []
            }

        nodes_data = json.loads(nodes_result.stdout)
        allocatable_ki = nodes_data['items'][0]['status']['allocatable']['memory']
        allocatable_mi = int(allocatable_ki.rstrip('Ki')) // 1024

        # Get current memory requests across all pods (in Mi)
        pods_result = subprocess.run(
            ["kubectl", "get", "pods", "--all-namespaces", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if pods_result.returncode != 0:
            return {
                "error": "Failed to query cluster pods",
                "memory": None,
                "can_deploy": {"queue_mode": False, "regular_mode": False},
                "deployments": []
            }

        pods_data = json.loads(pods_result.stdout)
        used_mi = 0

        for pod in pods_data['items']:
            if pod['status']['phase'] in ['Running', 'Pending']:
                for container in pod['spec']['containers']:
                    mem_req = container.get('resources', {}).get('requests', {}).get('memory', '0')
                    if mem_req.endswith('Mi'):
                        used_mi += int(mem_req[:-2])
                    elif mem_req.endswith('Gi'):
                        used_mi += int(mem_req[:-2]) * 1024

        available_mi = allocatable_mi - used_mi
        utilization_percent = int((used_mi / allocatable_mi * 100) if allocatable_mi > 0 else 0)

        # Get n8n deployments with their memory usage
        namespaces_result = subprocess.run(
            ["kubectl", "get", "ns", "-o", "json"],
            capture_output=True,
            text=True,
            timeout=5
        )

        deployments = []
        if namespaces_result.returncode == 0:
            namespaces_data = json.loads(namespaces_result.stdout)

            for ns_item in namespaces_data['items']:
                ns_name = ns_item['metadata']['name']

                # Only include n8n deployments
                if not ns_name.startswith('n8n-v'):
                    continue

                # Get pods for this namespace
                ns_pods_result = subprocess.run(
                    ["kubectl", "get", "pods", "-n", ns_name, "-o", "json"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )

                if ns_pods_result.returncode != 0:
                    continue

                ns_pods_data = json.loads(ns_pods_result.stdout)
                ns_memory = 0

                for pod in ns_pods_data['items']:
                    if pod['status']['phase'] in ['Running', 'Pending']:
                        for container in pod['spec']['containers']:
                            mem_req = container.get('resources', {}).get('requests', {}).get('memory', '0')
                            if mem_req.endswith('Mi'):
                                ns_memory += int(mem_req[:-2])
                            elif mem_req.endswith('Gi'):
                                ns_memory += int(mem_req[:-2]) * 1024

                # Determine mode from pod labels
                mode = "regular"
                for pod in ns_pods_data['items']:
                    if pod['metadata'].get('labels', {}).get('mode') == 'queue':
                        mode = "queue"
                        break

                # Calculate age
                created_at = ns_item['metadata']['creationTimestamp']
                from datetime import datetime
                created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                now = datetime.now(created.tzinfo)
                age_seconds = int((now - created).total_seconds())

                deployments.append({
                    "namespace": ns_name,
                    "memory_mi": ns_memory,
                    "mode": mode,
                    "age_seconds": age_seconds
                })

        # Sort by age (oldest first) - makes it easier to decide what to delete
        deployments.sort(key=lambda d: d['age_seconds'], reverse=True)

        return {
            "memory": {
                "allocatable_mi": allocatable_mi,
                "used_mi": used_mi,
                "available_mi": available_mi,
                "utilization_percent": utilization_percent
            },
            "can_deploy": {
                "queue_mode": available_mi >= QUEUE_MODE_MEMORY,
                "regular_mode": available_mi >= REGULAR_MODE_MEMORY
            },
            "deployments": deployments
        }

    except subprocess.TimeoutExpired:
        return {
            "error": "Cluster query timeout",
            "memory": None,
            "can_deploy": {"queue_mode": False, "regular_mode": False},
            "deployments": []
        }
    except Exception as e:
        return {
            "error": str(e),
            "memory": None,
            "can_deploy": {"queue_mode": False, "regular_mode": False},
            "deployments": []
        }
