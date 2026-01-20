#!/bin/bash

set -e

# Usage: ./scripts/deploy-version.sh <version> [--queue|--regular] [--isolated-db] [--snapshot <name>] [--name <custom-name>]

VERSION=$1
shift

# Parse flags
MODE="--queue"
ISOLATED_DB=""
CUSTOM_NAME=""
SNAPSHOT_NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --queue|--regular)
      MODE=$1
      shift
      ;;
    --isolated-db)
      ISOLATED_DB=$1
      shift
      ;;
    --name)
      CUSTOM_NAME="$2"
      shift 2
      ;;
    --snapshot)
      SNAPSHOT_NAME="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/deploy-version.sh <version> [--queue|--regular] [--isolated-db] [--snapshot <name>] [--name <custom-name>]"
  echo ""
  echo "Examples:"
  echo "  ./scripts/deploy-version.sh 1.123 --queue"
  echo "  ./scripts/deploy-version.sh 1.123 --regular --name acme-prod"
  echo "  ./scripts/deploy-version.sh 1.123 --regular --isolated-db --snapshot prod-baseline"
  exit 1
fi

# Validate: --snapshot requires --isolated-db
if [ -n "$SNAPSHOT_NAME" ] && [ "$ISOLATED_DB" != "--isolated-db" ]; then
  echo "ERROR: --snapshot flag requires --isolated-db"
  echo "Usage: ./scripts/deploy-version.sh <version> --regular --isolated-db --snapshot <name>"
  exit 1
fi

# Verify snapshot exists (if provided)
if [ -n "$SNAPSHOT_NAME" ]; then
  echo "Verifying snapshot exists: ${SNAPSHOT_NAME}.sql"

  # Use temporary pod to check if snapshot file exists
  kubectl delete pod tmp-verify --ignore-not-found=true -n n8n-system >/dev/null 2>&1
  SNAPSHOT_EXISTS=$(kubectl run tmp-verify --rm -i --restart=Never --image=busybox -n n8n-system \
    --overrides="{\"spec\":{\"containers\":[{\"name\":\"tmp-verify\",\"image\":\"busybox\",\"command\":[\"sh\",\"-c\",\"[ -f '/backups/snapshots/${SNAPSHOT_NAME}.sql' ] && echo 'true' || echo 'false'\"],\"volumeMounts\":[{\"name\":\"backup\",\"mountPath\":\"/backups\"}]}],\"volumes\":[{\"name\":\"backup\",\"persistentVolumeClaim\":{\"claimName\":\"backup-storage\"}}]}}" \
    2>&1 | grep -v "^pod.*deleted" | tr -d '\n')

  if [ "$SNAPSHOT_EXISTS" != "true" ]; then
    echo "ERROR: Snapshot not found: ${SNAPSHOT_NAME}.sql"
    echo ""
    echo "Available named snapshots:"
    ./scripts/list-snapshots.sh --named-only
    exit 1
  fi

  echo "✓ Snapshot verified: ${SNAPSHOT_NAME}.sql"
fi
echo ""

# Generate namespace and port
if [ -n "$CUSTOM_NAME" ]; then
  NAMESPACE="$CUSTOM_NAME"
  RELEASE_NAME="$CUSTOM_NAME"

  # Hash-based port for custom names (CRC32 mod 1000 + 30000)
  PORT=$(echo -n "$CUSTOM_NAME" | cksum | awk '{print 30000 + ($1 % 1000)}')
else
  # Auto-generate from version
  NAMESPACE="n8n-v${VERSION//./-}"
  RELEASE_NAME="n8n-v${VERSION//./-}"

  # Calculate port from version (include patch to avoid conflicts)
  # Formula: 30000 + major*100 + minor*10 + patch
  PORT=$(python3 -c "v='$VERSION'.split('.'); print(30000 + int(v[0])*100 + int(v[1])*10 + int(v[2]))")
fi

