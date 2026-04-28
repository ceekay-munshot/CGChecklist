import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function PlaceholderModule({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={<Badge tone="info">Upcoming</Badge>}
      />
      <ul className="mt-2 space-y-2 text-sm text-[var(--color-fg-muted)]">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-mist-400)]"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
