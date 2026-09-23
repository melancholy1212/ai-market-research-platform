const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

// Rendered on the server; UTC is explicit so output doesn't depend on the
// host's timezone.
export function formatDateTime(iso: string): string {
  return `${dateTime.format(new Date(iso))} UTC`;
}
