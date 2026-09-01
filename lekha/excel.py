from __future__ import annotations
from pathlib import Path
import pandas as pd

def write_ca_pack(rows: list[dict], path: Path, entity: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        pd.DataFrame([entity]).to_excel(xw, sheet_name="Entity", index=False)
        df.to_excel(xw, sheet_name="Register", index=False)
        if not df.empty and "category" in df:
            df.groupby("category", dropna=False)["amount"].sum().reset_index().to_excel(
                xw, sheet_name="Expenses", index=False
            )
    return path

def write_csv(rows: list[dict], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False)
    return path
