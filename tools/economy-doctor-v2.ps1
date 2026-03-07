
$root = "C:\a\avalo\functions\src"
$out  = "C:\a\avalo\audit-out\ECONOMY_DOCTOR_REPORT.txt"

$lines = @()

function log {
    param($t)
    Write-Host $t
    $script:lines += $t
}

log "========== AVALO ECONOMY DOCTOR =========="
log "ROOT: $root"

$files = Get-ChildItem $root -File -Recurse | Where-Object {$_.Extension -in ".ts",".js"}

# ------------------------------------------------
# SCAN 1 CANONICAL / LEGACY
# ------------------------------------------------

log ""
log "SCAN 1 — CHAT ENGINES"

foreach($f in $files){

    $m = Select-String -Path $f.FullName -Pattern "canonical-chat-engine","pack273ChatEngine","chatMonetization","pack430-economy-engine","canonical-chat-legacy-shim" -SimpleMatch -ErrorAction SilentlyContinue

    foreach($x in $m){
        log "FILE: $($x.Path)"
        log "LINE: $($x.LineNumber)"
        log "CODE: $($x.Line.Trim())"
        log "---------------------------------------"
    }

}

# ------------------------------------------------
# SCAN 2 WORD BILLING
# ------------------------------------------------

log ""
log "SCAN 2 — WORD BILLING"

foreach($f in $files){

$m = Select-String -Path $f.FullName -Pattern "WORDS_PER_TOKEN_STANDARD","WORDS_PER_TOKEN_ROYAL","wordsPerToken","tokensConsumed","wordCount" -SimpleMatch -ErrorAction SilentlyContinue

foreach($x in $m){

log "FILE: $($x.Path)"
log "LINE: $($x.LineNumber)"
log "CODE: $($x.Line.Trim())"
log "---------------------------------------"

}

}

# ------------------------------------------------
# SCAN 3 ENTRY FEE
# ------------------------------------------------

log ""
log "SCAN 3 — ENTRY / ESCROW"

foreach($f in $files){

$m = Select-String -Path $f.FullName -Pattern "deposit","escrow","platformFee","MIN_DEPOSIT_TOKENS","DEPOSIT_PLATFORM_FEE_PCT" -SimpleMatch -ErrorAction SilentlyContinue

foreach($x in $m){

log "FILE: $($x.Path)"
log "LINE: $($x.LineNumber)"
log "CODE: $($x.Line.Trim())"
log "---------------------------------------"

}

}

# ------------------------------------------------
# SCAN 4 MULTIPLIERS
# ------------------------------------------------

log ""
log "SCAN 4 — MULTIPLIERS"

foreach($f in $files){

$m = Select-String -Path $f.FullName -Pattern "multiplier","burnMultiplier","setMultiplierForNextSession" -SimpleMatch -ErrorAction SilentlyContinue

foreach($x in $m){

log "FILE: $($x.Path)"
log "LINE: $($x.LineNumber)"
log "CODE: $($x.Line.Trim())"
log "---------------------------------------"

}

}

# ------------------------------------------------
# SCAN 5 SPLITS
# ------------------------------------------------

log ""
log "SCAN 5 — SPLITS"

foreach($f in $files){

$m = Select-String -Path $f.FullName -Pattern "0.65","0.35","0.70","0.30","0.80","0.20" -SimpleMatch -ErrorAction SilentlyContinue

foreach($x in $m){

log "FILE: $($x.Path)"
log "LINE: $($x.LineNumber)"
log "CODE: $($x.Line.Trim())"
log "---------------------------------------"

}

}

# ------------------------------------------------
# SAVE REPORT
# ------------------------------------------------

$lines | Set-Content $out -Encoding UTF8

log ""
log "REPORT SAVED:"
log $out

