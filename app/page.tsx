import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { BugReportButton } from "@/components/BugReportButton";
import { GrommetForm } from "@/components/GrommetForm";
import { UpdateStatus } from "@/components/UpdateStatus";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-2xl">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Grommet Marks App
        </h1>
        <p className="mt-3 text-center text-zinc-600 dark:text-zinc-400">
          Nahrajte PDF, nastavte hrany, rozteče a parametry značek a získejte výstupní PDF připravené k tisku.
        </p>
        <div className="mt-8">
          <GrommetForm />
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
          <BugReportButton />
          <UpdateStatus />
          <AnalyticsConsent />
        </footer>
      </main>
    </div>
  );
}
