"""Utilities for running witrnhid decoding logic in Pyodide."""

from __future__ import annotations

from typing import Any, Dict, Optional

from .core import (  # noqa: F401 - re-export for consumers if needed
    general_msg,
    is_pdo,
    is_rdo,
    metadata,
    pd_msg,
    provide_ext,
)


def _metadata_to_dict(node: metadata) -> Dict[str, Any]:
    value = node.value()
    serialized: Dict[str, Any] = {
        "field": node.field(),
        "bit_loc": node.bit_loc(),
        "raw": node.raw(),
    }

    if isinstance(value, list):
        serialized["value"] = [_metadata_to_dict(child) for child in value]
    else:
        serialized["value"] = value

    return serialized


def _normalize_hex(payload: str) -> str:
    cleaned = ''.join(payload.split())
    if not cleaned:
        raise ValueError("请输入报文的十六进制字符串")
    if len(cleaned) % 2 != 0:
        raise ValueError("HEX 长度必须为偶数")
    return cleaned.upper()


_LAST_PDO: Optional[metadata] = None
_LAST_EXT: Optional[metadata] = None
_LAST_RDO: Optional[metadata] = None


def reset_decoder_state() -> None:
    """Reset cached PD context used for multi-packet decoding."""

    global _LAST_PDO, _LAST_EXT, _LAST_RDO
    _LAST_PDO = None
    _LAST_EXT = None
    _LAST_RDO = None


def decode_hex_payload(payload: str) -> Dict[str, Any]:
    """Decode a HID payload (general or PD) and return a JSON-serialisable dict."""

    cleaned = _normalize_hex(payload)
    data = bytes.fromhex(cleaned)
    if not data:
        raise ValueError("报文长度为空")

    first_byte = data[0]

    if first_byte == 0xFF:
        if len(data) < 64:
            raise ValueError("常规报文需要 64 字节完整数据")
        packet = list(data[:64])
        decoded = general_msg(packet)
        return {
            "status": "ok",
            "message": "general",
            "raw": cleaned,
            "tree": _metadata_to_dict(decoded),
        }

    if first_byte == 0xFE:
        packet = list(data)
        expected_length = packet[1] + 2 if len(packet) > 1 else 0
        if expected_length and len(packet) < expected_length:
            raise ValueError("PD 报文长度不足")
        global _LAST_PDO, _LAST_EXT, _LAST_RDO
        decoded = pd_msg(packet, last_pdo=_LAST_PDO, last_ext=_LAST_EXT, last_rdo=_LAST_RDO)
        tree = _metadata_to_dict(decoded)
        msg_header = None
        try:
            values = decoded.value()
            if isinstance(values, list) and len(values) >= 3:
                msg_header = values[2]
        except Exception:  # pragma: no cover - defensive against malformed decoder output
            msg_header = None

        message_type = None
        if isinstance(msg_header, metadata):
            field = msg_header["Message Type"]
            if field is not None:
                try:
                    message_type = field.value()
                except AttributeError:
                    message_type = field
        elif msg_header is not None:
            # msg_header 已经是 dict/list/str 等序列化结果
            if isinstance(msg_header, dict):
                candidate = msg_header.get("Message Type")
                if hasattr(candidate, "value"):
                    message_type = candidate.value()
                else:
                    message_type = candidate
            elif isinstance(msg_header, list):
                for item in msg_header:
                    if isinstance(item, dict) and item.get("field") == "Message Type":
                        message_type = item.get("value")
                        break
            elif hasattr(msg_header, "get"):
                candidate = msg_header.get("Message Type")
                if hasattr(candidate, "value"):
                    message_type = candidate.value()
                else:
                    message_type = candidate
            else:
                message_type = msg_header

        try:
            if is_pdo(decoded):
                _LAST_PDO = decoded
            if provide_ext(decoded):
                _LAST_EXT = decoded
            if is_rdo(decoded):
                _LAST_RDO = decoded
        except Exception:
            # Context updates are best-effort; ignore unexpected parsing errors
            pass

        return {
            "status": "ok",
            "message": "pd",
            "raw": cleaned,
            "tree": tree,
            "pd_message_type": message_type,
        }

    raise ValueError("未知的报文类型：首字节既不是0xFF也不是0xFE")
