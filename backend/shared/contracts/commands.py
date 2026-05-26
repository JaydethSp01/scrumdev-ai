from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class StartWorkflowCommand(BaseModel):
    project_key: str
    issue_key: Optional[str] = None
    user_id: str
    message: str
    correlation_id: str = Field(default_factory=lambda: str(uuid4()))


class AgentExecutionCommand(BaseModel):
    agent_name: str
    task_name: str
    input_data: dict[str, Any]
    correlation_id: str = Field(default_factory=lambda: str(uuid4()))


class CrewExecutionCommand(BaseModel):
    crew_name: str
    inputs: dict[str, Any]
    correlation_id: str = Field(default_factory=lambda: str(uuid4()))
