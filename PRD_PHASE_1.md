# 🚀 PRD PHASE 1: System Foundation, Identity, Catalog & Billing Plans
## Brightloop Software Subscription Billing Platform (Hackathon Winning Blueprint)

> **Document Version:** 3.0.0 (Unified Enterprise Blueprint: FastAPI Engine + Next.js 15 UI + Supabase/PostgreSQL)  
> **Engineering Mode:** GRAVITAS Invariant-Enforced Implementation  
> **⏱ Time Box:** 0:00 → 0:40 | **Commits:** 3  
> **Design Aesthetic:** Premium Obsidian Dark (`#090a0f`) & Crisp Porcelain White (`#ffffff`), Electric Sky Blue Accents (`#0ea5e9` / `#38bdf8`), Tabular Figures, Micro-Glow Cards  
> **Target SLA:** 100% Functional Compliance with Brightloop Problem Statement  

---

## 🎯 Exit Criteria (Phase 1 Gatekeeper)
- [ ] Database starts successfully with PostgreSQL 15+ / Supabase
- [ ] FastAPI backend starts with zero errors: `uvicorn app.main:app --reload`
- [ ] `POST /auth/register` creates user with strict password validation ($>8$ chars, uppercase, lowercase, special char), returns JWT
- [ ] `POST /auth/login` returns valid JWT
- [ ] `GET /products` returns product catalog with brand variant markups (+560 for Odoo brand)
- [ ] `GET /plans` returns active billing plans with granular policy flags (`allow_pause`, `allow_early_close`, `allow_renew`, `auto_close_at_end`)
- [ ] All 13 core relational tables and sequences visible in database

---

## 📦 Final Production Tech Stack

| Layer | Choice | Rationale & Advantage |
| :--- | :--- | :--- |
| **Backend API** | **FastAPI 0.111** | Automatic OpenAPI / Swagger docs, highest-speed REST validation via Pydantic v2. |
| **Frontend UI** | **Next.js 15 (App Router)** | Server Components, Tailwind CSS v4, Lucide icons, GSAP/Framer Motion luxury design. |
| **ORM / Data Layer** | **SQLAlchemy 2.x (Sync Engine)** | Deterministic ACID transactions, zero async connection pool leak bugs in hackathon. |
| **Database** | **PostgreSQL 17 / Supabase** | `FOR UPDATE SKIP LOCKED`, native `NUMERIC(16, 4)` decimals, Row Level Security (RLS). |
| **Invoicing Scheduler**| **APScheduler 3.x** | In-process, rock-solid recurring worker with zero external Redis/Celery bloat. |
| **Auth & Security** | **passlib[bcrypt] + python-jose** | Bcrypt hashing + Argon2id support, strict regex password validator, JWT with role claims. |

---

## 📁 Repository Structure (Phase 1 Foundation)

```
subscription-management/
├── docker-compose.yml
├── .env
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py          ← Complete unified relational models
│   ├── schemas.py         ← Pydantic v2 schemas
│   ├── auth.py            ← JWT + bcrypt + RBAC dependencies
│   └── routers/
│       ├── __init__.py
│       ├── auth.py
│       ├── products.py
│       ├── plans.py
│       └── quotation_templates.py
├── frontend/              ← Next.js 15 Portal UI
│   ├── app/
│   │   ├── (auth)/
│   │   ├── admin/
│   │   ├── staff/
│   │   └── portal/
│   ├── components/
│   └── lib/
└── tests/
    └── __init__.py
```

---

## 🏛️ Database Schema & All Models (`app/models.py`)

