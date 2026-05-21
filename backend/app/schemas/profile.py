from typing import List

from pydantic import BaseModel, Field


class TrustedContactProfile(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone_number: str = Field(min_length=5, max_length=20)
    relation: str = Field(min_length=1, max_length=50)


class SafetyProfileUpsert(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=1, le=130)
    phone_number: str = Field(min_length=5, max_length=20)
    home_locality: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=120)
    trusted_contacts: List[TrustedContactProfile] = Field(default_factory=list)


class SafetyProfileResponse(SafetyProfileUpsert):
    pass
