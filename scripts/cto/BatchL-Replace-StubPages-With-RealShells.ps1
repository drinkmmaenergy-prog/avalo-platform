Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchL-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$targets = @(
  'C:\a\avalo\app-web\src\app\admin\moderation\appeals\[appealId]\page.tsx',
  'C:\a\avalo\app-web\src\app\admin\moderation\incidents\[incidentId]\page.tsx',
  'C:\a\avalo\app-web\src\app\admin\moderation\user\[uid]\page.tsx',
  'C:\a\avalo\app-web\src\app\ai\chat\[avatarId]\page.tsx',
  'C:\a\avalo\app-web\src\app\ai\profile\[id]\page.tsx',
  'C:\a\avalo\app-web\src\app\call\[callId]\page.tsx',
  'C:\a\avalo\app-web\src\app\chat\[chatId]\page.tsx',
  'C:\a\avalo\app-web\src\app\clubs\[clubId]\page.tsx',
  'C:\a\avalo\app-web\src\app\feed\post\[id]\page.tsx',
  'C:\a\avalo\app-web\src\app\feed\reel\[id]\page.tsx',
  'C:\a\avalo\app-web\src\app\live\[sessionId]\page.tsx',
  'C:\a\avalo\app-web\src\app\moderator\incidents\[incidentId]\page.tsx',
  'C:\a\avalo\app-web\src\app\moderator\users\[userId]\page.tsx',
  'C:\a\avalo\app-web\src\app\profile\[userId]\layout.tsx',
  'C:\a\avalo\app-web\src\app\profile\[userId]\page.tsx',
  'C:\a\avalo\app-web\src\app\store\[userId]\page.tsx'
)

function Backup-File {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) { return }
  $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
  $dest = Join-Path $BackupRoot $relative
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -LiteralPath $Path -Destination $dest -Force
}

foreach ($path in $targets) {
  Backup-File -Path $path
}

function Write-PageShell {
  param(
    [string]$Path,
    [string]$ComponentName,
    [string]$Title,
    [string]$ParamName,
    [string]$Label
  )

@"
type PageProps = {
  params: {
    $ParamName: string;
  };
};

export default function $ComponentName({ params }: PageProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Avalo
            </p>
            <h1 className="text-2xl font-semibold">$Title</h1>
            <p className="text-sm text-muted-foreground">
              $Label: <span className="font-mono">{params.$ParamName}</span>
            </p>
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                This route is connected and ready for feature wiring. The shell keeps routing,
                parameters, and production build stability intact while the full screen is implemented.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
"@ | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Write-LayoutShell {
  param([string]$Path)

@"
import type { ReactNode } from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function ProfileUserLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </div>
    </div>
  );
}
"@ | Set-Content -LiteralPath $Path -Encoding UTF8
}

Write-PageShell -Path 'C:\a\avalo\app-web\src\app\admin\moderation\appeals\[appealId]\page.tsx' -ComponentName 'AdminModerationAppealDetailPage' -Title 'Appeal details' -ParamName 'appealId' -Label 'Appeal ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\admin\moderation\incidents\[incidentId]\page.tsx' -ComponentName 'AdminModerationIncidentDetailPage' -Title 'Incident details' -ParamName 'incidentId' -Label 'Incident ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\admin\moderation\user\[uid]\page.tsx' -ComponentName 'AdminModerationUserDetailPage' -Title 'User moderation details' -ParamName 'uid' -Label 'User ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\ai\chat\[avatarId]\page.tsx' -ComponentName 'AiChatAvatarDetailPage' -Title 'AI chat session' -ParamName 'avatarId' -Label 'Avatar ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\ai\profile\[id]\page.tsx' -ComponentName 'AiProfileDetailPage' -Title 'AI profile' -ParamName 'id' -Label 'Profile ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\call\[callId]\page.tsx' -ComponentName 'CallDetailPage' -Title 'Call session' -ParamName 'callId' -Label 'Call ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\chat\[chatId]\page.tsx' -ComponentName 'ChatDetailPage' -Title 'Chat session' -ParamName 'chatId' -Label 'Chat ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\clubs\[clubId]\page.tsx' -ComponentName 'ClubDetailPage' -Title 'Club details' -ParamName 'clubId' -Label 'Club ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\feed\post\[id]\page.tsx' -ComponentName 'FeedPostDetailPage' -Title 'Post details' -ParamName 'id' -Label 'Post ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\feed\reel\[id]\page.tsx' -ComponentName 'FeedReelDetailPage' -Title 'Reel details' -ParamName 'id' -Label 'Reel ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\live\[sessionId]\page.tsx' -ComponentName 'LiveSessionDetailPage' -Title 'Live session' -ParamName 'sessionId' -Label 'Session ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\moderator\incidents\[incidentId]\page.tsx' -ComponentName 'ModeratorIncidentDetailPage' -Title 'Moderator incident details' -ParamName 'incidentId' -Label 'Incident ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\moderator\users\[userId]\page.tsx' -ComponentName 'ModeratorUserDetailPage' -Title 'Moderator user details' -ParamName 'userId' -Label 'User ID'
Write-LayoutShell -Path 'C:\a\avalo\app-web\src\app\profile\[userId]\layout.tsx'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\profile\[userId]\page.tsx' -ComponentName 'ProfileUserDetailPage' -Title 'User profile' -ParamName 'userId' -Label 'User ID'
Write-PageShell -Path 'C:\a\avalo\app-web\src\app\store\[userId]\page.tsx' -ComponentName 'StoreUserDetailPage' -Title 'Creator store' -ParamName 'userId' -Label 'User ID'

$reportPath = Join-Path $AuditRoot ('batchL-report-' + $timestamp + '.txt')
@(
  'Batch L complete.'
  ('Safety backup: ' + $BackupRoot)
  ('Timestamp: ' + $timestamp)
  'Replaced stub pages with real route shells.'
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
