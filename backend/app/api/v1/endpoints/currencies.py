from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.currency import Currency
from app.schemas.currency import CurrencyCreate, CurrencyUpdate, Currency as CurrencySchema
from app.crud.crud_currency import ensure_default_currencies

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=List[CurrencySchema])
async def get_currencies(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all currencies. Seeds USD/EUR/GBP/JPY/CHF/TRY if the table is empty."""
    try:
        query = db.query(Currency)
        if active_only:
            query = query.filter(Currency.is_active == True)
        currencies = query.all()
        if not currencies:
            ensure_default_currencies(db)
            query = db.query(Currency)
            if active_only:
                query = query.filter(Currency.is_active == True)
            currencies = query.all()
        return currencies
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=CurrencySchema)
async def create_currency(
    currency: CurrencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new currency"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        db_currency = Currency(**currency.dict())
        db.add(db_currency)
        db.commit()
        db.refresh(db_currency)
        return db_currency
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{currency_id}", response_model=CurrencySchema)
async def update_currency(
    currency_id: int,
    currency_update: CurrencyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a currency"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        db_currency = db.query(Currency).filter(Currency.id == currency_id).first()
        if not db_currency:
            raise HTTPException(status_code=404, detail="Currency not found")
        
        for field, value in currency_update.dict(exclude_unset=True).items():
            setattr(db_currency, field, value)
            
        db.commit()
        db.refresh(db_currency)
        return db_currency
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{currency_id}")
async def delete_currency(
    currency_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a currency"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        currency = db.query(Currency).filter(Currency.id == currency_id).first()
        if not currency:
            raise HTTPException(status_code=404, detail="Currency not found")
        
        db.delete(currency)
        db.commit()
        return {"message": "Currency deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
