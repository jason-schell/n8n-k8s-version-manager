#!/bin/bash

set -e

# Usage: ./scripts/restore-to-deployment.sh <snapshot-filename> <namespace>

SNAPSHOT=$1
NAMESPACE=$2

if [ -z "$SNAPSHOT" ] || [ -z "$NAMESPACE" ]; then
  echo "Usage: ./scripts/restore-to-deployment.sh <snapshot-filename> <namespace>"
  echo "Example: ./scripts/restore-to-deployment.sh test-data.sql n8n-v1-85-0"
  exit 1
fi

# Verify namespace exists
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
  echo "Error: Namespace not found: $NAMESPACE"
  exit 1
fi

# Get the deployment's postgres pod
POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POSTGRES_POD" ]; then
  echo "Error: PostgreSQL pod not found in namespace $NAMESPACE"
  exit 1
fi

echo "Restoring snapshot: $SNAPSHOT"
echo "Target namespace: $NAMESPACE"
echo "PostgreSQL pod: $POSTGRES_POD"
echo ""

# Check if snapshot exists (in the shared backup storage)
# First, we need to copy the snapshot from the backup PVC to the deployment's postgres pod

echo "Copying snapshot to deployment..."

# Create a job to copy the snapshot
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
JOB_NAME="restore-${NAMESPACE}-${TIMESTAMP}"

cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: n8n-system
spec:
  ttlSecondsAfterFinished: 60
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: copy
        image: postgres:16
        command:
        - /bin/bash
        - -c
        - |
          set -e

          SNAPSHOT_PATH=""
          # Check in snapshots directory first (named snapshots)
          if [ -f "/backups/snapshots/${SNAPSHOT}" ]; then
            SNAPSHOT_PATH="/backups/snapshots/${SNAPSHOT}"
          # Then check root backups directory (auto snapshots)
          elif [ -f "/backups/${SNAPSHOT}" ]; then
            SNAPSHOT_PATH="/backups/${SNAPSHOT}"
          else
            echo "Error: Snapshot not found: ${SNAPSHOT}"
            echo "Checked: /backups/snapshots/${SNAPSHOT} and /backups/${SNAPSHOT}"
            exit 1
          fi

          echo "Found snapshot at: \${SNAPSHOT_PATH}"
          echo "Copying to shared location..."
          cp "\${SNAPSHOT_PATH}" /backups/restore-temp.sql
          echo "Snapshot ready for restore"
        volumeMounts:
        - name: backup-storage
          mountPath: /backups
      volumes:
      - name: backup-storage
        persistentVolumeClaim:
          claimName: backup-storage
EOF

echo "Waiting for snapshot copy job..."
kubectl wait --for=condition=complete job/${JOB_NAME} -n n8n-system --timeout=60s

# Now restore the snapshot to the deployment's database
echo "Restoring database in ${NAMESPACE}..."

# The isolated postgres doesn't have access to the backup PVC, so we need to:
# 1. Read the snapshot content from the backup pod
# 2. Pipe it directly to the target postgres

# Get the snapshot content and pipe to target postgres
kubectl exec -n n8n-system deploy/postgres -- cat /backups/restore-temp.sql | \
  kubectl exec -i -n "$NAMESPACE" "$POSTGRES_POD" -- sh -c "
    echo 'Dropping existing database...'
    psql -U admin -d postgres -c 'DROP DATABASE IF EXISTS n8n;'

    echo 'Creating fresh database...'
    psql -U admin -d postgres -c 'CREATE DATABASE n8n OWNER admin;'

    echo 'Restoring from snapshot...'
    psql -U admin -d n8n

    echo 'Database restored successfully!'
  "

# Clean up temp file
kubectl exec -n n8n-system deploy/postgres -- rm -f /backups/restore-temp.sql

echo ""
echo "Restore complete!"
echo "The n8n pods in ${NAMESPACE} should automatically reconnect to the restored database."
