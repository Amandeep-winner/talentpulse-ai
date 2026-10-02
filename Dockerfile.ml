FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY services/ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ml/ .

EXPOSE 8000

HEALTHCHECK --interval=5s --timeout=5s --retries=10 \
    CMD wget -qO- http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
