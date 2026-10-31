import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./brightloop.db"
    SECRET_KEY: str = "brightloop-hackathon-winning-secret-key-32chars-min"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Supabase Production Project Configuration (Loaded from .env)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://vzuxwfmpxgkjcjdftuqp.supabase.co")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_PUBLISHABLE_KEY: str = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    SUPABASE_SECRET_KEY: str = os.getenv("SUPABASE_SECRET_KEY", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
