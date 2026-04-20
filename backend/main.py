import json
import os
import uuid
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="QueueLess API", description="Smart Queue & Slot Booking System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "data.json"

SERVICE_WAIT_TIMES = {
    "canteens": 3,
    "salons": 15,
    "clinics": 10
}

# Models
class BookingRequest(BaseModel):
    name: str
    phone: str
    category: str # "canteens", "salons", "clinics"
    service_id: str

class QueueItem(BaseModel):
    token: str
    name: str
    phone: str

class NextRequest(BaseModel):
    category: str
    service_id: str

class CancelRequest(BaseModel):
    category: str
    service_id: str
    token: str

# Helper to read/write JSON
def load_data():
    if not os.path.exists(DATA_FILE):
        return {"canteens": [], "salons": [], "clinics": []}
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)

@app.get("/api/services")
def get_services():
    data = load_data()
    # Inject wait time estimates
    for cat, services in data.items():
        base_time = SERVICE_WAIT_TIMES.get(cat, 5)
        for svc in services:
            svc["estimated_wait_time"] = len(svc.get("queue", [])) * base_time
    return data

@app.get("/api/queue/{category}/{service_id}")
def get_queue(category: str, service_id: str):
    data = load_data()
    if category not in data:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    base_time = SERVICE_WAIT_TIMES.get(category, 5)
    for service in data[category]:
        if service["id"] == service_id:
            return {
                "current_token": service["current_token"],
                "queue_length": len(service["queue"]),
                "queue": service["queue"],
                "base_wait_time": base_time
            }
    raise HTTPException(status_code=404, detail="Service not found")

@app.post("/api/book")
def book_slot(req: BookingRequest):
    data = load_data()
    if req.category not in data:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    for service in data[req.category]:
        if service["id"] == req.service_id:
            if len(service["queue"]) >= service["available_slots"]:
                raise HTTPException(status_code=400, detail="Queue is full")
            
            # Generate new token
            queue_len = len(service["queue"])
            last_token_num = 0
            if queue_len > 0:
                last_token_num = int(service["queue"][-1]["token"][1:])
            elif service["current_token"] != "Q0":
                last_token_num = int(service["current_token"][1:])
            
            new_token = f"Q{last_token_num + 1}"
            
            new_item = {
                "token": new_token,
                "name": req.name,
                "phone": req.phone
            }
            service["queue"].append(new_item)
            save_data(data)
            
            # Calculate position
            position = len(service["queue"])
            
            return {
                "token": new_token,
                "position": position,
                "message": f"Booking confirmed. Token {new_token}. You will be notified soon."
            }
            
    raise HTTPException(status_code=404, detail="Service not found")

@app.post("/api/cancel")
def cancel_slot(req: CancelRequest):
    data = load_data()
    if req.category not in data:
        return {"status": "not_found", "message": "Invalid category"}
    
    for service in data[req.category]:
        if service["id"] == req.service_id:
            if service["current_token"] == req.token:
                return {"status": "not_found", "message": "Token is currently being served. Cannot cancel."}

            for idx, item in enumerate(service["queue"]):
                if item["token"] == req.token:
                    service["queue"].pop(idx)
                    save_data(data)
                    return {"status": "cancelled", "message": "Booking cancelled successfully"}
            
            return {"status": "not_found", "message": "Token already served or invalid"}
            
    return {"status": "not_found", "message": "Service not found"}

@app.post("/api/admin/next")
def next_in_queue(req: NextRequest):
    data = load_data()
    if req.category not in data:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    for service in data[req.category]:
        if service["id"] == req.service_id:
            if len(service["queue"]) == 0:
                raise HTTPException(status_code=400, detail="Queue is empty")
            
            # Pop the first user
            next_user = service["queue"].pop(0)
            service["current_token"] = next_user["token"]
            
            save_data(data)
            return {"message": "Queue advanced", "current_token": service["current_token"], "served_user": next_user}
            
    raise HTTPException(status_code=404, detail="Service not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
