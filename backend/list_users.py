import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb+srv://amit:amit%40123@cluster0.i6ejvoj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

async def list_users():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client['queueless']
    users = await db['users'].find({}, {"password": 0, "hashed_password": 0}).to_list(100)
    for u in users:
        print(f"Username: {u['username']}, Email: {u['email']}, IsAdmin: {u.get('is_admin')}")
    client.close()

if __name__ == "__main__":
    asyncio.run(list_users())
