[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 8080, [switch]$MySql, [switch]$NoBuild, [switch]$Build)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$run = (New-Item -ItemType Directory -Force (Join-Path $root 'runtime')).FullName
$tmp = (New-Item -ItemType Directory -Force (Join-Path $run 'tmp')).FullName
$record = Join-Path $run 'service.json'
$started = $null
try {
    if (Test-Path -LiteralPath $record) {
        $old = Get-Content -Raw -LiteralPath $record | ConvertFrom-Json
        $process = Get-Process -Id $old.pid -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $old.started -and $process.Path -eq $old.executable) {
            throw "Project server is already running. Use stop.bat first."
        }
    }
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    if ($listeners.Port -contains $Port) { throw "Port $Port is occupied. Try start.bat -Port 8081." }
    $java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java.exe -ErrorAction Stop).Source }
    $javaVersion = (& $java --version | Select-Object -First 1)
    if ($javaVersion -notmatch '"?(21|22|23|24|25)(\.|"|\s)') { throw "Use JDK 21 (or compatible 22-25) via JAVA_HOME: $javaVersion" }
    if ($MySql -and !$env:NANHU_DB_PASSWORD) { throw 'Set NANHU_DB_PASSWORD for the MySQL profile.' }
    $jar = Join-Path $root 'backend/target/nanhu-1.0.0-app.jar'
    $built = (Test-Path -LiteralPath $jar) -and (Test-Path -LiteralPath 'frontend/dist/index.html')
    if ($Build -or (!$NoBuild -and !$built)) {
        $env:TEMP = $tmp
        $env:TMP = $tmp
        $env:MAVEN_OPTS = ($env:MAVEN_OPTS + ' "-Djava.io.tmpdir=' + $tmp + '"').Trim()
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $nodeVersion = ((& $node --version).TrimStart('v')) -as [version]
        if (!$nodeVersion -or ($nodeVersion -lt [version]'22.12.0' -and ($nodeVersion.Major -ne 20 -or $nodeVersion -lt [version]'20.19.0'))) {
            throw 'Vite requires Node.js 20.19+ or 22.12+.'
        }
        $npm = if ($env:NANHU_NPM_CLI) { $env:NANHU_NPM_CLI } else { (Get-Command npm.cmd -ErrorAction Stop).Source }
        $mvn = if ($env:NANHU_MAVEN) { $env:NANHU_MAVEN } else { (Get-Command mvn.cmd -ErrorAction Stop).Source }
        Push-Location -LiteralPath (Join-Path $root 'frontend')
        try {
            Write-Host "Installing frontend dependencies. Log: $run/npm.log"
            $env:npm_config_cache = Join-Path $run 'npm-cache'
            if ($env:NANHU_NPM_CLI) { & $node $npm ci --no-audit --no-fund > (Join-Path $run 'npm.log') 2>&1 }
            else { & $npm ci --no-audit --no-fund > (Join-Path $run 'npm.log') 2>&1 }
            if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. See runtime/npm.log.' }
            & $node node_modules/vite/bin/vite.js build --configLoader native > (Join-Path $run 'vite.log') 2>&1
            if ($LASTEXITCODE -ne 0) { throw 'Vite build failed. See runtime/vite.log.' }
        } finally { Pop-Location }
        $mavenRepo = if ($env:NANHU_MAVEN_REPO) { $env:NANHU_MAVEN_REPO } else { Join-Path $run 'maven-repository' }
        Write-Host "Building backend. Log: $run/maven.log"
        & $mvn -B "-Dmaven.repo.local=$mavenRepo" '-Dmaven.compiler.fork=true' -f backend/pom.xml package > (Join-Path $run 'maven.log') 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Maven build failed. See runtime/maven.log.' }
    }
    if (!(Test-Path -LiteralPath $jar) -or !(Test-Path -LiteralPath 'frontend/dist/index.html')) {
        throw 'Build output is missing. Run start.bat without -NoBuild.'
    }
    $argsList = @(('"-Djava.io.tmpdir=' + $tmp + '"'), '-jar', ('"' + $jar + '"'), "--server.port=$Port")
    if ($MySql) { $argsList += '--spring.profiles.active=mysql' }
    $started = Start-Process -FilePath $java -ArgumentList $argsList -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $run 'server.log') -RedirectStandardError (Join-Path $run 'server-error.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(35)
    do {
        if ($started.HasExited) { throw "Java exited. See $run/server.log and server-error.log." }
        Start-Sleep -Milliseconds 650
        try {
            $probe = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://127.0.0.1:$Port/api/scene"
            if ($probe.StatusCode -eq 200 -and $probe.Content -match '"revision"') {
                @{pid=$started.Id;started=$started.StartTime.ToUniversalTime().Ticks.ToString();executable=$started.Path;port=$Port} |
                    ConvertTo-Json | Set-Content -LiteralPath $record -Encoding UTF8
                Write-Host "Campus map: http://127.0.0.1:$Port/"
                Write-Host "Server logs: $run/server.log and server-error.log"
                exit 0
            }
        } catch { }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Server readiness timed out. See $run/server.log."
} catch {
    if ($started -and !$started.HasExited) { Stop-Process -InputObject $started -ErrorAction SilentlyContinue }
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
