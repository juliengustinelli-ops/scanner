import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getDb();

    // Test connection by listing collections
    const collections = await db.listCollections().toArray();

    // Get counts from our collections
    const donorsCount = await db.collection("donors").countDocuments();
    const donationsCount = await db.collection("donations").countDocuments();

    return NextResponse.json({
      status: "connected",
      database: db.databaseName,
      collections: collections.map((c) => c.name),
      counts: {
        donors: donorsCount,
        donations: donationsCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: (error as Error).message },
      { status: 500 }
    );
  }
}
