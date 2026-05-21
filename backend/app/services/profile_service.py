from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException, status

from app.schemas.profile import SafetyProfileResponse, SafetyProfileUpsert


class ProfileService:
    def __init__(self, db):
        self.users = db["users"]
        self.contacts = db["contacts"]

    async def get_profile(self, user_id: str) -> SafetyProfileResponse:
        user = await self.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        contacts = await self.contacts.find({"user_id": user_id}).sort("created_at", -1).to_list(length=100)
        trusted_contacts = [
            {
                "name": item.get("name", ""),
                "phone_number": item.get("phone_number", ""),
                "relation": item.get("relationship", "") or item.get("relation", ""),
            }
            for item in contacts
        ]

        return SafetyProfileResponse(
            full_name=user.get("full_name", "User"),
            age=max(int(user.get("age", 18) or 18), 1),
            phone_number=user.get("phone_number", "0000000000"),
            home_locality=user.get("home_locality", "Unknown"),
            city=user.get("city", "Unknown"),
            trusted_contacts=trusted_contacts,
        )

    async def upsert_profile(self, user_id: str, payload: SafetyProfileUpsert) -> SafetyProfileResponse:
        now = datetime.now(timezone.utc)
        await self.users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "full_name": payload.full_name.strip(),
                    "age": payload.age,
                    "phone_number": payload.phone_number.strip(),
                    "home_locality": payload.home_locality.strip(),
                    "city": payload.city.strip(),
                    "updated_at": now,
                }
            },
        )
        await self._replace_contacts(user_id, payload.trusted_contacts)
        return await self.get_profile(user_id)

    async def _replace_contacts(self, user_id: str, trusted_contacts: list) -> None:
        existing_contacts = await self.contacts.find({"user_id": user_id}).to_list(length=300)
        for item in existing_contacts:
            await self.contacts.delete_one({"_id": item.get("_id"), "user_id": user_id})

        now = datetime.now(timezone.utc)
        for contact in trusted_contacts:
            await self.contacts.insert_one(
                {
                    "user_id": user_id,
                    "name": contact.name.strip(),
                    "phone_number": contact.phone_number.strip(),
                    "relationship": contact.relation.strip(),
                    "channel": "sms",
                    "created_at": now,
                    "updated_at": now,
                }
            )
