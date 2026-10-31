from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, DiscountRule, Subscription, SubscriptionDiscount
from app.schemas import DiscountRuleCreate, DiscountRuleOut, ApplyDiscountRequest
from app.auth import require_admin, require_admin_or_staff

router = APIRouter(prefix="/discounts", tags=["discounts"])

@router.post("", response_model=DiscountRuleOut, status_code=status.HTTP_201_CREATED)
def create_discount_rule(
    payload: DiscountRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    existing = db.query(DiscountRule).filter(DiscountRule.code == payload.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Discount code '{payload.code.upper()}' already exists")

    rule = DiscountRule(
        code=payload.code.upper(),
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        min_purchase_amount=payload.min_purchase_amount,
        min_quantity=payload.min_quantity,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_uses=payload.max_uses,
        scope=payload.scope,
        target_product_id=payload.target_product_id,
        is_active=payload.is_active
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule

@router.get("", response_model=List[DiscountRuleOut])
def list_discount_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    return db.query(DiscountRule).all()

@router.post("/subscriptions/{subscription_id}/apply", status_code=status.HTTP_200_OK)
def apply_discount_to_subscription(
    subscription_id: str,
    payload: ApplyDiscountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    rule = db.query(DiscountRule).filter(
        DiscountRule.code == payload.discount_code.upper(),
        DiscountRule.is_active == True
    ).first()

    if not rule:
        raise HTTPException(status_code=404, detail=f"Active discount code '{payload.discount_code}' not found")

    if rule.max_uses is not None and rule.current_uses >= rule.max_uses:
        raise HTTPException(status_code=422, detail="Discount code has reached its maximum usage limit")

    existing_sub_disc = db.query(SubscriptionDiscount).filter(
        SubscriptionDiscount.subscription_id == subscription_id,
        SubscriptionDiscount.discount_rule_id == rule.id
    ).first()

    if existing_sub_disc:
        return {"status": "success", "message": "Discount already linked to this subscription"}

    link = SubscriptionDiscount(
        subscription_id=subscription_id,
        discount_rule_id=rule.id
    )
    db.add(link)
    db.commit()

    return {
        "status": "success",
        "message": f"Discount code '{rule.code}' successfully applied to subscription {sub.subscription_number}"
    }
