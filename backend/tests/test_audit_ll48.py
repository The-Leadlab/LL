"""Guards for the production audit: slash routes and CORS on errors."""

from app.api.v1.endpoints.workflows import router as workflows_router
from app.middleware.cors_on_error import origin_is_allowed


def test_workflow_collection_has_unsashed_route():
    paths = {getattr(route, "path", None) for route in workflows_router.routes}
    assert "" in paths or "/" in paths
    assert "" in paths


def test_production_origin_is_allowed_and_strangers_are_not():
    assert origin_is_allowed("https://www.the-leadlab.com")
    assert origin_is_allowed("https://ll-preview.vercel.app")
    assert not origin_is_allowed("https://evil.example")
    assert not origin_is_allowed(None)
