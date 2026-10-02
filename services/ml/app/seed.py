import random
from typing import List, Dict, Any
from app.models.registry import registry
from app.models.application_prob import train_application_model, MODEL_NAME as APP_MODEL_NAME
from app.models.fill_prob import train_fill_model, MODEL_NAME as FILL_MODEL_NAME

def generate_synthetic_application_rows(n: int = 200, seed: int = 42) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    categories = ["engineering", "product", "sales", "marketing", "operations", "healthcare"]
    location_tiers = ["tier_1", "tier_2", "tier_3", "remote"]
    publishers = ["job_board", "social", "search", "aggregator", "referral"]

    rows = []
    for _ in range(n):
        cat = rng.choice(categories)
        loc = rng.choice(location_tiers)
        pub = rng.choice(publishers)
        exp = rng.randint(1, 10)
        ctr = round(rng.uniform(0.015, 0.085), 4)
        cpa = round(rng.uniform(60.0, 450.0), 2)
        conv = round(rng.uniform(0.08, 0.35), 4)
        dow = rng.randint(0, 6)
        bid = round(rng.uniform(1.0, 5.0), 2)
        budget = round(rng.uniform(500.0, 5000.0), 2)

        # Realistic conversion probability formula
        score = (
            (conv * 2.0)
            + (ctr * 5.0)
            - (cpa / 1000.0)
            + (0.1 if loc == "remote" else 0.0)
            + (0.1 if pub in ["job_board", "referral"] else -0.05)
            + rng.uniform(-0.1, 0.1)
        )
        converted = 1 if score > 0.40 else 0

        rows.append({
            "job_category": cat,
            "experience_req": float(exp),
            "location_tier": loc,
            "publisher_type": pub,
            "historical_ctr": ctr,
            "historical_cpa": cpa,
            "historical_conv": conv,
            "day_of_week": dow,
            "bid": bid,
            "budget": budget,
            "converted": converted,
        })
    return rows

def generate_synthetic_fill_rows(n: int = 150, seed: int = 42) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    rows = []
    for _ in range(n):
        salary = rng.randint(60, 220)  # in $k
        skills = rng.randint(3, 10)
        apps_7d = rng.randint(5, 60)
        qual_rate = round(rng.uniform(0.15, 0.70), 4)
        spend = round(rng.uniform(200.0, 3000.0), 2)
        exp_req = rng.randint(1, 8)

        # Higher salary, more early apps, higher qual_rate -> higher fill probability
        # Higher skills count and higher exp_req -> lower fill probability
        score = (
            (salary / 200.0 * 0.3)
            + (apps_7d / 50.0 * 0.3)
            + (qual_rate * 0.4)
            + (spend / 3000.0 * 0.1)
            - (skills / 10.0 * 0.15)
            - (exp_req / 8.0 * 0.15)
            + rng.uniform(-0.1, 0.1)
        )
        filled = 1 if score > 0.38 else 0

        rows.append({
            "salary_band": float(salary),
            "skills_count": skills,
            "applications_first_7d": float(apps_7d),
            "qualified_rate": qual_rate,
            "spend": spend,
            "experience_req": float(exp_req),
            "filled_within_45d": filled,
        })
    return rows

def bootstrap_initial_models() -> None:
    """Pre-trains initial baseline models if none are registered."""
    if not registry.get_active_metadata(APP_MODEL_NAME):
        app_rows = generate_synthetic_application_rows()
        train_application_model(app_rows, version=f"{APP_MODEL_NAME}-v1-init")

    if not registry.get_active_metadata(FILL_MODEL_NAME):
        fill_rows = generate_synthetic_fill_rows()
        train_fill_model(fill_rows, version=f"{FILL_MODEL_NAME}-v1-init")
