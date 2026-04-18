@echo off
title StockMyGhar Server
echo ---------------------------------------------------
echo starting StockMyGhar Grocery Inventory...
echo ---------------------------------------------------
echo.
echo [INFO] Server will be available at:
echo        Local:  http://localhost:5000
echo        Mobile: run ipconfig to fing your IPv4 address and then visit http://<your_1pv4_add>:5000
echo.
echo [HINT] Make sure your phone is on the same hotspot!
echo ---------------------------------------------------
echo.

python app.py

pause
