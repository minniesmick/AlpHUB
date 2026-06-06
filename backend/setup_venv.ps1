# AlpHUB — venv setup script
# Run this ONCE from the backend\ directory as Administrator (or with D: access)
# Usage: cd backend; .\setup_venv.ps1

$VenvPath   = "D:\AI_Ortak_Venv\hub_venv"
$Python     = "python"      # use system Python to create the venv

Write-Host "=== AlpHUB venv setup ===" -ForegroundColor Cyan

# 1. Create venv if not already a valid venv
if (-not (Test-Path "$VenvPath\Scripts\python.exe")) {
    Write-Host "Creating venv at $VenvPath ..." -ForegroundColor Yellow
    & $Python -m venv $VenvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create venv. Make sure Python 3.11+ is on PATH."
        exit 1
    }
} else {
    Write-Host "Venv already exists at $VenvPath" -ForegroundColor Green
}

$VenvPython = "$VenvPath\Scripts\python.exe"
$VenvPip    = "$VenvPath\Scripts\pip.exe"

# 2. Upgrade pip
Write-Host "Upgrading pip..." -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip

# 3. Install PyTorch with CUDA 12.1 first (avoid CPU-only torch from PyPI)
Write-Host "Installing PyTorch (CUDA 12.1)..." -ForegroundColor Yellow
& $VenvPip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# 4. Install remaining requirements
Write-Host "Installing remaining requirements..." -ForegroundColor Yellow
& $VenvPip install `
    "fastapi>=0.111.0" `
    "uvicorn[standard]>=0.30.0" `
    "websockets>=12.0" `
    "python-multipart>=0.0.9" `
    "pydantic>=2.7.0" `
    "python-dotenv>=1.0.0" `
    "sounddevice>=0.4.7" `
    "numpy>=2.0.0" `
    "scipy>=1.13.0" `
    "pedalboard>=0.9.0" `
    "faster-whisper>=1.0.0" `
    "kokoro>=0.9.4" `
    "misaki[en]>=0.9.4" `
    "soundfile>=0.12.0" `
    "demucs>=4.0.1"

# 5. Verify key imports
Write-Host "`nVerifying installs..." -ForegroundColor Yellow
& $VenvPython -c "import fastapi; print('fastapi', fastapi.__version__)"
& $VenvPython -c "import torch; print('torch', torch.__version__, '| CUDA:', torch.cuda.is_available())"
& $VenvPython -c "import sounddevice; print('sounddevice OK')"
& $VenvPython -c "import pedalboard; print('pedalboard OK')"
& $VenvPython -c "import faster_whisper; print('faster_whisper OK')"
& $VenvPython -c "import kokoro; print('kokoro OK')"
& $VenvPython -c "import demucs; print('demucs OK')"

Write-Host "`n=== Setup complete ===" -ForegroundColor Green
Write-Host "Run: npm start  (from project root)" -ForegroundColor Cyan
