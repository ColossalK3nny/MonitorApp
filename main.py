from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from metrics import snapshot
import asyncio, os

app = FastAPI(title="Server Health API")
origins = ["*"]  # dev; szűkítsd prodban
app.add_middleware(CORSMiddleware, allow_origins=origins,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health(): return {"status": "ok"}

@app.get("/metrics")
def metrics(): return snapshot()

@app.websocket("/ws")
async def ws_metrics(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_json(snapshot())
            await asyncio.sleep(float(os.getenv("WS_INTERVAL_SEC", "1")))
    except Exception:
        await ws.close()