```python
import uuid
import enum
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Boolean, Integer, Enum, ForeignKey,
    Numeric, Text, Date, DateTime, UniqueConstraint, func, Sequence
)
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMPTZ
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


# ─────────────── SEQUENCES ───────────────
invoice_seq = Sequence("invoice_seq", start=1)
subscription_seq = Sequence("subscription_seq", start=1)


# ─────────────── MODELS ───────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.customer)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())

    subscriptions = relationship("Subscription", back_populates="customer")
    invoices = relationship("Invoice", back_populates="customer")
    payments_recorded = relationship("Payment", back_populates="recorded_by_user")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(128), nullable=False, index=True)
    expires_at = Column(TIMESTAMPTZ, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())


class TaxRule(Base):
    __tablename__ = "tax_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    rate = Column(Numeric(5, 2), nullable=False)   # e.g. 18.00 for 18%
    description = Column(String(255))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    product_type = Column(String(50), nullable=False)  # 'software', 'service', 'addon'
    base_sales_price = Column(Numeric(16, 4), nullable=False)
    cost_price = Column(Numeric(16, 4), nullable=False)
    notes = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())

    variants = relationship("ProductVariant", back_populates="product")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_name = Column(String(100), nullable=False)   # e.g. "Odoo Brand", "Standard"
    price_extra = Column(Numeric(16, 4), nullable=False, default=Decimal("0.0000"))  # e.g. +560.00
    sku = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    product = relationship("Product", back_populates="variants")


class BillingPlan(Base):
    __tablename__ = "billing_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    interval_unit = Column(Enum(BillingInterval), nullable=False)
    interval_count = Column(Integer, nullable=False, default=1)
    min_quantity = Column(Integer, nullable=False, default=1)
    available_from = Column(Date)
    available_to = Column(Date)
    auto_close_at_end = Column(Boolean, nullable=False, default=False)
    allow_pause = Column(Boolean, nullable=False, default=True)
    allow_early_close = Column(Boolean, nullable=False, default=True)
    allow_renew = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())


class QuotationTemplate(Base):
    __tablename__ = "quotation_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("billing_plans.id"), nullable=False)
    validity_days = Column(Integer, nullable=False, default=30)
    payment_terms = Column(String(100), nullable=False, default="Net 15")
    notes = Column(Text)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())

    lines = relationship("QuotationTemplateLine", back_populates="template", cascade="all, delete-orphan")
    plan = relationship("BillingPlan")


class QuotationTemplateLine(Base):
    __tablename__ = "quotation_template_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("quotation_templates.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False)
    default_quantity = Column(Numeric(12, 4), nullable=False, default=1)
    tax_rule_id = Column(UUID(as_uuid=True), ForeignKey("tax_rules.id"), nullable=True)

    template = relationship("QuotationTemplate", back_populates="lines")
    variant = relationship("ProductVariant")
    tax_rule = relationship("TaxRule")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_number = Column(String(50), unique=True, nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("billing_plans.id"), nullable=False)
    state = Column(Enum(SubscriptionState), nullable=False, default=SubscriptionState.draft)
    start_date = Column(Date)
    expiry_date = Column(Date)
    next_invoice_date = Column(Date)
    payment_terms = Column(String(100), nullable=False, default="Net 15")
    notes = Column(Text)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now(), onupdate=func.now())

    customer = relationship("User", back_populates="subscriptions")
    plan = relationship("BillingPlan")
    lines = relationship("SubscriptionLine", back_populates="subscription", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="subscription")
    discounts = relationship("SubscriptionDiscount", back_populates="subscription")


class SubscriptionLine(Base):
    __tablename__ = "subscription_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False, default=1)
    unit_price = Column(Numeric(16, 4), nullable=False)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))

    subscription = relationship("Subscription", back_populates="lines")
    variant = relationship("ProductVariant")


class DiscountRule(Base):
    __tablename__ = "discount_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False)
    discount_type = Column(Enum(DiscountType), nullable=False)
    discount_value = Column(Numeric(16, 4), nullable=False)
    min_purchase_amount = Column(Numeric(16, 4), default=Decimal("0"))
    min_quantity = Column(Integer, default=0)
    start_date = Column(Date)
    end_date = Column(Date)
    max_uses = Column(Integer, nullable=True)   # NULL = unlimited
    current_uses = Column(Integer, nullable=False, default=0)
    scope = Column(Enum(DiscountScope), nullable=False, default=DiscountScope.subscription)
    target_product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())


class SubscriptionDiscount(Base):
    __tablename__ = "subscription_discounts"
    __table_args__ = (UniqueConstraint("subscription_id", "discount_rule_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False)
    discount_rule_id = Column(UUID(as_uuid=True), ForeignKey("discount_rules.id"), nullable=False)
    applied_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())

    subscription = relationship("Subscription", back_populates="discounts")
    discount_rule = relationship("DiscountRule")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_number = Column(String(50), unique=True, nullable=False)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(Enum(InvoiceStatus), nullable=False, default=InvoiceStatus.draft)
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    billing_period_start = Column(Date, nullable=False)
    billing_period_end = Column(Date, nullable=False)
    amount_untaxed = Column(Numeric(16, 4), nullable=False, default=Decimal("0"))
    amount_discount = Column(Numeric(16, 4), nullable=False, default=Decimal("0"))
    amount_tax = Column(Numeric(16, 4), nullable=False, default=Decimal("0"))
    amount_total = Column(Numeric(16, 4), nullable=False, default=Decimal("0"))
    idempotency_key = Column(String(128), unique=True, nullable=False)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())

    subscription = relationship("Subscription", back_populates="invoices")
    customer = relationship("User", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False)
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False)
    unit_price = Column(Numeric(16, 4), nullable=False)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=Decimal("0"))
    discount_amount = Column(Numeric(16, 4), nullable=False, default=Decimal("0"))
    line_subtotal = Column(Numeric(16, 4), nullable=False)

    invoice = relationship("Invoice", back_populates="lines")
    variant = relationship("ProductVariant")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    payment_method = Column(Enum(PaymentMethodEnum), nullable=False)
    amount = Column(Numeric(16, 4), nullable=False)
    payment_date = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())
    reference_note = Column(Text)
    recorded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=func.now())

    invoice = relationship("Invoice", back_populates="payments")
    recorded_by_user = relationship("User", back_populates="payments_recorded")
```

