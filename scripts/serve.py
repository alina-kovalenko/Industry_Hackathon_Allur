"""One-process server for frontend and API, locally or in a container."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn

if __name__ == "__main__":
    uvicorn.run("allur.api:app", host=os.environ.get("HOST", "127.0.0.1"),
                port=int(os.environ.get("PORT", "8001")), workers=1)
