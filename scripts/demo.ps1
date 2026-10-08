param(
    [ValidateSet('start', 'stop', 'status', 'logs', 'reset')][string]$Action = 'start',
    [ValidateRange(1024, 65535)][int]$Port = 8080,
    [switch]$ConfirmDemoReset
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Nainstalujte a spusťte Docker Desktop.' }
Push-Location $projectRoot
$previousPort = $env:FNS_DEMO_PORT
try {
    $env:FNS_DEMO_PORT = "$Port"
    docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker neběží. Spusťte Docker Desktop a zkuste to znovu.' }
    $composeArgs = @('compose', '-f', 'compose.demo.yaml')
    switch ($Action) {
        'start' {
            docker @composeArgs up --build -d --wait
            if ($LASTEXITCODE -ne 0) { throw 'Ukázku se nepodařilo spustit. Zkontrolujte volný port a příkaz -Action logs.' }
            Write-Host "Ukázková síť: http://127.0.0.1:$Port"
            Write-Host 'Návod je v aplikaci pod odkazem Ukázková síť · Jak začít.'
        }
        'stop' { docker @composeArgs down }
        'status' { docker @composeArgs ps }
        'logs' { docker @composeArgs logs --tail 80 }
        'reset' {
            if (-not $ConfirmDemoReset) { throw 'Obnovení smaže změny jen v této ukázce. Pro potvrzení použijte -Action reset -ConfirmDemoReset.' }
            docker @composeArgs down --volumes
            if ($LASTEXITCODE -ne 0) { throw 'Ukázkové úložiště se nepodařilo obnovit.' }
            docker @composeArgs up --build -d --wait
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "Operace '$Action' selhala. Podrobnosti jsou ve výpisu Dockeru." }
} finally {
    $env:FNS_DEMO_PORT = $previousPort
    Pop-Location
}
