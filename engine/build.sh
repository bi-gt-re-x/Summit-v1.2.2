#!/usr/bin/env sh
# build.sh — the whole build. One shared library from one source file.
#
#   ./build.sh          build the library into build/
#   ./build.sh test     build it, then build and run the C++ checks
#   ./build.sh clean    remove build/
#
# There is no CMake here on purpose. This is one .cpp and one .h; a build
# system would be more lines than the thing it builds, and a second toolchain
# for anyone who wants to touch it. `c++` is whatever the platform calls its
# compiler and is already on any machine that could use this.
#
# Nothing in Summit requires the result. backend/engine/ loads it if it is
# here and falls back to the Python in backend/tracking/analytics.py if it is
# not, so an unbuilt engine is a slower app and never a broken one.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
out="$here/build"

# .dylib on macOS, .so everywhere else — backend/engine/__init__.py looks for
# both and does not care which it finds.
case "$(uname -s)" in
    Darwin) lib="libsummit_engine.dylib" ;;
    *)      lib="libsummit_engine.so" ;;
esac

case "${1:-build}" in
clean)
    rm -rf "$out"
    echo "removed $out"
    ;;
build|test)
    mkdir -p "$out"
    # -O2 rather than -O3: the hot loop is a hash lookup and an add, which -O3
    # does not make faster, and -O2 is the setting the result was measured at.
    # -fPIC is required for a shared object on Linux and harmless on macOS.
    ${CXX:-c++} -std=c++17 -O2 -fPIC -Wall -Wextra -shared \
        -I "$here/include" \
        "$here/src/schedule.cpp" \
        -o "$out/$lib"
    echo "built $out/$lib"

    if [ "${1:-build}" = "test" ]; then
        ${CXX:-c++} -std=c++17 -O2 -Wall -Wextra \
            -I "$here/include" \
            "$here/src/schedule.cpp" "$here/tests/schedule_test.cpp" \
            -o "$out/schedule_test"
        "$out/schedule_test"
    fi
    ;;
*)
    echo "usage: $0 [build|test|clean]" >&2
    exit 2
    ;;
esac
