@echo off
chcp 65001 > nul
rem TeamFlow Django manage.py yordamchi skripti
rem Foydalanish: manage.bat <buyruq> [parametrlar]
rem Masalan: manage.bat migrate
rem          manage.bat makemigrations
rem          manage.bat seed_demo
rem          manage.bat shell

if "%~1"=="" (
    echo ==============================================================================
    echo   TeamFlow — Django manage.py konteyner ko'prigi
    echo ==============================================================================
    echo   Foydalanish: manage.bat ^<buyruq^> [parametrlar]
    echo.
    echo   Mashhur buyruqlar:
    echo     manage.bat migrate               - Bazani oxirgi migratsiyalarga keltirish
    echo     manage.bat makemigrations        - Yangi migratsiya fayllarini yaratish
    echo     manage.bat seed_demo             - Demo ma'lumotlarni kiritish
    echo     manage.bat seed_ui_texts         - Interfeys matnlarini yangilash
    echo     manage.bat bootstrap_boss        - Boshliq hisobini yaratish
    echo     manage.bat shell                 - Django interaktiv shellini ochish
    echo     manage.bat test --noinput        - Testlarni yugurtirish
    echo ==============================================================================
    exit /b 0
)

docker exec -it teamflow_backend python manage.py %*
