"""Deciding whether to use the C++ engine, and refusing it when in doubt.

`backend/engine/__init__.py` is the only place that opens the shared library,
and almost all of it is about *not* opening one. That is the part worth
testing: every other file in the engine's story fails loudly, and this one
fails by returning False, which is exactly the kind of failure that can be
wrong for a year without anybody noticing.

Two failures matter for different reasons.

**Absent** has to be quiet. A checkout with no compiler, a container that
never ran `build.sh`, a developer who ran `clean` — all of those have to leave
a working app on the Python path, with no exception at import and none at
call. If this ever starts raising, the engine has stopped being optional and
the C++ toolchain has become a requirement nobody agreed to.

**Stale** has to be loud, in the sense of being refused. A library built
before a field moved exports the same symbols with the same signatures, loads
without complaint, and reads the wrong bytes as the wrong fields. That is a
confident wrong answer rather than a crash, which is the worse of the two, so
the ABI number is checked and a mismatch is treated as no engine at all.

The module keeps its answer in module-level state, so these tests reload it
rather than calling it twice. The fixture puts the environment and the module
back afterwards; without that, a test that turned the engine off would turn it
off for everything that ran after it in the same session.
"""
import ctypes
import importlib
import os

import pytest

from backend import engine as engine_module


@pytest.fixture
def loader():
    """`backend.engine`, reloaded under an environment of the test's choosing.

    `importlib.reload` mutates the existing module object rather than making a
    new one, so `backend/engine/schedule.py`'s `from backend import engine`
    goes on pointing at the thing being reloaded. That is what makes this
    honest: the module under test is the module the app uses.
    """
    watched = ('SUMMIT_ENGINE', 'SUMMIT_ENGINE_LIB')
    before = {name: os.environ.get(name) for name in watched}

    def reload(**env):
        for name, value in env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        return importlib.reload(engine_module)

    yield reload

    for name, value in before.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value
    importlib.reload(engine_module)


class _Symbol:
    """Something ctypes-shaped enough for `_declare` to annotate and call."""

    def __init__(self, answer):
        self._answer = answer
        self.argtypes = None
        self.restype = None

    def __call__(self, *_args):
        return self._answer


class _FakeLibrary:
    """A library that loads, exports the right names, and is the wrong build."""

    def __init__(self, abi):
        self.summit_engine_abi = _Symbol(abi)
        self.summit_plan = _Symbol(0.0)
        self.summit_plan_score = _Symbol(0.0)


def test_switched_off_is_off(loader):
    engine = loader(SUMMIT_ENGINE='0')
    assert engine.available() is False
    assert engine.library() is None
    assert 'disabled' in engine.reason()


def test_a_path_with_nothing_at_it_is_not_an_error(loader):
    engine = loader(SUMMIT_ENGINE=None, SUMMIT_ENGINE_LIB='/nowhere/libsummit_engine.so')
    assert engine.available() is False
    assert engine.library() is None
    # The message has to name the fix. "False" on its own has cost somebody an
    # afternoon in every codebase that has ever shipped an optional accelerator.
    assert 'not built' in engine.reason()
    assert 'build.sh' in engine.reason()


def test_a_file_that_is_not_a_library_is_refused(loader, tmp_path):
    # Points at something real that will not dlopen — a stale artefact, a
    # partial download, a text file with the right name.
    impostor = tmp_path / 'libsummit_engine.so'
    impostor.write_text('not a shared object')
    engine = loader(SUMMIT_ENGINE=None, SUMMIT_ENGINE_LIB=str(impostor))
    assert engine.available() is False
    assert 'would not load' in engine.reason()


def test_the_wrong_abi_is_refused_even_though_it_loads(loader, monkeypatch, tmp_path):
    # The failure this check exists for. Every symbol is present and every
    # signature matches; only the layout behind them has moved. Nothing about
    # the call would fail — it would answer, with the wrong fields.
    present = tmp_path / 'libsummit_engine.so'
    present.write_text('stands in for a real build')
    monkeypatch.setattr(ctypes, 'CDLL', lambda _path: _FakeLibrary(abi=99))

    engine = loader(SUMMIT_ENGINE=None, SUMMIT_ENGINE_LIB=str(present))
    assert engine.available() is False
    assert engine.library() is None
    assert 'ABI 99' in engine.reason()
    assert 'rebuild' in engine.reason()


def test_the_right_abi_is_accepted(loader, monkeypatch, tmp_path):
    # The same fake, built against this checkout. Proves the refusal above is
    # about the number and not about the fake.
    present = tmp_path / 'libsummit_engine.so'
    present.write_text('stands in for a real build')
    monkeypatch.setattr(ctypes, 'CDLL', lambda _path: _FakeLibrary(abi=engine_module.ABI))

    engine = loader(SUMMIT_ENGINE=None, SUMMIT_ENGINE_LIB=str(present))
    assert engine.available() is True
    assert engine.reason() == ''
    assert engine.library() is not None


def test_a_missing_engine_costs_the_app_nothing(loader):
    # The whole promise: no engine, no exception, and the planner still plans.
    from backend.engine import schedule

    engine = loader(SUMMIT_ENGINE='0')
    assert engine.available() is False

    # Two half-hours into an hour: both fit, and both are placed.
    fits = schedule.plan([schedule.Task(30, 100), schedule.Task(30, 50)],
                         [schedule.Slot(60)])
    assert fits.engine is False
    assert fits.slot_of == [0, 0]
    assert fits.score == pytest.approx(150.0)

    # And the greedy still chooses when it cannot have both: the hour goes to
    # the task worth more, and the other is left out rather than crammed in.
    crowded = schedule.plan([schedule.Task(60, 20), schedule.Task(60, 500)],
                            [schedule.Slot(60)])
    assert crowded.slot_of == [-1, 0]
    assert crowded.score == pytest.approx(500.0)


def test_the_real_library_says_what_it_is(loader):
    # Skipped rather than failed where it is not built, for the same reason
    # every other engine test is: it is optional, and a red suite on a machine
    # with no compiler would quietly make it mandatory.
    engine = loader(SUMMIT_ENGINE=None, SUMMIT_ENGINE_LIB=None)
    if not engine.available():
        pytest.skip(f'C++ engine unavailable: {engine.reason()}')
    assert engine.reason() == ''
    assert int(engine.library().summit_engine_abi()) == engine.ABI
