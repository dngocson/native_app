from machine import Pin, I2C, ADC
import time
import ujson
import ubinascii
import sh1106
import ota
from ds1302 import DS1302
from ble_server import BLEServer

# ---------- CONFIG ----------
SETTING_TIME = "SETTING_TIME"
SETTING_ALARM_TIME = "SETTING_ALARM_TIME"
DEFAULT_TIMEZONE_OFFSET_MINUTES = 7 * 60  # Vietnam UTC+7
MAX_BLE_BUFFER_SIZE = 4096
STATE_FILE = "/pill_alert_state.json"

# Chân theo sơ đồ Pillbox_new (Pico W):
# - OLED 1.3" SH1106: I2C1, SDA GP2, SCL GP3
# - RTC DS1302 (3 dây): CE/RST GP10, I/O GP11, SCLK GP12
# - Buzzer active 3V qua NPN S8050: GP15 (mức 1 = kêu)
# - 6 LED slot thuốc (L1..L6): GP6, GP7, GP8, GP9, GP13, GP14
# Mạch không có LED trạng thái riêng -> dùng LED onboard của Pico W.
OLED_I2C_ID = 1
OLED_SDA_PIN = 2
OLED_SCL_PIN = 3

DS1302_CE_PIN = 10
DS1302_IO_PIN = 11
DS1302_SCLK_PIN = 12

LED_PIN = "LED"
# 6 LED tương ứng 6 slot thuốc (drug_slots[0..5])
PILL_SLOT_LED_PINS = (6, 7, 8, 9, 13, 14)
BUZZER_PIN = 15
BUZZER_TOGGLE_INTERVAL_MS = 300
DEFAULT_ALARM_DURATION_MS = 15_000  # 30 giây

# Pin LiPo đo qua cầu phân áp 2 điện trở bằng nhau (vd 100k + 100k) nối vào
# GP26 (ADC0, chân vật lý 31). Sơ đồ Pillbox_new chưa có cầu phân áp này,
# cần hàn thêm thì % pin mới đúng. Không được nối thẳng pin vào GP26 vì pin đầy
# ~4.2V trong khi ADC chỉ chịu tối đa 3.3V.
BATTERY_ADC_PIN = 26
BATTERY_VOLTAGE_DIVIDER = 2.0  # 2 điện trở bằng nhau -> chia đôi điện áp
BATTERY_READ_INTERVAL_MS = 5000  # đo mỗi 5s, không cần đo liên tục

# (điện áp, %) ước lượng cho LiPo 1 cell (3.7V danh định) khi xả nhẹ.
# Chỉnh lại bằng đồng hồ vạn năng nếu sai lệch nhiều.
BATTERY_LIPO_CURVE = (
    (4.20, 100), (4.15, 95), (4.11, 90), (4.08, 85), (4.02, 80),
    (3.98, 75), (3.95, 70), (3.91, 65), (3.87, 60), (3.85, 55),
    (3.84, 50), (3.82, 45), (3.80, 40), (3.79, 35), (3.77, 30),
    (3.75, 25), (3.73, 20), (3.71, 15), (3.69, 10), (3.61, 5),
    (3.27, 0),
)

# ---------- OUTPUT ----------
led = Pin(LED_PIN, Pin.OUT, value=0)
pill_slot_leds = [Pin(pin, Pin.OUT, value=0) for pin in PILL_SLOT_LED_PINS]
# Buzzer active: tự tạo âm, chỉ cần bật/tắt chân (không dùng PWM)
buzzer = Pin(BUZZER_PIN, Pin.OUT, value=0)


def buzzer_on():
    buzzer.value(1)


def buzzer_off():
    buzzer.value(0)

# ---------- OLED ----------
i2c = I2C(
    OLED_I2C_ID,
    sda=Pin(OLED_SDA_PIN),
    scl=Pin(OLED_SCL_PIN),
    freq=400000,
)

oled = sh1106.SH1106_I2C(128, 64, i2c)
oled.flip(180)

# ---------- RTC ----------
rtc = DS1302(
    clk=DS1302_SCLK_PIN,
    dio=DS1302_IO_PIN,
    cs=DS1302_CE_PIN,
)

