"""
Configuration models for InboxHunter Automation Engine.
Uses Pydantic for validation and type safety.
"""

from typing import Optional, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator


class PhoneConfig(BaseModel):
    """Phone number configuration."""
    country_code: str = "+1"
    number: str = ""
    full: str = ""


class Credentials(BaseModel):
    """Sign-up credentials."""
    first_name: str = Field(default="", alias="firstName")
    last_name: str = Field(default="", alias="lastName")
    email: str = ""
    country_code: str = Field(default="+1", alias="countryCode")
    phone: str = ""
    
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()
    
    @property
    def phone_config(self) -> PhoneConfig:
        return PhoneConfig(
            country_code=self.country_code,
            number=self.phone,
            full=f"{self.country_code}{self.phone}"
        )
    
    class Config:
        populate_by_name = True


class APIKeys(BaseModel):
    """API keys configuration."""
    openai: str = ""
    captcha: str = ""
    
    class Config:
        populate_by_name = True


class Settings(BaseModel):
    """Bot settings."""
    data_source: str = Field(default="meta", alias="dataSource")
    csv_path: str = Field(default="", alias="csvPath")
    meta_keywords: str = Field(default="marketing, funnel", alias="metaKeywords")
    ad_limit: int = Field(default=20, alias="adLimit")  # Default within valid range (5-100)
    max_signups: int = Field(default=30, alias="maxSignups")  # Default 30, range 1-100
    headless: bool = False
    debug: bool = False
    detailed_logs: bool = Field(default=False, alias="detailedLogs")  # Simple logs by default
    min_delay: int = Field(default=10, alias="minDelay")  # Default 10s, range 5-60
    max_delay: int = Field(default=30, alias="maxDelay")  # Default 30s, range 10-120
    llm_model: str = Field(default="gpt-4o-mini", alias="llmModel")  # Cheaper model by default
    batch_planning: bool = Field(default=True, alias="batchPlanning")  # Batch planning is now the default (faster execution)

    @field_validator('ad_limit')
    @classmethod
    def validate_ad_limit(cls, v: int) -> int:
        """Validate ad_limit is within valid range (5-100)."""
        if v < 5:
            return 5
        if v > 100:
            return 100
        return v
    
    @field_validator('max_signups')
    @classmethod
    def validate_max_signups(cls, v: int) -> int:
        """Validate max_signups is within valid range (1-100)."""
        if v < 1:
            return 1
        if v > 100:
            return 100
        return v
    
    @field_validator('min_delay')
    @classmethod
    def validate_min_delay(cls, v: int) -> int:
        """Validate min_delay is within valid range (5-60)."""
        if v < 5:
            return 5
        if v > 60:
            return 60
        return v
    
    @field_validator('max_delay')
    @classmethod
    def validate_max_delay(cls, v: int) -> int:
        """Validate max_delay is within valid range (10-120)."""
        if v < 10:
            return 10
        if v > 120:
            return 120
        return v
    
    class Config:
        populate_by_name = True


class BotConfig(BaseModel):
    """Complete bot configuration."""
    credentials: Credentials = Field(default_factory=Credentials)
    api_keys: APIKeys = Field(default_factory=APIKeys, alias="apiKeys")
    settings: Settings = Field(default_factory=Settings)
    
    class Config:
        populate_by_name = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return self.model_dump(by_alias=True)
    
    @classmethod
    def from_file(cls, path: str) -> "BotConfig":
        """Load configuration from JSON file."""
        import json
        with open(path) as f:
            data = json.load(f)
        return cls(**data)
    
    def save(self, path: str):
        """Save configuration to JSON file."""
        import json
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

