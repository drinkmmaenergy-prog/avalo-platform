Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Content
  )
  $dir = Split-Path -LiteralPath $Path -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function New-PageContent {
  param(
    [Parameter(Mandatory=$true)][string]$Title,
    [Parameter(Mandatory=$true)][string]$ParamName,
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$ComponentName
  )

  $template = @"
type PageProps = {
  params: {
    __PARAM__: string;
  };
};

export default function __COMPONENT__({ params }: PageProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avalo</p>
          <h1 className="text-2xl font-semibold">__TITLE__</h1>
          <p className="text-sm text-muted-foreground">__LABEL__: <span className="font-mono">{params.__PARAM__}</span></p>
        </div>
      </div>
    </main>
  );
}
"@

  return $template.Replace('__TITLE__', $Title).Replace('__PARAM__', $ParamName).Replace('__LABEL__', $Label).Replace('__COMPONENT__', $ComponentName)
}

$layoutContent = @"
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
"@

$pages = @(
  @{ Path = 'C:\a\avalo\app-web\src\app\admin\moderation\appeals\[appealId]\page.tsx'; Title = 'Appeal details'; Param = 'appealId'; Label = 'Appeal ID'; Component = 'AdminModerationAppealDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\admin\moderation\incidents\[incidentId]\page.tsx'; Title = 'Incident details'; Param = 'incidentId'; Label = 'Incident ID'; Component = 'AdminModerationIncidentDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\admin\moderation\user\[uid]\page.tsx'; Title = 'User moderation details'; Param = 'uid'; Label = 'User ID'; Component = 'AdminModerationUserDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\ai\chat\[avatarId]\page.tsx'; Title = 'AI chat session'; Param = 'avatarId'; Label = 'Avatar ID'; Component = 'AiChatAvatarDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\ai\profile\[id]\page.tsx'; Title = 'AI profile'; Param = 'id'; Label = 'Profile ID'; Component = 'AiProfileDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\call\[callId]\page.tsx'; Title = 'Call session'; Param = 'callId'; Label = 'Call ID'; Component = 'CallDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\chat\[chatId]\page.tsx'; Title = 'Chat session'; Param = 'chatId'; Label = 'Chat ID'; Component = 'ChatDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\clubs\[clubId]\page.tsx'; Title = 'Club details'; Param = 'clubId'; Label = 'Club ID'; Component = 'ClubDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\feed\post\[id]\page.tsx'; Title = 'Post details'; Param = 'id'; Label = 'Post ID'; Component = 'FeedPostDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\feed\reel\[id]\page.tsx'; Title = 'Reel details'; Param = 'id'; Label = 'Reel ID'; Component = 'FeedReelDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\live\[sessionId]\page.tsx'; Title = 'Live session'; Param = 'sessionId'; Label = 'Session ID'; Component = 'LiveSessionDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\moderator\incidents\[incidentId]\page.tsx'; Title = 'Moderator incident details'; Param = 'incidentId'; Label = 'Incident ID'; Component = 'ModeratorIncidentDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\moderator\users\[userId]\page.tsx'; Title = 'Moderator user details'; Param = 'userId'; Label = 'User ID'; Component = 'ModeratorUserDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\profile\[userId]\page.tsx'; Title = 'User profile'; Param = 'userId'; Label = 'User ID'; Component = 'ProfileUserDetailPage' },
  @{ Path = 'C:\a\avalo\app-web\src\app\store\[userId]\page.tsx'; Title = 'Creator store'; Param = 'userId'; Label = 'User ID'; Component = 'StoreUserDetailPage' }
)

foreach ($page in $pages) {
  $content = New-PageContent -Title $page.Title -ParamName $page.Param -Label $page.Label -ComponentName $page.Component
  Write-Utf8NoBom -Path $page.Path -Content $content
  Write-Host ('Wrote: ' + $page.Path) -ForegroundColor Green
}

Write-Utf8NoBom -Path 'C:\a\avalo\app-web\src\app\profile\[userId]\layout.tsx' -Content $layoutContent
Write-Host 'Wrote: C:\a\avalo\app-web\src\app\profile\[userId]\layout.tsx' -ForegroundColor Green
