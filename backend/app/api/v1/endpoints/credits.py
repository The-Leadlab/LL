from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
import stripe
import os

from app.database import get_db
from app.api import deps
from app.models.user import User
from app.core.config import settings

router = APIRouter(redirect_slashes=False)

# Pydantic models
class CreditPackage(BaseModel):
    id: int
    name: str
    description: Optional[str]
    credits: int
    price: float
    stripe_price_id: str
    is_active: bool

class CreditBalance(BaseModel):
    organization_id: int
    credit_balance: float
    subscription_status: str
    stripe_customer_id: Optional[str]

class CreditTransaction(BaseModel):
    amount: float
    credits: int
    package_name: str
    stripe_payment_intent_id: Optional[str]

class CreditUsage(BaseModel):
    feature_name: str
    credits_consumed: int
    description: Optional[str]

class ConsumeCreditsRequest(BaseModel):
    feature: str
    credits: int

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

@router.get("/balance")
async def get_credit_balance(
    current_user: User = Depends(deps.get_current_user),
    db: Session = Depends(get_db)
):
    """Get organization credit balance"""
    try:
        result = db.execute(
            text("SELECT credit_balance, subscription_status FROM organizations WHERE id = :org_id"),
            {"org_id": current_user.organization_id}
        ).fetchone()
        
        return {
            "organization_id": current_user.organization_id,
            "credit_balance": float(result[0] or 0),
            "subscription_status": result[1] or "trial"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/packages")
async def get_credit_packages(db: Session = Depends(get_db)):
    """Get available credit packages"""
    try:
        result = db.execute(
            text("SELECT id, name, credits, price FROM credit_packages WHERE is_active = TRUE ORDER BY price")
        ).fetchall()
        
        return {
            "packages": [
                {"id": row[0], "name": row[1], "credits": row[2], "price": float(row[3])}
                for row in result
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/purchase/{package_id}")
async def create_purchase_session(
    package_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: Session = Depends(get_db)
):
    """Create Stripe checkout session for credit purchase"""
    try:
        # Get package details
        package = db.execute(
            text("""
                SELECT name, credits, price, stripe_price_id 
                FROM credit_packages 
                WHERE id = :package_id AND is_active = TRUE
            """),
            {"package_id": package_id}
        ).fetchone()
        
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        # Create Stripe checkout session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price': package[3],  # stripe_price_id
                'quantity': 1,
            }],
            mode='payment',
            success_url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/credits/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/credits/cancel",
            metadata={
                'organization_id': current_user.organization_id,
                'user_id': current_user.id,
                'package_id': package_id,
                'credits': package[1]
            }
        )
        
        return {"checkout_url": checkout_session.url, "session_id": checkout_session.id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating checkout: {str(e)}")

@router.post("/consume")
async def consume_credits(
    request: ConsumeCreditsRequest,
    current_user: User = Depends(deps.get_current_user),
    db: Session = Depends(get_db)
):
    """Consume credits for feature usage"""
    try:
        # Check balance
        balance = db.execute(
            text("SELECT credit_balance FROM organizations WHERE id = :org_id"),
            {"org_id": current_user.organization_id}
        ).fetchone()
        
        if not balance or balance[0] < request.credits:
            raise HTTPException(status_code=402, detail="Insufficient credits")
        
        # Deduct credits
        db.execute(
            text("UPDATE organizations SET credit_balance = credit_balance - :credits WHERE id = :org_id"),
            {"credits": request.credits, "org_id": current_user.organization_id}
        )
        
        # Optional: Log usage to feature_usage table if it exists
        try:
            db.execute(
                text("""
                    INSERT INTO feature_usage (organization_id, feature_name, credits_consumed, created_at)
                    VALUES (:org_id, :feature_name, :credits, NOW())
                """),
                {
                    "org_id": current_user.organization_id,
                    "feature_name": request.feature,
                    "credits": request.credits
                }
            )
        except:
            # Table might not exist, ignore
            pass
            
        db.commit()
        
        return {"success": True, "credits_consumed": request.credits}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/usage/history")
async def get_usage_history(
    current_user: User = Depends(deps.get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """Get credit usage history"""
    try:
        # Try to get from feature_usage table if it exists
        try:
            result = db.execute(
                text("""
                    SELECT feature_name, credits_consumed, created_at
                    FROM feature_usage 
                    WHERE organization_id = :org_id
                    ORDER BY created_at DESC
                    LIMIT :limit
                """),
                {"org_id": current_user.organization_id, "limit": limit}
            ).fetchall()
            
            usage_history = []
            for row in result:
                usage_history.append({
                    "feature_name": row[0],
                    "credits_consumed": row[1],
                    "created_at": row[2].isoformat() if row[2] else None
                })
            
            return {"usage_history": usage_history}
            
        except:
            # Table doesn't exist yet, return empty
            return {"usage_history": []}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching usage: {str(e)}")

@router.post("/webhook/stripe")
async def stripe_webhook(request: dict, db: Session = Depends(get_db)):
    """Handle Stripe webhook events"""
    try:
        event_type = request.get("type")
        
        if event_type == "checkout.session.completed":
            session = request["data"]["object"]
            metadata = session.get("metadata", {})
            
            org_id = metadata.get("organization_id")
            credits = int(metadata.get("credits", 0))
            
            if org_id and credits:
                # Add credits to organization
                db.execute(
                    text("""
                        UPDATE organizations 
                        SET credit_balance = credit_balance + :credits 
                        WHERE id = :org_id
                    """),
                    {"credits": credits, "org_id": org_id}
                )
                
                # Log transaction
                db.execute(
                    text("""
                        INSERT INTO transactions 
                        (user_id, organization_id, type, amount, credit_change, stripe_session_id, status, created_at)
                        VALUES (:user_id, :org_id, 'credit_purchase', :amount, :credits, :session_id, 'completed', NOW())
                    """),
                    {
                        "user_id": metadata.get("user_id"),
                        "org_id": org_id,
                        "amount": session.get("amount_total", 0) / 100,  # Stripe amounts are in cents
                        "credits": credits,
                        "session_id": session["id"]
                    }
                )
                
                db.commit()
        
        return {"status": "success"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Webhook error: {str(e)}") 