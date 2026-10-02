import os
import shutil
import tempfile
import pytest
from app.models.registry import ModelRegistry

@pytest.fixture
def temp_registry():
    temp_dir = tempfile.mkdtemp()
    reg = ModelRegistry(base_dir=temp_dir)
    yield reg
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_registry_save_and_load(temp_registry):
    dummy_model = {"model": "dummy"}
    metrics = {"roc_auc": 0.85}

    meta = temp_registry.save_model(
        model_name="test_model",
        pipeline=dummy_model,
        metrics=metrics,
        training_rows=100,
        version="v1.0",
        set_active=True,
    )

    assert meta["name"] == "test_model"
    assert meta["version"] == "v1.0"
    assert meta["isActive"] is True

    # Load active version
    loaded_pipeline, loaded_meta = temp_registry.load_model("test_model")
    assert loaded_pipeline == dummy_model
    assert loaded_meta["version"] == "v1.0"

    # Save second version
    dummy_model_v2 = {"model": "dummy_v2"}
    temp_registry.save_model(
        model_name="test_model",
        pipeline=dummy_model_v2,
        metrics={"roc_auc": 0.90},
        training_rows=200,
        version="v2.0",
        set_active=True,
    )

    # Active should now be v2.0
    loaded_v2, loaded_meta_v2 = temp_registry.load_model("test_model")
    assert loaded_v2 == dummy_model_v2
    assert loaded_meta_v2["version"] == "v2.0"

    # Can still load v1.0 explicitly
    loaded_v1, _ = temp_registry.load_model("test_model", version="v1.0")
    assert loaded_v1 == dummy_model
