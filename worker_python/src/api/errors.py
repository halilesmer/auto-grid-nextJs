from pydantic import BaseModel, Field
from typing import Literal, Optional
from src.api.models import AccountModel


class ProblemDetail(BaseModel):
    """RFC 7807 Problem Details base - extend for each error type"""
    type: str = Field(
        default="about:blank",
        description="URI identifying the error type"
    )
    title: str = Field(..., description="Human-readable summary of the error")
    status: int = Field(..., ge=400, le=599, description="HTTP status code")
    detail: str = Field(..., description="Specific occurrence description")
    instance: Optional[str] = Field(None, description="Request-specific URI")


class DuplicateAccountProblem(ProblemDetail):
    type: Literal["https://auto-grid.io/errors/duplicate-account"] = (
        "https://auto-grid.io/errors/duplicate-account"
    )
    title: Literal["Duplicate Account"] = "Duplicate Account"
    status: Literal[409] = 409
    code: Literal["DUPLICATE_ACCOUNT"] = "DUPLICATE_ACCOUNT"
    existing_account: AccountModel = Field(..., description="The conflicting account")