# ---------- BATTERY ----------
battery_adc = ADC(BATTERY_ADC_PIN)


def read_battery_voltage(samples=16):
    """Đọc điện áp pin thật (đã bù lại hệ số chia của cầu phân áp)."""

    total = 0
    for _ in range(samples):
        total += battery_adc.read_u16()

    return total / samples / 65535 * 3.3 * BATTERY_VOLTAGE_DIVIDER


def battery_voltage_to_percent(voltage):
    curve = BATTERY_LIPO_CURVE

    if voltage >= curve[0][0]:
        return 100
    if voltage <= curve[-1][0]:
        return 0

    for i in range(len(curve) - 1):
        v_hi, p_hi = curve[i]
        v_lo, p_lo = curve[i + 1]
        if v_lo <= voltage <= v_hi:
            return int(p_lo + (voltage - v_lo) / (v_hi - v_lo) * (p_hi - p_lo))

    return 0


def read_battery_percent():
    try:
        return battery_voltage_to_percent(read_battery_voltage())
    except Exception as err:
        print("Failed to read battery:", err)
        return None


# ---------- STATE ----------
is_connected = False

# True khi DS1302 đang giữ giờ tin cậy (đã từng SETTING_TIME và pin RTC
# chưa từng hết). Giờ thực tế luôn được đọc trực tiếp từ chip, không giữ
# bằng ticks_ms như trước nữa.
clock_is_set = False
timezone_offset_minutes = DEFAULT_TIMEZONE_OFFSET_MINUTES
last_rendered_second = -1

alarm_times = []          # [(17, 30), (18, 0), ...] - đã sort, dùng để trigger/next-alarm
# Vị trí GỐC trong mảng "time" gửi lên quyết định buổi, vd time[0]=morning,
# time[1]=noon, time[2]=evening - bất kể sau đó có sort lại theo giờ hay không.
# {"HH:MM": "morning" | "noon" | "evening"}
alarm_period_by_text = {}
alarm_is_active = False
alarm_started_at_ticks_ms = 0
alarm_duration_ms = DEFAULT_ALARM_DURATION_MS
last_triggered_alarm_key = None
last_buzzer_toggle_ms = 0
buzzer_level = 0
current_alarm_period = None  # "morning" | "noon" | "evening" khi alarm đang kêu

battery_percent = None  # None cho đến lần đọc đầu tiên
last_battery_read_ms = 0

DAY_PERIODS = ("morning", "noon", "evening")
# Nhãn hiển thị cho dòng thông báo trên OLED (rút gọn để vừa 16 ký tự/dòng)
DAY_PERIOD_LABELS = {
    "morning": "morning",
    "noon": "noon",
    "evening": "evening",
}

# [{"name": "Drug #1", "morning": 3, "noon": 1, "evening": 1}, ...]
drug_slots = []

# Ghép các chunk BLE do MTU chia nhỏ
ble_rx_buffer = ""


def set_outputs_off():
    global buzzer_level

    led.value(0)
    for slot_led in pill_slot_leds:
        slot_led.value(0)
    buzzer_off()
    buzzer_level = 0


def update_pill_slot_leds(period):
    """Bật LED của slot có thuốc (số lượng >= 1) cho đúng buổi alarm."""

    for index, slot_led in enumerate(pill_slot_leds):
        qty = drug_slots[index].get(period, 0) if index < len(drug_slots) else 0
        slot_led.value(1 if qty >= 1 else 0)


BATTERY_SQUARE_COUNT = 5    # mỗi ô = 20%
BATTERY_SQUARE_SIZE = 8     # px
BATTERY_SQUARE_GAP = 2      # px


import framebuf

# Bitmap 8x8 (MONO_HLSB: mỗi byte = 1 hàng, bit 1 = pixel sáng)
_SQUARE_FILLED = framebuf.FrameBuffer(
    bytearray([0xFF] * 8), 8, 8, framebuf.MONO_HLSB
)
_SQUARE_EMPTY = framebuf.FrameBuffer(
    bytearray([0xFF, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0xFF]),
    8, 8, framebuf.MONO_HLSB,
)


