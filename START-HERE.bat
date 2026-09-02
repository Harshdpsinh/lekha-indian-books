@echo off
REM Double-click this on Windows.
cd /d "%~dp0"
if not exist "app\streamlit_app.py" if exist "lekha-indian-books-main\app\streamlit_app.py" cd lekha-indian-books-main
set PYTHONPATH=%CD%
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
if not exist .env copy .env.example .env
if not exist inbox mkdir inbox
if not exist data mkdir data
echo Lekha is opening in your browser...
streamlit run app/streamlit_app.py
