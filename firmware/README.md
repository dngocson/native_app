# Firmware PillAlert (Pico W + MicroPython)

| File | Vai trò | Cập nhật qua app (OTA)? |
| --- | --- | --- |
| `main.py` | Launcher: kiểm tra rollback, chạy `app.py`, safe mode khi lỗi | Không (chỉ USB) |
| `ota.py` | Nhận firmware qua BLE, backup, rollback | Không (chỉ USB) |
| `app.py` | Code chính (OLED, RTC, alarm, LED, buzzer) | Có |
| `ble_server.py`, `sh1106.py`, `ds3231.py` | Thư viện | Có |

## Nạp lần đầu (USB) — chỉ làm 1 lần

```sh
pip install mpremote
mpremote connect auto fs cp firmware/main.py firmware/ota.py firmware/app.py firmware/ble_server.py firmware/sh1106.py firmware/ds3231.py : + reset
```

Hoặc dùng Thonny: mở từng file và chọn *Save as → Raspberry Pi Pico* với đúng tên file.

## Cập nhật qua app

1. Sửa code trong `firmware/` (ví dụ đổi chân OLED, đổi chữ trên màn hình trong `app.py`).
2. `npm run firmware:bundle` (tự chạy khi `npm start` / `npm run android`) → sinh `constants/firmwareBundle.ts`.
3. Reload app → màn hình **BLE devices** → kết nối board → **Update firmware**.

App chỉ gửi những file khác với file trên board (so sánh CRC32).

## Cơ chế an toàn

- Bản mới được nạp vào `/ota_new`, kiểm tra kích thước + CRC32, bản cũ chuyển vào `/ota_bak`.
- Board khởi động lại ở chế độ **chạy thử** (có watchdog 8s). Chạy ổn 15s → xác nhận bản mới.
- Crash hoặc treo khi chạy thử → tự khôi phục bản cũ; app báo "rolled back" kèm lỗi.
- Crash khi không còn bản để khôi phục → **SAFE MODE**: OLED hiện thông báo, BLE vẫn chạy để nạp bản sửa lỗi.
- Sửa `main.py` hoặc `ota.py` thì phải nạp lại qua USB. Màn hình safe mode dùng cố định I2C0 GP4/GP5 trong `main.py`.
