from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB Configuration (Atlas)
MONGO_URL = "mongodb+srv://amit:amit%40123@cluster0.i6ejvoj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "queueless"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Collections
users_collection = db["users"]
services_collection = db["services"]
queue_collection = db["queue"]

async def get_db():
    # In MongoDB with Motor, we usually just use the db object directly
    # but we can return it as a dependency if needed
    return db

# Initialization script for MongoDB
async def init_mongodb():
    # Create indexes for performance and uniqueness
    await users_collection.create_index("username", unique=True)
    await users_collection.create_index("email", unique=True)
    await services_collection.create_index("id", unique=True)
    
    # Check if we need to seed data
    service_count = await services_collection.count_documents({})
    if service_count == 0:
        print("Seeding MongoDB with initial data...")
        import json
        json_path = os.path.join(os.path.dirname(__file__), 'data.json')
        if os.path.exists(json_path):
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            for category, services in data.items():
                for s in services:
                    s['category'] = category
                    # Ensure queue is empty in DB initially or migrate it
                    s['queue'] = s.get('queue', [])
                    await services_collection.insert_one(s)
            print("MongoDB Seeding complete.")
