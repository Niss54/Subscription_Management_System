from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import QuotationTemplate, QuotationTemplateLine, BillingPlan, ProductVariant
from app.schemas import (
    QuotationTemplateCreate, QuotationTemplateOut,
    QuotationTemplateLineCreate, QuotationTemplateLineOut
)
from app.auth import require_admin, require_admin_or_staff, get_current_user

router = APIRouter(prefix="/quotation-templates", tags=["quotation-templates"])


@router.post("", response_model=QuotationTemplateOut)
def create_quotation_template(
    payload: QuotationTemplateCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin)
):
    """
    PDF Rule: Sales rep starts from a quotation template that already has the
    right plan and product lines, and stays valid for a set number of days.
    """
    plan = db.query(BillingPlan).filter(BillingPlan.id == payload.plan_id).first()
    if not plan:
        raise HTTPException(404, "Billing plan not found")

    template = QuotationTemplate(
        name=payload.name,
        plan_id=payload.plan_id,
        validity_days=payload.validity_days,
        payment_terms=payload.payment_terms,
        notes=payload.notes
    )
    db.add(template)
    db.flush()

    if payload.lines:
        for line in payload.lines:
            variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
            if not variant:
                raise HTTPException(404, f"Variant ID {line.variant_id} not found")
            template_line = QuotationTemplateLine(
                template_id=template.id,
                variant_id=line.variant_id,
                default_quantity=line.default_quantity,
                tax_rule_id=line.tax_rule_id
            )
            db.add(template_line)

    db.commit()
    db.refresh(template)
    return template


@router.get("", response_model=List[QuotationTemplateOut])
def list_quotation_templates(db: Session = Depends(get_db), _=Depends(require_admin_or_staff)):
    return db.query(QuotationTemplate).all()


@router.get("/{id}", response_model=QuotationTemplateOut)
def get_quotation_template(id: str, db: Session = Depends(get_db), _=Depends(require_admin_or_staff)):
    template = db.query(QuotationTemplate).filter(QuotationTemplate.id == id).first()
    if not template:
        raise HTTPException(404, "Quotation template not found")
    return template