def draw_battery_squares(y):
    """Vẽ thanh pin bằng các ô vuông: ô đặc = còn pin, ô rỗng = hết."""

    if battery_percent is None:
        filled = 0
    else:
        # làm tròn lên để pin còn >0% vẫn hiện ít nhất 1 ô
        filled = min(
            BATTERY_SQUARE_COUNT,
            (battery_percent * BATTERY_SQUARE_COUNT + 99) // 100,
        )

    label = "Battery:"
    oled.text(label, 0, y)

    # Các ô vuông bắt đầu sau chữ "Battery:" (8 px/ký tự) + 4 px cách
    x = len(label) * 8 + 4
    for i in range(BATTERY_SQUARE_COUNT):
        bitmap = _SQUARE_FILLED if i < filled else _SQUARE_EMPTY
        oled.blit(bitmap, x, y)
        x += BATTERY_SQUARE_SIZE + BATTERY_SQUARE_GAP


def show_message(msg, battery_y=None):
    oled.fill(0)

    msg = str(msg)
    msg = msg.replace("\r\n", "\n")
    msg = msg.replace("\\n", "\n")

    lines = msg.split("\n")

    y = 0
    for line in lines[:6]:
        oled.text(line[:16], 0, y)
        y += 10

    if battery_y is not None:
        draw_battery_squares(battery_y)

    oled.show()


def show_waiting():
    show_message(
        "PillAlert v1.01\n\n"
        "Waiting..."
    )


def show_connected():
    global is_connected

    is_connected = True
    render_screen(force=True)


def on_disconnect():
    global is_connected
    global ble_rx_buffer

    is_connected = False
    ble_rx_buffer = ""
    render_screen(force=True)


def decode_ble_message(raw_message):
    """Decode Base64 hoặc JSON thuần."""

    text = raw_message.strip()

    # JSON thuần
    if text.startswith("{"):
        return ujson.loads(text)

    # Base64: btoa(JSON.stringify(message))
    decoded = ubinascii.a2b_base64(text)
    json_text = decoded.decode("utf-8")
    return ujson.loads(json_text)


def set_board_time(timestamp_ms, offset_minutes=None):
    global clock_is_set
    global timezone_offset_minutes
    global last_rendered_second

    if timestamp_ms is None:
        raise ValueError("Missing timestamp")

    timestamp_ms = int(timestamp_ms)

    if timestamp_ms <= 0:
        raise ValueError("Invalid timestamp")

    if offset_minutes is not None:
        timezone_offset_minutes = int(offset_minutes)

    # DS1302 lưu giờ UTC (dạng lịch), offset múi giờ chỉ áp dụng lúc hiển thị.
    year, month, day, hour, minute, second, weekday, _ = time.gmtime(
        timestamp_ms // 1000
    )
    rtc.set_datetime((year, month, day, hour, minute, second, weekday + 1))
    rtc.clear_lost_power_flag()

    clock_is_set = True
    last_rendered_second = -1

    print(
        "Clock synchronized:",
        timestamp_ms,
        "offset:",
        timezone_offset_minutes,
    )

    save_persisted_state()


def get_local_datetime():
    year, month, day, hour, minute, second, weekday = rtc.get_datetime()

    utc_epoch_seconds = time.mktime(
        (year, month, day, hour, minute, second, weekday - 1, 0)
    )
    local_epoch_seconds = utc_epoch_seconds + timezone_offset_minutes * 60

    return time.gmtime(local_epoch_seconds)


def parse_alarm_time(value):
    if not isinstance(value, str):
        raise ValueError("Alarm time must be HH:MM")

    parts = value.strip().split(":")
    if len(parts) != 2:
        raise ValueError("Invalid alarm time: " + value)

    hour = int(parts[0])
    minute = int(parts[1])

    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError("Invalid alarm time: " + value)

    return hour, minute


def format_hhmm(hour, minute):
    return "{:02d}:{:02d}".format(hour, minute)


def parse_alarm_time_list(values):
    """Parse danh sách chuỗi "HH:MM" -> list (hour, minute) đã dedupe + sort."""

    return sorted(set(parse_alarm_time(value) for value in values))


