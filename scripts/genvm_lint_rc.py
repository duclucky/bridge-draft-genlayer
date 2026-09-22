"""Compatibility wrapper for genvm-linter 0.11.1-rc.2 and GenVM v0.3.

The RC linter omits the renamed sandboxed custom-validator entrypoint from its
reachability table. This declares only that entrypoint as safe; all ordinary
lint and semantic validation remains unchanged. Remove it after upstream
recognizes ``gl.vm.run_nondet_default``.
"""

import sys

from genvm_linter.cli import main
from genvm_linter.lint import safety


safety.SafeEntryPointFinder.SAFE_PATTERNS["gl.vm.run_nondet_default"] = [0, 1]
safety.NONDET_SPAWN_CALLS = safety.NONDET_SPAWN_CALLS | {"gl.vm.run_nondet_default"}


if __name__ == "__main__":
    sys.exit(main())
