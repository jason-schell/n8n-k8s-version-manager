import subprocess
import re
import tempfile
import os
from typing import List, Dict
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from validation import validate_namespace, validate_snapshot_name, validate_filename
import k8s

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class RestoreRequest(BaseModel):
    snapshot: str


class RestoreToDeploymentRequest(BaseModel):
    snapshot: str
    namespace: str


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
            input="yes\n"
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=result.stderr.strip() or result.stdout.strip() or "Restore failed"
            )

        return {
            "success": True,
            "message": f"Snapshot {request.snapshot} restored"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore-to-deployment")
async def restore_to_deployment(request: RestoreToDeploymentRequest):
    """Restore snapshot to a specific deployment's isolated database."""
    validate_namespace(request.namespace)

    try:
        result = subprocess.run(
            ["/workspace/scripts/restore-to-deployment.sh", request.snapshot, request.namespace],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=result.stderr.strip() or result.stdout.strip() or "Restore failed"
            )

        return {
            "success": True,
            "message": f"Snapshot {request.snapshot} restored to {request.namespace}"
        }

    except HTTPException:
        raise
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
            raise HTTPException(
                status_code=500,
                detail=result.stderr.strip() or result.stdout.strip() or "Snapshot creation failed"
            )

        return {
            "success": True,
            "message": "Snapshot creation started"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-named")
async def create_named_snapshot(request: CreateNamedSnapshotRequest):
    """Create named database snapshot."""
    validate_snapshot_name(request.name)

    if request.source != "shared":
        validate_namespace(request.source)

    try:
        cmd = ["/workspace/scripts/create-named-snapshot.sh", request.name]
        if request.source != "shared":
            cmd.extend(["--source", request.source])

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace")

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=result.stderr.strip() or result.stdout.strip() or "Snapshot creation failed"
            )

        return {
            "success": True,
            "message": f"Named snapshot '{request.name}' created"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{filename}")
async def delete_snapshot(filename: str):
    """Delete a snapshot by filename."""
    validate_filename(filename)

    try:
        result = subprocess.run(
            ["/workspace/scripts/delete-snapshot.sh", filename],
            capture_output=True,
            text=True,
            cwd="/workspace",
            input="yes\n"
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=result.stderr.strip() or result.stdout.strip() or "Delete failed"
            )

        return {
            "success": True,
            "message": f"Snapshot {filename} deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Max file size: 500MB
MAX_UPLOAD_SIZE = 500 * 1024 * 1024


@router.post("/upload")
async def upload_snapshot(
    file: UploadFile = File(...),
    name: str = Form(...)
):
    """Upload a SQL snapshot file."""
    validate_snapshot_name(name)

    if not file.filename or not file.filename.endswith('.sql'):
        raise HTTPException(status_code=400, detail="File must be a .sql file")

    temp_file = None
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)}MB"
            )

        if len(content) == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        fd, temp_file = tempfile.mkstemp(suffix='.sql')
        with os.fdopen(fd, 'wb') as f:
            f.write(content)

        # Find backup storage pod using k8s module
        pods = await k8s.list_pods(
            namespace="n8n-system",
            label_selector="app=backup-storage"
        )
        if not pods:
            raise HTTPException(status_code=503, detail="Backup storage unavailable")

        backup_pod = pods[0].metadata.name
        dest_path = f"/backups/snapshots/{name}.sql"

        cp_result = subprocess.run(
            ["kubectl", "cp", temp_file, f"n8n-system/{backup_pod}:{dest_path}"],
            capture_output=True,
            text=True
        )

        if cp_result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to copy file to storage: {cp_result.stderr}"
            )

        return {
            "success": True,
            "message": f"Snapshot '{name}' uploaded successfully",
            "filename": f"{name}.sql"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)
