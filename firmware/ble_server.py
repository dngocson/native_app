import bluetooth
import struct

_IRQ_CENTRAL_CONNECT = 1
_IRQ_CENTRAL_DISCONNECT = 2
_IRQ_GATTS_WRITE = 3


class BLEServer:

    SERVICE_UUID = bluetooth.UUID(
        "12345678-1234-1234-1234-1234567890ab"
    )

    CHARACTERISTIC_UUID = bluetooth.UUID(
        "abcdefab-1234-5678-1234-abcdefabcdef"
    )

    def __init__(
        self,
        on_message=None,
        on_connect=None,
        on_disconnect=None,
    ):

        self.ble = bluetooth.BLE()
        self.ble.active(True)

        self.on_message = on_message
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect

        (
            (self.tx_handle,),
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
                    ),
                ),
            )
        )

        self.connections = set()

        self.ble.irq(self._irq)

        self._advertise()

    def _advertise(self):

        name = "PillAlert"

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

            if self.on_disconnect:
                self.on_disconnect()

            self._advertise()

        elif event == _IRQ_GATTS_WRITE:

            conn_handle, value_handle = data

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

