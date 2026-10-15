from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User

router = APIRouter(redirect_slashes=False)

# Mock psychometrics data structure
MOCK_PSYCHOMETRICS_DATA = [
    {
        "id": 1,
        "lead_id": 1,
        "personality_type": "INTJ",
        "openness": 85,
        "conscientiousness": 92,
        "extraversion": 25,
        "agreeableness": 60,
        "neuroticism": 15,
        "risk_tolerance": "High",
        "decision_style": "Analytical",
        "communication_preference": "Direct",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    },
    {
        "id": 2,
        "lead_id": 2,
        "personality_type": "ENFP",
        "openness": 95,
        "conscientiousness": 65,
        "extraversion": 88,
        "agreeableness": 85,
        "neuroticism": 45,
        "risk_tolerance": "Medium",
        "decision_style": "Intuitive",
        "communication_preference": "Enthusiastic",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    }
]

@router.get("")
@router.get("/")
def get_psychometrics(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    lead_id: Optional[int] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get psychometrics data with filtering.
    """
    data = MOCK_PSYCHOMETRICS_DATA.copy()
    
    # Filter by lead_id if provided
    if lead_id:
        data = [item for item in data if item["lead_id"] == lead_id]
    
    # Apply pagination
    return {
        "data": data[skip:skip + limit],
        "total": len(data),
        "skip": skip,
        "limit": limit
    }

@router.get("/{psychometric_id}")
def get_psychometric(
    psychometric_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get specific psychometric data by ID.
    """
    data = next((item for item in MOCK_PSYCHOMETRICS_DATA if item["id"] == psychometric_id), None)
    if not data:
        raise HTTPException(status_code=404, detail="Psychometric data not found")
    return data

@router.post("")
@router.post("/")
def create_psychometric(
    psychometric_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new psychometric data.
    """
    new_id = max([item["id"] for item in MOCK_PSYCHOMETRICS_DATA], default=0) + 1
    new_data = {
        "id": new_id,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        **psychometric_data
    }
    MOCK_PSYCHOMETRICS_DATA.append(new_data)
    return new_data

@router.put("/{psychometric_id}")
def update_psychometric(
    psychometric_id: int,
    psychometric_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update psychometric data.
    """
    for i, item in enumerate(MOCK_PSYCHOMETRICS_DATA):
        if item["id"] == psychometric_id:
            MOCK_PSYCHOMETRICS_DATA[i] = {
                **item,
                **psychometric_data,
                "updated_at": "2024-01-01T00:00:00Z"
            }
            return MOCK_PSYCHOMETRICS_DATA[i]
    
    raise HTTPException(status_code=404, detail="Psychometric data not found")

@router.delete("/{psychometric_id}")
def delete_psychometric(
    psychometric_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete psychometric data.
    """
    for i, item in enumerate(MOCK_PSYCHOMETRICS_DATA):
        if item["id"] == psychometric_id:
            deleted_item = MOCK_PSYCHOMETRICS_DATA.pop(i)
            return {"message": "Psychometric data deleted successfully", "deleted": deleted_item}
    
    raise HTTPException(status_code=404, detail="Psychometric data not found")

@router.get("/types")
def get_psychometric_types(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get available psychometric types and categories.
    """
    return {
        "personality_types": [
            "INTJ", "INTP", "ENTJ", "ENTP", 
            "INFJ", "INFP", "ENFJ", "ENFP",
            "ISTJ", "ISFJ", "ESTJ", "ESFJ",
            "ISTP", "ISFP", "ESTP", "ESFP"
        ],
        "risk_tolerance_levels": ["Low", "Medium", "High"],
        "decision_styles": ["Analytical", "Intuitive", "Behavioral", "Conceptual"],
        "communication_preferences": ["Direct", "Enthusiastic", "Supportive", "Detailed"],
        "big_five_traits": [
            "openness", "conscientiousness", "extraversion", 
            "agreeableness", "neuroticism"
        ]
    }

@router.get("/stats/{lead_id}")
def get_lead_psychometric_stats(
    lead_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get psychometric statistics for a specific lead.
    """
    lead_data = next((item for item in MOCK_PSYCHOMETRICS_DATA if item["lead_id"] == lead_id), None)
    
    if not lead_data:
        return {
            "lead_id": lead_id,
            "has_data": False,
            "message": "No psychometric data available for this lead"
        }
    
    return {
        "lead_id": lead_id,
        "has_data": True,
        "personality_type": lead_data["personality_type"],
        "big_five_summary": {
            "openness": lead_data["openness"],
            "conscientiousness": lead_data["conscientiousness"],
            "extraversion": lead_data["extraversion"],
            "agreeableness": lead_data["agreeableness"],
            "neuroticism": lead_data["neuroticism"]
        },
        "behavioral_insights": {
            "risk_tolerance": lead_data["risk_tolerance"],
            "decision_style": lead_data["decision_style"],
            "communication_preference": lead_data["communication_preference"]
        },
        "recommendations": [
            "Use direct communication based on personality type",
            "Tailor approach to risk tolerance level",
            "Consider decision-making style in proposals"
        ]
    }