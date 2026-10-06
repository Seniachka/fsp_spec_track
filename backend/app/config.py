from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./razryad.db"
    jwt_secret: str = "dev-only-change-me"
    jwt_issuer: str = "razryad"
    access_minutes: int = 15
    refresh_days: int = 14
    seed: bool = True
    auto_verify: bool = True
    exposure_cap: int = 1000
    session_minutes: int = 30


settings = Settings()
