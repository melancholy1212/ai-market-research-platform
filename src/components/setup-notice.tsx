// Shown instead of data when the server is missing configuration, so a fresh
// clone or a misconfigured deployment explains itself instead of crashing.
export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
      <p className="font-medium">Database connection is not configured</p>
      <p className="mt-1 text-muted">
        Set the following environment variables (see <code>.env.example</code>) and restart the
        server:
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
