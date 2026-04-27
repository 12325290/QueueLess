import os
import uuid
import json
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from jose import JWTError, jwt

# MongoDB Imports
from database import db, users_collection, services_collection, queue_collection, init_mongodb

# Secret key for JWT
SECRET_KEY = "your-very-secret-key-change-it-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

app = FastAPI(title="QueueLess API", description="Smart Queue & Slot Booking System with MongoDB")

# Updated CORS for production level
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICE_WAIT_TIMES = {
    "canteens": 3,
    "salons": 15,
    "clinics": 10
}

# --- WebSocket Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

import bcrypt

# --- Auth Helpers ---
def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = await users_collection.find_one({"username": username})
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user

# --- Pydantic Models ---
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    username: str
    email: str
    is_admin: int

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class BookingRequest(BaseModel):
    name: str
    phone: str
    category: str
    service_id: str

class NextRequest(BaseModel):
    category: str
    service_id: str

class CancelRequest(BaseModel):
    category: str
    service_id: str
    token: str

# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- Auth Endpoints ---
@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    db_user = await users_collection.find_one({"username": user_in.username})
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    db_email = await users_collection.find_one({"email": user_in.email})
    if db_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if len(user_in.password) > 72:
        raise HTTPException(status_code=400, detail="Password too long (max 72 characters)")
    
    new_user = {
        "username": user_in.username,
        "email": user_in.email,
        "hashed_password": get_password_hash(user_in.password),
        "is_admin": 0
    }
    await users_collection.insert_one(new_user)
    return new_user

@app.post("/api/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await users_collection.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    
    user_res = {
        "username": user["username"],
        "email": user["email"],
        "is_admin": user.get("is_admin", 0)
    }
    return {"access_token": access_token, "token_type": "bearer", "user": user_res}

# --- Service Endpoints ---
@app.get("/api/services")
async def get_services():
    services = await services_collection.find().to_list(length=100)
    result = {"canteens": [], "salons": [], "clinics": []}
    
    for s in services:
        category = s.get("category")
        base_time = SERVICE_WAIT_TIMES.get(category, 5)
        queue_list = s.get("queue", [])
        
        service_data = {
            "id": s["id"],
            "name": s["name"],
            "location": s["location"],
            "current_token": s.get("current_token", "Q0"),
            "available_slots": s.get("available_slots", 50),
            "queue": queue_list,
            "estimated_wait_time": len(queue_list) * base_time
        }
        
        if category in result:
            result[category].append(service_data)
            
    return result

@app.get("/api/queue/{category}/{service_id}")
async def get_queue(category: str, service_id: str):
    service = await services_collection.find_one({"id": service_id, "category": category})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    base_time = SERVICE_WAIT_TIMES.get(category, 5)
    queue_list = service.get("queue", [])
    
    return {
        "current_token": service.get("current_token", "Q0"),
        "queue_length": len(queue_list),
        "queue": queue_list,
        "base_wait_time": base_time
    }

@app.post("/api/book")
async def book_slot(req: BookingRequest):
    service = await services_collection.find_one({"id": req.service_id, "category": req.category})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    queue = service.get("queue", [])
    if len(queue) >= service.get("available_slots", 50):
        raise HTTPException(status_code=400, detail="Queue is full")
    
    # Check for duplicate booking by phone
    for item in queue:
        if item["phone"] == req.phone:
            raise HTTPException(status_code=400, detail="You already have an active booking for this service")

    last_token_num = 0
    if queue:
        last_item = queue[-1]
        last_token_num = int(last_item["token"][1:])
    elif service.get("current_token", "Q0") != "Q0":
        last_token_num = int(service["current_token"][1:])
    
    new_token = f"Q{last_token_num + 1}"
    
    new_booking = {
        "token": new_token,
        "name": req.name,
        "phone": req.phone
    }
    
    await services_collection.update_one(
        {"id": req.service_id},
        {"$push": {"queue": new_booking}}
    )
    
    # Broadcast update
    await manager.broadcast({
        "event": "queue_update", 
        "category": req.category, 
        "service_id": req.service_id,
        "type": "new_booking"
    })
    
    return {
        "token": new_token,
        "position": len(queue) + 1,
        "message": f"Booking confirmed. Token {new_token}."
    }

@app.post("/api/cancel")
async def cancel_slot(req: CancelRequest):
    service = await services_collection.find_one({"id": req.service_id, "category": req.category})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if service.get("current_token") == req.token:
        raise HTTPException(status_code=400, detail="Token is currently being served.")

    # Remove from queue
    result = await services_collection.update_one(
        {"id": req.service_id},
        {"$pull": {"queue": {"token": req.token}}}
    )
    
    if result.modified_count > 0:
        await manager.broadcast({
            "event": "queue_update", 
            "category": req.category, 
            "service_id": req.service_id,
            "type": "cancellation"
        })
        return {"status": "cancelled", "message": "Booking cancelled successfully"}
    
    raise HTTPException(status_code=404, detail="Token already served or invalid")

@app.post("/api/admin/next")
async def next_in_queue(req: NextRequest, admin: dict = Depends(get_current_admin)):
    service = await services_collection.find_one({"id": req.service_id, "category": req.category})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    queue = service.get("queue", [])
    if not queue:
        raise HTTPException(status_code=400, detail="Queue is empty")
    
    next_user = queue[0]
    
    await services_collection.update_one(
        {"id": req.service_id},
        {
            "$set": {"current_token": next_user["token"]},
            "$pop": {"queue": -1} # Remove first element
        }
    )
    
    # Broadcast update
    await manager.broadcast({
        "event": "turn_update", 
        "category": req.category, 
        "service_id": req.service_id,
        "current_token": next_user["token"],
        "message": f"Token {next_user['token']} is now being served!"
    })
    
    return {"message": "Queue advanced", "current_token": next_user["token"], "served_user": next_user}

@app.on_event("startup")
async def startup_event():
    try:
        await init_mongodb()
        print("MongoDB connected successfully.")
    except Exception as e:
        print(f"WARNING: MongoDB startup init failed: {e}")
        print("Server will still start. Connection will be retried on first request.")

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("QueueLess Backend is starting with MongoDB...")
    print("Access the API at http://localhost:8000")
    print("="*50 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=8000)
