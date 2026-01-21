#!/bin/bash

# Usage: ./scripts/list-snapshots.sh [--named-only|--auto-only]

MODE=${1:-all}

# Helper function to list files using the existing backup-storage pod
list_files() {
  local path=$1
  kubectl exec -n n8n-system deploy/backup-storage -- ls -1 "$path" 2>/dev/null || true
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
