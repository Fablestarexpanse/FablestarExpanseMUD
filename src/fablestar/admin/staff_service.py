"""Admin staff accounts: authentication and CRUD (head admin only for writes)."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import bcrypt
from fastapi import HTTPException
from sqlalchemy import func, select

from fablestar.state.models import AdminStaff

logger = logging.getLogger(__name__)

VALID_ROLES = frozenset({"head_admin", "admin", "gm"})


def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pw: str, pw_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), pw_hash.encode("utf-8"))
    except ValueError:
        return False


def staff_public(row: AdminStaff) -> Dict[str, Any]:
    perms = row.permissions if isinstance(row.permissions, dict) else {}
    return {
        "id": row.id,
        "username": row.username,
        "display_name": row.display_name,
        "role": row.role,
        "is_active": row.is_active,
        "permissions": dict(perms),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def authenticate_staff(server: Any, username: str, password: str) -> AdminStaff:
    u = (username or "").strip().lower()
    if not u or not password:
        raise HTTPException(status_code=401, detail="invalid_credentials")
    async with server.db.session_factory() as session:
        r = await session.execute(select(AdminStaff).where(AdminStaff.username == u))
        row = r.scalar_one_or_none()
        if row is None or not row.is_active:
            raise HTTPException(status_code=401, detail="invalid_credentials")
        if not _verify_password(password, row.password_hash):
            raise HTTPException(status_code=401, detail="invalid_credentials")
        return row


async def list_staff(server: Any) -> List[AdminStaff]:
    async with server.db.session_factory() as session:
        r = await session.execute(select(AdminStaff).order_by(AdminStaff.username))
        return list(r.scalars().all())


async def get_staff(server: Any, staff_id: int) -> Optional[AdminStaff]:
    async with server.db.session_factory() as session:
        return await session.get(AdminStaff, staff_id)


async def create_staff(
    server: Any,
    *,
    username: str,
    password: str,
    display_name: str,
    role: str,
    permissions: Optional[Dict[str, Any]],
) -> AdminStaff:
    u = (username or "").strip().lower()
    if not u or not password:
        raise HTTPException(status_code=400, detail="username_and_password_required")
    rl = (role or "gm").lower().strip()
    if rl not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="invalid_role")
    perms = permissions if isinstance(permissions, dict) else {}
    async with server.db.session_factory() as session:
        taken = await session.execute(select(AdminStaff).where(AdminStaff.username == u))
        if taken.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="username_taken")
        row = AdminStaff(
            username=u,
            password_hash=_hash_password(password),
            display_name=(display_name or u).strip() or u,
            role=rl,
            is_active=True,
            permissions=perms,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        logger.info("Created admin staff %s role=%s", u, rl)
        return row


async def apply_staff_patch(server: Any, staff_id: int, patch: Dict[str, Any]) -> AdminStaff:
    """Merge partial fields; keys omitted in patch are left unchanged."""
    async with server.db.session_factory() as session:
        row = await session.get(AdminStaff, staff_id)
        if row is None:
            raise HTTPException(status_code=404, detail="staff_not_found")
        if "role" in patch and patch["role"] is not None:
            rl = str(patch["role"]).lower().strip()
            if rl not in VALID_ROLES:
                raise HTTPException(status_code=400, detail="invalid_role")
            if row.role == "head_admin" and rl != "head_admin":
                n = await session.execute(
                    select(func.count())
                    .select_from(AdminStaff)
                    .where(AdminStaff.role == "head_admin", AdminStaff.is_active.is_(True))
                )
                if int(n.scalar() or 0) <= 1:
                    raise HTTPException(status_code=400, detail="cannot_remove_last_head_admin")
            row.role = rl
        if "display_name" in patch and patch["display_name"] is not None:
            row.display_name = str(patch["display_name"]).strip() or row.username
        if "permissions" in patch and patch["permissions"] is not None:
            row.permissions = dict(patch["permissions"])
        if "is_active" in patch:
            is_active = bool(patch["is_active"])
            if not is_active and row.role == "head_admin":
                n = await session.execute(
                    select(func.count())
                    .select_from(AdminStaff)
                    .where(AdminStaff.role == "head_admin", AdminStaff.is_active.is_(True))
                )
                if int(n.scalar() or 0) <= 1:
                    raise HTTPException(status_code=400, detail="cannot_deactivate_last_head_admin")
            row.is_active = is_active
        if "password" in patch and patch["password"] is not None and str(patch["password"]).strip():
            row.password_hash = _hash_password(str(patch["password"]))
        await session.commit()
        await session.refresh(row)
        return row
