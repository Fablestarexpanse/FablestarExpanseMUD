"""Global server singleton — all command handlers import app_instance from here."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fablestar.server import FablestarServer

# This will hold the global server instance
app_instance: FablestarServer | None = None
