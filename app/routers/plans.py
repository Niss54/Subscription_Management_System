from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import BillingPlan, PlanEntitlement
from app.schemas import BillingPlanCreate, BillingPlanOut, PlanEntitlementCreate, PlanEntitlementOut
from app.auth import require_admin, get_current_user

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", response_model=BillingPlanOut)
def create_billing_plan(
    payload: BillingPlanCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin)
):
    """
    PDF Rule: What it costs, how often it bills (daily, weekly, monthly, yearly),
    minimum quantity, dates available, auto-close at end, pause, renew, or close early.
    Admin decides plan by plan.
    """
    plan = BillingPlan(
        name=payload.name,
        interval_unit=payload.interval_unit,
        interval_count=payload.interval_count,
        min_quantity=payload.min_quantity,
        available_from=payload.available_from,
        available_to=payload.available_to,
        auto_close_at_end=payload.auto_close_at_end,
        allow_pause=payload.allow_pause,
        allow_early_close=payload.allow_early_close,
        allow_renew=payload.allow_renew
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("", response_model=List[BillingPlanOut])
def list_billing_plans(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(BillingPlan).all()


@router.get("/{id}", response_model=BillingPlanOut)
def get_billing_plan(id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    plan = db.query(BillingPlan).filter(BillingPlan.id == id).first()
    if not plan:
        raise HTTPException(404, "Billing plan not found")
    return plan


@router.post('/{id}/entitlements', response_model=PlanEntitlementOut, status_code=status.HTTP_201_CREATED)
def attach_plan_entitlement(
    id: str,
    payload: PlanEntitlementCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin)
):
    plan = db.query(BillingPlan).filter(BillingPlan.id == id).first()
    if not plan:
        raise HTTPException(404, 'Billing plan not found')

    ent = PlanEntitlement(
        plan_id=plan.id,
        feature_key=payload.feature_key,
        is_enabled=payload.is_enabled,
        usage_limit=payload.usage_limit
    )
    db.add(ent)
    db.commit()
    db.refresh(ent)
    return ent

@router.get('/{id}/entitlements', response_model=List[PlanEntitlementOut])
def list_plan_entitlements(id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    plan = db.query(BillingPlan).filter(BillingPlan.id == id).first()
    if not plan:
        raise HTTPException(404, 'Billing plan not found')
    return db.query(PlanEntitlement).filter(PlanEntitlement.plan_id == id).all()
