"""The routing table: everything the app serves, in one list.

API routers come from backend/api/ (one per page). The four here are the
routes that don't belong to a single page — the account endpoints, the theme
switch, the Jinja pages and the React app — plus the static-asset mounts.

Adding a page's API: write backend/api/<name>.py with a `router`, then add it
to API_MODULES. Nothing else needs to know.

The two frontends split the site between them: routes/pages.py is what still
renders server-side, routes/spa.py is what React has taken over. A path is in
one or the other, never both, so which one answers is never a race.

Order matters in one place: the mounts go on last, so a route defined above
always wins over a file that happens to sit at the same path.
"""
from importlib import import_module

from backend.routes import assets, spa

# Imported by name so this list reads as the map of the app. The stubs in
# backend/api/ (library, history, growthtree) are deliberately absent — they
# carry no router yet.
API_MODULES = (
    'dashboard',
    'tasks',
    'calendar',
    'goals',
    'growth',
    'analytics',
    'subject_ai',
    'focus',
    'quote',
    'subjects',
    'notes',
    'spaces',
    'records',
    'settings',
    'achievements',
    'notifications',
    'skillsteps',
    'skillattempts',
    'next',
)

SHARED_MODULES = (
    'backend.routes.auth',
    'backend.routes.theme',
    'backend.routes.spa',
    'backend.routes.pages',
)


def register(app):
    """Attach every router and the file mounts to `app`."""
    for name in API_MODULES:
        app.include_router(import_module('backend.api.{}'.format(name)).router)

    for path in SHARED_MODULES:
        app.include_router(import_module(path).router)

    spa.register(app)
    assets.register(app)
