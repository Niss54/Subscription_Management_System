import uuid
import enum
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Boolean, Integer, Enum, ForeignKey,
    Numeric, Text, Date, DateTime, UniqueConstraint, func
)
from sqlalchemy.orm import relationship
from app.database import Base


# ─────────────── ENUMS ───────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    staff = "staff"
    customer = "customer"

class BillingInterval(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"

class SubscriptionState(str, enum.Enum):
    draft = "draft"
    quotation = "quotation"
    confirmed = "confirmed"
    active = "active"
    paused = "paused"
    closed = "closed"

class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    paid = "paid"
    cancelled = "cancelled"

class DiscountType(str, enum.Enum):
    percentage = "percentage"
    fixed = "fixed"

class DiscountScope(str, enum.Enum):
    subscription = "subscription"
    product = "product"

class PaymentMethodEnum(str, enum.Enum):
    bank_transfer = "bank_transfer"
    credit_card = "credit_card"
    cash = "cash"
    wire = "wire"
    upi = "upi"
    check = "check"

class CreditNoteReason(str, enum.Enum):
    duplicated_charge = "duplicated_charge"
    product_unsatisfactory = "product_unsatisfactory"
    order_cancellation = "order_cancellation"
    other = "other"



# ─────────────── MODELS ───────────────

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, native_enum=False), nullable=False, default=UserRole.customer)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    subscriptions = relationship("Subscription", back_populates="customer")
    invoices = relationship("Invoice", back_populates="customer")
    payments_recorded = relationship("Payment", back_populates="recorded_by_user")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(128), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TaxRule(Base):
    __tablename__ = "tax_rules"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    rate = Column(Numeric(5, 2), nullable=False)   # e.g. 18.00 for 18%
    description = Column(String(255))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Product(Base):
    __tablename__ = "products"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    product_type = Column(String(50), nullable=False)  # 'software', 'service', 'addon'
    base_sales_price = Column(Numeric(16, 4), nullable=False)
    cost_price = Column(Numeric(16, 4), nullable=False)
    notes = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_name = Column(String(100), nullable=False)   # e.g. "Odoo Brand", "Standard"
    price_extra = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))  # e.g. +560.00
    sku = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    product = relationship("Product", back_populates="variants")


class BillingPlan(Base):
    __tablename__ = "billing_plans"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    interval_unit = Column(Enum(BillingInterval, native_enum=False), nullable=False)
    interval_count = Column(Integer, nullable=False, default=1)
    min_quantity = Column(Integer, nullable=False, default=1)
    available_from = Column(Date)
    available_to = Column(Date)
    auto_close_at_end = Column(Boolean, nullable=False, default=False)
    allow_pause = Column(Boolean, nullable=False, default=True)
    allow_early_close = Column(Boolean, nullable=False, default=True)
    allow_renew = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class QuotationTemplate(Base):
    __tablename__ = "quotation_templates"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    plan_id = Column(String(36), ForeignKey("billing_plans.id"), nullable=False)
    validity_days = Column(Integer, nullable=False, default=30)
    payment_terms = Column(String(100), nullable=False, default="Net 15")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    lines = relationship("QuotationTemplateLine", back_populates="template", cascade="all, delete-orphan")
    plan = relationship("BillingPlan")


