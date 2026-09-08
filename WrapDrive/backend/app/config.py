"""Application configuration loaded from environment variables."""
from __future__ import annotations

from dataclasses import dataclass
import os
from dotenv import load_dotenv

load_dotenv()


def _csv_env(name: str, default: str) -> list[str]:
    return [part.strip() for part in os.getenv(name, default).split(",") if part.strip()]


@dataclass(frozen=True)
class Settings:
    mongodb_url: str = os.getenv("MONGODB_URL", "")
    mongodb_database: str = os.getenv("MONGODB_DATABASE", "purpl_inventory")
    cors_origins: tuple[str, ...] = tuple(
        _csv_env(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )
    )
    max_attachment_bytes: int = int(os.getenv("MAX_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))

    def validate(self) -> None:
        if not self.mongodb_url:
            raise RuntimeError(
                "MONGODB_URL is not set. Copy .env.example to .env and supply your MongoDB URI."
            )


settings = Settings()
