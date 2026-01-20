FROM python:3.11-slim

# Install kubectl and helm
RUN apt-get update && apt-get install -y curl && \
    curl -LO https://dl.k8s.io/release/v1.28.0/bin/linux/amd64/kubectl && \
    chmod +x kubectl && mv kubectl /usr/local/bin/ && \
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY *.py ./

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set KUBECONFIG to use the modified config created by entrypoint
ENV KUBECONFIG=/tmp/kubeconfig

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