class QuotationTemplateLine(Base):
    __tablename__ = "quotation_template_lines"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    template_id = Column(String(36), ForeignKey("quotation_templates.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(String(36), ForeignKey("product_variants.id"), nullable=False)
    default_quantity = Column(Numeric(12, 4), nullable=False, default=Decimal("1.0000"))
    tax_rule_id = Column(String(36), ForeignKey("tax_rules.id"), nullable=True)

    template = relationship("QuotationTemplate", back_populates="lines")
    variant = relationship("ProductVariant")
    tax_rule = relationship("TaxRule")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    subscription_number = Column(String(50), unique=True, nullable=False)
    customer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    plan_id = Column(String(36), ForeignKey("billing_plans.id"), nullable=False)
    state = Column(Enum(SubscriptionState, native_enum=False), nullable=False, default=SubscriptionState.draft)
    start_date = Column(Date)
    expiry_date = Column(Date)
    next_invoice_date = Column(Date)
    payment_terms = Column(String(100), nullable=False, default="Net 15")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    customer = relationship("User", back_populates="subscriptions")
    plan = relationship("BillingPlan")
    lines = relationship("SubscriptionLine", back_populates="subscription", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="subscription")
    discounts = relationship("SubscriptionDiscount", back_populates="subscription")


class SubscriptionLine(Base):
    __tablename__ = "subscription_lines"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    subscription_id = Column(String(36), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(String(36), ForeignKey("product_variants.id"), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False, default=Decimal("1.0000"))
    unit_price = Column(Numeric(16, 4), nullable=False)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))

    subscription = relationship("Subscription", back_populates="lines")
    variant = relationship("ProductVariant")


class DiscountRule(Base):
    __tablename__ = "discount_rules"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    code = Column(String(50), unique=True, nullable=False)
    discount_type = Column(Enum(DiscountType, native_enum=False), nullable=False)
    discount_value = Column(Numeric(16, 4), nullable=False)
    min_purchase_amount = Column(Numeric(16, 4), default=Decimal("0.0000"))
    min_quantity = Column(Integer, default=0)
    start_date = Column(Date)
    end_date = Column(Date)
    max_uses = Column(Integer, nullable=True)   # NULL = unlimited
    current_uses = Column(Integer, nullable=False, default=0)
    scope = Column(Enum(DiscountScope, native_enum=False), nullable=False, default=DiscountScope.subscription)
    target_product_id = Column(String(36), ForeignKey("products.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SubscriptionDiscount(Base):
    __tablename__ = "subscription_discounts"
    __table_args__ = (UniqueConstraint("subscription_id", "discount_rule_id"),)

    id = Column(String(36), primary_key=True, default=generate_uuid)
    subscription_id = Column(String(36), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False)
    discount_rule_id = Column(String(36), ForeignKey("discount_rules.id"), nullable=False)
    applied_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    subscription = relationship("Subscription", back_populates="discounts")
    discount_rule = relationship("DiscountRule")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_number = Column(String(50), unique=True, nullable=False)
    subscription_id = Column(String(36), ForeignKey("subscriptions.id"), nullable=False)
    customer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(Enum(InvoiceStatus, native_enum=False), nullable=False, default=InvoiceStatus.draft)
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    billing_period_start = Column(Date, nullable=False)
    billing_period_end = Column(Date, nullable=False)
    amount_untaxed = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))
    amount_discount = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))
    amount_tax = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))
    amount_total = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))
    amount_paid = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))
    idempotency_key = Column(String(128), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    subscription = relationship("Subscription", back_populates="invoices")
    customer = relationship("User", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")
    credit_notes = relationship("CreditNote", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(String(36), ForeignKey("product_variants.id"), nullable=False)
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False)
    unit_price = Column(Numeric(16, 4), nullable=False)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))
    discount_amount = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))
    line_subtotal = Column(Numeric(16, 4), nullable=False)

    invoice = relationship("Invoice", back_populates="lines")
    variant = relationship("ProductVariant")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False)
    payment_method = Column(Enum(PaymentMethodEnum, native_enum=False), nullable=False)
    amount = Column(Numeric(16, 4), nullable=False)
    payment_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reference_note = Column(Text)
    recorded_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    invoice = relationship("Invoice", back_populates="payments")
    recorded_by_user = relationship("User", back_populates="payments_recorded")


class CreditNote(Base):
    __tablename__ = "credit_notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    credit_note_number = Column(String(50), unique=True, nullable=False)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False)
    customer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    amount = Column(Numeric(16, 4), nullable=False)
    reason = Column(Enum(CreditNoteReason, native_enum=False), nullable=False, default=CreditNoteReason.other)
    refund_status = Column(String(20), nullable=False, default="succeeded")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    invoice = relationship("Invoice", back_populates="credit_notes")
    customer = relationship("User")

