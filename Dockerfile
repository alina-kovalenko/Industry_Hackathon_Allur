FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements-runtime.lock .
RUN pip install --no-cache-dir -r requirements-runtime.lock
COPY allur ./allur
COPY data/case ./data/case
COPY data/external ./data/external
COPY models ./models
COPY scripts/serve.py ./scripts/serve.py
COPY --from=frontend /frontend/dist ./frontend/dist
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
ENV HOST=0.0.0.0 PORT=8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/health')"
CMD ["python", "scripts/serve.py"]
