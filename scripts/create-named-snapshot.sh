#!/bin/bash
set -e

# Usage: ./scripts/create-named-snapshot.sh <name> [--source shared|<namespace>]

NAME=$1
SOURCE=${2:-shared}

if [ -z "$NAME" ]; then
  echo "Usage: ./scripts/create-named-snapshot.sh <name> [--source shared|<namespace>]"
  echo "Example: ./scripts/create-named-snapshot.sh test-data-v1"
  echo "Example: ./scripts/create-named-snapshot.sh prod-clone --source n8n-v1-25-0"
  exit 1
fi

# Validate name (alphanumeric, hyphens, underscores only)
if ! [[ "$NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: Invalid name. Use only letters, numbers, hyphens, and underscores"
  echo "Good: test-data-v1, prod_clone, mySnapshot123"
  echo "Bad: test data, snapshot.sql, my/snapshot"
  exit 1
fi

# Parse source
if [ "$SOURCE" == "shared" ]; then
  DB_HOST="postgres.n8n-system.svc.cluster.local"
  DB_NAME="n8n"
  SOURCE_NAMESPACE="n8n-system"
else
  # Source is a namespace (e.g., n8n-v1-25-0)
  DB_HOST="postgres-${SOURCE}.${SOURCE}.svc.cluster.local"
  DB_NAME="n8n"
  SOURCE_NAMESPACE="$SOURCE"

  # Verify namespace exists
  if ! kubectl get namespace "$SOURCE_NAMESPACE" &> /dev/null; then
    echo "ERROR: Namespace not found: $SOURCE_NAMESPACE"
    exit 1
  fi
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${NAME}.sql"

echo "Creating named snapshot: $NAME"
echo "Source: $SOURCE_NAMESPACE ($DB_HOST)"
echo "Output: /backups/snapshots/$BACKUP_FILE"
echo ""

# Create Kubernetes Job to run snapshot
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: snapshot-${NAME}-${TIMESTAMP}
  namespace: n8n-system
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: snapshot
        image: postgres:16
        command:
        - /bin/bash
        - -c
        - |
          set -e

          # Wait for postgres
          until pg_isready -h ${DB_HOST} -U admin; do
            echo "Waiting for PostgreSQL at ${DB_HOST}..."
            sleep 2
          done

          # Create snapshots directory if it doesn't exist
          mkdir -p /backups/snapshots

          # Create backup
          PGPASSWORD=changeme123 pg_dump \\
            -h ${DB_HOST} \\
            -U admin \\
            -d ${DB_NAME} \\
            > "/backups/snapshots/${BACKUP_FILE}"

          if [ -f "/backups/snapshots/${BACKUP_FILE}" ]; then
            SIZE=\$(du -h "/backups/snapshots/${BACKUP_FILE}" | cut -f1)
            echo "Named snapshot created: ${BACKUP_FILE} (\${SIZE})"

            # Create metadata file
            echo "{" > "/backups/snapshots/${BACKUP_FILE}.meta"
            echo "  \"name\": \"${NAME}\"," >> "/backups/snapshots/${BACKUP_FILE}.meta"
            echo "  \"created\": \"\$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"," >> "/backups/snapshots/${BACKUP_FILE}.meta"
            echo "  \"source\": \"${SOURCE}\"," >> "/backups/snapshots/${BACKUP_FILE}.meta"
            echo "  \"type\": \"named\"" >> "/backups/snapshots/${BACKUP_FILE}.meta"
            echo "}" >> "/backups/snapshots/${BACKUP_FILE}.meta"
          else
            echo "ERROR: Snapshot creation failed"
            exit 1
          fi
        volumeMounts:
        - name: backup-storage
          mountPath: /backups
      volumes:
      - name: backup-storage
        persistentVolumeClaim:
          claimName: backup-storage
EOF

echo "Snapshot job created: snapshot-${NAME}-${TIMESTAMP}"
echo "Monitor: kubectl logs -f job/snapshot-${NAME}-${TIMESTAMP} -n n8n-system"
