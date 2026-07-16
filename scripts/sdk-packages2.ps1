$ErrorActionPreference = "Continue"
$sdk = "C:\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_HOME = $sdk

# Pre-accept SDK licenses headlessly by writing the known hash files
# (identical to what `sdkmanager --licenses` produces when you type "y").
$lic = Join-Path $sdk "licenses"
New-Item -ItemType Directory -Force $lic | Out-Null

$sdkLicense = @(
  "24333f8a63b6825ea9c5514f83c2829b004d1fee",
  "8933bad161af4178b1185d1a37fbf41ea5269c55",
  "d56f5187479451eabf01fb78af6dfcb131a6481e"
) -join "`n"
$previewLicense = "84831b9409646a918e30573bab4c9c91346d8abd"

[System.IO.File]::WriteAllText((Join-Path $lic "android-sdk-license"), "`n$sdkLicense")
[System.IO.File]::WriteAllText((Join-Path $lic "android-sdk-preview-license"), "`n$previewLicense")
Write-Output "licenses written"

$sm = Join-Path $sdk "cmdline-tools\latest\bin\sdkmanager.bat"
Write-Output "== installing packages (licenses pre-accepted) =="
& $sm "--sdk_root=$sdk" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

Write-Output ("adb: " + (Test-Path (Join-Path $sdk 'platform-tools\adb.exe')))
Write-Output ("android-34: " + (Test-Path (Join-Path $sdk 'platforms\android-34')))
Write-Output ("build-tools: " + (Test-Path (Join-Path $sdk 'build-tools')))
Write-Output "SDK_DONE2"
