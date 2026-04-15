type PageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function ProfileUserDetailPage({ params }: PageProps) {
  const { userId } = await params;
  return (
    <main className="min-h-screen bg-background">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avalo</p>
        <h1 className="text-2xl font-semibold">User profile</h1>
        <p className="text-sm text-muted-foreground">User ID: <span className="font-mono">{userId}</span></p>
      </div>
    </main>
  );
}



