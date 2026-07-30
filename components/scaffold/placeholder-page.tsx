import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * ⚠ SCAFFOLDING — every route named in Slice 1 exists from the first commit so
 * the route tree (and therefore the /food path nesting and the host-gating that
 * depends on it) is real rather than planned. Each page is replaced by its own
 * slice; none of them carries half-built feature logic, per house style.
 *
 * Slice 7 replaces this with the real page chrome.
 */
export function PlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-h1">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-body text-ink-muted">{body}</p>
      </CardContent>
    </Card>
  );
}
