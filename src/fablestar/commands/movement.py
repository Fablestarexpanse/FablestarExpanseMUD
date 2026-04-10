from fablestar.commands.registry import command
from fablestar.network.session import Session

def move_to(direction: str):
    """Helper to create a movement command for a specific direction."""
    async def mover(session: Session, args: list[str]):
        from fablestar.__main__ import app_instance
        
        # 1. Get current room
        player_id = session.player_id or "test_player"
        room_id = await app_instance.redis.get_player_location(player_id)
        if not room_id:
            await session.send("You are lost in the void.")
            return

        room = app_instance.content_loader.get_room(room_id)
        if not room:
            await session.send("The world is collapsing around you.")
            return

        # 2. Check for exit
        if direction not in room.exits:
            await session.send(f"You cannot go {direction}.")
            return

        exit_meta = room.exits[direction]
        target_room_id = exit_meta.destination
        
        # 3. Update location
        await app_instance.redis.set_player_location(player_id, target_room_id)
        
        # 4. Describe new room
        await session.send(f"You move {direction}.")
        # Re-dispatch look to describe the new room
        from fablestar.parser.dispatcher import CommandDispatcher
        dispatcher = CommandDispatcher()
        await dispatcher.dispatch(session, "look")

    return mover

# Register all directions
for direction in ["north", "south", "east", "west", "up", "down"]:
    # Using the closure as the handler
    handler = move_to(direction)
    # Set docstring for help system
    handler.__doc__ = f"Move {direction}."
    command(direction, aliases=[direction[0]])(handler)
