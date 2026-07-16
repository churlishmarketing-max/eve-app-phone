$ErrorActionPreference = "Continue"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_SDK_ROOT = "C:\Android\Sdk"
$env:ANDROID_HOME = "C:\Android\Sdk"
Set-Location C:\dev\eve\app\android
Write-Output "== gradle assembleDebug (first run downloads Gradle 8.9) =="
& .\gradlew.bat assembleDebug --no-daemon --console=plain
$apk = "C:\dev\eve\app\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Output ("APK exists: " + (Test-Path $apk))
if (Test-Path $apk) { Write-Output ("APK size (MB): " + [math]::Round((Get-Item $apk).Length/1MB, 2)) }
Write-Output "BUILD_DONE"
