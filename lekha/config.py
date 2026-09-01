import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()

@dataclass(frozen=True)
class Entity:
    gstin: str = env("OWN_GSTIN")
    pan: str = env("OWN_PAN")
    tan: str = env("OWN_TAN")
    fy: str = env("FY", "2026-27")
    period: str = env("PERIOD", "2026-06")

    def validate(self) -> list[str]:
        missing = []
        if len(self.gstin) != 15:
            missing.append("OWN_GSTIN")
        if len(self.pan) != 10:
            missing.append("OWN_PAN")
        return missing
