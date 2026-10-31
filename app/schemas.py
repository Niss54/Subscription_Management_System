import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models import UserRole, BillingInterval, SubscriptionState, InvoiceStatus, DiscountType, DiscountScope, PaymentMethodEnum, CreditNoteReason


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
    id: Optional[str] = None
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

class PlanEntitlementCreate(BaseModel):
    feature_key: str
    is_enabled: bool = True
    usage_limit: Optional[int] = None

class PlanEntitlementOut(PlanEntitlementCreate):
    id: str
    plan_id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class BillingPlanOut(BillingPlanCreate):
    id: str
    entitlements: List[PlanEntitlementOut] = []
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


# ─────────────── SUBSCRIPTION SCHEMAS ───────────────

class SubscriptionLineCreate(BaseModel):
    variant_id: str
    quantity: Decimal = Decimal("1.0000")
    unit_price: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = Decimal("0.00")

class SubscriptionLineOut(BaseModel):
    id: str
    variant_id: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate: Decimal
    model_config = ConfigDict(from_attributes=True)

class SubscriptionCreate(BaseModel):
    customer_id: str
    plan_id: str
    start_date: Optional[date] = None
    payment_terms: str = "Net 15"
    notes: Optional[str] = None
    lines: List[SubscriptionLineCreate] = []

class SubscriptionFromTemplateCreate(BaseModel):
    customer_id: str
    template_id: str
    start_date: Optional[date] = None
    payment_terms: Optional[str] = None
    notes: Optional[str] = None

class SubscriptionStateTransition(BaseModel):
    target_state: SubscriptionState
    reason: Optional[str] = None

class SubscriptionOut(BaseModel):
    id: str
    subscription_number: str
    customer_id: str
    plan_id: str
    state: SubscriptionState
    start_date: Optional[date]
    expiry_date: Optional[date]
    next_invoice_date: Optional[date]
    payment_terms: str
    notes: Optional[str]
    created_at: datetime
    lines: List[SubscriptionLineOut] = []
    model_config = ConfigDict(from_attributes=True)


# ─────────────── DISCOUNT SCHEMAS ───────────────

class DiscountRuleCreate(BaseModel):
    code: str
    discount_type: DiscountType
    discount_value: Decimal
    min_purchase_amount: Decimal = Decimal("0.0000")
    min_quantity: int = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    max_uses: Optional[int] = None
    scope: DiscountScope = DiscountScope.subscription
    target_product_id: Optional[str] = None
    is_active: bool = True

class DiscountRuleOut(DiscountRuleCreate):
    id: str
    current_uses: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ApplyDiscountRequest(BaseModel):
    discount_code: str


# ─────────────── INVOICE SCHEMAS ───────────────

class InvoiceLineOut(BaseModel):
    id: str
    variant_id: str
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate: Decimal
    discount_amount: Decimal
    line_subtotal: Decimal
    model_config = ConfigDict(from_attributes=True)

class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    subscription_id: str
    customer_id: str
    status: InvoiceStatus
    invoice_date: date
    due_date: date
    billing_period_start: date
    billing_period_end: date
    amount_untaxed: Decimal
    amount_discount: Decimal
    amount_tax: Decimal
    amount_total: Decimal
    amount_paid: Decimal = Decimal("0.0000")
    idempotency_key: str
    created_at: datetime
    lines: List[InvoiceLineOut] = []
    model_config = ConfigDict(from_attributes=True)

class BillingRunResult(BaseModel):
    processed_count: int
    invoices_generated: int
    skipped_count: int
    errors: List[str] = []



# ─────────────── PAYMENT SCHEMAS ───────────────

class PaymentCreate(BaseModel):
    invoice_id: str
    payment_method: PaymentMethodEnum
    amount: Decimal
    reference_note: Optional[str] = None

class PaymentOut(BaseModel):
    id: str
    invoice_id: str
    payment_method: PaymentMethodEnum
    amount: Decimal
    payment_date: datetime
    reference_note: Optional[str] = None
    recorded_by: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─────────────── CREDIT NOTE SCHEMAS ───────────────

class CreditNoteCreate(BaseModel):
    amount: Decimal
    reason: CreditNoteReason = CreditNoteReason.other
    notes: Optional[str] = None

class CreditNoteOut(BaseModel):
    id: str
    credit_note_number: str
    invoice_id: str
    customer_id: str
    amount: Decimal
    reason: CreditNoteReason
    refund_status: str
    notes: Optional[str]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─────────────── RAZORPAY SCHEMAS ───────────────

class RazorpayOrderRequest(BaseModel):
    invoice_id: str

class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount_paise: int
    currency: str
    key_id: str
    invoice_id: str
    invoice_number: str

class RazorpayVerifyRequest(BaseModel):
    invoice_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ─────────────── GOOGLE / SUPABASE AUTH SCHEMAS ───────────────

class GoogleOAuthCallback(BaseModel):
    email: EmailStr
    full_name: Optional[str] = "Google User"
    provider_id: Optional[str] = None


# ─────────────── NOTIFICATION & EMAIL SCHEMAS ───────────────

class EmailNotificationRequest(BaseModel):
    target_group: str = "overdue_customers"  # 'overdue_customers', 'all_customers', 'staff', 'custom'
    custom_recipients: Optional[List[EmailStr]] = None
    subject: str
    body_message: str

class EmailNotificationResponse(BaseModel):
    success: bool
    dispatched_count: int
    target_group: str
    recipients: List[str]
    subject: str
    message: str
