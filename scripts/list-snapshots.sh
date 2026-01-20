#!/bin/bash

# Usage: ./scripts/list-snapshots.sh [--named-only|--auto-only]

MODE=${1:-all}

# Helper function to list files using a temporary pod
list_files() {
  local path=$1
  # Delete any existing tmp-list pod first
  kubectl delete pod tmp-list -n n8n-system --ignore-not-found=true >/dev/null 2>&1
  # Run the listing command, redirecting stderr for cleanup messages only
  kubectl run tmp-list --rm -i --restart=Never --image=busybox -n n8n-system \
    --overrides="{\"spec\":{\"containers\":[{\"name\":\"tmp-list\",\"image\":\"busybox\",\"command\":[\"ls\",\"-1\",\"$path\"],\"volumeMounts\":[{\"name\":\"backup\",\"mountPath\":\"/backups\"}]}],\"volumes\":[{\"name\":\"backup\",\"persistentVolumeClaim\":{\"claimName\":\"backup-storage\"}}]}}" \
    2>&1 | grep -v "^pod.*deleted"
}

# List snapshots
case $MODE in
  --named-only)
    list_files "/backups/snapshots/" | grep '\.sql$' | grep -v '\.meta$' || true
    ;;
  --auto-only)
    list_files "/backups/" | grep '^n8n-.*\.sql$' | grep -v '\.meta$' || true
    ;;
  all|*)
    echo "=== Named Snapshots ==="
    NAMED=$(list_files "/backups/snapshots/" | grep '\.sql$' | grep -v '\.meta$' || true)
    if [ -z "$NAMED" ]; then
      echo "  (none)"
    else
      echo "$NAMED" | sed 's/^/  /'
    fi
    echo ""
    echo "=== Timestamped Snapshots ==="
    AUTO=$(list_files "/backups/" | grep '^n8n-.*\.sql$' | grep -v '\.meta$' || true)
    if [ -z "$AUTO" ]; then
      echo "  (none)"
    else
      echo "$AUTO" | sed 's/^/  /'
    fi
    ;;
esac
