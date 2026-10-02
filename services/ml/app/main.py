from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.health import router as health_router
from app.routes.models import router as models_router
from app.routes.train import router as train_router
from app.routes.predict import router as predict_router
from app.seed import bootstrap_initial_models

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Bootstrap initial baseline models if none exist
    try:
        bootstrap_initial_models()
    except Exception as e:
        print(f"Warning: Model bootstrap failed: {e}")
    yield

app = FastAPI(
    title="TalentPulse ML Service",
    description="Predictive intelligence microservice for recruitment conversion, job fill probability, and forecasting.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(models_router)
app.include_router(train_router)
app.include_router(predict_router)

if __name__ == "__main__":
    import uvicorn
    from app.config import HOST, PORT
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
