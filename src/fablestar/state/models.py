from datetime import datetime
from typing import Any, Optional

from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from fablestar.state.postgres import Base

class Account(Base):
    """Player account credentials and metadata."""
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    # Relationships
    characters: Mapped[list["Character"]] = relationship(back_populates="account", cascade="all, delete-orphan")

class Character(Base):
    """Persistent game character data linked to an account."""
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    
    # World state
    room_id: Mapped[str] = mapped_column(String(255), default="test_zone:entrance")
    
    # Generic stats/data stored as JSON for "Vibe Coding" flexibility
    # This allows us to add stats without frequent schema migrations
    stats: Mapped[dict] = mapped_column(JSON, default=lambda: {
        "strength": 10,
        "dexterity": 10,
        "intelligence": 10,
        "perception": 10
    })
    
    inventory: Mapped[list] = mapped_column(JSON, default=list)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    account: Mapped["Account"] = relationship(back_populates="characters")


class AdminStaff(Base):
    """Console staff (head admin, admin, GM) with optional tool/zone restrictions."""

    __tablename__ = "admin_staff"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120), default="")
    # head_admin | admin | gm
    role: Mapped[str] = mapped_column(String(32), default="gm")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # {"tools": ["dashboard", "players", ...], "zones": ["*"] | ["zone_id", ...]}
    permissions: Mapped[dict[str, Any]] = mapped_column(JSON, default=lambda: {})
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
