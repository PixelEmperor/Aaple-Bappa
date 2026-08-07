export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        Aaple <span className="text-orange-600">Bappa</span>
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        The app is under construction. Track progress in{' '}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-sm dark:bg-white/[.08]">
          docs/design-plan.md
        </code>
        .
      </p>
    </main>
  )
}
