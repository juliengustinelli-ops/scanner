import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import { Donor } from "@/types";

const COLLECTION = "donors";

export async function getAllDonors(): Promise<Donor[]> {
  const db = await getDb();
  return db.collection<Donor>(COLLECTION).find().sort({ name: 1 }).toArray();
}

export async function getDonorById(id: string): Promise<Donor | null> {
  const db = await getDb();
  return db.collection<Donor>(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function getDonorByEnvelope(
  envelopeNumber: string
): Promise<Donor | null> {
  const db = await getDb();
  return db.collection<Donor>(COLLECTION).findOne({ envelopeNumber });
}

export async function createDonor(
  donor: Omit<Donor, "_id" | "createdAt" | "updatedAt">
): Promise<Donor> {
  const db = await getDb();
  const now = new Date();
  const newDonor: Donor = {
    ...donor,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection<Donor>(COLLECTION).insertOne(newDonor);
  return { ...newDonor, _id: result.insertedId };
}

export async function updateDonor(
  id: string,
  updates: Partial<Omit<Donor, "_id" | "createdAt">>
): Promise<Donor | null> {
  const db = await getDb();
  const result = await db.collection<Donor>(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result;
}

export async function deleteDonor(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<Donor>(COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}

export async function searchDonors(query: string): Promise<Donor[]> {
  const db = await getDb();
  return db
    .collection<Donor>(COLLECTION)
    .find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { envelopeNumber: { $regex: query, $options: "i" } },
        { address: { $regex: query, $options: "i" } },
      ],
    })
    .sort({ name: 1 })
    .toArray();
}

export async function getDonorCount(): Promise<number> {
  const db = await getDb();
  return db.collection<Donor>(COLLECTION).countDocuments();
}
