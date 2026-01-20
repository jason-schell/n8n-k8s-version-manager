import subprocess
import re
from datetime import datetime
from typing import List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class RestoreRequest(BaseModel):
    snapshot: str


class CreateNamedSnapshotRequest(BaseModel):
    name: str
    source: str = "shared"  # "shared" or namespace name


class DeleteSnapshotRequest(BaseModel):
    filename: str


def parse_snapshots_output(output: str, snapshot_type: str = "all") -> List[Dict[str, str]]:
    """Parse list-snapshots.sh output into structured JSON."""
    snapshots = []
    lines = output.strip().split('\n')

    for line in lines:
        if not line.strip() or not line.endswith('.sql'):
            continue

        filename = line.strip()

        # Determine if named or timestamped
        is_named = not filename.startswith('n8n-')

        # Parse timestamp from filename for auto snapshots
        if not is_named:
            timestamp_match = re.search(r'n8n-(\d{8})-(\d{6})', filename)
            if timestamp_match:
                date_str = timestamp_match.group(1)
                time_str = timestamp_match.group(2)
                timestamp = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]} {time_str[:2]}:{time_str[2:4]}:{time_str[4:6]}"
            else:
                timestamp = "Unknown"

            snapshots.append({
                "filename": filename,
                "timestamp": timestamp,
                "type": "auto",
                "name": None
            })
        else:
            # Named snapshot
            name = filename.replace('.sql', '')
            snapshots.append({
                "filename": filename,
                "name": name,
                "type": "named",
                "timestamp": None
            })

    # Filter by type if requested
    if snapshot_type == "named":
        snapshots = [s for s in snapshots if s["type"] == "named"]
    elif snapshot_type == "auto":
        snapshots = [s for s in snapshots if s["type"] == "auto"]

    return snapshots


@router.get("")
async def list_snapshots():
    """List all database snapshots (named and timestamped)."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/list-snapshots.sh"],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        # If infrastructure not ready, return empty list instead of error
        if result.returncode != 0:
            return {"snapshots": []}

        snapshots = parse_snapshots_output(result.stdout, snapshot_type="all")
        return {"snapshots": snapshots}

    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="list-snapshots.sh script not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/named")
async def list_named_snapshots():
    """List only named snapshots for deployment UI."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/list-snapshots.sh", "--named-only"],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            return {"snapshots": []}

        snapshots = parse_snapshots_output(result.stdout, snapshot_type="named")
        return {"snapshots": snapshots}

    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="list-snapshots.sh script not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore")
async def restore_snapshot(request: RestoreRequest):
    """Restore database from snapshot."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/restore-snapshot.sh", request.snapshot],
            capture_output=True,
            text=True,
            cwd="/workspace",
            input="yes\n"  # Auto-confirm the restore
        )

        if result.returncode != 0:
            return {
                "success": False,
                "message": "Restore failed",
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": f"Snapshot {request.snapshot} restored",
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create")
async def create_snapshot():
    """Create manual database snapshot."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/create-snapshot.sh"],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": "Snapshot creation started",
            "output": result.stdout
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-named")
async def create_named_snapshot(request: CreateNamedSnapshotRequest):
    """Create named database snapshot."""
    try:
        # Validate name
        if not re.match(r'^[a-zA-Z0-9_-]+$', request.name):
            return {
                "success": False,
                "error": "Invalid name. Use only letters, numbers, hyphens, and underscores"
            }

        # Run create-named-snapshot.sh script
        cmd = ["/workspace/scripts/create-named-snapshot.sh", request.name]
        if request.source != "shared":
            cmd.extend(["--source", request.source])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": f"Named snapshot '{request.name}' created",
            "output": result.stdout
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{filename}")
async def delete_snapshot(filename: str):
    """Delete a snapshot by filename."""
    try:
        # Security: validate filename
        if not filename.endswith('.sql') or '/' in filename or '..' in filename:
            return {
                "success": False,
                "error": "Invalid filename"
            }

        result = subprocess.run(
            ["/workspace/scripts/delete-snapshot.sh", filename],
            capture_output=True,
            text=True,
            cwd="/workspace",
            input="yes\n"  # Auto-confirm deletion
        )

        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": f"Snapshot {filename} deleted",
            "output": result.stdout
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
