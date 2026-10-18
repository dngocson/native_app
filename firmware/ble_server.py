import bluetooth
import struct
import ota

_IRQ_CENTRAL_CONNECT = 1
_IRQ_CENTRAL_DISCONNECT = 2
_IRQ_GATTS_WRITE = 3

# MTU lớn để gửi firmware nhanh hơn (app sẽ xin MTU 247)
_PREFERRED_MTU = 247
_CHAR_BUFFER_SIZE = 512


class BLEServer:

    SERVICE_UUID = bluetooth.UUID(
        "12345678-1234-1234-1234-1234567890ab"
    )

    CHARACTERISTIC_UUID = bluetooth.UUID(
        "abcdefab-1234-5678-1234-abcdefabcdef"
    )

    # Characteristic riêng cho OTA (nhị phân), tách khỏi kênh JSON
    OTA_CHARACTERISTIC_UUID = bluetooth.UUID(
        "abcdefab-1234-5678-1234-abcdefab0a7a"
    )

    def __init__(
        self,
        on_message=None,
        on_connect=None,
        on_disconnect=None,
        name="PillAlert",
    ):

        self.ble = bluetooth.BLE()
        self.ble.active(True)

        try:
            self.ble.config(mtu=_PREFERRED_MTU)
        except Exception as err:
            print("MTU config not supported:", err)

        self.name = name
        self.on_message = on_message
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect

        (
            (self.tx_handle, self.ota_handle),
        ) = self.ble.gatts_register_services(
            (
                (
                    self.SERVICE_UUID,
                    (
                        (
                            self.CHARACTERISTIC_UUID,
                            bluetooth.FLAG_READ
                            | bluetooth.FLAG_WRITE
                            | bluetooth.FLAG_NOTIFY,
                        ),
                        (
                            self.OTA_CHARACTERISTIC_UUID,
                            bluetooth.FLAG_READ
                            | bluetooth.FLAG_WRITE
                            | bluetooth.FLAG_NOTIFY,
                        ),
                    ),
                ),
            )
        )

        self.ble.gatts_set_buffer(self.tx_handle, _CHAR_BUFFER_SIZE)
        self.ble.gatts_set_buffer(self.ota_handle, _CHAR_BUFFER_SIZE)

        self.connections = set()

        self.ble.irq(self._irq)

        self._advertise()

    def _advertise(self):

        name = self.name

        payload = bytearray()

        payload += struct.pack(
            "BB",
            len(name) + 1,
            0x09,
        )

        payload += name.encode()

        self.ble.gap_advertise(
            100000,
            payload,
        )

        print("Advertising...")

    def _handle_ota(self, conn_handle):

        value = self.ble.gatts_read(self.ota_handle)
        response = ota.handle(value)

        if response is None:
            return

        # Ghi giá trị đầy đủ để app đọc lại nếu dài hơn MTU, rồi notify
        self.ble.gatts_write(self.ota_handle, response)

        try:
            self.ble.gatts_notify(conn_handle, self.ota_handle)
        except Exception as err:
            print("OTA notify failed:", err)

    def _irq(self, event, data):

        if event == _IRQ_CENTRAL_CONNECT:

            conn_handle, _, _ = data

            self.connections.add(conn_handle)

            print("Connected")

            if self.on_connect:
                self.on_connect()

        elif event == _IRQ_CENTRAL_DISCONNECT:

            conn_handle, _, _ = data

            if conn_handle in self.connections:
                self.connections.remove(conn_handle)

            print("Disconnected")

            # Mất kết nối giữa chừng -> huỷ phiên OTA dở dang
            if ota.is_active():
                ota.handle(bytes([ota.OP_ABORT]))

            if self.on_disconnect:
                self.on_disconnect()

            self._advertise()

        elif event == _IRQ_GATTS_WRITE:

            conn_handle, value_handle = data

            if value_handle == self.ota_handle:
                self._handle_ota(conn_handle)
                return

            if value_handle != self.tx_handle:
                return

            value = self.ble.gatts_read(self.tx_handle)

            try:
                text = value.decode("utf-8").strip()
            except Exception:
                text = str(value)

            print("RX:", text)

            if self.on_message:
                self.on_message(text)
