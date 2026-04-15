type PageProps = {
  params: Promise<{
    callId: string;
  }>;
};

export default async function CallDetailPage({ params }: PageProps) {
  const { callId } = await params;
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avalo</p>
          <h1 className="text-2xl font-semibold">Call session</h1>
          <p className="text-sm text-muted-foreground">Call ID: <span className="font-mono">{callId}</span></p>
        </div>
      </div>
    </main>
  );
}



