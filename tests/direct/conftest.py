"""Windows-only direct-test compatibility shim for gltest 0.30.0-rc.2.

The upstream loader unlinks the temporary stdin message while descriptor zero
still owns it. POSIX permits that; Windows rejects it. Keep the file until the
VM restores stdin during its normal cleanup.
"""

import os
import sys
import tempfile
from datetime import datetime

from gltest.direct import loader
from gltest.direct import wasi_mock
from gltest.direct.sdk_compat import import_address, import_calldata
from gltest.direct.vm import VMContext


def _inject_message_after_cleanup(vm: VMContext) -> None:
    calldata = import_calldata()
    address_type = import_address()
    sender = address_type(vm.sender) if isinstance(vm.sender, bytes) else vm.sender
    contract = address_type(vm._contract_address) if isinstance(vm._contract_address, bytes) else vm._contract_address
    origin = address_type(vm.origin) if isinstance(vm.origin, bytes) else vm.origin
    message = {
        "contract_address": contract,
        "sender_address": sender,
        "origin_address": origin,
        "stack": [],
        "value": vm._value,
        "datetime": vm._datetime,
        "is_init": False,
        "chain_id": vm._chain_id,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    fd, path = tempfile.mkstemp()
    os.write(fd, calldata.encode(message))
    os.lseek(fd, 0, os.SEEK_SET)
    vm._original_stdin_fd = os.dup(0)
    os.dup2(fd, 0)
    os.close(fd)
    vm._bridge_draft_message_path = path
    genlayer_module = sys.modules.get("genlayer")
    if genlayer_module is not None:
        genlayer_module.message_raw = {"datetime": vm._datetime}


_original_cleanup = VMContext._cleanup_after_deactivate


def _cleanup_after_deactivate(vm: VMContext) -> None:
    _original_cleanup(vm)
    path = getattr(vm, "_bridge_draft_message_path", None)
    if path is not None:
        try:
            os.unlink(path)
        finally:
            vm._bridge_draft_message_path = None


loader._inject_message_to_fd0 = _inject_message_after_cleanup
VMContext._cleanup_after_deactivate = _cleanup_after_deactivate


_original_handle_gl_call = wasi_mock._handle_gl_call


def _handle_gl_call_with_timestamp(vm: VMContext, request):
    if isinstance(request, dict) and "GetTimestamp" in request:
        return int(datetime.fromisoformat(vm._datetime.replace("Z", "+00:00")).timestamp())
    return _original_handle_gl_call(vm, request)


wasi_mock._handle_gl_call = _handle_gl_call_with_timestamp


_original_warp = VMContext.warp


def _warp_with_message_datetime(vm: VMContext, timestamp: str) -> None:
    _original_warp(vm, timestamp)
    genlayer_module = sys.modules.get("genlayer")
    if genlayer_module is not None:
        genlayer_module.message_raw = {"datetime": timestamp}


VMContext.warp = _warp_with_message_datetime
