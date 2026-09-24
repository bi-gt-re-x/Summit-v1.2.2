"""Loading the C++ engine, or deciding to do without it.

`engine/` at the repository root builds one shared library. This package is
the only thing that opens it, and the only thing the rest of the backend ever
imports — nothing else in `backend/` mentions ctypes or a file path.

## It is optional, and that is the whole design

Nothing in Summit requires the library. `backend/engine/schedule.py` keeps a
pure-Python planner and uses it when the answer is no; the engine is asked for
first and the Python runs otherwise. An unbuilt engine is a worse plan, never
a broken app — which is what lets this be checked in at all, because a
repository whose server stops booting until somebody runs a C++ compiler is a
repository with a new required dependency.

So every failure here is the same failure: `available()` is False, `reason()`
says why in one line, and the caller carries on. Nothing raises on import.

## What is checked before it is used

The ABI number, against the one in `engine/include/summit/schedule.h`. A
stale library — built before a field was added, left behind in `engine/build/`
— has the same symbols and the same signatures and would read the wrong bytes
as the wrong fields. That is a confident wrong answer rather than a crash,
which is the worse of the two, so the version is read and refused rather than
trusted.

## Where it looks

`SUMMIT_ENGINE_LIB` if it is set, then `engine/build/` beside this checkout,
for both the macOS and the Linux name. `SUMMIT_ENGINE=0` turns it off without
deleting anything, which is how the two planners are compared against each
other — see tests/test_engine_schedule.py.
"""
import ctypes
import os
from pathlib import Path

#: Matches SUMMIT_ENGINE_ABI in engine/include/summit/schedule.h.
ABI = 1

#: The repository root: backend/engine/__init__.py -> backend/engine -> backend.
_ROOT = Path(__file__).resolve().parent.parent.parent

#: Both platform names, because `engine/build.sh` writes whichever suits the
#: machine it ran on and this does not care which one it finds.
_NAMES = ('libsummit_engine.dylib', 'libsummit_engine.so')

_lib = None
_reason = ''
_loaded = False


def _candidates():
    override = os.environ.get('SUMMIT_ENGINE_LIB', '').strip()
    if override:
        yield Path(override)
        return
    for name in _NAMES:
        yield _ROOT / 'engine' / 'build' / name


def _declare(lib):
    """Signatures, so ctypes converts rather than guessing.

    Without argtypes a pointer arrives as a plain int and a double return is
    read as one — both of which produce a number rather than an error, and a
    number is what these functions return.
    """
    lib.summit_engine_abi.argtypes = []
    lib.summit_engine_abi.restype = ctypes.c_int32

    lib.summit_plan.argtypes = [
        ctypes.POINTER(Tasks), ctypes.POINTER(Slots), ctypes.POINTER(PlanOpts),
        ctypes.POINTER(ctypes.c_int32),
    ]
    lib.summit_plan.restype = ctypes.c_double

    lib.summit_plan_score.argtypes = [
        ctypes.POINTER(Tasks), ctypes.POINTER(Slots), ctypes.POINTER(PlanOpts),
        ctypes.POINTER(ctypes.c_int32),
    ]
    lib.summit_plan_score.restype = ctypes.c_double


class Tasks(ctypes.Structure):
    """`summit_tasks`. Field order is the ABI; do not reorder."""

    _fields_ = [
        ('minutes', ctypes.POINTER(ctypes.c_int32)),
        ('value', ctypes.POINTER(ctypes.c_double)),
        ('due', ctypes.POINTER(ctypes.c_int32)),
        ('subject', ctypes.POINTER(ctypes.c_int32)),
        ('count', ctypes.c_int32),
    ]


class Slots(ctypes.Structure):
    """`summit_slots`. Field order is the ABI; do not reorder."""

    _fields_ = [
        ('minutes', ctypes.POINTER(ctypes.c_int32)),
        ('weight', ctypes.POINTER(ctypes.c_double)),
        ('count', ctypes.c_int32),
    ]


class PlanOpts(ctypes.Structure):
    """`summit_plan_opts`. Field order is the ABI; do not reorder."""

    _fields_ = [
        ('late_penalty', ctypes.c_double),
        ('switch_penalty', ctypes.c_double),
        ('iterations', ctypes.c_int32),
        ('seed', ctypes.c_uint64),
    ]


def _load():
    global _lib, _reason, _loaded
    if _loaded:
        return
    _loaded = True

    if os.environ.get('SUMMIT_ENGINE', '').strip() == '0':
        _reason = 'disabled by SUMMIT_ENGINE=0'
        return

    tried = []
    for path in _candidates():
        tried.append(str(path))
        if not path.exists():
            continue
        try:
            lib = ctypes.CDLL(str(path))
            _declare(lib)
        except OSError as problem:
            # Built for another architecture, or against a libstdc++ this
            # machine does not have. Both are "no engine", not a crash.
            _reason = f'{path.name} would not load: {problem}'
            return
        found = int(lib.summit_engine_abi())
        if found != ABI:
            _reason = (f'{path.name} speaks ABI {found}, this checkout expects '
                       f'{ABI} — rebuild with engine/build.sh')
            return
        _lib = lib
        _reason = ''
        return

    _reason = 'not built (run engine/build.sh); looked in ' + ', '.join(tried)


def available() -> bool:
    """Is the engine here, loadable, and the version this checkout expects?"""
    _load()
    return _lib is not None


def reason() -> str:
    """One line saying why it is not available, or '' when it is.

    Worth printing at startup and worth putting in a test's skip message: the
    difference between "not built" and "built, but stale" is most of the
    debugging.
    """
    _load()
    return _reason


def library():
    """The loaded CDLL, or None. Only backend/engine/schedule.py calls this."""
    _load()
    return _lib
