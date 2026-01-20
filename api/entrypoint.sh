#!/bin/bash
set -e

# Fix kubeconfig to use kubernetes.docker.internal instead of 127.0.0.1
# This allows the container to reach the host's Kubernetes API on Docker Desktop
if [ -f /root/.kube/config ]; then
    echo "Fixing kubeconfig for Docker container networking..."
    # Copy to writable location and modify
    cp /root/.kube/config /tmp/kubeconfig
    sed -i 's|https://127.0.0.1:6443|https://kubernetes.docker.internal:6443|g' /tmp/kubeconfig
    # Set KUBECONFIG environment variable to use the modified config
    export KUBECONFIG=/tmp/kubeconfig
    echo "Kubeconfig updated successfully (using /tmp/kubeconfig)"
fi

# Start the FastAPI application
exec uvicorn main:app --host 0.0.0.0 --port 8080
