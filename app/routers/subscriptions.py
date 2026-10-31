from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User, UserRole, Subscription, SubscriptionState, SubscriptionLine,
    BillingPlan, QuotationTemplate, ProductVariant, TaxRule
)
from app.schemas import (
    SubscriptionCreate, SubscriptionFromTemplateCreate,
    SubscriptionStateTransition, SubscriptionOut
)
from app.auth import get_current_user, require_admin_or_staff
from app.services.billing import generate_invoice_for_subscription

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

def generate_sub_number(db: Session) -> str:
    current_year = date.today().year
    prefix = f"SUB-{current_year}-"
    count = db.query(Subscription).filter(Subscription.subscription_number.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"

@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    payload: SubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    plan = db.query(BillingPlan).filter(BillingPlan.id == payload.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Billing plan not found")

    customer = db.query(User).filter(User.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    start_date = payload.start_date or date.today()
    sub_num = generate_sub_number(db)

    sub = Subscription(
        subscription_number=sub_num,
        customer_id=payload.customer_id,
        plan_id=payload.plan_id,
        state=SubscriptionState.draft,
        start_date=start_date,
        payment_terms=payload.payment_terms,
        notes=payload.notes,
        next_invoice_date=start_date
    )
    db.add(sub)
    db.flush()

    total_qty = Decimal("0.0000")
    for line in payload.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        if not variant:
            raise HTTPException(status_code=404, detail=f"Variant {line.variant_id} not found")
        
        unit_price = line.unit_price
        if unit_price is None:
            unit_price = variant.product.base_sales_price + variant.price_extra

        sub_line = SubscriptionLine(
            subscription_id=sub.id,
            variant_id=line.variant_id,
            quantity=line.quantity,
            unit_price=unit_price,
            tax_rate=line.tax_rate or Decimal("0.00")
        )
        total_qty += line.quantity
        db.add(sub_line)

    if total_qty < plan.min_quantity:
        raise HTTPException(
            status_code=422,
            detail=f"Total line quantity ({total_qty}) is below plan minimum required ({plan.min_quantity})"
        )

    db.commit()
    db.refresh(sub)
    return sub

@router.post("/from-template", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription_from_template(
    payload: SubscriptionFromTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    template = db.query(QuotationTemplate).filter(QuotationTemplate.id == payload.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Quotation template not found")

    plan = template.plan
    start_date = payload.start_date or date.today()
    expiry_date = start_date + timedelta(days=template.validity_days)
    sub_num = generate_sub_number(db)

    sub = Subscription(
        subscription_number=sub_num,
        customer_id=payload.customer_id,
        plan_id=plan.id,
        state=SubscriptionState.draft,
        start_date=start_date,
        expiry_date=expiry_date,
        next_invoice_date=start_date,
        payment_terms=payload.payment_terms or template.payment_terms,
        notes=payload.notes or template.notes
    )
    db.add(sub)
    db.flush()

    for t_line in template.lines:
        variant = t_line.variant
        unit_price = variant.product.base_sales_price + variant.price_extra
        tax_rate = t_line.tax_rule.rate if t_line.tax_rule else Decimal("0.00")

        sub_line = SubscriptionLine(
            subscription_id=sub.id,
            variant_id=t_line.variant_id,
            quantity=t_line.default_quantity,
            unit_price=unit_price,
            tax_rate=tax_rate
        )
        db.add(sub_line)

    db.commit()
    db.refresh(sub)
    return sub

@router.get("", response_model=List[SubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role in [UserRole.admin, UserRole.staff]:
        return db.query(Subscription).all()
    else:
        # Customer sees only their own subscriptions
        return db.query(Subscription).filter(Subscription.customer_id == current_user.id).all()

@router.get("/{id}", response_model=SubscriptionOut)
def get_subscription(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sub = db.query(Subscription).filter(Subscription.id == id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    if current_user.role == UserRole.customer and sub.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden: cannot access other customer's subscriptions")
    return sub

@router.post("/{id}/transition", response_model=SubscriptionOut)
def transition_subscription_state(
    id: str,
    payload: SubscriptionStateTransition,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    sub = db.query(Subscription).filter(Subscription.id == id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    current = sub.state
    target = payload.target_state
    plan = sub.plan
    today = date.today()

    # Transition validation rules
    if current == target:
        return sub

    if current == SubscriptionState.closed:
        raise HTTPException(status_code=400, detail="Cannot transition out of closed terminal state")

    if current == SubscriptionState.draft:
        if target not in [SubscriptionState.quotation, SubscriptionState.closed]:
            raise HTTPException(status_code=400, detail=f"Illegal transition from draft to {target}")
        if target == SubscriptionState.quotation:
            if not sub.lines:
                raise HTTPException(status_code=422, detail="Cannot issue quotation without product lines")
            if not sub.expiry_date:
                sub.expiry_date = today + timedelta(days=30)

    elif current == SubscriptionState.quotation:
        if target not in [SubscriptionState.confirmed, SubscriptionState.closed]:
            raise HTTPException(status_code=400, detail=f"Illegal transition from quotation to {target}")
        if target == SubscriptionState.confirmed:
            # GUARD: Cannot confirm expired quote!
            if sub.expiry_date and today > sub.expiry_date:
                raise HTTPException(
                    status_code=422,
                    detail="Quotation validity has expired. Must issue updated quote before confirmation."
                )

    elif current == SubscriptionState.confirmed:
        if target not in [SubscriptionState.active, SubscriptionState.closed]:
            raise HTTPException(status_code=400, detail=f"Illegal transition from confirmed to {target}")
        if target == SubscriptionState.active:
            sub.start_date = today
            sub.next_invoice_date = today
            # Generate initial invoice immediately
            generate_invoice_for_subscription(db, sub, today)

    elif current == SubscriptionState.active:
        if target == SubscriptionState.paused:
            # GUARD: Check if plan allows pause!
            if not plan.allow_pause:
                raise HTTPException(
                    status_code=400,
                    detail="This billing plan does not permit pausing."
                )
            sub.notes = f"Paused on {datetime.now().isoformat()}"
        elif target == SubscriptionState.closed:
            # GUARD: Check if plan allows early close
            if not plan.allow_early_close and sub.expiry_date and today < sub.expiry_date:
                raise HTTPException(
                    status_code=400,
                    detail="This billing plan does not permit early closure."
                )
        elif target != SubscriptionState.active:
            raise HTTPException(status_code=400, detail=f"Illegal transition from active to {target}")

    elif current == SubscriptionState.paused:
        if target == SubscriptionState.active:
            # Recalibrate next_invoice_date forward
            sub.next_invoice_date = today
        elif target != SubscriptionState.closed:
            raise HTTPException(status_code=400, detail=f"Illegal transition from paused to {target}")

    sub.state = target
    db.commit()
    db.refresh(sub)
    return sub