def normalize_drug_slots(values):
    if not isinstance(values, list):
        raise ValueError("drugslot must be an array")

    normalized = []

    for item in values:
        if not isinstance(item, dict):
            raise ValueError("Invalid drugslot item")

        name = item.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError("drugslot item missing name")

        normalized.append({
            "name": name,
            "morning": int(item.get("morning") or 0),
            "noon": int(item.get("noon") or 0),
            "evening": int(item.get("evening") or 0),
        })

    return normalized


def load_persisted_state():
    """Đọc lại alarm/drugslot đã lưu và kiểm tra giờ RTC để không mất dữ liệu
    sau khi reload/mất điện.

    Lưu ý: giờ thực tế do DS1302 giữ (có pin backup riêng) nên vẫn đúng qua
    các lần mất điện của board, miễn pin RTC còn sống. Nếu pin RTC hết/chưa
    lắp, chip tự báo qua cờ OSF và board sẽ coi như chưa từng SETTING_TIME.
    """

    global clock_is_set
    global timezone_offset_minutes
    global alarm_times
    global alarm_period_by_text
    global alarm_duration_ms
    global drug_slots

    try:
        clock_is_set = not rtc.lost_power()
    except Exception as err:
        print("Failed to read RTC status:", err)
        clock_is_set = False

    try:
        with open(STATE_FILE, "r") as f:
            state = ujson.load(f)
    except (OSError, ValueError):
        print("No persisted state found, using defaults")
        return

    try:
        alarm_times = parse_alarm_time_list(state.get("alarm_time_texts", []))

        alarm_period_by_text = state.get("alarm_period_by_text", {})

        alarm_duration_ms = int(
            state.get("alarm_duration_ms", DEFAULT_ALARM_DURATION_MS)
        )

        drug_slots = normalize_drug_slots(state.get("drug_slots", []))

        timezone_offset_minutes = int(
            state.get("timezone_offset_minutes", timezone_offset_minutes)
        )

        print("Loaded persisted state:", state)
    except Exception as err:
        print("Failed to apply persisted state:", err)


def save_persisted_state():
    state = {
        "alarm_time_texts": [
            format_hhmm(hour, minute) for hour, minute in alarm_times
        ],
        "alarm_period_by_text": alarm_period_by_text,
        "alarm_duration_ms": alarm_duration_ms,
        "drug_slots": drug_slots,
        "timezone_offset_minutes": timezone_offset_minutes,
    }

    try:
        with open(STATE_FILE, "w") as f:
            ujson.dump(state, f)
        print("State saved:", state)
    except Exception as err:
        print("Failed to save state:", err)


def set_alarm_times(values, duration_seconds=None, drugslot_values=None):
    global alarm_times
    global alarm_period_by_text
    global alarm_duration_ms
    global drug_slots
    global last_triggered_alarm_key
    global last_rendered_second

    if not isinstance(values, list):
        raise ValueError("time must be an array")

    if duration_seconds is not None:
        duration_seconds = int(duration_seconds)
        if duration_seconds <= 0:
            raise ValueError("durationSeconds must be greater than 0")
        alarm_duration_ms = duration_seconds * 1000

    parsed_values = [parse_alarm_time(value) for value in values]

    # Vị trí GỐC trong "values" quyết định buổi: values[0]=morning,
    # values[1]=noon, values[2]=evening (lặp lại nếu có hơn 3 phần tử).
    # KHÔNG dựa vào thứ tự sau khi sort theo giờ.
    alarm_period_by_text = {
        format_hhmm(hour, minute): DAY_PERIODS[index % len(DAY_PERIODS)]
        for index, (hour, minute) in enumerate(parsed_values)
    }

    # Không lưu giờ trùng nhau
    alarm_times = sorted(set(parsed_values))

    if drugslot_values is not None:
        drug_slots = normalize_drug_slots(drugslot_values)

    last_triggered_alarm_key = None
    last_rendered_second = -1

    print(
        "Alarm times updated:",
        [format_hhmm(hour, minute) for hour, minute in alarm_times],
        "period_by_text:",
        alarm_period_by_text,
        "duration_ms:",
        alarm_duration_ms,
        "drug_slots:",
        drug_slots,
    )

    save_persisted_state()

    render_screen(force=True)


