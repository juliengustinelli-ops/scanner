import { notFound } from "next/navigation";
import Link from "next/link";
import { getDonorById } from "@/lib/models/donors";
import { getDonationsByDonor } from "@/lib/models/donations";
import DonorEditForm from "./DonorEditForm";
import DeleteDonorButton from "./DeleteDonorButton";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function DonorDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const donor = await getDonorById(id);

  if (!donor) {
    notFound();
  }

  const donations = await getDonationsByDonor(id);

  const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <Link href="/donors" className="text-[#722f37] hover:underline">
          &larr; Back to Parishioners
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Donor Info Card */}
        <div className="col-span-2 bg-white rounded shadow p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl text-[#722f37] mb-1">{donor.name}</h1>
              <span className="inline-block px-3 py-1 text-sm bg-[#f5f3ef] text-[#722f37] rounded-full">
                {donor.envelopeNumber}
              </span>
            </div>
            <DeleteDonorButton id={id} name={donor.name} />
          </div>

          <DonorEditForm donor={JSON.parse(JSON.stringify(donor))} />
        </div>

        {/* Stats Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded shadow p-6">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide mb-2">
              Total Contributed
            </h3>
            <div className="text-3xl text-[#722f37] font-semibold">
              {formatCurrency(totalDonated)}
            </div>
          </div>

          <div className="bg-white rounded shadow p-6">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide mb-2">
              Contributions
            </h3>
            <div className="text-3xl text-[#722f37] font-semibold">
              {donations.length}
            </div>
          </div>

          <div className="bg-white rounded shadow p-6">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide mb-2">
              Member Since
            </h3>
            <div className="text-lg text-gray-700">
              {formatDate(donor.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Donation History */}
      <div className="mt-8 bg-white rounded shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg text-[#722f37]">Contribution History</h2>
        </div>

        {donations.length === 0 ? (
          <div className="p-6 text-center text-gray-500 italic">
            No contributions recorded for this parishioner.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-sm text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((donation) => (
                <tr
                  key={donation._id?.toString()}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(donation.date)}
                  </td>
                  <td className="px-6 py-4 font-semibold text-[#722f37]">
                    {formatCurrency(donation.amount)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-block px-3 py-1 text-sm bg-[#f5f3ef] text-[#722f37] rounded-full capitalize">
                      {donation.method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {donation.notes || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
