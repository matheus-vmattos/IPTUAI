@echo off
cd /d "%~dp0"

echo ============================================
echo   IPTUAI - iniciando o servidor
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao foi encontrado no seu computador.
    echo Baixe e instale em https://nodejs.org antes de continuar.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo Criando arquivo de configuracao .env pela primeira vez...
    copy ".env.example" ".env" >nul
)

if not exist "node_modules" (
    echo Instalando dependencias pela primeira vez, isso pode demorar alguns minutos...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar as dependencias.
        pause
        exit /b 1
    )
)

echo.
echo Servidor iniciando em http://localhost:4000
echo As credenciais de login (email/senha) do administrador aparecem abaixo.
echo NAO FECHE ESTA JANELA enquanto estiver usando o programa.
echo.

call npm start
pause
