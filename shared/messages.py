from pydantic import BaseModel
from typing import Optional


class MoveMsg(BaseModel):
    type: str = "move"
    dx: float
    dy: float

class SpellMsg(BaseModel):
    type: str = "spell"
    spell: str
    target_id: Optional[int] = None

class JoinGameMsg(BaseModel):
    type: str = "join"
    player_name: str

class GameStateMsg(BaseModel):
    type: str = "state"
    players: list[dict]
    enemies: list[dict]
    loot: list[dict]
    room: str

class SpellResultMsg(BaseModel):
    type: str = "spell_result"
    player_id: str
    spell: str
    success: bool
    message: str
    affected_id: Optional[int] = None

class PlayerJoinedMsg(BaseModel):
    type: str = "player_joined"
    player_id: str
    player_name: str
    color_idx: int

class PlayerLeftMsg(BaseModel):
    type: str = "player_left"
    player_id: str

class ResetMsg(BaseModel):
    type: str = "reset"

class ChatMsg(BaseModel):
    type: str = "chat"
    text: str
    sender: str