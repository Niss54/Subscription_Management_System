"""Supabase Client for Brightloop Subscription Management System."""
from supabase import create_client, Client
from app.config import settings

def get_supabase_client() -> Client:
    """Returns an authenticated Supabase client using the Service Role Key for server-side admin operations."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_supabase_anon_client() -> Client:
    """Returns a client using the public Anon Key for client-scoped operations."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
