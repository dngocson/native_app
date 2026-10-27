"""Driver tối giản cho RTC DS1302 (giao tiếp 3 dây: CE/RST, I/O, SCLK).

Cùng API với driver DS3231 cũ (get_datetime/set_datetime/lost_power/
clear_lost_power_flag) để app.py không phải đổi logic.

DS1302 không có cờ mất nguồn như DS3231, nên coi là "mất giờ" khi:
- bit Clock Halt (CH) đang bật: chip vừa có nguồn lại mà pin backup hết, hoặc
- byte đánh dấu trong RAM (có pin backup) không còn đúng.
"""

from machine import Pin
import time

_CMD_CLOCK_BURST_READ = 0xBF
_CMD_CLOCK_BURST_WRITE = 0xBE
_CMD_WP_WRITE = 0x8E
_CMD_SECONDS_READ = 0x81
_CMD_RAM0_READ = 0xC1
_CMD_RAM0_WRITE = 0xC0

_CH_BIT = 0x80
_RAM_MARKER = 0xA5


def _bcd2dec(bcd):
    return (bcd >> 4) * 10 + (bcd & 0x0F)


def _dec2bcd(dec):
    return ((dec // 10) << 4) | (dec % 10)


class DS1302:
    def __init__(self, clk, dio, cs):
        self.clk = Pin(clk, Pin.OUT, value=0)
        self.dio = Pin(dio, Pin.OUT, value=0)
        self.cs = Pin(cs, Pin.OUT, value=0)

    # ---------- Tầng bit ----------

    def _begin(self):
        self.clk.value(0)
        self.cs.value(1)
        time.sleep_us(4)

    def _end(self):
        self.cs.value(0)
        self.clk.value(0)
        self.dio.init(Pin.OUT, value=0)
        time.sleep_us(4)

    def _write_byte(self, value):
        # Chip chốt dữ liệu ở sườn lên SCLK, LSB trước
        self.dio.init(Pin.OUT)
        for i in range(8):
            self.dio.value((value >> i) & 1)
            self.clk.value(1)
            self.clk.value(0)

    def _read_byte(self):
        # Chip xuất bit ở sườn xuống SCLK, LSB trước
        self.dio.init(Pin.IN)
        value = 0
        for i in range(8):
            value |= self.dio.value() << i
            self.clk.value(1)
            self.clk.value(0)
        return value

    def _read_reg(self, cmd):
        self._begin()
        self._write_byte(cmd)
        value = self._read_byte()
        self._end()
        return value

    def _write_reg(self, cmd, value):
        self._begin()
        self._write_byte(cmd)
        self._write_byte(value)
        self._end()

    # ---------- API ----------

    def get_datetime(self):
        """Trả về (year, month, day, hour, minute, second, weekday).

        weekday là giá trị thô 1-7 lưu trong chip, chỉ dùng nội bộ."""

        self._begin()
        self._write_byte(_CMD_CLOCK_BURST_READ)
        data = [self._read_byte() for _ in range(7)]
        self._end()

        second = _bcd2dec(data[0] & 0x7F)
        minute = _bcd2dec(data[1] & 0x7F)
        hour = _bcd2dec(data[2] & 0x3F)  # luôn ghi ở chế độ 24h
        day = _bcd2dec(data[3] & 0x3F)
        month = _bcd2dec(data[4] & 0x1F)
        weekday = data[5] & 0x07
        year = _bcd2dec(data[6]) + 2000

        return (year, month, day, hour, minute, second, weekday)

    def set_datetime(self, dt):
        """Ghi (year, month, day, hour, minute, second, weekday) và chạy dao động."""

        year, month, day, hour, minute, second, weekday = dt

        self._write_reg(_CMD_WP_WRITE, 0x00)  # tắt write-protect

        self._begin()
        self._write_byte(_CMD_CLOCK_BURST_WRITE)
        self._write_byte(_dec2bcd(second) & 0x7F)  # CH = 0 -> dao động chạy
        self._write_byte(_dec2bcd(minute) & 0x7F)
        self._write_byte(_dec2bcd(hour) & 0x3F)  # bit7 = 0 -> chế độ 24h
        self._write_byte(_dec2bcd(day) & 0x3F)
        self._write_byte(_dec2bcd(month) & 0x1F)
        self._write_byte(weekday if 1 <= weekday <= 7 else 1)
        self._write_byte(_dec2bcd(year % 100))
        self._write_byte(0x00)  # thanh ghi control (WP = 0)
        self._end()

        self._write_reg(_CMD_RAM0_WRITE, _RAM_MARKER)

    def lost_power(self):
        """True nếu giờ trong chip không còn tin cậy (pin backup hết/chưa lắp)."""

        if self._read_reg(_CMD_SECONDS_READ) & _CH_BIT:
            return True
        return self._read_reg(_CMD_RAM0_READ) != _RAM_MARKER

    def clear_lost_power_flag(self):
        # set_datetime() đã xoá CH và ghi byte đánh dấu, không cần làm gì thêm
        pass
