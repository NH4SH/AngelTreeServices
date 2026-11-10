"""Check the ten released local-search behaviors after the public build.

The unchanged test_local_search module also has a proposed /home redirect test.
That eleventh assertion is intentionally NOT in this released-behavior gate:
/home / 301 and nine total redirect rules have not shipped. Full discovery still
runs that assertion; do not mark it skipped or weaken it to make discovery pass.
When routing ships, review this inventory and integrate its coverage explicitly.

Run: python3 scripts/test-released-local-search.py
"""
import sys
import unittest

import test_local_search


EXPECTED_RELEASED_COUNT = 10
RELEASED_TESTS = (
    "test_anchor_offset_covers_mobile_and_desktop",
    "test_core_service_pages_link_to_verified_coverage_anchors",
    "test_coverage_and_tree_only_restrictions_preserved",
    "test_east_directory_links_to_unique_visible_heading",
    "test_existing_hub_remains_canonical",
    "test_hub_description_matches_confirmed_tree_service_coverage",
    "test_local_permit_resource_does_not_promise_approval",
    "test_real_base_and_project_location_are_explicit",
    "test_schema_does_not_add_a_fake_business_location",
    "test_service_and_estimate_links_reuse_existing_routes",
)
DEFERRED_TEST = "test_home_alias_is_a_narrow_permanent_redirect"


def test_ids(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from test_ids(test)
        else:
            yield test.id()


def main():
    loader = unittest.TestLoader()
    case = test_local_search.LocalSearchGuideTests
    selected = set(RELEASED_TESTS)
    expected = selected | {DEFERRED_TEST}
    available = set(loader.getTestCaseNames(case))
    if hasattr(test_local_search, "load_tests"):
        print("Custom load_tests hooks require an explicit SEO inventory review.", file=sys.stderr)
        return 2
    discovered = loader.loadTestsFromModule(test_local_search)
    module_count = discovered.countTestCases()
    discovered_ids = list(test_ids(discovered))
    expected_ids = {f"{case.__module__}.{case.__qualname__}.{name}" for name in expected}
    if (
        len(RELEASED_TESTS) != EXPECTED_RELEASED_COUNT
        or len(selected) != EXPECTED_RELEASED_COUNT
        or DEFERRED_TEST in selected
        or available != expected
        or module_count != EXPECTED_RELEASED_COUNT + 1
        or len(discovered_ids) != EXPECTED_RELEASED_COUNT + 1
        or set(discovered_ids) != expected_ids
        or loader.errors
    ):
        print(
            "Released SEO test inventory changed; review the explicit selection. "
            f"Selected={len(RELEASED_TESTS)}, unique={len(selected)}, "
            f"module={module_count}, missing={sorted(expected - available)}, "
            f"unexpected={sorted(available - expected)}, loader_errors={loader.errors}",
            file=sys.stderr,
        )
        return 2

    print(
        f"Running {EXPECTED_RELEASED_COUNT} released SEO checks. "
        f"Deferred, not run: {DEFERRED_TEST} "
        "(unreleased /home / 301 and nine-rule routing contract).",
        file=sys.stderr,
    )
    suite = unittest.TestSuite(case(name) for name in RELEASED_TESTS)
    if suite.countTestCases() != EXPECTED_RELEASED_COUNT:
        print("Released SEO suite count mismatch.", file=sys.stderr)
        return 2
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != EXPECTED_RELEASED_COUNT or result.skipped or result.expectedFailures:
        print(
            "Released SEO gate requires all ten checks to execute without skips "
            "or expected failures.",
            file=sys.stderr,
        )
        return 1
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
