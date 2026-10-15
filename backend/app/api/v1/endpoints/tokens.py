from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header, Response, Body
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.token import Token
from app.services.token_service import TokenService
from decimal import Decimal
import stripe
import json
import logging
from app.core.config import settings
from app.core.stripe import verify_webhook_signature
from pydantic import BaseModel
from sqlalchemy.sql import text

router = APIRouter(redirect_slashes=False)
logger = logging.getLogger(__name__)

# TokenBalanceResponse modelini tanımlayalım
class TokenBalanceResponse(BaseModel):
    balance: int

# settings.STRIPE_SECRET_KEY ayarını kontrol edelim
if hasattr(settings, "STRIPE_SECRET_KEY"):
    stripe.api_key = settings.STRIPE_SECRET_KEY
else:
    logger.warning("STRIPE_SECRET_KEY setting is missing. Stripe functionality will be disabled.")
    stripe.api_key = "dummy_key_for_development"

TOKEN_PACKAGES = {
    1: {"tokens": 50, "price": 5000, "name": "Basic"},      # $50.00
    2: {"tokens": 100, "price": 10000, "name": "Pro"},      # $100.00
    3: {"tokens": 500, "price": 50000, "name": "Enterprise"}  # $500.00
}

@router.get("/balance", response_model=TokenBalanceResponse)
async def get_token_balance(
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get user's token balance
    """
    try:
        # Log that we're getting token balance for a specific user
        logger.info(f"Getting token balance for user ID: {current_user.id}")
        
        # Get token balance
        balance = await TokenService.get_token_balance(db, current_user.id)
        
        # Log successful balance retrieval
        logger.info(f"Successfully retrieved token balance: {balance} for user {current_user.id}")
        
        return {"balance": balance}
    except Exception as e:
        # Log any errors
        logger.error(f"Error retrieving token balance for user {current_user.id}: {str(e)}")
        # Do not propagate the error, just return 0
        return {"balance": 0}

@router.post("/purchase")
async def purchase_tokens(
    amount: Decimal = Body(..., description="Amount in USD"),
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Purchase tokens
    """
    try:
        result = await TokenService.add_tokens(db, current_user.id, amount)
        return {"success": True, "balance": result["balance"]}
    except Exception as e:
        logger.error(f"Error purchasing tokens: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error purchasing tokens: {str(e)}")

@router.get("/history")
async def get_purchase_history(
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get user's token purchase history
    """
    try:
        history = await TokenService.get_purchase_history(db, current_user.id)
        return {"transactions": history}
    except Exception as e:
        logger.error(f"Error retrieving purchase history: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error retrieving purchase history: {str(e)}"
        )

class CheckoutSessionRequest(BaseModel):
    package_id: int

@router.post("/create-checkout-session")
async def create_checkout_session(
    request: CheckoutSessionRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if request.package_id not in TOKEN_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package id")
    
    package = TOKEN_PACKAGES[request.package_id]
    
    try:
        # Log the request details
        logger.info(f"Creating checkout session for user {current_user.id} - Package: {package['name']} with {package['tokens']} tokens")
        
        # Sabit olarak localhost URL'ini kullan (geliştirme ortamında)
        base_url = "http://localhost:3000"
        
        # Create URLs with the correct base
        success_url = f"{base_url}/profile?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{base_url}/profile"
        
        # Log the success and cancel URLs
        logger.info(f"Success URL: {success_url}")
        logger.info(f"Cancel URL: {cancel_url}")
        
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f'{package["name"]} - {package["tokens"]} Tokens',
                        'description': '1 Token = $1 USD',
                    },
                    'unit_amount': package["price"],  # Stripe uses cents
                },
                'quantity': 1,
            }],
            mode='payment',
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(current_user.id),
            metadata={
                'tokens': package["tokens"],
                'user_id': current_user.id,
                'package_name': package["name"]
            }
        )
        
        # Log the created session ID
        logger.info(f"Checkout session created with ID: {checkout_session.id}")
        
        return {"checkout_url": checkout_session.url}
    except Exception as e:
        logger.error(f"Error creating checkout session: {str(e)}")
        # Add more error details
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/prices")
async def get_token_prices():
    """Token paket fiyatlarını getir"""
    return {
        pkg_id: {
            "name": pkg["name"],
            "tokens": pkg["tokens"],
            "price": pkg["price"] / 100  # Convert cents to dollars
        }
        for pkg_id, pkg in TOKEN_PACKAGES.items()
    }

@router.post("/webhook", status_code=status.HTTP_200_OK)
async def handle_stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
    db: Session = Depends(deps.get_db)
):
    """
    Handle Stripe webhook events, particularly for successful payments
    """
    try:
        # Get the raw request payload
        payload = await request.body()
        
        logger.info(f"Received Stripe webhook - Signature: {stripe_signature[:10]}... (truncated)")
        
        # Verify the webhook signature
        try:
            event = await verify_webhook_signature(payload, stripe_signature)
            logger.info(f"Webhook signature verification successful, event type: {event['type']}")
        except ValueError as e:
            logger.error(f"Webhook signature verification failed: {str(e)}")
            return Response(status_code=status.HTTP_400_BAD_REQUEST)
        
        # Handle the event based on its type
        if event['type'] == 'checkout.session.completed':
            logger.info("Processing checkout.session.completed event")
            session = event['data']['object']
            
            # Log full session data for debugging (removing sensitive info)
            safe_session_data = {k: v for k, v in session.items() if k not in ['client_secret', 'payment_intent']}
            logger.info(f"Session data: {json.dumps(safe_session_data)}")
            
            # Get the user ID from the session metadata
            user_id = int(session.get('metadata', {}).get('user_id', 0))
            tokens = int(session.get('metadata', {}).get('tokens', 0))
            
            logger.info(f"Extracted user_id: {user_id}, tokens: {tokens} from webhook payload")
            
            if user_id and tokens:
                # Add tokens to the user's account
                try:
                    result = await TokenService.add_tokens(db, user_id, Decimal(str(tokens)))
                    logger.info(f"Successfully added {tokens} tokens to user {user_id}. New balance: {result['balance']}")
                except Exception as e:
                    logger.error(f"Error adding tokens to user {user_id}: {str(e)}")
                    # Try to provide more details about the error
                    logger.error(f"Error type: {type(e).__name__}")
                    return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                logger.warning(f"Missing user_id or tokens in webhook metadata: user_id={user_id}, tokens={tokens}")
        else:
            logger.info(f"Received webhook event type '{event['type']}' - not processing")
        
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        # Add more detailed error information
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ConfirmSessionRequest(BaseModel):
    session_id: str

@router.post("/confirm-session")
async def confirm_session(
    request: ConfirmSessionRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Manually confirm a Stripe checkout session and add tokens to the user's account
    """
    try:
        # Log request
        logger.info(f"Manual session confirmation requested for session ID: {request.session_id}")
        
        # Retrieve the session from Stripe
        try:
            session = stripe.checkout.Session.retrieve(request.session_id)
            logger.info(f"Retrieved Stripe session: {request.session_id}")
        except Exception as e:
            logger.error(f"Error retrieving Stripe session: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid session ID")
        
        # Verify session is completed and not already processed
        if session.payment_status != 'paid':
            logger.error(f"Session {request.session_id} payment status is not paid: {session.payment_status}")
            raise HTTPException(status_code=400, detail="Payment is not completed")
        
        # Get tokens from metadata
        tokens = int(session.metadata.get('tokens', 0))
        user_id = int(session.metadata.get('user_id', 0))
        
        logger.info(f"Session metadata - tokens: {tokens}, user_id: {user_id}")
        
        # Verify the session belongs to the current user
        if user_id != current_user.id:
            logger.error(f"Session user ID {user_id} does not match current user {current_user.id}")
            raise HTTPException(status_code=403, detail="This session does not belong to you")
        
        # Check if this session has already been processed
        existing_transaction = db.execute(
            text("SELECT * FROM transactions WHERE description LIKE :description"),
            {"description": f"%session:{request.session_id}%"}
        ).fetchone()
        
        if existing_transaction:
            logger.info(f"Session {request.session_id} already processed in transaction {existing_transaction.id}")
            return {"success": True, "message": "Tokens already added", "balance": await TokenService.get_token_balance(db, current_user.id)}
        
        # Add tokens to the user's account with session ID in description
        try:
            result = await TokenService.add_tokens(
                db, 
                current_user.id, 
                Decimal(str(tokens)), 
                description=f"Token purchase: ${tokens} (session:{request.session_id})"
            )
            logger.info(f"Successfully added {tokens} tokens to user {current_user.id}. New balance: {result['balance']}")
            return {"success": True, "balance": result['balance']}
        except Exception as e:
            logger.error(f"Error adding tokens: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to add tokens")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in confirm_session: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Internal server error")