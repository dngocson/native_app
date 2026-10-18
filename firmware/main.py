# Launcher LÕI: không cập nhật qua OTA (chỉ nạp qua USB).
#
# 1. ota.boot_check(): nếu bản mới đang chạy thử mà boot lỗi quá số lần -> rollback.
# 2. import app: chạy code chính (app.py).
# 3. App crash: đang chạy thử -> rollback về bản cũ; không thì vào SAFE MODE
#    (chỉ chạy BLE để nhận OTA sửa lỗi từ app).

import time
import ota

ota.boot_check()

try:
    import app  # noqa: F401  (app.py chạy vòng lặp chính khi import)
except Exception as err:
    ota.on_crash(err)

    # Không rollback được -> safe mode
    print("SAFE MODE")

    def show_safe_mode():
        try:
            from machine import Pin, I2C
            import sh1106

            oled = sh1106.SH1106_I2C(128, 64, I2C(0, sda=Pin(4), scl=Pin(5)))
            oled.flip(180)
            oled.fill(0)
            oled.text("SAFE MODE", 0, 0)
            oled.text("App error.", 0, 16)
            oled.text("Update firmware", 0, 32)
            oled.text("from the app", 0, 42)
            oled.show()
        except Exception as oled_err:
            print("Safe mode OLED failed:", oled_err)

    show_safe_mode()

    try:
        from ble_server import BLEServer

        BLEServer(name="PillAlert")
    except Exception as ble_err:
        ota.log_error(ble_err)
        print("Safe mode BLE failed, use USB to recover")

    while True:
        ota.tick(allow_confirm=False)
        time.sleep_ms(100)
