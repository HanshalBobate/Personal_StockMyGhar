@echo off
title StockMyGhar Server
echo ---------------------------------------------------
echo starting StockMyGhar Grocery Inventory...
echo ---------------------------------------------------
echo.
echo [INFO] Server will be available at:
echo        Local:  http://127.0.0.1:5000
echo        Mobile: http://10.55.239.242:5000
echo.
echo [HINT] Make sure your phone is on the same hotspot!
echo ---------------------------------------------------
echo.

python app.py

pause
