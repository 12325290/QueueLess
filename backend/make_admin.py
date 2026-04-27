import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb+srv://amit:amit%40123@cluster0.i6ejvoj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "queueless"

async def make_admin(username):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    users_collection = db["users"]

    result = await users_collection.update_one(
        {"username": username},
        {"$set": {"is_admin": 1}}
    )

    if result.matched_count > 0:
        print(f"Success: User '{username}' is now an admin.")
    else:
        print(f"Error: User '{username}' not found.")
    
    client.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python make_admin.py <username>")
    else:
        asyncio.run(make_admin(sys.argv[1]))
