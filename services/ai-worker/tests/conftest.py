import os

# Settings are read at import time by app.main; tests never touch the network.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("WORKER_SECRET", "test-worker-secret")
os.environ.setdefault("WORKER_API_KEY", "test-api-key")