---

## 🔐 Auth & Password Policy Enforcement (`app/auth.py`)

```python
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole

SECRET_KEY = os.getenv("SECRET_KEY", "brightloop-hackathon-secret-key-32chars-min")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

PASSWORD_REGEX = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{9,}$')

def validate_password_complexity(password: str) -> None:
    """PDF Rule: >8 characters, 1 uppercase, 1 lowercase, 1 special character."""
    if not PASSWORD_REGEX.match(password):
        raise HTTPException(
            status_code=422,
            detail="Password must be more than 8 characters and contain at least one uppercase letter, one lowercase letter, and one special character."
        )

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception
    return user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def require_admin_or_staff(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [UserRole.admin, UserRole.staff]:
        raise HTTPException(status_code=403, detail="Staff or Admin access required")
    return current_user
```

---

## 📋 Pydantic Schemas (`app/schemas.py`)

```python
import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from app.models import UserRole, BillingInterval, SubscriptionState, InvoiceStatus, DiscountType, DiscountScope, PaymentMethodEnum

class UserRegister(BaseModel):
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

class ProductVariantCreate(BaseModel):
    variant_name: str
    price_extra: Decimal = Decimal("0.0000")
    sku: str

class ProductVariantOut(BaseModel):
    id: uuid.UUID
    variant_name: str
    price_extra: Decimal
    sku: str
    class Config:
        from_attributes = True

class ProductCreate(BaseModel):
    name: str
    product_type: str
    base_sales_price: Decimal
    cost_price: Decimal
    notes: Optional[str] = None
    variants: Optional[List[ProductVariantCreate]] = []

class ProductOut(BaseModel):
    id: uuid.UUID
    name: str
    product_type: str
    base_sales_price: Decimal
    cost_price: Decimal
    notes: Optional[str]
    variants: List[ProductVariantOut] = []
    class Config:
        from_attributes = True

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
    id: uuid.UUID
    class Config:
        from_attributes = True
```

---

## 🔌 Routers Implementation (`app/routers/`)

### Products & Brand Variant Surcharges (`app/routers/products.py`)
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Product, ProductVariant
from app.schemas import ProductCreate, ProductOut, ProductVariantCreate, ProductVariantOut
from app.auth import require_admin, get_current_user

router = APIRouter(prefix="/products", tags=["products"])

@router.post("", response_model=ProductOut)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
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
    return db.query(Product).filter(Product.is_active == True).all()
```

---

## 📌 Phase 1 Commit Checkpoints
1. `git commit -m "feat(phase1): core database schema, sequences and models"`
2. `git commit -m "feat(phase1): auth with password complexity and JWT RBAC"`
3. `git commit -m "feat(phase1): products with brand variant surcharges and billing plans"`
