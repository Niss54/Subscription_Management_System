import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models import UserRole, BillingInterval, SubscriptionState, InvoiceStatus, DiscountType, DiscountScope, PaymentMethodEnum


# ─────────────── AUTH SCHEMAS ───────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str
    role: str
    full_name: str

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ─────────────── TAX RULE SCHEMAS ───────────────

class TaxRuleCreate(BaseModel):
    name: str
    rate: Decimal
    description: Optional[str] = None

class TaxRuleOut(BaseModel):
    id: str
    name: str
    rate: Decimal
    description: Optional[str]
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


# ─────────────── PRODUCT SCHEMAS ───────────────

class ProductVariantCreate(BaseModel):
    variant_name: str
    price_extra: Decimal = Decimal("0.0000")
    sku: str

class ProductVariantOut(BaseModel):
    id: str
    variant_name: str
    price_extra: Decimal
    sku: str
    is_active: bool
    model_config = ConfigDict(from_attributes=True)

class ProductCreate(BaseModel):
    name: str
    product_type: str
    base_sales_price: Decimal
    cost_price: Decimal
    notes: Optional[str] = None
    variants: Optional[List[ProductVariantCreate]] = []

class ProductOut(BaseModel):
    id: str
    name: str
    product_type: str
    base_sales_price: Decimal
    cost_price: Decimal
    notes: Optional[str]
    is_active: bool
    variants: List[ProductVariantOut] = []
    model_config = ConfigDict(from_attributes=True)


# ─────────────── BILLING PLAN SCHEMAS ───────────────

class BillingPlanCreate(BaseModel):
    name: str
    interval_unit: BillingInterval
    interval_count: int = 1
    min_quantity: int = 1
    available_from: Optional[date] = None
    available_to: Optional[date] = None
    auto_close_at_end: bool = False
    allow_pause: bool = True
    allow_early_close: bool = True
    allow_renew: bool = True

class BillingPlanOut(BillingPlanCreate):
    id: str
    model_config = ConfigDict(from_attributes=True)


# ─────────────── QUOTATION TEMPLATE SCHEMAS ───────────────

class QuotationTemplateLineCreate(BaseModel):
    variant_id: str
    default_quantity: Decimal = Decimal("1.0000")
    tax_rule_id: Optional[str] = None

class QuotationTemplateLineOut(BaseModel):
    id: str
    variant_id: str
    default_quantity: Decimal
    tax_rule_id: Optional[str]
    model_config = ConfigDict(from_attributes=True)

class QuotationTemplateCreate(BaseModel):
    name: str
    plan_id: str
    validity_days: int = 30
    payment_terms: str = "Net 15"
    notes: Optional[str] = None
    lines: Optional[List[QuotationTemplateLineCreate]] = []

class QuotationTemplateOut(BaseModel):
    id: str
    name: str
    plan_id: str
    validity_days: int
    payment_terms: str
    notes: Optional[str]
    lines: List[QuotationTemplateLineOut] = []
    model_config = ConfigDict(from_attributes=True)
