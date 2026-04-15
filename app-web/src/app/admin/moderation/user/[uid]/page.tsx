type PageProps = {
  params: Promise<{
    uid: string;
  }>;
};

export default async function AdminModerationUserDetailPage({ params }: PageProps) {
  const { uid } = await params;
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avalo</p>
          <h1 className="text-2xl font-semibold">User moderation details</h1>
          <p className="text-sm text-muted-foreground">User ID: <span className="font-mono">{uid}</span></p>
        </div>
      </div>
    </main>
  );
}



