#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="n8n-${TIMESTAMP}-manual.sql"

# Create Kubernetes Job to run snapshot
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: manual-snapshot-${TIMESTAMP}
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
          until pg_isready -h postgres.n8n-system.svc.cluster.local -U n8n_user; do
            echo "Waiting for PostgreSQL..."
            sleep 2
          done

          # Create backup
          PGPASSWORD=n8n_password pg_dump \\
            -h postgres.n8n-system.svc.cluster.local \\
            -U n8n_user \\
            -d n8n \\
            > "/backups/${BACKUP_FILE}"

          if [ -f "/backups/${BACKUP_FILE}" ]; then
            SIZE=\$(du -h "/backups/${BACKUP_FILE}" | cut -f1)
            echo "Snapshot created: ${BACKUP_FILE} (\${SIZE})"
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

echo "Manual snapshot job created: manual-snapshot-${TIMESTAMP}"
