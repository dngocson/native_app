# OTA (cập nhật firmware qua BLE) + backup/rollback.
#
# File LÕI: không được cập nhật qua OTA (chỉ nạp qua USB). Nếu sửa file này
# hoặc main.py thì phải nạp lại bằng Thonny/mpremote.
#
# Giao thức (ghi vào OTA characteristic, board trả lời bằng notify):
#   request : [op][payload...]
#   response: [op][status][payload...]   status 0 = OK, 1 = lỗi (payload = text)
#
#   0x01 BEGIN   payload = JSON {"version": "...", "files": [...]}
#   0x02 FILE    payload = JSON {"name": "app.py", "size": 123, "crc": 456}
#   0x03 DATA    payload = u32 LE offset + bytes  -> trả về u32 offset kế tiếp
#   0x04 END     kết thúc file hiện tại, kiểm tra size + CRC32
#   0x05 COMMIT  backup bản cũ, thay file mới, khởi động lại để chạy thử
#   0x06 ABORT   huỷ phiên đang nạp
#   0x07 INFO    payload = JSON ["app.py", ...] (tuỳ chọn)
#                -> JSON trạng thái (version, state, last_error, crcs)

import os
import time
import ujson
import struct
import machine

try:
    from ubinascii import crc32 as _crc32
except ImportError:
    _crc32 = None

OP_BEGIN = 0x01
OP_FILE = 0x02
OP_DATA = 0x03
OP_END = 0x04
OP_COMMIT = 0x05
OP_ABORT = 0x06
OP_INFO = 0x07

STATUS_OK = 0
STATUS_ERR = 1

STATE_FILE = "/ota_state.json"
ERROR_FILE = "/ota_last_error.txt"
STAGING_DIR = "/ota_new"
BACKUP_DIR = "/ota_bak"

# File lõi không cho ghi đè qua OTA
PROTECTED_FILES = ("main.py", "ota.py", "boot.py")
ALLOWED_NAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-."

# Số lần khởi động thử tối đa trước khi rollback
MAX_TRIAL_BOOTS = 2
# App chạy ổn định bấy nhiêu ms thì xác nhận bản mới là tốt
CONFIRM_AFTER_MS = 15_000
WDT_TIMEOUT_MS = 8_000
RESET_DELAY_MS = 500


# ---------- CRC32 ----------

_crc_table = None


def _crc32_soft(data, crc=0):
    global _crc_table

    if _crc_table is None:
        _crc_table = []
        for i in range(256):
            c = i
            for _ in range(8):
                c = (c >> 1) ^ 0xEDB88320 if c & 1 else c >> 1
            _crc_table.append(c)

    crc ^= 0xFFFFFFFF
    for b in data:
        crc = _crc_table[(crc ^ b) & 0xFF] ^ (crc >> 8)
    return crc ^ 0xFFFFFFFF


def crc32(data, crc=0):
    if _crc32 is not None:
        return _crc32(data, crc) & 0xFFFFFFFF
    return _crc32_soft(data, crc)


# ---------- FS helpers ----------

def _exists(path):
    try:
        os.stat(path)
        return True
    except OSError:
        return False


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def _ensure_dir(path):
    if not _exists(path):
        os.mkdir(path)


def _clear_dir(path):
    if not _exists(path):
        return
    for name in os.listdir(path):
        _remove(path + "/" + name)


def _load_state():
    try:
        with open(STATE_FILE) as f:
            return ujson.load(f)
    except Exception:
        return {"state": "ok", "version": "usb"}


def _save_state(state):
    with open(STATE_FILE, "w") as f:
        ujson.dump(state, f)


def _valid_name(name):
    if not name or len(name) > 32 or name in PROTECTED_FILES:
        return False
    for ch in name:
        if ch not in ALLOWED_NAME_CHARS:
            return False
    return not name.startswith(".")


