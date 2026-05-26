from typing import Any, Optional

from pydantic import BaseModel


class ServiceResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    correlation_id: Optional[str] = None
