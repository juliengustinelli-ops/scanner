import { NextResponse } from "next/server";
import { getCollectionStats } from "@/lib/models/donations";

// GET /api/stats - Get dashboard statistics
export async function GET() {
  try {
    const stats = await getCollectionStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
