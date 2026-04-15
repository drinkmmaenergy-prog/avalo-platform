type PageProps = {
  params: Promise<{
    clubId: string;
  }>;
};

export default async function ClubDetailPage({ params }: PageProps) {
  const { clubId } = await params;
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avalo</p>
          <h1 className="text-2xl font-semibold">Club details</h1>
          <p className="text-sm text-muted-foreground">Club ID: <span className="font-mono">{clubId}</span></p>
        </div>
      </div>
    </main>
  );
}



