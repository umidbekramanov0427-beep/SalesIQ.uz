"""Bearer-key check for the /v1 endpoints."""

import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


def require_api_key(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> None:
    if creds is None or not secrets.compare_digest(creds.credentials, settings.worker_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
