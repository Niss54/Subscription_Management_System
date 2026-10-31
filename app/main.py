import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import engine, Base, SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash
from app.routers import auth, products, plans, quotation_templates, subscriptions, discounts, invoices, payments, dashboard, notifications

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
            print("[INFO] Seeded default admin: admin@brightloop.com / Admin@Brightloop2026!")
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
app.include_router(payments.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)

# ─── Static Web Portal ───
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", include_in_schema=False)
@app.get("/portal", include_in_schema=False)
def serve_portal():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Brightloop Billing Engine Online. Visit /docs for Swagger API."}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Brightloop Subscription Billing Engine",
        "version": "3.0.0",
        "phase": "Phase 3: Payments, Analytics & Executive Dashboard"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