def get_next_alarm_text(hour, minute):
    if not alarm_times:
        return "--:--"

    now_minutes = hour * 60 + minute

    # Chỉ lấy mốc nằm SAU phút hiện tại.
    # Mốc bằng giờ/phút hiện tại đã hoặc đang được xử lý bởi alarm,
    # nên không được tiếp tục hiển thị là "Next" sau khi alarm tắt.
    for alarm_hour, alarm_minute in alarm_times:
        alarm_minutes = alarm_hour * 60 + alarm_minute
        if alarm_minutes > now_minutes:
            return format_hhmm(alarm_hour, alarm_minute)

    # Tất cả alarm hôm nay đã qua, lấy alarm đầu tiên của ngày mai.
    return format_hhmm(*alarm_times[0])


def update_alarm_outputs():
    global alarm_is_active
    global alarm_started_at_ticks_ms
    global last_triggered_alarm_key
    global last_buzzer_toggle_ms
    global buzzer_level
    global last_rendered_second
    global current_alarm_period

    now_ticks = time.ticks_ms()

    # Nếu alarm đang chạy, tự tắt khi hết thời lượng cấu hình.
    if alarm_is_active:
        elapsed_ms = time.ticks_diff(now_ticks, alarm_started_at_ticks_ms)
        if elapsed_ms >= alarm_duration_ms:
            alarm_is_active = False
            current_alarm_period = None
            set_outputs_off()
            last_rendered_second = -1
            print("ALARM OFF - duration reached")
            render_screen(force=True)
            return

        # LED sáng liên tục, buzzer kêu ngắt quãng.
        led.value(1)
        if time.ticks_diff(now_ticks, last_buzzer_toggle_ms) >= BUZZER_TOGGLE_INTERVAL_MS:
            buzzer_level = 0 if buzzer_level else 1
            if buzzer_level:
                buzzer_on()
            else:
                buzzer_off()
            last_buzzer_toggle_ms = now_ticks
        return

    set_outputs_off()

    if not clock_is_set or not alarm_times:
        return

    date_time = get_local_datetime()
    year, month, day = date_time[0], date_time[1], date_time[2]
    current_hour = date_time[3]
    current_minute = date_time[4]

    if (current_hour, current_minute) not in alarm_times:
        return

    # Mỗi mốc alarm chỉ được kích hoạt một lần trong ngày.
    alarm_key = "{:04d}-{:02d}-{:02d}-{:02d}:{:02d}".format(
        year, month, day, current_hour, current_minute
    )
    if alarm_key == last_triggered_alarm_key:
        return

    last_triggered_alarm_key = alarm_key
    alarm_is_active = True
    alarm_started_at_ticks_ms = now_ticks
    last_buzzer_toggle_ms = now_ticks
    buzzer_level = 1
    led.value(1)
    buzzer_on()
    last_rendered_second = -1

    # Buổi (morning/noon/evening) lấy theo VỊ TRÍ GỐC mà app đã gửi cho
    # đúng mốc giờ này (values[0]=morning, values[1]=noon, values[2]=evening),
    # bất kể alarm_times đã bị sắp xếp lại theo giờ hay chưa.
    alarm_text = format_hhmm(current_hour, current_minute)
    current_alarm_period = alarm_period_by_text.get(
        alarm_text, DAY_PERIODS[alarm_times.index((current_hour, current_minute)) % len(DAY_PERIODS)]
    )

    update_pill_slot_leds(current_alarm_period)

    print(
        "ALARM ON - duration_ms:", alarm_duration_ms,
        "period:", current_alarm_period,
    )
    render_screen(force=True)


def update_battery_state():
    """Đọc lại % pin mỗi BATTERY_READ_INTERVAL_MS, không đọc mỗi vòng lặp."""

    global battery_percent
    global last_battery_read_ms

    now_ticks = time.ticks_ms()

    if (
        battery_percent is not None
        and time.ticks_diff(now_ticks, last_battery_read_ms) < BATTERY_READ_INTERVAL_MS
    ):
        return

    last_battery_read_ms = now_ticks
    battery_percent = read_battery_percent()


