"""Vercel entrypoint for the WindLens API.

Vercel's Python runtime imports this module and serves the ASGI app with its
own server, so Uvicorn is not part of the deployment dependencies. The backend
package and the bundled snapshot land next to this function through the
includeFiles setting in vercel.json.
"""

from __future__ import annotations

from pathlib import Path
import sys

# The backend package sits one level above api/. Insert the repo root so the
# import resolves regardless of how the runtime orders sys.path, and so the
# snapshot path in backend/store.py, which is resolved from its own file
# location, stays valid.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app import app  # noqa: E402

__all__ = ["app"]
