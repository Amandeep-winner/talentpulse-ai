import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
import joblib

from app.config import MODELS_DIR

class ModelRegistry:
    """Manages model artifact persistence, versioning, and retrieval."""

    def __init__(self, base_dir: str = MODELS_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_model_dir(self, model_name: str) -> str:
        model_dir = os.path.join(self.base_dir, model_name)
        os.makedirs(model_dir, exist_ok=True)
        return model_dir

    def _get_registry_path(self, model_name: str) -> str:
        return os.path.join(self._get_model_dir(model_name), "registry.json")

    def _load_registry(self, model_name: str) -> Dict[str, Any]:
        path = self._get_registry_path(model_name)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"model": model_name, "active_version": None, "versions": []}

    def _save_registry(self, model_name: str, data: Dict[str, Any]) -> None:
        path = self._get_registry_path(model_name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def generate_version(self, model_name: str) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        return f"{model_name}-v{timestamp}"

    def save_model(
        self,
        model_name: str,
        pipeline: Any,
        metrics: Dict[str, Any],
        training_rows: int,
        version: Optional[str] = None,
        set_active: bool = True,
    ) -> Dict[str, Any]:
        """Saves a trained model artifact and its evaluation metrics."""
        model_dir = self._get_model_dir(model_name)
        if not version:
            version = self.generate_version(model_name)

        artifact_path = os.path.join(model_dir, f"{version}.joblib")
        metrics_path = os.path.join(model_dir, f"{version}_metrics.json")

        # Save joblib binary
        joblib.dump(pipeline, artifact_path)

        now_iso = datetime.now(timezone.utc).isoformat()
        metadata = {
            "name": model_name,
            "version": version,
            "trainedAt": now_iso,
            "trainingRows": training_rows,
            "metrics": metrics,
            "artifactPath": artifact_path,
            "isActive": set_active,
        }

        # Save metrics json
        with open(metrics_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        # Update registry
        reg = self._load_registry(model_name)
        reg["versions"] = [v for v in reg["versions"] if v.get("version") != version]
        reg["versions"].append(metadata)
        if set_active:
            reg["active_version"] = version
            for v in reg["versions"]:
                v["isActive"] = (v["version"] == version)
        self._save_registry(model_name, reg)

        return metadata

    def load_model(self, model_name: str, version: Optional[str] = None) -> Tuple[Any, Dict[str, Any]]:
        """Loads model artifact and metadata by version or active version."""
        reg = self._load_registry(model_name)
        target_version = version or reg.get("active_version")

        if not target_version:
            raise ValueError(f"No active version found for model '{model_name}'")

        model_dir = self._get_model_dir(model_name)
        artifact_path = os.path.join(model_dir, f"{target_version}.joblib")
        metrics_path = os.path.join(model_dir, f"{target_version}_metrics.json")

        if not os.path.exists(artifact_path):
            raise FileNotFoundError(f"Model artifact not found at {artifact_path}")

        pipeline = joblib.load(artifact_path)
        metadata = {}
        if os.path.exists(metrics_path):
            with open(metrics_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

        return pipeline, metadata

    def get_active_metadata(self, model_name: str) -> Optional[Dict[str, Any]]:
        reg = self._load_registry(model_name)
        active_ver = reg.get("active_version")
        if not active_ver:
            return None
        for v in reg.get("versions", []):
            if v.get("version") == active_ver:
                return v
        return None

    def list_all_models(self) -> List[Dict[str, Any]]:
        """Lists active models and their latest versions."""
        results = []
        if not os.path.exists(self.base_dir):
            return results

        for item in os.listdir(self.base_dir):
            item_path = os.path.join(self.base_dir, item)
            if os.path.isdir(item_path):
                meta = self.get_active_metadata(item)
                if meta:
                    results.append(meta)
        return results

# Singleton registry instance
registry = ModelRegistry()
