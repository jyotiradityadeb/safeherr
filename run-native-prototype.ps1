$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$adb = Get-Command adb -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $adb) {
  $sdkRoot = $env:ANDROID_SDK_ROOT
  if (-not $sdkRoot) {
    $sdkRoot = $env:ANDROID_HOME
  }
  if ($sdkRoot) {
    $candidateAdb = Join-Path $sdkRoot "platform-tools\adb.exe"
    if (Test-Path $candidateAdb) {
      $adb = $candidateAdb
    }
  }
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
  $studioJbr = Join-Path $env:ProgramFiles "Android\Android Studio\jbr"
  if (Test-Path $studioJbr) {
    $javaHome = $studioJbr
  }
}
$apkPath = Join-Path $root "mobile\android\app\build\outputs\apk\release\app-release.apk"

Write-Host "Starting SafeHer native prototype..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\admin'; npm run dev -- --host 0.0.0.0 --port 5173"
Start-Sleep -Seconds 2

if (-not (Test-Path $adb)) {
  throw "adb not found. Add adb to PATH or set ANDROID_SDK_ROOT/ANDROID_HOME."
}

if (-not (Test-Path $apkPath)) {
  Write-Host "Release APK not found. Building it now..." -ForegroundColor Yellow
  if ($javaHome) {
    Start-Process powershell -Wait -ArgumentList "-NoExit", "-Command", "`$env:JAVA_HOME='$javaHome'; `$env:Path='$javaHome\bin;' + `$env:Path; cd '$root\mobile\android'; .\gradlew.bat assembleRelease"
  } else {
    Start-Process powershell -Wait -ArgumentList "-NoExit", "-Command", "cd '$root\mobile\android'; .\gradlew.bat assembleRelease"
  }
}

& $adb devices
& $adb install -r $apkPath | Out-Host
& $adb shell monkey -p com.safeher.app -c android.intent.category.LAUNCHER 1 | Out-Null

Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Admin:   http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "APK:     $apkPath" -ForegroundColor Green
Write-Host "Demo user: demo@safeher.app / password123" -ForegroundColor Green
Write-Host "Admin:     admin@safeher.app / admin123" -ForegroundColor Green
