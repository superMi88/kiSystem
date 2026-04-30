@echo off
echo Starte PostgreSQL Docker Container fuer KI-System...

:: Variablen
set CONTAINER_NAME=kisystem-postgres
set DB_PORT=5435
set DB_USER=admin
set DB_PASSWORD=password123
set DB_NAME=kisystem

:: Pruefe ob Container bereits existiert
docker ps -a --format "{{.Names}}" | findstr /R /C:"^%CONTAINER_NAME%$" > nul
if %errorlevel% equ 0 (
    echo Container %CONTAINER_NAME% existiert bereits. Starte ihn...
    docker start %CONTAINER_NAME%
) else (
    echo Erstelle neuen Container %CONTAINER_NAME% auf Port %DB_PORT%...
    docker run --name %CONTAINER_NAME% ^
        -e POSTGRES_USER=%DB_USER% ^
        -e POSTGRES_PASSWORD=%DB_PASSWORD% ^
        -e POSTGRES_DB=%DB_NAME% ^
        -p %DB_PORT%:5432 ^
        -d postgres:latest
)

echo.
echo PostgreSQL ist bereit auf Port %DB_PORT%!
echo Verbindung: postgresql://%DB_USER%:%DB_PASSWORD%@localhost:%DB_PORT%/%DB_NAME%
pause
