FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Runtime dependencies only. Uvicorn is here because the container runs the
# ASGI server itself; the Vercel deployment uses the root requirements.txt,
# which excludes it. The split is documented in docs/HANDOFF.md and goes into
# the Phase 6 README.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The build context is ./backend, so the package lands at /app/backend and
# uvicorn can import backend.app with /app as the working directory.
RUN mkdir /app/backend
COPY . /app/backend/

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8000

# The slim base has no curl, so the healthcheck uses the standard library.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
