<#
    punctual.ps1 — run a swing job ON TIME.

    THE PROBLEM
    GitHub's `schedule` event is queued and drained when GitHub chooses. Measured
    on this repository: within 38 minutes through 26 Aug, then +11h55m, +6h20m,
    and a steady +4h30m into September. On 7 September the swing fill (cron
    03:46 UTC) and the options trade (03:45 UTC) both started at 08:38 UTC.
    Moving a cron earlier only moves the input to a queue that ignores it.

    THE FIX, IN TWO TIERS
    1. Ask GitHub to run it via workflow_dispatch. Dispatched runs start within
       seconds -- they do not go through the schedule queue at all. This is the
       preferred path because the cloud runner stays the single writer of
       swing.db, which is what keeps the paper book free of merge conflicts.
    2. If the dispatch is refused, run the job locally instead, so the Telegram
       notification still arrives on time.

    Tier 1 needs a token with Actions: write. Until that exists every dispatch
    returns 403 and tier 2 carries it. Nothing needs changing when you do grant
    it -- the script simply stops falling back.

    USAGE
        powershell -File ops\punctual.ps1 -Job brief
        powershell -File ops\punctual.ps1 -Job "mark scan"

    Register with Windows Task Scheduler via ops\install-tasks.ps1.
#>

param(
    [Parameter(Mandatory = $true)][string]$Job,
    [switch]$LocalOnly
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repo 'langchain project'
$python = Join-Path $app 'venv\Scripts\python.exe'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("punctual-{0}.log" -f (Get-Date -Format 'yyyy-MM'))

function Write-Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Output $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

Write-Log "=== $Job ==="

# --- read .env without a shell dependency ---------------------------------
# The token is never hardcoded here: this file is committed, .env is not.
# .env sits at the repo root, beside the "langchain project" directory.
$envFile = Join-Path $repo '.env'
$token = $null
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*GITHUB_PAT\s*=\s*(.+?)\s*$') { $token = $Matches[1].Trim('"').Trim("'") }
    }
}

# --- tier 1: ask GitHub to run it -----------------------------------------
$dispatched = $false
if (-not $LocalOnly -and $token) {
    # The workflow takes "mark+scan" as one choice; the CLI takes two words.
    $input = $Job.Replace(' ', '+')
    $body = @{ ref = 'main'; inputs = @{ command = $input } } | ConvertTo-Json -Compress
    $uri = 'https://api.github.com/repos/n9exorcist/python-project/actions/workflows/swing.yml/dispatches'
    try {
        Invoke-RestMethod -Method Post -Uri $uri -Body $body -ContentType 'application/json' -Headers @{
            Authorization          = "Bearer $token"
            Accept                 = 'application/vnd.github+json'
            'X-GitHub-Api-Version' = '2022-11-28'
            'User-Agent'           = 'swing-punctual'
        } -TimeoutSec 30 | Out-Null
        $dispatched = $true
        Write-Log "dispatched '$input' to GitHub (runs in the cloud, starts within seconds)"
    }
    catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 403) {
            Write-Log "dispatch refused (403): the token lacks Actions: write. Running locally instead."
        }
        else {
            Write-Log "dispatch failed ($code): $($_.Exception.Message). Running locally instead."
        }
    }
}
elseif (-not $token) {
    Write-Log 'no GITHUB_PAT in .env; running locally'
}

# --- tier 2: run it here ---------------------------------------------------
if (-not $dispatched) {
    if (-not (Test-Path $python)) {
        Write-Log "FATAL: no interpreter at $python"
        exit 1
    }
    Push-Location $app
    try {
        # Each word is a separate job; "mark scan" is two, in order.
        foreach ($cmd in $Job.Split(' ')) {
            Write-Log "running jobs.py $cmd locally"
            & $python 'jobs.py' $cmd 2>&1 | ForEach-Object { Write-Log "  $_" }
        }
    }
    finally { Pop-Location }
}

Write-Log "done`n"
