import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODELS_DIR = str(BASE_DIR / "models")

ML_SERVICE_TOKEN = os.getenv("ML_SERVICE_TOKEN", "dev-ml-token")
MODELS_DIR = os.getenv("MODELS_DIR", DEFAULT_MODELS_DIR)
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

# Ensure models directory exists
os.makedirs(MODELS_DIR, exist_ok=True)
