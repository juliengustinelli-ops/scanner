import BarcodeScanner from "@/components/BarcodeScanner";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Barcode Scanner
        </h1>
        <BarcodeScanner />
      </main>
    </div>
  );
}
