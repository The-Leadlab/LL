"""
CPQ (Configure-Price-Quote) API Endpoints

Product catalog, pricing rules, and quote generation.
"""

from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.models.cpq import Product, Quote, PricingRule
from app.schemas.cpq import (
    ProductCreate, ProductUpdate, ProductResponse, ProductCatalog,
    QuoteCreate, QuoteUpdate, QuoteResponse, QuoteDetail,
    QuoteItemCreate, QuoteItemResponse,
    PricingRuleCreate, PricingRuleUpdate, PricingRuleResponse,
    QuoteStatusUpdate, QuoteApprovalRequest, QuoteApprovalResponse,
    QuoteCalculationRequest, QuoteCalculationResponse
)
from app.crud.crud_cpq import crud_product, crud_quote, crud_pricing_rule

router = APIRouter(redirect_slashes=False)


# Product Endpoints
@router.get("/products", response_model=List[ProductResponse])
def list_products(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    is_active: Optional[bool] = Query(True),
    category: Optional[str] = Query(None)
):
    """
    List all products in the catalog.
    """
    products = crud_product.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        is_active=is_active,
        category=category
    )

    return products


@router.get("/products/search", response_model=List[ProductResponse])
def search_products(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    q: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = Query(None),
    min_price: Optional[Decimal] = Query(None, ge=0),
    max_price: Optional[Decimal] = Query(None, ge=0)
):
    """
    Search products by name, description, or SKU.
    """
    products = crud_product.search(
        db,
        organization_id=current_user.organization_id,
        query_text=q,
        category=category,
        min_price=min_price,
        max_price=max_price
    )

    return products


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get product by ID.
    """
    product = crud_product.get(db, product_id)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return product


@router.post("/products", response_model=ProductResponse)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create new product in catalog.
    """
    try:
        product = crud_product.create(
            db,
            obj_in=product_in,
            organization_id=current_user.organization_id
        )
        return product
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_in: ProductUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update product.
    """
    product = crud_product.get(db, product_id)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        product = crud_product.update(db, product=product, obj_in=product_in)
        return product
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete product (soft delete - sets inactive).
    """
    product = crud_product.get(db, product_id)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    crud_product.delete(db, product_id=product_id)

    return {"message": "Product deleted successfully"}


# Quote Endpoints
@router.get("/quotes", response_model=List[QuoteResponse])
def list_quotes(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: Optional[str] = Query(None),
    deal_id: Optional[int] = Query(None)
):
    """
    List all quotes.
    """
    quotes = crud_quote.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        status=status,
        deal_id=deal_id
    )

    return quotes


@router.get("/quotes/{quote_id}", response_model=QuoteDetail)
def get_quote(
    quote_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get quote by ID with all line items.
    """
    quote = crud_quote.get(db, quote_id)

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return quote


@router.post("/quotes", response_model=QuoteDetail)
def create_quote(
    quote_in: QuoteCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create new quote with line items.

    Pricing rules will be automatically applied.
    """
    try:
        quote = crud_quote.create(
            db,
            obj_in=quote_in,
            organization_id=current_user.organization_id,
            created_by_id=current_user.id
        )
        return quote
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/quotes/{quote_id}", response_model=QuoteDetail)
def update_quote(
    quote_id: int,
    quote_in: QuoteUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update quote.
    """
    quote = crud_quote.get(db, quote_id)

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Only allow updates on draft quotes
    if quote.status != "draft":
        raise HTTPException(status_code=400, detail="Can only update draft quotes")

    quote = crud_quote.update(db, quote=quote, obj_in=quote_in)

    return quote


@router.post("/quotes/{quote_id}/items", response_model=QuoteDetail)
def add_quote_item(
    quote_id: int,
    item_in: QuoteItemCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Add item to quote.
    """
    quote = crud_quote.get(db, quote_id)

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if quote.status != "draft":
        raise HTTPException(status_code=400, detail="Can only add items to draft quotes")

    try:
        quote = crud_quote.add_item(db, quote=quote, item_in=item_in)
        return quote
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/quotes/{quote_id}/items/{item_id}", response_model=QuoteDetail)
def remove_quote_item(
    quote_id: int,
    item_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Remove item from quote.
    """
    quote = crud_quote.get(db, quote_id)

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if quote.status != "draft":
        raise HTTPException(status_code=400, detail="Can only remove items from draft quotes")

    quote = crud_quote.remove_item(db, quote=quote, item_id=item_id)

    return quote


@router.post("/quotes/{quote_id}/status", response_model=QuoteDetail)
def update_quote_status(
    quote_id: int,
    status_update: QuoteStatusUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update quote status (draft -> sent -> accepted/rejected).
    """
    quote = crud_quote.get(db, quote_id)

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if requires approval before sending
    if status_update.status == "sent" and quote.requires_approval and not quote.approved_by_id:
        raise HTTPException(status_code=400, detail="Quote requires approval before sending")

    quote = crud_quote.update_status(db, quote=quote, status=status_update.status)

    return quote


@router.post("/quotes/{quote_id}/approve", response_model=QuoteDetail)
def approve_quote(
    quote_id: int,
    approval: QuoteApprovalResponse,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Approve or reject a quote.

    Requires manager permissions.
    """
    quote = crud_quote.get(db, quote_id)

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not quote.requires_approval:
        raise HTTPException(status_code=400, detail="Quote does not require approval")

    if approval.approved:
        quote = crud_quote.approve(db, quote=quote, approved_by_id=current_user.id)
    else:
        # Reject quote
        quote = crud_quote.update_status(db, quote=quote, status="rejected")

    return quote


# Pricing Rule Endpoints
@router.get("/pricing-rules", response_model=List[PricingRuleResponse])
def list_pricing_rules(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    is_active: Optional[bool] = Query(True)
):
    """
    List all pricing rules.
    """
    rules = crud_pricing_rule.get_multi(
        db,
        organization_id=current_user.organization_id,
        is_active=is_active
    )

    return rules


@router.get("/pricing-rules/{rule_id}", response_model=PricingRuleResponse)
def get_pricing_rule(
    rule_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get pricing rule by ID.
    """
    rule = crud_pricing_rule.get(db, rule_id)

    if not rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")

    if rule.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return rule


@router.post("/pricing-rules", response_model=PricingRuleResponse)
def create_pricing_rule(
    rule_in: PricingRuleCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create new pricing rule.

    Rules are applied in priority order (highest first).
    """
    rule = crud_pricing_rule.create(
        db,
        obj_in=rule_in,
        organization_id=current_user.organization_id
    )

    return rule


@router.put("/pricing-rules/{rule_id}", response_model=PricingRuleResponse)
def update_pricing_rule(
    rule_id: int,
    rule_in: PricingRuleUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update pricing rule.
    """
    rule = crud_pricing_rule.get(db, rule_id)

    if not rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")

    if rule.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    rule = crud_pricing_rule.update(db, rule=rule, obj_in=rule_in)

    return rule


@router.delete("/pricing-rules/{rule_id}")
def delete_pricing_rule(
    rule_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete pricing rule.
    """
    rule = crud_pricing_rule.get(db, rule_id)

    if not rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")

    if rule.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    crud_pricing_rule.delete(db, rule_id=rule_id)

    return {"message": "Pricing rule deleted successfully"}
