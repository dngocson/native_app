"""Driver tối giản cho RTC DS3231 (I2C).

Chỉ hỗ trợ đọc/ghi ngày giờ (chế độ 24h) và cờ mất nguồn (OSF) - đủ dùng
cho việc đồng bộ đồng hồ hệ thống, không cài đặt alarm/square-wave của chip.
"""

REG_TIME = 0x00
REG_STATUS = 0x0F
OSF_BIT = 0x80


def _bcd2dec(bcd):
    return (bcd >> 4) * 10 + (bcd & 0x0F)


def _dec2bcd(dec):
    return ((dec // 10) << 4) | (dec % 10)


class DS3231:
    def __init__(self, i2c, addr=0x68):
        self.i2c = i2c
        self.addr = addr

    def get_datetime(self):
        """Trả về (year, month, day, hour, minute, second, weekday).

        weekday là giá trị thô 1-7 lưu trong chip (không có ý nghĩa chuẩn
        Thứ-Hai/Chủ-Nhật cố định, chỉ dùng nội bộ để đổi qua lại với
        time.gmtime()/time.mktime())."""

        data = self.i2c.readfrom_mem(self.addr, REG_TIME, 7)

        second = _bcd2dec(data[0] & 0x7F)
        minute = _bcd2dec(data[1] & 0x7F)
        hour = _bcd2dec(data[2] & 0x3F)  # luôn cấu hình chip ở chế độ 24h
        weekday = data[3] & 0x07
        day = _bcd2dec(data[4] & 0x3F)

        month_reg = data[5]
        month = _bcd2dec(month_reg & 0x1F)
        century = 1 if (month_reg & 0x80) else 0
        year = _bcd2dec(data[6]) + 2000 + century * 100

        return (year, month, day, hour, minute, second, weekday)

    def set_datetime(self, dt):
        """Ghi (year, month, day, hour, minute, second, weekday) vào chip.

        weekday: 1-7, tuỳ ý miễn nhất quán với lúc đọc lại."""

        year, month, day, hour, minute, second, weekday = dt

        data = bytearray(7)
        data[0] = _dec2bcd(second) & 0x7F
        data[1] = _dec2bcd(minute) & 0x7F
        data[2] = _dec2bcd(hour) & 0x3F
        data[3] = weekday if 1 <= weekday <= 7 else 1
        data[4] = _dec2bcd(day) & 0x3F

        year_offset = year - 2000
        century_bit = 0x80 if year_offset >= 100 else 0x00
        data[5] = (_dec2bcd(month) & 0x1F) | century_bit
        data[6] = _dec2bcd(year_offset % 100)

        self.i2c.writeto_mem(self.addr, REG_TIME, bytes(data))

    def lost_power(self):
        """True nếu chip từng mất nguồn (pin CR2032 hết/chưa lắp) - nghĩa
        là giờ đang lưu không còn tin cậy."""

        status = self.i2c.readfrom_mem(self.addr, REG_STATUS, 1)[0]
        return bool(status & OSF_BIT)

    def clear_lost_power_flag(self):
        status = self.i2c.readfrom_mem(self.addr, REG_STATUS, 1)[0]
        status &= ~OSF_BIT
        self.i2c.writeto_mem(self.addr, REG_STATUS, bytes([status]))


