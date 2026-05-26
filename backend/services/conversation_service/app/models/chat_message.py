from typing import Optional

from pydantic import BaseModel


class ChatMessage(BaseModel):
    user_id: str
    project_key: str
    issue_key: Optional[str] = None
    content: str
