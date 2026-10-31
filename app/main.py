from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import engine, Base, SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash
from app.routers import auth, products, plans, quotation_templates, subscriptions, discounts, invoices

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ─── Initialize DB Tables ───
    Base.metadata.create_all(bind=engine)

    # ─── Seed Default Admin User ───
    db: Session = SessionLocal()
    try:
        admin_email = "admin@brightloop.com"
        existing_admin = db.query(User).filter(User.email == admin_email).first()
        if not existing_admin:
            default_admin = User(
                email=admin_email,
                password_hash=get_password_hash("Admin@Brightloop2026!"),
                full_name="Brightloop System Administrator",
                role=UserRole.admin,
                is_active=True
            )
            db.add(default_admin)
            db.commit()
            print("🚀 Seeded default admin: admin@brightloop.com / Admin@Brightloop2026!")
    finally:
        db.close()

    yield

app = FastAPI(
    title="Brightloop Software — Subscription Management System",
    description="Unified platform for plans, subscriptions, recurring billing, and executive analytics (Odoo Hackathon Winner).",
    version="1.0.0",
    lifespan=lifespan
)

# ─── CORS Middleware ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Register Routers ───
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(plans.router)
app.include_router(quotation_templates.router)
app.include_router(subscriptions.router)
app.include_router(discounts.router)
app.include_router(invoices.router)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Brightloop Subscription Billing Engine",
        "version": "2.0.0",
        "phase": "Phase 2: Core Commercial Billing Engine"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
