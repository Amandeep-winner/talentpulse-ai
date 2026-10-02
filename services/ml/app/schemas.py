from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

# Training row schemas
class ApplicationTrainRow(BaseModel):
    job_category: str = Field(..., description="Job category, e.g. engineering, product, sales")
    experience_req: float = Field(..., description="Years of experience required")
    location_tier: str = Field(..., description="Location tier: tier_1, tier_2, tier_3, or remote")
    publisher_type: str = Field(..., description="Publisher type: job_board, social, search, aggregator, referral")
    historical_ctr: float = Field(..., description="Historical CTR for this channel / category")
    historical_cpa: float = Field(..., description="Historical CPA for this channel / category")
    historical_conv: float = Field(..., description="Historical conversion rate")
    day_of_week: int = Field(..., ge=0, le=6, description="Day of week (0=Mon, 6=Sun)")
    bid: float = Field(..., description="Current bid amount")
    budget: float = Field(..., description="Current campaign budget")
    converted: int = Field(..., ge=0, le=1, description="Binary target: 1 if converted to application, else 0")

class ApplicationPredictRequest(BaseModel):
    job_category: str
    experience_req: float
    location_tier: str
    publisher_type: str
    historical_ctr: float
    historical_cpa: float
    historical_conv: float
    day_of_week: int = Field(default=0, ge=0, le=6)
    bid: float
    budget: float

class FillTrainRow(BaseModel):
    salary_band: float = Field(..., description="Midpoint or annualized salary in thousands")
    skills_count: int = Field(..., description="Number of required skills listed")
    applications_first_7d: float = Field(..., description="Applications received in first 7 days")
    qualified_rate: float = Field(..., description="Ratio of qualified applications to total applications")
    spend: float = Field(..., description="Total ad spend on requisition")
    experience_req: float = Field(..., description="Minimum years of experience required")
    filled_within_45d: int = Field(..., ge=0, le=1, description="Binary target: 1 if filled within 45 days, else 0")

class FillPredictRequest(BaseModel):
    salary_band: float
    skills_count: int
    applications_first_7d: float
    qualified_rate: float
    spend: float
    experience_req: float

class TrainRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(..., description="List of feature rows for training")

class ModelMetrics(BaseModel):
    roc_auc: float
    precision: float
    recall: float
    f1: float
    confusion_matrix: List[List[int]]
    class_balance: Dict[str, Union[int, float]]
    feature_importances: Dict[str, float]
    best_model: Optional[str] = None
    validation_split: Optional[float] = 0.2

class TrainResponse(BaseModel):
    model: str
    version: str
    metrics: Dict[str, Any]
    trainingRows: int
    trainedAt: str
    isActive: bool = True

class TopFactor(BaseModel):
    feature: str
    impact: str = Field(..., description="'positive' or 'negative'")
    weight: float
    description: str

class PredictResponse(BaseModel):
    probability: float
    risk: Optional[str] = None
    modelVersion: str
    topFactors: List[TopFactor] = Field(default_factory=list)

class ModelMetadata(BaseModel):
    name: str
    version: str
    trainedAt: str
    trainingRows: int
    metrics: Dict[str, Any]
    isActive: bool

class ModelsListResponse(BaseModel):
    models: List[ModelMetadata]

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
