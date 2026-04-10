"""
Ensure account username=test password=test exists (creates or resets password).
Run from repo root:  python scripts/ensure_test_user.py
Requires PYTHONPATH=src (or pip install -e .).
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path

# Repo root on path
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_ROOT / "src"))

import bcrypt
from sqlalchemy import select

from fablestar.core.config import load_config
from fablestar.state.models import Account, Character
from fablestar.state.postgres import PostgresState


async def main() -> None:
    username = "test"
    password = "test"
    config = load_config(str(_ROOT / "config"))
    db = PostgresState(config.database)
    try:
        async with db.session_factory() as session:
            result = await session.execute(select(Account).where(Account.username == username))
            account = result.scalar_one_or_none()
            pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

            if account is None:
                account = Account(
                    username=username,
                    password_hash=pw_hash,
                    last_login=datetime.utcnow(),
                )
                session.add(account)
                await session.flush()
                session.add(
                    Character(
                        account_id=account.id,
                        name=username,
                        room_id="test_zone:entrance",
                    )
                )
                await session.commit()
                print(f"Created account '{username}' with default character.")
            else:
                account.password_hash = pw_hash
                account.last_login = datetime.utcnow()
                result = await session.execute(select(Character).where(Character.account_id == account.id))
                chars = list(result.scalars().all())
                if not chars:
                    session.add(
                        Character(
                            account_id=account.id,
                            name=username,
                            room_id="test_zone:entrance",
                        )
                    )
                await session.commit()
                print(f"Updated password for existing account '{username}' (and added character if missing).")
    finally:
        await db.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