def log_error(err):
    try:
        import sys
        import io

        buf = io.StringIO()
        sys.print_exception(err, buf)
        text = buf.getvalue()
    except Exception:
        text = repr(err)

    print("App error:", text)

    try:
        with open(ERROR_FILE, "w") as f:
            f.write(text[-1000:])
    except Exception:
        pass


def _read_last_error():
    try:
        with open(ERROR_FILE) as f:
            return f.read()
    except Exception:
        return None


# ---------- Boot / rollback ----------

_wdt = None
_boot_ms = time.ticks_ms()
_reset_at = None


def boot_check():
    """Gọi từ main.py trước khi import app. Rollback nếu bản thử boot lỗi nhiều lần."""

    global _wdt

    state = _load_state()

    if state.get("state") != "trial":
        return

    state["boots"] = state.get("boots", 0) + 1
    _save_state(state)

    if state["boots"] > MAX_TRIAL_BOOTS:
        print("OTA: trial failed, rolling back")
        rollback("Trial boot failed")
        return

    # App treo khi chạy thử -> watchdog reset -> boots tăng -> rollback
    _wdt = machine.WDT(timeout=WDT_TIMEOUT_MS)
    print("OTA: trial boot", state["boots"], "version", state.get("version"))


def is_trial():
    return _load_state().get("state") == "trial"


def confirm():
    state = _load_state()
    if state.get("state") != "trial":
        return
    state["state"] = "ok"
    state.pop("boots", None)
    _save_state(state)
    _remove(ERROR_FILE)
    print("OTA: version confirmed", state.get("version"))


def rollback(reason):
    """Khôi phục các file từ backup và khởi động lại. Trả về False nếu không có gì để rollback."""

    state = _load_state()
    files = state.get("files") or []

    if state.get("state") != "trial" or not files:
        return False

    for name in files:
        bak = BACKUP_DIR + "/" + name
        if _exists(bak):
            _remove("/" + name)
            os.rename(bak, "/" + name)
        else:
            # File mới hoàn toàn, bản cũ không có -> xoá đi
            _remove("/" + name)

    _save_state({
        "state": "rolled_back",
        "version": state.get("prev_version", "unknown"),
        "failed_version": state.get("version"),
        "reason": reason,
    })

    machine.reset()
    return True


def on_crash(err):
    """App crash: đang chạy thử thì rollback, không thì trả về để main.py vào safe mode."""

    log_error(err)

    if is_trial():
        rollback("Crash: " + repr(err)[:80])


def feed():
    if _wdt is not None:
        _wdt.feed()


def tick(allow_confirm=True):
    """Gọi đều đặn trong vòng lặp chính."""

    feed()

    if _reset_at is not None and time.ticks_diff(time.ticks_ms(), _reset_at) >= 0:
        machine.reset()

    if (
        allow_confirm
        and _wdt is not None
        and time.ticks_diff(time.ticks_ms(), _boot_ms) > CONFIRM_AFTER_MS
    ):
        if is_trial():
            confirm()


# ---------- Receiving ----------

class _Session:

    def __init__(self, version):
        self.version = version
        self.files = []
        self.file_name = None
        self.file_size = 0
        self.file_crc = 0
        self.received = 0
        self.crc = 0
        self.fh = None

    def close_file(self):
        if self.fh is not None:
            try:
                self.fh.close()
            except Exception:
                pass
        self.fh = None


_session = None


def is_active():
    return _session is not None


