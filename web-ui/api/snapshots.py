import subprocess
import re
from datetime import datetime
from typing import List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class RestoreRequest(BaseModel):
    snapshot: str


def parse_snapshots_output(output: str) -> List[Dict[str, str]]:
    """Parse list-snapshots.sh output into structured JSON."""
    snapshots = []
    lines = output.strip().split('\n')

    for line in lines:
        if line.strip() and line.endswith('.sql'):
            filename = line.strip()

            # Parse timestamp from filename: n8n-20260119-181411-pre-v2.1.0.sql
            timestamp_match = re.search(r'n8n-(\d{8})-(\d{6})', filename)
            if timestamp_match:
                date_str = timestamp_match.group(1)
                time_str = timestamp_match.group(2)
                # Format: YYYYMMDD-HHMMSS -> YYYY-MM-DD HH:MM:SS
                timestamp = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]} {time_str[:2]}:{time_str[2:4]}:{time_str[4:6]}"
            else:
                timestamp = "Unknown"

            snapshots.append({
                "filename": filename,
                "timestamp": timestamp
            })

    return snapshots


@router.get("")
async def list_snapshots():
    """List all database snapshots."""
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

        snapshots = parse_snapshots_output(result.stdout)
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
