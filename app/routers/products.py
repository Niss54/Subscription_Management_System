from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from app.database import get_db
from app.models import Product, ProductVariant, TaxRule
from app.schemas import (
    ProductCreate, ProductOut, ProductVariantCreate, ProductVariantOut,
    TaxRuleCreate, TaxRuleOut
)
from app.auth import require_admin, get_current_user

router = APIRouter(prefix="/products", tags=["products"])


# ─────────────── PRODUCTS & BRAND VARIANTS ───────────────

@router.post("", response_model=ProductOut)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """PDF Rule: Admin adds product with name, type, sales price, cost price, notes, and variants (e.g. Odoo brand adds 560)."""
    product = Product(
        name=payload.name,
        product_type=payload.product_type,
        base_sales_price=payload.base_sales_price,
        cost_price=payload.cost_price,
        notes=payload.notes
    )
    db.add(product)
    db.flush()

    if payload.variants:
        for v in payload.variants:
            existing_sku = db.query(ProductVariant).filter(ProductVariant.sku == v.sku).first()
            if existing_sku:
                raise HTTPException(400, f"SKU {v.sku} already exists")
            variant = ProductVariant(
                product_id=product.id,
                variant_name=v.variant_name,
                price_extra=v.price_extra,
                sku=v.sku
            )
            db.add(variant)

    db.commit()
    db.refresh(product)
    return product


@router.get("", response_model=List[ProductOut])
def list_products(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """All users can view active products and their variants."""
    return db.query(Product).filter(Product.is_active == True).all()


@router.get("/{id}", response_model=ProductOut)
def get_product(id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.post("/{id}/variants", response_model=ProductVariantOut)
def add_product_variant(
    id: str,
    payload: ProductVariantCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin)
):
    """PDF Rule: Choosing the Odoo brand adds 560 to the price."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(404, "Product not found")

    existing_sku = db.query(ProductVariant).filter(ProductVariant.sku == payload.sku).first()
    if existing_sku:
        raise HTTPException(400, f"SKU {payload.sku} already exists")

    variant = ProductVariant(
        product_id=product.id,
        variant_name=payload.variant_name,
        price_extra=payload.price_extra,
        sku=payload.sku
    )
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return variant


# ─────────────── TAX RULES (Admin Set) ───────────────

@router.post("/taxes", response_model=TaxRuleOut)
def create_tax_rule(payload: TaxRuleCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """PDF Rule: Taxes are calculated automatically from rules the admin has set."""
    tax = TaxRule(
        name=payload.name,
        rate=payload.rate,
        description=payload.description
    )
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return tax


@router.get("/taxes", response_model=List[TaxRuleOut])
def list_tax_rules(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(TaxRule).filter(TaxRule.is_active == True).all()
