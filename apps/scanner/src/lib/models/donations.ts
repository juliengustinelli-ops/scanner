import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import { Donation, DonationWithDonor, CollectionStats } from "@/types";

const COLLECTION = "donations";

export async function getAllDonations(limit = 50): Promise<Donation[]> {
  const db = await getDb();
  return db
    .collection<Donation>(COLLECTION)
    .find()
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
}

export async function getDonationsWithDonors(
  limit = 50
): Promise<DonationWithDonor[]> {
  const db = await getDb();
  return db
    .collection(COLLECTION)
    .aggregate<DonationWithDonor>([
      { $sort: { date: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "donors",
          localField: "donorId",
          foreignField: "_id",
          as: "donorArray",
        },
      },
      {
        $addFields: {
          donor: { $arrayElemAt: ["$donorArray", 0] },
        },
      },
      { $project: { donorArray: 0, donorId: 0 } },
    ])
    .toArray();
}

export async function getDonationById(id: string): Promise<Donation | null> {
  const db = await getDb();
  return db
    .collection<Donation>(COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

export async function getDonationsByDonor(donorId: string): Promise<Donation[]> {
  const db = await getDb();
  return db
    .collection<Donation>(COLLECTION)
    .find({ donorId: new ObjectId(donorId) })
    .sort({ date: -1 })
    .toArray();
}

export async function createDonation(
  donation: Omit<Donation, "_id" | "createdAt">
): Promise<Donation> {
  const db = await getDb();
  const newDonation: Donation = {
    ...donation,
    createdAt: new Date(),
  };
  const result = await db
    .collection<Donation>(COLLECTION)
    .insertOne(newDonation);
  return { ...newDonation, _id: result.insertedId };
}

export async function deleteDonation(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<Donation>(COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}

export async function getCollectionStats(): Promise<CollectionStats> {
  const db = await getDb();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayResult, weekResult, monthResult, todayCount, totalDonors] =
    await Promise.all([
      // Today's total
      db
        .collection(COLLECTION)
        .aggregate([
          { $match: { date: { $gte: startOfToday } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      // Week total
      db
        .collection(COLLECTION)
        .aggregate([
          { $match: { date: { $gte: startOfWeek } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      // Month total
      db
        .collection(COLLECTION)
        .aggregate([
          { $match: { date: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      // Today's count
      db
        .collection(COLLECTION)
        .countDocuments({ date: { $gte: startOfToday } }),
      // Total donors
      db.collection("donors").countDocuments(),
    ]);

  return {
    todayTotal: todayResult[0]?.total || 0,
    weekTotal: weekResult[0]?.total || 0,
    monthTotal: monthResult[0]?.total || 0,
    todayCount,
    totalDonors,
  };
}

export async function getDonationsByDateRange(
  startDate: Date,
  endDate: Date
): Promise<Donation[]> {
  const db = await getDb();
  return db
    .collection<Donation>(COLLECTION)
    .find({
      date: { $gte: startDate, $lte: endDate },
    })
    .sort({ date: -1 })
    .toArray();
}