OLED_LINE_WIDTH = 16
DRUG_SLOTS_PER_ROW = 2
# Mỗi ô "<tên>:<số viên>" chiếm bao nhiêu ký tự trên 1 dòng (có 1 khoảng
# trắng ngăn cách giữa các ô), để 2 thuốc/hàng không tràn dòng OLED.
DRUG_CELL_WIDTH = (OLED_LINE_WIDTH - (DRUG_SLOTS_PER_ROW - 1)) // DRUG_SLOTS_PER_ROW


def smart_truncate(text, width):
    """Cắt ngắn nhưng giữ lại phần đầu + phần cuối (thường chứa số/ký hiệu
    phân biệt như 'Drug #1' vs 'Drug #2'), thay vì cắt thẳng từ đầu."""

    text = text.strip()

    if len(text) <= width or width <= 0:
        return text[:width] if width > 0 else ""

    if width == 1:
        return text[-1:]

    head_len = width - (width // 2)
    tail_len = width - head_len

    return text[:head_len] + text[-tail_len:]


def format_drug_cell(slot, period, width):
    name = slot.get("name", "")
    qty = slot.get(period, 0)
    suffix = ":{}".format(qty)

    max_name_len = max(1, width - len(suffix))
    trimmed_name = smart_truncate(name, max_name_len)

    return "{}{}".format(trimmed_name, suffix)


def build_drug_slot_lines(period):
    """Ghép DRUG_SLOTS_PER_ROW thuốc / hàng để không tràn màn hình OLED."""

    lines = []
    slots = drug_slots[:6]

    for i in range(0, len(slots), DRUG_SLOTS_PER_ROW):
        row_slots = slots[i:i + DRUG_SLOTS_PER_ROW]
        cells = [
            format_drug_cell(slot, period, DRUG_CELL_WIDTH)
            for slot in row_slots
        ]
        lines.append(" ".join(cells))

    return lines


def render_screen(force=False):
    global last_rendered_second

    if not clock_is_set:
        alarm_summary = (
            "Alarm: " + format_hhmm(*alarm_times[0])
            if alarm_times
            else "Alarm: --:--"
        )

        if is_connected:
            show_message(
                "PillAlert v1.01\n"
                "Connected\n"
                "Waiting time\n"
                + alarm_summary,
                battery_y=40,
            )
        else:
            show_message(
                "PillAlert v1.01\n"
                "BLE: Offline\n"
                "Waiting time\n"
                + alarm_summary,
                battery_y=40,
            )
        return

    date_time = get_local_datetime()
    year, month, day = date_time[0], date_time[1], date_time[2]
    hour, minute, second = date_time[3], date_time[4], date_time[5]

    if not force and second == last_rendered_second:
        return

    last_rendered_second = second

    if alarm_is_active:
        slot_lines = build_drug_slot_lines(current_alarm_period)

        if slot_lines:
            period_label = DAY_PERIOD_LABELS.get(current_alarm_period, "your")

            # 2 thuốc/hàng chỉ chiếm tối đa 3 dòng -> còn chỗ hiện thông báo
            # "Take your <buổi> medicines" thay vì giờ, chia thành 2 dòng
            # ngắn để không tràn 16 ký tự/dòng của OLED.
            header_lines = [
                "*** ALARM ***",
                "Take your",
                "{} meds".format(period_label),
            ]
            screen = "\n".join(header_lines + slot_lines)
        else:
            screen = (
                "*** ALARM ***\n"
                "{:02d}:{:02d}:{:02d}\n"
                "TAKE MEDICINE"
            ).format(hour, minute, second)
    else:
        connection_text = "BLE: Connected" if is_connected else "BLE: Offline"
        next_alarm = get_next_alarm_text(hour, minute)

        screen = (
            "PillAlert v1.01\n"
            "{:02d}:{:02d}:{:02d}\n"
            "{:02d}/{:02d}/{:04d}\n"
            "Next: {}\n"
            "{}"
        ).format(
            hour,
            minute,
            second,
            day,
            month,
            year,
            next_alarm,
            connection_text,
        )

    # Màn hình thường: thanh pin ở dòng thứ 6 (y=50). Màn alarm không hiện pin.
    show_message(screen, battery_y=None if alarm_is_active else 50)


TYPE_EVENT = "event"
TYPE_DATA = "data"


def handle_setting_time(message_data, root_timestamp=None):
    # SETTING_TIME mới được phép cập nhật thời gian hiện tại
    timestamp_ms = message_data.get("time")

    if timestamp_ms is None:
        timestamp_ms = root_timestamp

    offset_minutes = message_data.get(
        "timezoneOffsetMinutes"
    )

    set_board_time(
        timestamp_ms,
        offset_minutes,
    )

    render_screen(force=True)


def handle_setting_alarm_time(message_data, root_timestamp=None):
    # Chỉ cập nhật danh sách alarm, không đồng bộ lại đồng hồ.
    values = message_data.get("time")
    duration_seconds = message_data.get("durationSeconds")
    drugslot_values = message_data.get("drugslot")

    set_alarm_times(values, duration_seconds, drugslot_values)


def handle_event(message_data, root_timestamp=None):
    if not isinstance(message_data, dict):
        raise ValueError("Invalid event message")

    event_name = message_data.get("name")

    event_handlers = {
        SETTING_TIME: handle_setting_time,
        SETTING_ALARM_TIME: handle_setting_alarm_time,
    }

    if event_name is None:
        print("Ignored event: missing name")
        return

    handler = event_handlers.get(event_name)

    if handler is None:
        print("Ignored event:", event_name)
        return

    handler(message_data, root_timestamp)


def handle_data(message_data, root_timestamp=None):
    if not isinstance(message_data, dict):
        raise ValueError("Invalid data message")

    data_name = message_data.get("name")

    data_handlers = {
        # "MEDICINE_LIST": handle_medicine_list,
        # "OLED_TEXT": handle_oled_text,
    }

    handler = data_handlers.get(data_name)

    if handler is None:
        print("Ignored data:", data_name)
        return

    handler(message_data)


def route_payload(payload, root_timestamp=None):
    if not isinstance(payload, dict):
        raise ValueError("Missing payload data")

    payload_type = payload.get("type")
    message_data = payload.get("message")

    # Tương thích cấu trúc cũ dùng payload.data
    if message_data is None:
        message_data = payload.get("data")

    if payload_type is None:
        print("Ignored payload: missing type")
        return

    type_handlers = {
        TYPE_EVENT: handle_event,
        TYPE_DATA: handle_data,
    }

    handler = type_handlers.get(payload_type)

    if handler is None:
        print("Ignored payload type:", payload_type)
        return

    handler(message_data, root_timestamp)


def process_complete_message(encoded_message):
    try:
        message = decode_ble_message(encoded_message)

        print("BLE message:", message)

        if not isinstance(message, dict):
            raise ValueError("Root message must be object")

        route_payload(
            message.get("data"),
            message.get("timestamp"),
        )

    except Exception as err:
        print("Invalid BLE message:", err)
        show_message(
            "PillAlert v1.01\n\n"
            "Invalid payload"
        )


def is_complete_json(text):
    text = text.strip()
    return text.startswith("{") and text.endswith("}")


def on_message(chunk):
    global ble_rx_buffer

    chunk = str(chunk).strip()

    if not chunk:
        return

    print("RX chunk:", chunk)
    ble_rx_buffer += chunk

    print("RX buffer length:", len(ble_rx_buffer))

    if len(ble_rx_buffer) > MAX_BLE_BUFFER_SIZE:
        print("BLE buffer overflow")
        ble_rx_buffer = ""
        show_message(
            "PillAlert v1.01\n\n"
            "Buffer overflow"
        )
        return

    # JSON thuần hoàn chỉnh hoặc Base64 có padding '=' ở cuối
    if not is_complete_json(ble_rx_buffer) and not ble_rx_buffer.endswith("="):
        return

    complete_message = ble_rx_buffer
    ble_rx_buffer = ""

    print("Complete message length:", len(complete_message))
    process_complete_message(complete_message)


set_outputs_off()
load_persisted_state()
show_waiting()

ble = BLEServer(
    on_message=on_message,
    on_connect=show_connected,
    on_disconnect=on_disconnect,
)

while True:
    ota.tick()
    update_battery_state()
    update_alarm_outputs()
    if ota.is_active():
        show_message("FIRMWARE UPDATE\n\n" + ota.progress_text())
    else:
        render_screen()
    time.sleep_ms(100)
