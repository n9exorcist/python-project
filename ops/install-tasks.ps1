<#
    install-tasks.ps1 — register the punctual triggers with Windows Task Scheduler.

    Windows fires these to the minute. That is the entire point: GitHub's cron
    queue has been running this repository's jobs 4 to 12 hours late, and no
    amount of editing the cron expression changes a queue that ignores it.

    Times are LOCAL, which on this machine is IST -- the same timezone the market
    trades in, so there is no conversion to get wrong.

        09:16  brief         yesterday's screen, today's fills, the open book
        15:40  mark scan     mark positions, then screen the session that closed
        Sat 09:00  eval report   the agent loop, then the weekly report

    This does NOT make the GitHub schedule redundant -- it stays as the backstop
    for days this machine is off. Double-running is safe by design: job_runs
    claims a session once its work is done, so whichever fires second prints
    "already screened" and exits.

    Register-ScheduledTask is used rather than schtasks.exe. schtasks takes the
    whole command as one string and re-parses it, which mangles both the space in
    "python project" and the quotes around a two-word job like "mark scan"; the
    cmdlets take the arguments as data and quote them correctly.

    Install:    powershell -ExecutionPolicy Bypass -File ops\install-tasks.ps1
    Remove:     powershell -ExecutionPolicy Bypass -File ops\install-tasks.ps1 -Uninstall
    Inspect:    Get-ScheduledTask -TaskPath '\SwingAgent\' | Format-Table TaskName, State
#>

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'punctual.ps1'
$taskPath = '\SwingAgent\'

$tasks = @(
    @{ Name = 'brief';  Job = 'brief';       Time = '09:16'; Days = @('Monday','Tuesday','Wednesday','Thursday','Friday') }
    @{ Name = 'scan';   Job = 'mark scan';   Time = '15:40'; Days = @('Monday','Tuesday','Wednesday','Thursday','Friday') }
    @{ Name = 'weekly'; Job = 'eval report'; Time = '09:00'; Days = @('Saturday') }
)

foreach ($t in $tasks) {
    $existing = Get-ScheduledTask -TaskPath $taskPath -TaskName $t.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskPath $taskPath -TaskName $t.Name -Confirm:$false
    }
    if ($Uninstall) {
        Write-Host ("removed  {0}{1}" -f $taskPath, $t.Name)
        continue
    }

    # -WindowStyle Hidden so a scheduled run does not throw a console window in
    # front of whatever you are doing at 09:16.
    $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden ' +
                 ('-File "{0}" -Job "{1}"' -f $script, $t.Job)

    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $t.Days -At $t.Time

    # StartWhenAvailable matters: if the machine was asleep at 09:16 the task
    # runs as soon as it wakes, rather than silently skipping the day. Late is
    # still better than never, and the job_runs guard stops it colliding with a
    # GitHub run that already did the work.
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

    Register-ScheduledTask -TaskPath $taskPath -TaskName $t.Name `
        -Action $action -Trigger $trigger -Settings $settings `
        -Description "Swing agent: $($t.Job)" | Out-Null

    Write-Host ("created  {0,-8} {1,-6} {2}  ->  {3}" -f $t.Name, $t.Time,
        ($t.Days[0].Substring(0,3) + $(if ($t.Days.Count -gt 1) { "-" + $t.Days[-1].Substring(0,3) } else { "" })),
        $t.Job)
}

if (-not $Uninstall) {
    Write-Host ''
    Write-Host 'Registered. These fire only while this machine is on;'
    Write-Host 'the GitHub schedule remains the backstop for the days it is not.'
}