def progress_text():
    s = _session
    if s is None:
        return ""
    if s.file_name is None:
        return "Preparing..."
    pct = (s.received * 100 // s.file_size) if s.file_size else 100
    return "{}\n{}%".format(s.file_name[:16], pct)


def _abort():
    global _session

    if _session is not None:
        _session.close_file()
    _session = None
    _clear_dir(STAGING_DIR)


def _ok(op, payload=b""):
    return bytes([op, STATUS_OK]) + payload


def _err(op, msg):
    print("OTA error:", msg)
    return bytes([op, STATUS_ERR]) + str(msg).encode()[:180]


def _file_crc(path):
    crc = 0
    buf = bytearray(512)
    with open(path, "rb") as f:
        while True:
            n = f.readinto(buf)
            if not n:
                break
            crc = crc32(memoryview(buf)[:n], crc)
            feed()
    return crc


def _info(payload):
    # payload (tuỳ chọn) = JSON danh sách tên file cần trả về CRC
    crcs = {}
    if payload:
        for name in ujson.loads(payload):
            if _valid_name(name) and _exists("/" + name):
                crcs[name] = _file_crc("/" + name)

    state = _load_state()
    info = {
        "version": state.get("version"),
        "state": state.get("state"),
        "failed_version": state.get("failed_version"),
        "reason": state.get("reason"),
        "last_error": (_read_last_error() or "")[-300:] or None,
        "crcs": crcs,
    }
    return ujson.dumps(info).encode()


def _commit():
    global _session, _reset_at

    s = _session
    s.close_file()

    if s.file_name is not None:
        raise ValueError("File not finished")
    if not s.files:
        raise ValueError("No files")

    prev = _load_state()

    _ensure_dir(BACKUP_DIR)
    _clear_dir(BACKUP_DIR)

    for name in s.files:
        if _exists("/" + name):
            os.rename("/" + name, BACKUP_DIR + "/" + name)
        os.rename(STAGING_DIR + "/" + name, "/" + name)

    _save_state({
        "state": "trial",
        "boots": 0,
        "version": s.version,
        "prev_version": prev.get("version", "unknown"),
        "files": s.files,
    })
    _remove(ERROR_FILE)

    _session = None
    _reset_at = time.ticks_add(time.ticks_ms(), RESET_DELAY_MS)


def handle(data):
    """Xử lý 1 gói OTA từ BLE, trả về bytes để notify lại cho app."""

    global _session

    if not data:
        return None

    op = data[0]
    payload = bytes(data[1:])

    try:
        if op == OP_INFO:
            return _ok(op, _info(payload))

        if op == OP_ABORT:
            _abort()
            return _ok(op)

        if op == OP_BEGIN:
            _abort()
            meta = ujson.loads(payload)
            _ensure_dir(STAGING_DIR)
            _session = _Session(str(meta.get("version", "unknown")))
            print("OTA: begin", _session.version)
            return _ok(op)

        s = _session
        if s is None:
            return _err(op, "No OTA session")

        if op == OP_FILE:
            s.close_file()
            meta = ujson.loads(payload)
            name = meta.get("name")
            if not _valid_name(name):
                return _err(op, "Invalid file name: {}".format(name))
            s.file_name = name
            s.file_size = int(meta["size"])
            s.file_crc = int(meta["crc"]) & 0xFFFFFFFF
            s.received = 0
            s.crc = 0
            s.fh = open(STAGING_DIR + "/" + name, "wb")
            print("OTA: file", name, s.file_size)
            return _ok(op)

        if op == OP_DATA:
            if s.fh is None:
                return _err(op, "No open file")
            offset = struct.unpack("<I", payload[:4])[0]
            chunk = payload[4:]
            # Gói gửi lại (app retry) -> bỏ qua, báo offset hiện tại
            if offset == s.received:
                s.fh.write(chunk)
                s.crc = crc32(chunk, s.crc)
                s.received += len(chunk)
            elif offset > s.received:
                return _err(op, "Offset {} > {}".format(offset, s.received))
            return _ok(op, struct.pack("<I", s.received))

        if op == OP_END:
            s.close_file()
            if s.received != s.file_size:
                return _err(op, "Size mismatch {}/{}".format(s.received, s.file_size))
            if s.crc != s.file_crc:
                return _err(op, "CRC mismatch")
            s.files.append(s.file_name)
            s.file_name = None
            return _ok(op)

        if op == OP_COMMIT:
            _commit()
            return _ok(op)

        return _err(op, "Unknown op")

    except Exception as err:
        _abort()
        return _err(op, err)