# Validate namespace and Helm release
if kubectl get namespace "$NAMESPACE" &> /dev/null; then
  # Namespace exists - check if Helm release is successfully deployed
  HELM_STATUS=$(helm list -n "$NAMESPACE" -o json 2>/dev/null | python3 -c "import json, sys; data=json.load(sys.stdin); print(data[0]['status'] if data else 'none')" 2>/dev/null || echo "none")

  if [ "$HELM_STATUS" == "deployed" ]; then
    echo "ERROR: Version already deployed in namespace '$NAMESPACE'"
    echo "Access UI: http://localhost:$PORT"
    echo "To redeploy, first remove the existing deployment:"
    echo "  ./scripts/remove-version.sh ${VERSION}"
    exit 1
  elif [ "$HELM_STATUS" == "failed" ]; then
    echo "Found failed deployment in namespace '$NAMESPACE'. Cleaning up..."
    helm uninstall "$RELEASE_NAME" --namespace "$NAMESPACE" 2>/dev/null || true
    kubectl delete namespace "$NAMESPACE" --wait=false

    # Wait for namespace to be fully deleted
    if ! ./scripts/wait-for-namespace-deletion.sh "$NAMESPACE"; then
      echo "ERROR: Failed to clean up namespace $NAMESPACE"
      echo "Please manually delete: kubectl delete namespace $NAMESPACE --force --grace-period=0"
      exit 1
    fi
  else
    echo "ERROR: Namespace '$NAMESPACE' exists but has no Helm release"
    echo "Please manually clean up: kubectl delete namespace $NAMESPACE"
    exit 1
  fi
fi

# Determine queue mode
if [ "$MODE" == "--queue" ]; then
  QUEUE_MODE="true"
  echo "Deploying n8n v${VERSION} in QUEUE mode..."
elif [ "$MODE" == "--regular" ]; then
  QUEUE_MODE="false"
  echo "Deploying n8n v${VERSION} in REGULAR mode..."
else
  echo "Invalid mode: $MODE (use --queue or --regular)"
  exit 1
fi

# Determine isolated DB
if [ "$ISOLATED_DB" == "--isolated-db" ]; then
  ISOLATED="true"
  echo "Using ISOLATED database"
else
  ISOLATED="false"
  echo "Using SHARED database"
fi

# Check cluster capacity before deploying
echo ""
echo "Checking cluster capacity..."

# Memory requirements (in Mi)
QUEUE_MODE_MEMORY=1792  # main(512) + webhook(256) + 2*worker(512)
REGULAR_MODE_MEMORY=512  # main only
ISOLATED_DB_MEMORY=512   # postgres when using isolated DB

# Calculate required memory for this deployment
if [ "$QUEUE_MODE" == "true" ]; then
  REQUIRED_MEMORY=$QUEUE_MODE_MEMORY
else
  REQUIRED_MEMORY=$REGULAR_MODE_MEMORY
fi

# Add isolated DB memory if needed
if [ "$ISOLATED" == "true" ]; then
  REQUIRED_MEMORY=$((REQUIRED_MEMORY + ISOLATED_DB_MEMORY))
fi

