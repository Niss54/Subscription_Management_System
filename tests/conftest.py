import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import User, UserRole
from app.auth import get_password_hash, create_access_token

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_brightloop.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db_session):
    user = db_session.query(User).filter(User.email == "admin_test@brightloop.com").first()
    if not user:
        user = User(
            email="admin_test@brightloop.com",
            password_hash=get_password_hash("Admin@Test2026!"),
            full_name="Test Administrator",
            role=UserRole.admin
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user

@pytest.fixture
def admin_token(admin_user):
    return create_access_token({"sub": str(admin_user.id), "role": admin_user.role.value, "email": admin_user.email})

@pytest.fixture
def customer_user(db_session):
    user = db_session.query(User).filter(User.email == "customer_test@brightloop.com").first()
    if not user:
        user = User(
            email="customer_test@brightloop.com",
            password_hash=get_password_hash("Customer@Test2026!"),
            full_name="Test Customer",
            role=UserRole.customer
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user

@pytest.fixture
def customer_token(customer_user):
    return create_access_token({"sub": str(customer_user.id), "role": customer_user.role.value, "email": customer_user.email})
