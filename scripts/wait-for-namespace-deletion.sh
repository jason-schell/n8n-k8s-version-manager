#!/bin/bash

# Usage: ./wait-for-namespace-deletion.sh <namespace>

NAMESPACE=$1
MAX_WAIT=120  # 2 minutes max

if [ -z "$NAMESPACE" ]; then
  echo "Usage: ./wait-for-namespace-deletion.sh <namespace>"
  exit 1
fi

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
  echo "Namespace $NAMESPACE does not exist (already deleted)"
  exit 0
fi

echo "Waiting for namespace $NAMESPACE to be fully deleted..."

# Poll every 2 seconds
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
    echo "✓ Namespace $NAMESPACE fully deleted"
    exit 0
  fi

  sleep 2
  ELAPSED=$((ELAPSED + 2))

  # Show progress every 10 seconds
  if [ $((ELAPSED % 10)) -eq 0 ]; then
    echo "Still waiting... (${ELAPSED}s elapsed)"
  fi
done

echo "ERROR: Namespace $NAMESPACE still exists after ${MAX_WAIT}s"
exit 1