# Get cluster allocatable memory (in Mi)
ALLOCATABLE=$(kubectl get nodes -o json 2>/dev/null | \
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    mem = data['items'][0]['status']['allocatable']['memory']
    # Convert Ki to Mi
    print(int(mem.rstrip('Ki')) // 1024)
except:
    print('0')
" 2>/dev/null || echo "0")

# Get current memory requests across all pods (in Mi)
CURRENT_USAGE=$(kubectl get pods --all-namespaces -o json 2>/dev/null | \
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    total = 0
    for pod in data['items']:
        if pod['status']['phase'] in ['Running', 'Pending']:
            for container in pod['spec']['containers']:
                mem_req = container.get('resources', {}).get('requests', {}).get('memory', '0')
                if mem_req.endswith('Mi'):
                    total += int(mem_req[:-2])
                elif mem_req.endswith('Gi'):
                    total += int(mem_req[:-2]) * 1024
    print(total)
except:
    print('0')
" 2>/dev/null || echo "0")

# Calculate available memory
AVAILABLE=$((ALLOCATABLE - CURRENT_USAGE))

# Check if we have enough capacity
if [ "$ALLOCATABLE" -eq 0 ]; then
  echo "⚠️  Warning: Could not determine cluster capacity (kubectl or python3 not available)"
  echo "Proceeding without capacity check..."
  echo ""
elif [ $AVAILABLE -lt $REQUIRED_MEMORY ]; then
  echo "❌ ERROR: Insufficient cluster memory"
  echo ""
  echo "Required:  ${REQUIRED_MEMORY}Mi ($([ "$QUEUE_MODE" == "true" ] && echo "queue" || echo "regular") mode$([ "$ISOLATED" == "true" ] && echo " + isolated DB" || echo ""))"
  echo "Available: ${AVAILABLE}Mi"
  echo "Total:     ${ALLOCATABLE}Mi"
  echo "Usage:     ${CURRENT_USAGE}Mi ($((CURRENT_USAGE * 100 / ALLOCATABLE))%)"
  echo ""
  echo "Active n8n deployments:"

  # List n8n deployments with their memory usage
  for ns in $(kubectl get ns -o name 2>/dev/null | grep "namespace/n8n-v" | cut -d/ -f2); do
    ns_memory=$(kubectl get pods -n "$ns" -o json 2>/dev/null | \
      python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    total = 0
    for pod in data['items']:
        if pod['status']['phase'] in ['Running', 'Pending']:
            for container in pod['spec']['containers']:
                mem_req = container.get('resources', {}).get('requests', {}).get('memory', '0')
                if mem_req.endswith('Mi'):
                    total += int(mem_req[:-2])
                elif mem_req.endswith('Gi'):
                    total += int(mem_req[:-2]) * 1024
    print(total)
except:
    print('0')
" 2>/dev/null || echo "0")

    # Get namespace age
    ns_age=$(kubectl get namespace "$ns" -o jsonpath='{.metadata.creationTimestamp}' 2>/dev/null | \
      python3 -c "
from datetime import datetime
import sys
try:
    created = datetime.fromisoformat(sys.stdin.read().strip().replace('Z', '+00:00'))
    now = datetime.now(created.tzinfo)
    diff = now - created
    hours = int(diff.total_seconds() // 3600)
    mins = int((diff.total_seconds() % 3600) // 60)
    if hours > 24:
        days = hours // 24
        hours = hours % 24
        print(f'{days}d {hours}h')
    elif hours > 0:
        print(f'{hours}h {mins}m')
    else:
        print(f'{mins}m')
except:
    print('unknown')
" 2>/dev/null || echo "unknown")

    echo "  • $ns (${ns_memory}Mi, age: $ns_age)"
  done

  echo ""
  echo "To free up memory, delete old deployments:"
  echo "  ./scripts/remove-version.sh <version>"
  echo ""
  exit 1
else
  echo "✓ Sufficient capacity: ${AVAILABLE}Mi available, ${REQUIRED_MEMORY}Mi required"
fi
echo ""

# Deploy using Helm
echo "Installing Helm release ${RELEASE_NAME} in namespace ${NAMESPACE}..."

# Build Helm command
HELM_CMD="helm install \"$RELEASE_NAME\" ./charts/n8n-instance \
  --set n8nVersion=\"$VERSION\" \
  --set queueMode=\"$QUEUE_MODE\" \
  --set isolatedDB=\"$ISOLATED\" \
  --namespace \"$NAMESPACE\" \
  --create-namespace"

# Add snapshot parameters if provided
if [ -n "$SNAPSHOT_NAME" ]; then
  HELM_CMD="$HELM_CMD \
    --set database.isolated.snapshot.enabled=true \
    --set database.isolated.snapshot.name=\"${SNAPSHOT_NAME}.sql\""
fi

# Execute Helm install
eval "$HELM_CMD"

echo ""
echo "Deployment initiated!"
echo "Namespace: $NAMESPACE"
echo "Version: $VERSION"
echo "Mode: $([ "$QUEUE_MODE" == "true" ] && echo "Queue" || echo "Regular")"
echo "Database: $([ "$ISOLATED" == "true" ] && echo "Isolated" || echo "Shared")"
if [ -n "$SNAPSHOT_NAME" ]; then
  echo "Snapshot: ${SNAPSHOT_NAME}.sql"
fi
echo ""
echo "Check status: kubectl get pods -n $NAMESPACE"
echo "View logs: kubectl logs -f n8n-main-0 -n $NAMESPACE"
echo "Access UI: http://localhost:$PORT"
