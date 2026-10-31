import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, PasswordResetToken
from app.schemas import (
    UserRegister, UserLogin, Token, UserOut, StaffCreate,
    ForgotPasswordRequest, ResetPasswordRequest
)
from app.auth import (
    validate_password_complexity, get_password_hash,
    verify_password, create_access_token, get_current_user, require_admin
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """PDF Rule: Unique email, password >8 chars with uppercase, lowercase, special char."""
    validate_password_complexity(payload.password)

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists"
        )

    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=UserRole.customer
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role.value, "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name
    }


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token({"sub": str(user.id), "role": user.role.value, "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name
    }


@router.post("/staff", response_model=UserOut)
def create_staff(payload: StaffCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """PDF Rule: Only the admin can add a new member of staff."""
    validate_password_complexity(payload.password)

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "User with this email already exists")

    staff = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=UserRole.staff
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """PDF Rule: Password reset link should arrive at registered email."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Prevent user enumeration
        return {"message": "If this email is registered, a password reset link has been dispatched."}

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(reset_token)
    db.commit()

    return {
        "message": "Reset token generated successfully (15-minute validity).",
        "reset_token": raw_token
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate single-use reset token and update password."""
    validate_password_complexity(payload.new_password)

    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    reset_record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used == False,
        PasswordResetToken.expires_at > now
    ).first()

    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid, expired, or already used reset token")

    user = db.query(User).filter(User.id == reset_record.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = get_password_hash(payload.new_password)
    reset_record.used = True
    db.commit()

    return {"message": "Password updated successfully. You may now log in with your new credentials."}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
