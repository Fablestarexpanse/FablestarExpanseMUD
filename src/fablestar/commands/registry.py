"""CommandRegistry and @command decorator — registers handlers at import time."""

import importlib
import inspect
import logging
from typing import Any, Callable, Dict, List, Optional, Type

logger = logging.getLogger(__name__)

class Command:
    """Represents a registered game command."""
    def __init__(self, name: str, handler: Callable, aliases: List[str] = None):
        self.name = name
        self.handler = handler
        self.aliases = aliases or []

class CommandRegistry:
    """
    Registry for all game commands.
    Supports dynamic registration and hot-reloading of command modules.
    """
    def __init__(self):
        self._commands: Dict[str, Command] = {}
        self._aliases: Dict[str, str] = {}
        self._modules: Dict[str, Any] = {}

    def register(self, name: str, handler: Callable, aliases: List[str] = None):
        """Register a command and its aliases."""
        cmd = Command(name, handler, aliases)
        self._commands[name] = cmd
        if aliases:
            for alias in aliases:
                self._aliases[alias] = name
        logger.debug(f"Registered command: {name} (aliases: {aliases})")

    def get(self, name: str) -> Optional[Command]:
        """Retrieve a command by name or alias."""
        # Check primary name
        if name in self._commands:
            return self._commands[name]
        
        # Check aliases
        if name in self._aliases:
            primary_name = self._aliases[name]
            return self._commands.get(primary_name)
        
        return None

    def reload_module(self, module_name: str):
        """Hot-reload commands from a specific module."""
        try:
            if module_name in self._modules:
                module = importlib.reload(self._modules[module_name])
            else:
                module = importlib.import_module(module_name)
                self._modules[module_name] = module
            
            # Re-scaning module for registration is one way, 
            # but we'll use the decorator pattern which triggers on import/reload.
            logger.info(f"Reloaded command module: {module_name}")
        except Exception as e:
            logger.error(f"Failed to reload command module {module_name}: {e}")

# Global registry instance
registry = CommandRegistry()

def command(name: str, aliases: List[str] = None):
    """Decorator to register a function as a command."""
    def decorator(func):
        registry.register(name, func, aliases)
        return func
    return decorator
