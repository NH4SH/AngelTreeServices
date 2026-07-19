#!/usr/bin/env python3
"""Build the lightweight static Batch 2 public pages."""

from __future__ import annotations

import argparse
import json
import sys
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = "https://angeltreeservices.org"
TRUST_DATA = json.loads((ROOT / "public-trust-data.json").read_text(encoding="utf-8"))
PHONE_DISPLAY = "(540) 388-8715"
PHONE_LINK = "+15403888715"
INSTAGRAM_URL = "https://www.instagram.com/angeltreeservices/"
SOCIAL_IMAGE = f"{SITE}/assets/hero-grass-1600.webp"
GOOGLE_MAPS_URL = TRUST_DATA["platforms"]["google"]["publicProfileUrl"]
ANGI_URL = TRUST_DATA["platforms"]["angi"]["publicProfileUrl"]
BBB_URL = TRUST_DATA["platforms"]["bbb"]["publicProfileUrl"]
TRUST_LINE = TRUST_DATA["trustLine"]
BEST_OF_BURG_URL = (
    "https://fredericksburgfreelance-star.secondstreetapp.com/og/"
    "1330302d-61d4-4411-bb5b-f84e5e2b593b/gallery/529160741"
)
NBC4_ARTICLE_URL = (
    "https://www.nbcwashington.com/news/consumer/nbc4-responds/"
    "tree-services-business-slows-down-after-google-profile-deleted/3721350/"
)
NBC4_VIDEO_URL = (
    "https://www.nbcwashington.com/video/news/consumer/nbc4-responds/"
    "tree-services-business-slows-down-after-google-profile-deleted/3721684/"
)
YOUTUBE_VIDEO_URL = "https://www.youtube.com/watch?v=QwfdLmPTQAk"
GOOGLE_REVIEW_PROOF = "4.9 stars from 120+ Google reviews"
COMPANY_EXPERIENCE_PROOF = "more than 30 years of tree-industry experience"
COMPANY_SERVICE_SINCE = "serving the Fredericksburg region since 2015"
FOUNDER_PRIOR_EXPERIENCE = "more than 20 years in the tree industry before founding Angel Tree Services"
CHAMBER_MEMBER_URL = (
    "https://members.fredericksburgchamber.org/list/member/"
    "angel-tree-services-llc-29385"
)
FABA_MEMBER_URL = (
    "https://members.fabava.com/list/member/"
    "angel-tree-services-llc-27366840"
)
TREE_FREDERICKSBURG_URL = "https://treefredericksburg.org/"
CHIPDROP_URL = "https://getchipdrop.com/"


def html_text(value: object) -> str:
    return escape(str(value))


def html_attr(value: object) -> str:
    return escape(str(value), quote=True)


def review_by_id(review_id: str) -> dict:
    return next(review for review in TRUST_DATA["reviews"] if review["id"] == review_id)


def testimonial(review_id: str, class_name: str = "ats-testimonial") -> str:
    review = review_by_id(review_id)
    return f"""
      <blockquote class="{html_attr(class_name)}">
        <p>“{html_text(review['excerpt'])}”</p>
        <footer>
          <cite>{html_text(review['reviewerDisplayName'])}</cite>
          <span>{html_text(review['platform'])} · {int(review['reviewYear'])}</span>
          <a href="{html_attr(review['publicProfileUrl'])}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on {html_text(review['platform'])}</a>
        </footer>
      </blockquote>"""


def trust_line(class_name: str = "ats-trust-line") -> str:
    return f'<p class="{html_attr(class_name)}"><a href="/credentials-safety/">{html_text(TRUST_LINE)}</a></p>'


def wave() -> str:
    return """
      <div class="ats-wave" aria-hidden="true">
        <svg viewBox="0 0 1440 96" preserveAspectRatio="none" focusable="false">
          <path class="ats-wave__fill" d="M0 58C170 20 360 14 580 42C870 78 1130 82 1440 44V96H0Z"></path>
          <path class="ats-wave__stroke" d="M0 58C170 20 360 14 580 42C870 78 1130 82 1440 44"></path>
        </svg>
      </div>"""


def header(active: str) -> str:
    primary_links = [
        ("about", "/about/", "About"),
        ("services", "/services/", "Services"),
        ("projects", "/projects/", "Projects"),
        ("commercial", "/services/commercial-hoa-tree-care/", "Commercial"),
    ]
    mobile_links = [
        ("about", "/about/", "About"),
        ("services", "/services/", "Services"),
        ("projects", "/projects/", "Projects"),
        ("commercial", "/services/commercial-hoa-tree-care/", "Commercial & HOA"),
        ("credentials", "/credentials-safety/", "Credentials & Safety"),
        ("recognition", "/recognition/", "Reviews & Recognition"),
        ("contact", "/#contact", "Contact"),
    ]

    def nav_links(links: list[tuple[str, str, str]]) -> str:
        return "\n".join(
            f'<a href="{href}" data-ats-nav="{key}"{(" aria-current=\"page\"" if key == active else "")}>{label}</a>'
            for key, href, label in links
        )

    return f"""
  <a class="ats-skip-link" href="#main-content">Skip to main content</a>
  <header class="ats-page-header">
    <div class="ats-page-header__inner">
      <a class="ats-page-brand" href="/" aria-label="Angel Tree Services home">
        <img src="/assets/angel-tree-logo-transparent.webp" width="512" height="512" alt="">
        <span>Angel Tree Services</span>
      </a>
      <nav class="ats-page-nav" aria-label="Primary navigation">
        {nav_links(primary_links)}
        <a class="ats-page-instagram" href="{INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.25"></circle><circle cx="17.4" cy="6.7" r="1"></circle></svg>
        </a>
        <a class="ats-page-call" href="tel:{PHONE_LINK}">Call Us</a>
      </nav>
      <details class="ats-mobile-menu">
        <summary>Menu</summary>
        <nav aria-label="Mobile navigation">
          {nav_links(mobile_links)}
        </nav>
      </details>
    </div>
  </header>"""


def footer() -> str:
    return f"""
  <footer class="ats-page-footer">
    <div class="ats-page-footer__inner">
      <div>
        <h2>Angel Tree Services</h2>
        <p>Family-operated tree care backed by {COMPANY_EXPERIENCE_PROOF}, {COMPANY_SERVICE_SINCE}.</p>
        <p class="ats-page-footer__trust"><a href="/credentials-safety/">{html_text(TRUST_LINE)}</a></p>
      </div>
      <div>
        <h3>Plan your service</h3>
        <ul>
          <li><a href="/about/">About our family business</a></li>
          <li><a href="/credentials-safety/">Credentials and safety</a></li>
          <li><a href="/services/tree-removal/">Tree removal</a></li>
          <li><a href="/services/tree-pruning/">Tree pruning</a></li>
        </ul>
      </div>
      <div>
        <h3>Contact</h3>
        <ul>
          <li><a href="tel:{PHONE_LINK}">{PHONE_DISPLAY}</a></li>
          <li><a href="mailto:info@angeltreeservice.org">info@angeltreeservice.org</a></li>
          <li><a class="ats-estimate-link" href="/#contact">Request a free estimate</a></li>
        </ul>
      </div>
      <div>
        <h3>Find us online</h3>
        <ul>
          <li><a href="{html_attr(GOOGLE_MAPS_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on Google</a></li>
          <li><a href="{html_attr(ANGI_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on Angi</a></li>
          <li><a href="{html_attr(BBB_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on BBB</a></li>
          <li><a href="{html_attr(INSTAGRAM_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on Instagram</a></li>
        </ul>
      </div>
    </div>
    <p class="ats-page-footer__legal">Serving Fredericksburg, Spotsylvania, Stafford, King George, and Caroline. Service availability is confirmed during the estimate process.</p>
  </footer>
  <nav class="ats-mobile-actions" aria-label="Quick actions">
    <a class="ats-mobile-actions__call" href="tel:{PHONE_LINK}">Call now</a>
    <a class="ats-mobile-actions__estimate ats-estimate-link" href="/#contact">Free estimate</a>
  </nav>"""


def schema_for_page(page: dict) -> dict:
    url = f"{SITE}{page['path']}"
    graph: list[dict] = [
        {
            "@type": "BreadcrumbList",
            "@id": f"{url}#breadcrumb",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": position,
                    "name": name,
                    "item": f"{SITE}{href}",
                }
                for position, (name, href) in enumerate(page["breadcrumbs"], start=1)
            ],
        }
    ]

    if page["type"] == "service":
        graph.append(
            {
                "@type": "Service",
                "@id": f"{url}#service",
                "name": page["service_name"],
                "description": page["description"],
                "url": url,
                "provider": {"@id": f"{SITE}/#business"},
                "areaServed": [
                    "Fredericksburg",
                    "Spotsylvania",
                    "Stafford",
                    "King George",
                    "Caroline",
                ],
            }
        )
    else:
        graph.append(
            {
                "@type": page.get("schema_type", "WebPage"),
                "@id": f"{url}#page",
                "url": url,
                "name": page["title"],
                "description": page["description"],
                "breadcrumb": {"@id": f"{url}#breadcrumb"},
                "isPartOf": {"@id": f"{SITE}/#website"},
                **({"about": {"@id": f"{SITE}/#business"}} if page.get("about_business") else {}),
            }
        )

    return {"@context": "https://schema.org", "@graph": graph}


def breadcrumbs(page: dict) -> str:
    items = []
    for index, (name, href) in enumerate(page["breadcrumbs"]):
        if index == len(page["breadcrumbs"]) - 1:
            items.append(f'<li aria-current="page">{html_text(name)}</li>')
        else:
            items.append(f'<li><a href="{html_attr(href)}">{html_text(name)}</a></li>')
    return f'<nav class="ats-breadcrumbs" aria-label="Breadcrumb"><ol>{"".join(items)}</ol></nav>'


def page_document(page: dict) -> str:
    canonical = f"{SITE}{page['path']}"
    image = page.get("social_image", SOCIAL_IMAGE)
    hero_media = ""
    hero_class = ""
    if page.get("hero_image"):
        hero_media = f"""
        <figure class="ats-page-hero__media">
          <img src="{html_attr(page['hero_image'])}" width="{int(page['image_width'])}" height="{int(page['image_height'])}" alt="{html_attr(page['hero_alt'])}" decoding="async" fetchpriority="high">
        </figure>"""
    else:
        hero_class = " ats-page-hero__inner--single"

    schema = json.dumps(schema_for_page(page), ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")

    return f"""<!doctype html>
<!-- Generated by scripts/build-public-pages.py; edit the builder, then regenerate. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html_text(page['title'])}</title>
  <meta name="description" content="{html_attr(page['description'])}">
  <link rel="canonical" href="{html_attr(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Angel Tree Services">
  <meta property="og:title" content="{html_attr(page['title'])}">
  <meta property="og:description" content="{html_attr(page['description'])}">
  <meta property="og:url" content="{html_attr(canonical)}">
  <meta property="og:image" content="{html_attr(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html_attr(page['title'])}">
  <meta name="twitter:description" content="{html_attr(page['description'])}">
  <meta name="twitter:image" content="{html_attr(image)}">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/assets/css2.css">
  <link rel="stylesheet" href="/site-pages.css?v=about1">
  <script type="application/ld+json">{schema}</script>
</head>
<body>
{header(page['active'])}
  <main id="main-content" tabindex="-1">
    <section class="ats-page-hero">
      <div class="ats-page-hero__inner{hero_class}">
        <div class="ats-page-hero__content">
          {breadcrumbs(page)}
          <h1>{html_text(page['h1'])}</h1>
          <p class="ats-page-hero__lead">{html_text(page['lead'])}</p>
          {trust_line('ats-page-hero__trust')}
          <div class="ats-actions">
            <a class="ats-button ats-button--primary ats-estimate-link" href="{html_attr(page['estimate_href'])}">{html_text(page['estimate_label'])}</a>
            <a class="ats-button ats-button--secondary" href="tel:{PHONE_LINK}">Call {PHONE_DISPLAY}</a>
          </div>
        </div>
        {hero_media}
      </div>
      {wave()}
    </section>
{page['body']}
  </main>
{footer()}
  <script src="/site-pages.js?v=recognition1" defer></script>
</body>
</html>
"""


def process_section() -> str:
    steps = [
        ("01", "Tell us what you need", "Share the service, property address, and any access or timing concerns."),
        ("02", "Review the property", "The site, nearby structures, access, and the requested outcome are considered in person."),
        ("03", "Receive a written proposal", "The recommended work and agreed scope are documented before approval."),
        ("04", "Approve and schedule", "Once approved, the office coordinates a practical service date and next steps."),
        ("05", "Complete the agreed work", "The crew follows the approved scope and the method selected for the property."),
        ("06", "Cleanup and follow-up", "Cleanup follows the written scope, and any remaining questions or next steps are made clear."),
    ]
    items = "".join(f'<li><span class="ats-card__number">{n}</span><strong>{title}</strong><span>{copy}</span></li>' for n, title, copy in steps)
    return f"""
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">A clear service path</p>
        <h2 class="ats-section-heading">What happens after you reach out</h2>
        <ol class="ats-process-list">{items}</ol>
      </div>
    </section>"""


def faq_section(faqs: list[tuple[str, str]]) -> str:
    details = "".join(
        f'<details><summary>{question}</summary><div><p>{answer}</p></div></details>'
        for question, answer in faqs
    )
    return f"""
    <section class="ats-content-section">
      <div class="ats-section-inner ats-section-inner--narrow">
        <p class="ats-eyebrow">Practical questions</p>
        <h2 class="ats-section-heading">What homeowners often ask</h2>
        <div class="ats-faq-list">{details}</div>
      </div>
    </section>"""


def final_cta(title: str, copy: str, href: str, label: str) -> str:
    return f"""
    <section class="ats-final-cta">
      <div class="ats-final-cta__inner">
        <h2>{title}</h2>
        <p>{copy}</p>
        {trust_line('ats-final-cta__trust')}
        <div class="ats-actions">
          <a class="ats-button ats-button--primary ats-estimate-link" href="{href}">{label}</a>
          <a class="ats-button ats-button--secondary" href="tel:{PHONE_LINK}">Call {PHONE_DISPLAY}</a>
        </div>
      </div>
    </section>"""


def cards(items: list[tuple[str, str]], start: int = 1) -> str:
    return "".join(
        f'<article class="ats-card"><span class="ats-card__number">{index:02d}</span><h3>{title}</h3><p>{copy}</p></article>'
        for index, (title, copy) in enumerate(items, start=start)
    )


def service_body(data: dict) -> str:
    related = "".join(f'<li><a href="{href}">{label}</a></li>' for href, label in data["related"])
    service_review = ""
    if data.get("review_id"):
        service_review = f"""
    <section class="ats-content-section ats-content-section--white ats-service-review" aria-label="Customer experience">
      <div class="ats-section-inner ats-section-inner--narrow">
        <p class="ats-eyebrow">A customer experience</p>
        {testimonial(data['review_id'], 'ats-testimonial ats-testimonial--service')}
      </div>
    </section>"""
    return f"""
    <section class="ats-content-section">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">A recommendation starts with the property</p>
        <h2 class="ats-section-heading">{data['fit_heading']}</h2>
        <p class="ats-section-intro">{data['fit_intro']}</p>
        <div class="ats-card-grid">{cards(data['situations'])}</div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner ats-two-column">
        <div class="ats-prose">
          <p class="ats-eyebrow">Scope and expectations</p>
          <h2>{data['scope_heading']}</h2>
          {data['scope_copy']}
        </div>
        <aside class="ats-callout">
          <h2>{data['callout_heading']}</h2>
          <p>{data['callout_copy']}</p>
        </aside>
      </div>
    </section>
    {process_section()}
    <section class="ats-content-section">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Planning the work</p>
        <h2 class="ats-section-heading">Property and site considerations</h2>
        <p class="ats-section-intro">The appropriate method depends on the actual site. These are common details worth sharing before the visit.</p>
        <div class="ats-card-grid ats-card-grid--two">{cards(data['considerations'])}</div>
        <ul class="ats-related-links">{related}<li><a href="/credentials-safety/">Credentials and safety</a></li></ul>
      </div>
    </section>
    {service_review}
    {faq_section(data['faqs'])}
    {final_cta(data['cta_title'], data['cta_copy'], data['estimate_href'], data['estimate_label'])}"""


SERVICE_PAGES = [
    {
        "path": "/services/tree-removal/",
        "active": "services",
        "type": "service",
        "service_name": "Tree Removal",
        "review_id": "john-p-angi-2019",
        "title": "Tree Removal in Fredericksburg, VA | Angel Tree Services",
        "description": "Plan tree removal with a property visit, written scope, and method selected for the site. Request an estimate from Angel Tree Services.",
        "h1": "Tree removal planned around your property.",
        "lead": "When removal may be the right next step, we begin with the tree, its surroundings, access, and your goals—not a one-size-fits-all assumption.",
        "breadcrumbs": [("Home", "/"), ("Services", "/services/"), ("Tree Removal", "/services/tree-removal/")],
        "estimate_href": "/?service=Tree%20Care#contact",
        "estimate_label": "Request a tree-removal estimate",
        "hero_image": "/assets/AngelChainsawSquooshed_008.jpg",
        "image_width": 1080,
        "image_height": 1080,
        "hero_alt": "Angel Tree Services crew member using a chainsaw during tree work",
        "fit_heading": "Removal is one option—not the automatic answer.",
        "fit_intro": "A property visit helps determine whether removal, pruning, monitoring, or another recommendation best fits the concern.",
        "situations": [
            ("Dead or declining trees", "A tree with substantial decline may warrant an in-person review of condition and surroundings."),
            ("Storm damage", "Broken, uprooted, or displaced trees can create urgent access and property concerns."),
            ("Conflicts with the property", "Trees may interfere with structures, access, planned work, or the reasonable use of a space."),
        ],
        "scope_heading": "A clear removal scope before work begins",
        "scope_copy": "<p>A proposal should identify the tree or trees included, the planned work, and the cleanup included in that scope. Wood, debris, and stump work should be discussed rather than assumed.</p><p>Where space is limited, a tree may need to be taken apart in controlled sections. The method and equipment depend on the tree, access, nearby property, and site conditions.</p>",
        "callout_heading": "Stump work is a separate decision",
        "callout_copy": "Removal of the standing tree does not mean the entire root system disappears. If the stump is part of your concern, include it in the estimate request so the written scope can address it clearly.",
        "considerations": [
            ("Nearby structures and boundaries", "Homes, sheds, fences, driveways, neighboring property, and overhead utilities can affect the work plan."),
            ("Access and ground conditions", "Gate width, slopes, septic areas, underground utilities, and lawn conditions can influence equipment and movement."),
            ("Wood and debris", "Tell us whether wood placement, debris handling, or a specific cleanup expectation matters to you."),
            ("Method selection", "Rigging, climbing, ground-based work, or larger equipment may be considered only when appropriate for the actual site."),
        ],
        "faqs": [
            ("Can you tell from a photo whether a tree must be removed?", "Photos can help explain the concern, but they do not replace an on-site review. A recommendation should account for the tree and the property around it."),
            ("Does tree removal include stump grinding?", "Do not assume it does. Ask for stump grinding to be included so the written proposal can state whether it is part of the scope."),
            ("Will every removal use the same equipment?", "No. Access, tree size, nearby property, ground conditions, and the approved scope determine the practical method."),
            ("What should I point out during the estimate?", "Share access limitations, septic areas, underground utilities, property boundaries, desired wood placement, and anything else that may affect the plan."),
        ],
        "related": [("/services/tree-pruning/", "Professional tree pruning"), ("/services/stump-grinding/", "Stump grinding"), ("/services/emergency-tree-service/", "Storm and emergency guidance")],
        "cta_title": "Start with a thoughtful property review.",
        "cta_copy": "Tell us which tree concerns you and where it is located. We’ll follow up about the next step for a free estimate.",
    },
    {
        "path": "/services/tree-pruning/",
        "active": "services",
        "type": "service",
        "service_name": "Tree Pruning",
        "title": "Tree Pruning in Fredericksburg, VA | Angel Tree Services",
        "description": "Request purposeful tree pruning for clearance, deadwood, structure, or storm damage in the Fredericksburg region.",
        "h1": "Tree pruning with a clear purpose.",
        "lead": "Pruning decisions should begin with the outcome you need—clearance, deadwood, structure, young-tree training, or appropriate storm-damage cleanup.",
        "breadcrumbs": [("Home", "/"), ("Services", "/services/"), ("Tree Pruning", "/services/tree-pruning/")],
        "estimate_href": "/?service=Tree%20Care#contact",
        "estimate_label": "Request a pruning estimate",
        "hero_image": "/assets/VerySquooshedSideGreenwall.jpg",
        "image_width": 1000,
        "image_height": 562,
        "hero_alt": "Trees and greenery on a maintained property",
        "fit_heading": "Match the cuts to the goal.",
        "fit_intro": "Good pruning is not simply making a tree smaller. The reason for the work should guide what is removed and what is retained.",
        "situations": [
            ("Clearance", "Selective pruning may improve practical clearance from roofs, driveways, walks, or other property features."),
            ("Deadwood and damage", "Dead or broken branches can be evaluated for targeted removal and storm-related cleanup."),
            ("Structure and training", "Young-tree training or selective structural work may support a more appropriate form as the tree develops."),
        ],
        "scope_heading": "Pruning should describe the intended result",
        "scope_copy": "<p>The written scope should identify the trees, the pruning objective, and the cleanup included. Terms such as clearance, deadwood removal, structural pruning, or reduction should be used only when they describe the actual recommendation.</p><p>Timing, species, condition, and the amount of live material involved can affect what is appropriate. Pruning cannot eliminate every future branch or storm risk.</p>",
        "callout_heading": "Topping is not a pruning goal",
        "callout_copy": "Indiscriminate cutting to a uniform height or leaving large stubs can create poor structure and unwanted regrowth. A useful proposal should describe purposeful cuts tied to the property and tree.",
        "considerations": [
            ("The requested clearance", "Show the estimator the roof, drive, view, walkway, or neighboring area you are trying to address."),
            ("Tree condition and timing", "Visible damage, recent changes, and the desired schedule are helpful context for the visit."),
            ("Access below the canopy", "Fences, gardens, vehicles, outdoor features, and ground conditions can affect how work is approached."),
            ("Future expectations", "Explain whether your priority is clearance, appearance, deadwood, young-tree development, or storm cleanup."),
        ],
        "faqs": [
            ("Is tree trimming the same as professional pruning?", "People often use the words interchangeably. The useful distinction is whether the work has a defined objective and an appropriate scope rather than indiscriminate cutting."),
            ("Can pruning prevent all storm damage?", "No. Pruning may address specific branches or objectives, but no pruning can guarantee that a tree or branch will never fail."),
            ("Do you recommend topping?", "No. A recommendation should use purposeful pruning rather than indiscriminate topping."),
            ("How do I know how much should be removed?", "That depends on the goal, tree, condition, and site. An on-site review is more reliable than choosing a percentage without context."),
        ],
        "related": [("/services/tree-removal/", "Tree removal planning"), ("/services/emergency-tree-service/", "Storm and emergency guidance")],
        "cta_title": "Tell us what you want the pruning to accomplish.",
        "cta_copy": "Share the tree, property address, and your clearance, deadwood, structure, or storm-cleanup concern.",
    },
    {
        "path": "/services/stump-grinding/",
        "active": "services",
        "type": "service",
        "service_name": "Stump Grinding",
        "title": "Stump Grinding in Fredericksburg, VA | Angel Tree Services",
        "description": "Plan stump grinding with clear access, utility, chip, depth, and replanting expectations. Request a Fredericksburg-region estimate.",
        "h1": "A clearer plan for the stump that remains.",
        "lead": "Stump grinding is different from removing an entire root system. Access, underground utilities, expected depth, chips, and the future use of the area all matter.",
        "breadcrumbs": [("Home", "/"), ("Services", "/services/"), ("Stump Grinding", "/services/stump-grinding/")],
        "estimate_href": "/?service=Tree%20Care#contact",
        "estimate_label": "Request a stump estimate",
        "fit_heading": "Define what you want to do with the space next.",
        "fit_intro": "A stump left after removal and an older existing stump can both be considered, but the practical scope depends on the site and your next use for the area.",
        "situations": [
            ("After tree removal", "Grinding can be discussed as part of the same proposal or as a clearly separate scope."),
            ("An existing stump", "Older stumps can be reviewed for access, size, surrounding growth, and site constraints."),
            ("Preparing the area", "Tell us if the goal is mowing access, surface improvement, landscaping, or potential replanting."),
        ],
        "scope_heading": "Set expectations for depth, chips, and finish",
        "scope_copy": "<p>A stump-grinding proposal should identify the stump or stumps included and clarify the expected work. Grinding produces chips, and the treatment of those chips or any backfill should be stated rather than assumed.</p><p>Grinding does not normally remove every root extending through the yard. Roots may remain below grade and can affect immediate replanting or other future work.</p>",
        "callout_heading": "Utilities come before grinding",
        "callout_copy": "Underground electric, gas, communications, irrigation, and other private or public lines may affect the work area. Share known utilities and follow the utility-marking steps provided during scheduling.",
        "considerations": [
            ("Machine access", "Gate openings, steps, walls, slopes, soft ground, and nearby plantings can affect whether equipment can reach the stump."),
            ("Stump and surface conditions", "Stump size, surrounding roots, stones, metal, soil, and adjacent hardscape can influence the practical scope."),
            ("Chips and backfill", "Ask whether chips stay on site, are spread, or are handled another way under the proposed scope."),
            ("Replanting plans", "If you intend to plant in the same spot, mention it before work so expectations about remaining roots and soil can be discussed."),
        ],
        "faqs": [
            ("Does stump grinding remove every root?", "No. Grinding addresses the stump and an agreed depth or area; roots commonly remain below the surrounding ground."),
            ("Can I plant another tree in the same place?", "It may be better to offset a new planting because roots, chips, and changing soil conditions can remain. Share your plan during the estimate."),
            ("Are the chips removed?", "That depends on the written scope. Ask for chip handling and any backfill expectation to be stated clearly in the proposal."),
            ("Can you grind a stump behind a fence?", "Possibly, but gate width, turns, slopes, steps, and ground conditions must be reviewed before confirming access."),
        ],
        "related": [("/services/tree-removal/", "Tree removal planning"), ("/services/tree-pruning/", "Tree pruning"), ("/projects/", "Real Angel Tree work")],
        "cta_title": "Show us the stump and the space around it.",
        "cta_copy": "Include the address, access details, and what you hope to do with the area afterward.",
    },
    {
        "path": "/services/emergency-tree-service/",
        "active": "services",
        "type": "service",
        "service_name": "Storm-Damaged and Fallen Tree Service",
        "title": "Storm-Damaged Tree Help | Angel Tree Services",
        "description": "Get calm safety guidance and request help for storm-damaged, fallen, or urgent tree concerns in the Fredericksburg region.",
        "h1": "Call first when safety cannot wait.",
        "lead": "For a fallen tree, blocked access, storm damage, or another immediate tree concern, keep people clear and tell us what happened. Availability is confirmed when you call.",
        "breadcrumbs": [("Home", "/"), ("Services", "/services/"), ("Storm and Emergency Guidance", "/services/emergency-tree-service/")],
        "estimate_href": "/?service=Storm%20Cleanup#contact",
        "estimate_label": "Send storm-damage details",
        "fit_heading": "Separate immediate danger from an urgent estimate.",
        "fit_intro": "The safest first action depends on whether people, roads, structures, vehicles, or electrical lines are involved.",
        "situations": [
            ("Power lines involved", "Do not approach a fallen or contacted line. Contact 911 or the electric utility as appropriate."),
            ("A structure or vehicle is affected", "Keep people away from the area and call so the situation and availability can be discussed."),
            ("Damage is urgent but stable", "If there is no immediate danger, send the address and details for an urgent estimate request."),
        ],
        "scope_heading": "What to share when you call",
        "scope_copy": "<p>Describe what fell or broke, whether a structure or access is affected, whether anyone is in danger, and whether power or utility lines are nearby. Do not move into an unsafe area to take better photographs.</p><p>Angel Tree Services does not claim 24/7 availability. Calling is the fastest way to confirm whether and when the team can help.</p>",
        "callout_heading": "Never approach an energized or contacted line",
        "callout_copy": "Treat every downed line as energized. Keep people and pets away, avoid touching the tree or nearby objects, and contact emergency services or the responsible utility. Angel Tree Services does not work on energized utility lines.",
        "considerations": [
            ("Immediate access", "Tell us if a driveway, entrance, road, or essential access point is blocked."),
            ("Structures and vehicles", "Identify what is affected without entering or standing beneath a compromised area."),
            ("Utility responsibility", "Utility-owned lines and energized electrical hazards require the responsible utility or emergency services."),
            ("Follow-up tree work", "After immediate hazards are addressed, remaining pruning, removal, stump, or cleanup needs can be scoped separately."),
        ],
        "faqs": [
            ("Do you offer guaranteed 24/7 response?", "No 24/7 guarantee is stated. Call to explain the situation and confirm current availability."),
            ("What if a tree is touching a power line?", "Stay away. Contact 911 or the electric utility as appropriate, and do not touch the tree, line, or nearby objects."),
            ("Should I send photos?", "Only from a safe location. Do not enter a hazardous area, stand under broken limbs, or approach lines to take a picture."),
            ("Can a normal concern still be handled quickly?", "Describe the concern and timing in the estimate form. Calling is best when access, structures, vehicles, or immediate safety are involved."),
        ],
        "related": [("/services/tree-removal/", "Tree removal planning"), ("/services/tree-pruning/", "Tree pruning")],
        "cta_title": "Need help with storm damage or a fallen tree?",
        "cta_copy": "Call for immediate concerns. For a stable situation, send the location and details for follow-up.",
    },
]


def services_hub_body() -> str:
    service_cards = [
        ("Tree removal", "Start with an on-site review and a clear written scope for the tree and surrounding property.", "/services/tree-removal/"),
        ("Tree pruning", "Plan clearance, deadwood, structural work, or young-tree training around a defined objective.", "/services/tree-pruning/"),
        ("Stump grinding", "Clarify access, underground utilities, remaining roots, chips, and the future use of the area.", "/services/stump-grinding/"),
        ("Storm and emergency guidance", "Know when to call, when to contact a utility, and what information helps with an urgent request.", "/services/emergency-tree-service/"),
        ("Commercial and HOA tree care", "Coordinate scopes, approvals, service contacts, and scheduling for managed properties.", "/services/commercial-hoa-tree-care/"),
    ]
    cards_html = "".join(
        f'<article class="ats-card"><span class="ats-card__number">{i:02d}</span><h2>{title}</h2><p>{copy}</p><p style="margin-top:18px"><a href="{href}">Explore {title.lower()}</a></p></article>'
        for i, (title, copy, href) in enumerate(service_cards, 1)
    )
    return f"""
    <section class="ats-content-section">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Choose the right starting point</p>
        <h2 class="ats-section-heading">Tree-service guidance without guesswork</h2>
        <p class="ats-section-intro">These pages explain common situations, questions to raise during an estimate, and how the written scope keeps expectations clear.</p>
        <div class="ats-card-grid">{cards_html}</div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner ats-two-column">
        <div class="ats-prose"><p class="ats-eyebrow">Not sure which service fits?</p><h2>Describe the problem, not the solution.</h2><p>You do not need to diagnose a tree or choose a technical service before contacting us. Tell us what changed, what concerns you, and what part of the property is affected.</p></div>
        <aside class="ats-callout"><h2>Landscaping and lawn care</h2><p>Angel Tree Services also accepts landscaping and lawn-care estimate requests through the same form. Select the service that best matches your project, or choose “multiple services / not sure yet.”</p></aside>
      </div>
    </section>
    {final_cta('Tell us what your property needs.', 'A short description is enough to start. We’ll follow up about the next step for your free estimate.', '/#contact', 'Request a free estimate')}"""


def commercial_body() -> str:
    return f"""
    <section class="ats-content-section">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Built for managed properties</p>
        <h2 class="ats-section-heading">One clear scope for everyone who needs to approve it</h2>
        <p class="ats-section-intro">The request can begin with a site walk, a defined property or phase, and the contacts who need to review next steps.</p>
        {trust_line()}
        <div class="ats-card-grid">{cards([
            ('Site and portfolio context', 'Identify the property, service location, site contact, and whether the request covers one area or several managed locations.'),
            ('Proposal and approval needs', 'Share whether a manager, board, owner, or another stakeholder must review the written scope.'),
            ('Scheduling and communication', 'Resident, tenant, access, parking, and service-location coordination can be raised before scheduling.'),
        ])}</div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner ats-two-column">
        <div class="ats-prose"><p class="ats-eyebrow">A practical workflow</p><h2>Keep the property and the decision path clear.</h2><p>Angel Tree Services can record organization and property context with the estimate request, then provide a written scope for review. Digital quote, approval, and invoice tools support a cleaner handoff without exposing internal systems.</p><p>Angel Tree Services is insured. Certificates of insurance are available upon request; ask the office to coordinate current documentation for your organization.</p></div>
        <aside class="ats-callout"><h2>No customer list without permission</h2><p>We do not publish organization names, partnerships, or property relationships without authorization. Project proof will be added only when the underlying facts and media are approved.</p></aside>
      </div>
    </section>
    {process_section()}
    <section class="ats-content-section">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Useful request details</p>
        <h2 class="ats-section-heading">Help us route the property correctly</h2>
        <div class="ats-card-grid ats-card-grid--two">{cards([
            ('Organization and property name', 'Include the business, HOA, church, nonprofit, apartment community, or managed property associated with the request.'),
            ('On-site contact and access', 'Share the person who can provide access or walk the property, along with gate, parking, tenant, or resident constraints.'),
            ('Scope and approval structure', 'Tell us whether the request covers a specific tree, area, phase, recurring concern, or several properties.'),
            ('Timing and documentation', 'Identify board dates, operating-hour constraints, storm concerns, or current documentation requirements.'),
        ])}</div>
        <ul class="ats-related-links"><li><a href="/services/tree-removal/">Tree removal</a></li><li><a href="/services/tree-pruning/">Tree pruning</a></li><li><a href="/services/emergency-tree-service/">Storm guidance</a></li><li><a href="/credentials-safety/">Credentials and safety</a></li></ul>
      </div>
    </section>
    {faq_section([
        ('Can a manager submit for more than one property?', 'Yes. Choose commercial / property management and include the organization, properties, or phases involved. The office can clarify how to separate the scope.'),
        ('Can a board or owner review the proposal?', 'The written proposal provides a clear scope for the appropriate decision-makers to review before approval.'),
        ('Can you coordinate certificates of insurance?', 'Describe the documentation your organization requires. The office will confirm what current documentation can be provided rather than making a blanket public claim.'),
        ('Do you offer recurring maintenance?', 'Share the property and desired frequency. Angel Tree Services can confirm whether a recurring or phased approach fits the current services and property.'),
    ])}
    {final_cta('Start a property-management request.', 'Choose commercial / property management in the form and include the organization, property, and approval context.', '/?service=Multiple%20Services%20%2F%20Not%20Sure%20Yet&customer_type=Commercial%20%2F%20Property%20Management#contact', 'Request a property estimate')}"""


def credentials_body() -> str:
    return f"""
    <section class="ats-content-section">
      <div class="ats-section-inner ats-credential-panel">
        <div class="ats-prose">
          <p class="ats-eyebrow">Verified public credentials</p>
          <h2>ISA member and ISA Certified Arborist</h2>
          <p>Angel Tree Services publicly identifies an active ISA membership and an ISA Certified Arborist credential. Certification belongs to the credentialed individual; it does not imply that every employee holds the same credential.</p>
          <p>Angel Tree Services was founded in 2015 after its founder had already spent more than 20 years in the tree industry. Together with the company’s local service since 2015, that continuous history represents {COMPANY_EXPERIENCE_PROOF}. No additional qualification should be inferred from these badges.</p>
          <p><strong>Angel Tree Services is insured.</strong> Certificates of insurance are available upon request. Specific policy details remain available directly from the office rather than being published as a blanket guarantee.</p>
        </div>
        <div class="ats-badges" aria-label="ISA credentials">
          <img src="/assets/isamember1_004.jpg" width="190" height="299" alt="ISA Member">
          <img src="/assets/certified-arborist.png" width="646" height="1126" alt="ISA Certified Arborist">
        </div>
      </div>
      <div class="ats-section-inner ats-affiliations" aria-labelledby="professional-affiliations-title">
        <div>
          <p class="ats-eyebrow">Professional affiliations</p>
          <h2 id="professional-affiliations-title">Connected to the Fredericksburg business community.</h2>
        </div>
        <div>
          <ul class="ats-affiliations__links">
            <li><a href="{html_attr(CHAMBER_MEMBER_URL)}" target="_blank" rel="noopener noreferrer">Member of the Fredericksburg Regional Chamber of Commerce</a></li>
            <li><a href="{html_attr(FABA_MEMBER_URL)}" target="_blank" rel="noopener noreferrer">Member of the Fredericksburg Area Builders Association</a></li>
          </ul>
          <p class="ats-affiliations__note">These are professional memberships, not awards or endorsements. <a href="/about/">Read our company story</a>, or <a href="/recognition/#community">review the source-backed community details</a>.</p>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Before work begins</p>
        <h2 class="ats-section-heading">What customers should expect to clarify</h2>
        <div class="ats-card-grid">{cards([
            ('The recommended scope', 'The written proposal should identify the work being recommended and the property areas involved.'),
            ('Site access and surroundings', 'Structures, fences, drives, utilities, neighboring property, ground conditions, and access can affect the work plan.'),
            ('Cleanup and next steps', 'Cleanup, debris or wood handling, stump work, scheduling, and follow-up should be confirmed in the approved scope.'),
        ])}</div>
      </div>
    </section>
    <section class="ats-content-section">
      <div class="ats-section-inner ats-two-column">
        <div class="ats-prose"><p class="ats-eyebrow">Safety around urgent conditions</p><h2>Power lines require the utility.</h2><p>Never approach a fallen or contacted power line. Keep people and pets away and contact 911 or the electric utility as appropriate. Angel Tree Services does not represent itself as a provider of energized-line work.</p></div>
        <aside class="ats-callout"><h2>Need current documentation?</h2><p>If a property manager or organization requires insurance or other documentation, request it through the office. Current availability can be confirmed directly without publishing private documents or unsupported blanket claims.</p><div class="ats-actions"><a class="ats-button ats-button--primary" href="mailto:info@angeltreeservice.org">Email the office</a></div></aside>
      </div>
    </section>
    {final_cta('A clear scope is part of a safer start.', 'Tell us about the property, service, and site concerns so the estimate can begin with the right context.', '/#contact', 'Request a free estimate')}"""


def projects_body() -> str:
    projects = [
        ("/assets/AngelChainsawSquooshed_008.jpg", 1080, 1080, "Angel Tree Services crew member during tree work", "Tree service", "Tree-service work", "Real Angel Tree Services field imagery. Detailed project facts and a privacy-safe case study are awaiting internal approval."),
        ("/assets/LightroomGrassPictureSquooshed_014.jpg", 1633, 919, "Close view of maintained green grass", "Lawn care", "Lawn-care work", "Real Angel Tree Services lawn imagery. No unverified address, customer, treatment, or outcome is attached to this image."),
        ("/assets/GardenLandscaping+(2)_008.jpg", 2500, 1407, "Landscaped garden and lawn", "Landscaping", "Landscaping work", "Real Angel Tree Services landscaping imagery. A fuller case study will be published only after project details are verified."),
    ]
    cards_html = "".join(
        f'<article class="ats-project-card"><img src="{src}" width="{w}" height="{h}" alt="{alt}" loading="lazy" decoding="async"><div class="ats-project-card__body"><p class="ats-project-card__type">{kind}</p><h2>{title}</h2><p>{copy}</p></div></article>'
        for src, w, h, alt, kind, title, copy in projects
    )
    return f"""
    <section class="ats-content-section">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Real Angel Tree imagery</p>
        <h2 class="ats-section-heading">A proof library built carefully</h2>
        <p class="ats-section-intro">These images come from the existing Angel Tree Services site. Individual case studies are being withheld until service details, general locations, customer concerns, methods, outcomes, and media permissions are verified.</p>
        <div class="ats-project-grid">{cards_html}</div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner ats-two-column">
        <div class="ats-prose"><p class="ats-eyebrow">Why the details matter</p><h2>No invented project stories.</h2><p>A photograph alone cannot reliably establish the tree species, equipment, exact service, customer concern, site constraints, location, or outcome. Angel Tree Services will add complete case studies when those facts and permissions are recorded.</p></div>
        <aside class="ats-callout"><h2>Have a project question?</h2><p>Describe the service or property situation you are comparing. The office can help route your request without pretending that an unlabeled photo proves the same conditions.</p></aside>
      </div>
    </section>
    {final_cta('Let’s talk about your property.', 'Share the service, address, and a short description. We’ll follow up about the next step for a free estimate.', '/#contact', 'Request a free estimate')}"""


def about_body() -> str:
    return f"""
    <section class="ats-content-section ats-about-origin" aria-labelledby="about-origin-title">
      <div class="ats-section-inner ats-about-origin__grid">
        <div class="ats-prose">
          <p class="ats-eyebrow">Serving the Fredericksburg region since 2015</p>
          <h2 id="about-origin-title">The business began in 2015. The field experience began much earlier.</h2>
          <p>Angel Tree Services has served the Fredericksburg region since 2015, but the experience behind the company reaches back more than 30 years. Before founding the family business, the founder had already spent more than 20 years working in tree care and utility vegetation management.</p>
          <p>That background became a company centered on professional service, clear communication, property protection, and dependable cleanup. Angel Tree Services was founded in 2015, while the experience guiding its work began decades earlier.</p>
        </div>
        <aside class="ats-about-origin__note" aria-label="Company history clarification">
          <strong>Founded in 2015</strong>
          <p>Angel Tree Services has operated as a company since 2015.</p>
          <strong>More than 30 years in the industry</strong>
          <p>The founder’s earlier career and the company’s service since 2015 form one continuous tree-industry history.</p>
        </aside>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white" aria-labelledby="founder-experience-title">
      <div class="ats-section-inner ats-about-history">
        <div class="ats-prose">
          <p class="ats-eyebrow">Built on decades in the field</p>
          <h2 id="founder-experience-title">More than 30 years in the tree industry</h2>
          <p>Before founding Angel Tree Services in 2015, the company’s founder had already spent more than 20 years working in tree care and utility vegetation management. He served as a crew leader with Asplundh before joining Lewis Tree Service, where he advanced to General Foreman.</p>
          <p>In that leadership role, he supervised approximately 40 employees and helped oversee crews across multiple Virginia service territories. Those areas included the Fredericksburg region, Leesburg and Northern Virginia, the Shenandoah Valley, and Tappahannock and eastern Virginia.</p>
          <p>Since founding Angel Tree Services, he has brought that background into more than a decade of operating a local family business. Together, that continuous history represents {COMPANY_EXPERIENCE_PROOF}.</p>
          <p class="ats-about-history__disclaimer">These former roles are part of the founder’s work history. They do not imply endorsement of Angel Tree Services by either former employer or any current utility affiliation.</p>
        </div>
        <div class="ats-about-territories" aria-label="Virginia service territories from the founder's prior leadership experience">
          <p>Leadership experience across Virginia</p>
          <ul>
            <li>Fredericksburg area</li>
            <li>Leesburg and Northern Virginia</li>
            <li>Shenandoah Valley</li>
            <li>Tappahannock and eastern Virginia</li>
          </ul>
        </div>
      </div>
    </section>
    <section class="ats-content-section" aria-labelledby="experience-today-title">
      <div class="ats-section-inner ats-about-practices">
        <div>
          <p class="ats-eyebrow">Experience put to work</p>
          <h2 class="ats-section-heading" id="experience-today-title">What that background means on your property today</h2>
          <p class="ats-section-intro">More than 30 years in the industry have shaped how Angel Tree Services plans each job, leads its crews, protects customer property, and communicates throughout the work.</p>
        </div>
        <ol class="ats-about-practices__list">
          <li><strong>Plan around the site</strong><span>Access, nearby structures, equipment movement, and the requested outcome all affect the practical work plan.</span></li>
          <li><strong>Keep crews coordinated</strong><span>Clear roles, work-zone organization, and active supervision help complicated tree projects move with purpose.</span></li>
          <li><strong>Protect the property</strong><span>Lawns, drives, fences, neighboring areas, and cleanup expectations are considered before the agreed work begins.</span></li>
          <li><strong>Communicate the next step</strong><span>A written scope and dependable follow-up help customers understand what is included and what happens next.</span></li>
        </ol>
      </div>
    </section>
    <section class="ats-content-section ats-about-family" aria-labelledby="family-business-title">
      <div class="ats-section-inner ats-two-column">
        <div class="ats-prose">
          <p class="ats-eyebrow">Family operated and locally grounded</p>
          <h2 id="family-business-title">Field knowledge carried into a connected customer experience</h2>
          <p>As Angel Tree Services grew, it developed as a family-operated business. Customers may interact with different people during estimates, scheduling, field work, and follow-up, but the goal is a coordinated experience from the first conversation through cleanup.</p>
          <p>The company serves homeowners and property professionals throughout Fredericksburg, Spotsylvania, Stafford, King George, and Caroline.</p>
        </div>
        <nav class="ats-about-links" aria-label="Learn more about Angel Tree Services">
          <a href="/services/">Explore services</a>
          <a href="/credentials-safety/">Review credentials and safety</a>
          <a href="/projects/">See real project imagery</a>
          <a href="/services/commercial-hoa-tree-care/">Commercial and HOA tree care</a>
        </nav>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white" aria-labelledby="about-community-title">
      <div class="ats-section-inner ats-about-community">
        <div>
          <p class="ats-eyebrow">Community involvement</p>
          <h2 class="ats-section-heading" id="about-community-title">Connected through business, service, and material reuse</h2>
        </div>
        <div class="ats-prose">
          <ul class="ats-about-community__memberships">
            <li>Member of the Fredericksburg Regional Chamber of Commerce</li>
            <li>Member of the Fredericksburg Area Builders Association</li>
          </ul>
          <p>The company also regularly donates arborist wood chips to Tree Fredericksburg and uses ChipDrop to connect reusable arborist chips with local recipients.</p>
          <p>This is a concise company-story summary. The current source links and full relationship wording remain on the Recognition page.</p>
          <p><a class="ats-text-link" href="/recognition/#community">Read the verified community details</a></p>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-about-recognition" aria-labelledby="about-recognition-title">
      <div class="ats-section-inner">
        <div class="ats-about-recognition__heading">
          <p class="ats-eyebrow">Independent proof</p>
          <h2 class="ats-section-heading" id="about-recognition-title">Trusted locally. Recognized regionally.</h2>
          <p class="ats-section-intro">The company story belongs here. Current customer review proof, official finalist recognition, media sources, affiliations, and community details remain documented on the Recognition page.</p>
        </div>
        <div class="ats-about-recognition__facts">
          <p><strong>{GOOGLE_REVIEW_PROOF}</strong><span>Current durable wording linked to the official Google Business Profile.</span></p>
          <p><strong>2026 Best of the Burg finalist</strong><span>Finalist in the Best Tree Trim/Removal Services category.</span></p>
          <p><strong>NBC4 Responds coverage</strong><span>Independent regional coverage of the company’s 2024 Google Business Profile issue.</span></p>
        </div>
        <div class="ats-actions"><a class="ats-button ats-button--green" href="/recognition/">View Reviews, Recognition &amp; Media</a></div>
      </div>
    </section>
    {final_cta('Tell us what your property needs.', 'Share the service, property address, and a few project details. We’ll follow up about the next step for your free estimate.', '/#contact', 'Request a free estimate')}"""


def recognition_body() -> str:
    customer_experiences = "".join(
        testimonial(review_id)
        for review_id in (
            "tim-s-google-2023",
            "carolyn-k-angi-2024",
            "anne-l-angi-2023",
            "louis-f-angi-2020",
            "john-p-angi-2019",
        )
    )
    return f"""
    <section class="ats-content-section ats-recognition-overview" aria-labelledby="review-proof-title">
      <div class="ats-section-inner">
        <div class="ats-recognition-intro">
          <div>
            <p class="ats-eyebrow">Customer review proof</p>
            <h2 class="ats-section-heading" id="review-proof-title">Independent platforms, shown separately.</h2>
          </div>
          <p>Google remains the primary review signal. Angi adds a longer project-history view, while BBB publishes a separate business rating. No scores or review counts are combined.</p>
        </div>
        <div class="ats-review-metrics" aria-label="Current third-party review and rating information">
          <article>
            <p class="ats-review-metrics__platform">Google</p>
            <p class="ats-review-metrics__value">120+</p>
            <p><strong>reviews</strong> · 4.9 average</p>
            <a href="{html_attr(GOOGLE_MAPS_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on Google</a>
          </article>
          <article>
            <p class="ats-review-metrics__platform">Angi</p>
            <p class="ats-review-metrics__value">44</p>
            <p><strong>customer reviews</strong> · 5.0 rating</p>
            <a href="{html_attr(ANGI_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on Angi</a>
          </article>
          <article>
            <p class="ats-review-metrics__platform">Better Business Bureau</p>
            <p class="ats-review-metrics__value">A+</p>
            <p><strong>BBB rating</strong> · Not BBB Accredited</p>
            <a href="{html_attr(BBB_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on BBB</a>
          </article>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white ats-customer-experiences" aria-labelledby="customer-experiences-title">
      <div class="ats-section-inner">
        <div class="ats-customer-experiences__heading">
          <div>
            <p class="ats-eyebrow">Customer experiences</p>
            <h2 class="ats-section-heading" id="customer-experiences-title">The details behind the ratings.</h2>
          </div>
          <p>These brief excerpts preserve the customers’ published words. Each is attributed to the platform identified on the source page.</p>
        </div>
        <div class="ats-testimonial-grid">{customer_experiences}</div>
        <p class="ats-customer-experiences__summary">Across these reviews, customers specifically describe repeat use, prompt communication, careful work around homes and landscaping, and thorough cleanup.</p>
      </div>
    </section>
    <section class="ats-content-section ats-professional-trust" aria-labelledby="professional-trust-title">
      <div class="ats-section-inner ats-professional-trust__grid">
        <div>
          <p class="ats-eyebrow">Professional trust</p>
          <h2 class="ats-section-heading" id="professional-trust-title">Experience and accountability before the work begins.</h2>
        </div>
        <div class="ats-professional-trust__facts">
          <p><strong>Certified Arborist-led</strong><span>Certification belongs to the credentialed individual and does not imply every employee holds it.</span></p>
          <p><strong>Insured</strong><span>Certificates of insurance are available upon request. Specific policy types are confirmed directly with the office.</span></p>
          <p><strong>30+ years</strong><span>Tree-industry experience, with local service in the Fredericksburg region since 2015.</span></p>
          <p><strong>Family-operated</strong><span>A local service business built around clear scopes, careful work, and direct communication.</span></p>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white ats-recognition-history" id="best-of-burg" aria-labelledby="recognition-history-title">
      <div class="ats-section-inner">
        <p class="ats-eyebrow">Recognition</p>
        <h2 class="ats-section-heading" id="recognition-history-title">Local recognition, stated precisely.</h2>
        <div class="ats-recognition-history__grid">
          <article>
            <p class="ats-recognition-history__year">2026</p>
            <h3>Best of the Burg finalist</h3>
            <p>Angel Tree Services was named a 2026 finalist in the <strong>Best Tree Trim/Removal Services</strong> category through Fredericksburg.com and The Free Lance-Star.</p>
            <a href="{html_attr(BEST_OF_BURG_URL)}" target="_blank" rel="noopener noreferrer">View the finalist listing</a>
          </article>
          <article>
            <p class="ats-recognition-history__label">Historical recognition</p>
            <h3>Previously recognized with Angi’s Super Service Award</h3>
            <p>This is past recognition. It is not presented as a current award, endorsement, certification, or annual distinction.</p>
            <a href="{html_attr(ANGI_URL)}" target="_blank" rel="noopener noreferrer">View Angel Tree Services on Angi</a>
          </article>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-recognition-media" id="nbc4" aria-labelledby="nbc4-title">
      <div class="ats-section-inner ats-recognition-media__grid">
        <div class="ats-prose">
          <p class="ats-eyebrow">Independent regional coverage</p>
          <h2 id="nbc4-title">Featured by NBC4</h2>
          <p>On September 19, 2024, NBC4 Responds reported on Angel Tree Services after its Google Business Profile was disabled. The report described the company as a family business and documented that Google reinstated the profile after NBC4 Responds contacted Google.</p>
          <p>The coverage concerned the business-profile issue and its effect on the company. It was not an endorsement, ranking, or workmanship award.</p>
          <ul class="ats-source-links">
            <li><a href="{html_attr(NBC4_ARTICLE_URL)}" target="_blank" rel="noopener noreferrer">Read the NBC4 Responds article</a></li>
            <li><a href="{html_attr(NBC4_VIDEO_URL)}" target="_blank" rel="noopener noreferrer">Open the NBC4 video page</a></li>
            <li><a href="{html_attr(YOUTUBE_VIDEO_URL)}" target="_blank" rel="noopener noreferrer">Watch on the official NBC4 Washington YouTube channel</a></li>
          </ul>
        </div>
        <div class="ats-video-facade" data-video-id="QwfdLmPTQAk">
          <button class="ats-video-facade__button" type="button" aria-label="Watch the NBC4 Responds report">
            <img src="https://i.ytimg.com/vi/QwfdLmPTQAk/maxresdefault.jpg" width="1280" height="720" alt="" loading="lazy" decoding="async">
            <span class="ats-video-facade__play" aria-hidden="true"></span>
            <span class="ats-video-facade__label">Watch the NBC4 Responds report</span>
          </button>
          <noscript><p><a href="{html_attr(YOUTUBE_VIDEO_URL)}">Watch the NBC4 Responds report on YouTube</a>.</p></noscript>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-community-proof" id="community" aria-labelledby="community-title">
      <div class="ats-section-inner">
        <div class="ats-community-proof__heading">
          <p class="ats-eyebrow">Community and professional connections</p>
          <h2 class="ats-section-heading" id="community-title">Rooted in the Fredericksburg community</h2>
          <p class="ats-section-intro">Angel Tree Services LLC supports local professional connections and practical ways to keep usable arborist wood chips in the community.</p>
        </div>
        <div class="ats-community-proof__grid">
          <section aria-labelledby="community-affiliations-title">
            <h3 id="community-affiliations-title">Professional affiliations</h3>
            <ul class="ats-community-proof__links">
              <li><a href="{html_attr(CHAMBER_MEMBER_URL)}" target="_blank" rel="noopener noreferrer">Member of the Fredericksburg Regional Chamber of Commerce</a></li>
              <li><a href="{html_attr(FABA_MEMBER_URL)}" target="_blank" rel="noopener noreferrer">Member of the Fredericksburg Area Builders Association</a></li>
            </ul>
          </section>
          <section aria-labelledby="community-support-title">
            <h3 id="community-support-title">Community support</h3>
            <p>Angel Tree Services regularly donates arborist wood chips to <a href="{html_attr(TREE_FREDERICKSBURG_URL)}" target="_blank" rel="noopener noreferrer">Tree Fredericksburg</a>, helping support local tree planting and urban forestry efforts.</p>
          </section>
          <section aria-labelledby="material-reuse-title">
            <h3 id="material-reuse-title">Responsible material reuse</h3>
            <p>Angel Tree Services also uses <a href="{html_attr(CHIPDROP_URL)}" target="_blank" rel="noopener noreferrer">ChipDrop</a> to connect reusable arborist wood chips with local gardeners and other nearby recipients.</p>
            <p>This helps keep usable tree material in the local community rather than treating every load as disposal waste.</p>
          </section>
        </div>
      </div>
    </section>
    <section class="ats-content-section ats-content-section--white">
      <div class="ats-section-inner ats-recognition-next">
        <div>
          <p class="ats-eyebrow">Plan with clear information</p>
          <h2 class="ats-section-heading">Trust signals are one part of a good service decision.</h2>
        </div>
        <ul class="ats-related-links">
          <li><a href="/about/">Read our company story</a></li>
          <li><a href="/services/">Explore services</a></li>
          <li><a href="/credentials-safety/">Credentials and safety</a></li>
          <li><a href="/projects/">View real project imagery</a></li>
        </ul>
      </div>
    </section>
    {final_cta('Ready to discuss your property?', 'Share the service, property address, and a few project details. We’ll follow up about the next step for a free estimate.', '/#contact', 'Request a free estimate')}"""


PAGES = [
    {
        "path": "/services/",
        "active": "services",
        "type": "hub",
        "schema_type": "CollectionPage",
        "title": "Tree Services in Fredericksburg, VA | Angel Tree Services",
        "description": "Explore tree removal, pruning, stump grinding, storm guidance, and managed-property tree care from Angel Tree Services.",
        "h1": "Tree-service decisions made clearer.",
        "lead": "Explore practical guidance for removal, pruning, stump grinding, storm damage, and managed properties—then request one clear estimate for your site.",
        "breadcrumbs": [("Home", "/"), ("Services", "/services/")],
        "estimate_href": "/#contact",
        "estimate_label": "Request a free estimate",
        "body": services_hub_body(),
    },
    *[dict(page, body=service_body(page)) for page in SERVICE_PAGES],
    {
        "path": "/services/commercial-hoa-tree-care/",
        "active": "commercial",
        "type": "service",
        "service_name": "Commercial and HOA Tree Care",
        "title": "Commercial & HOA Tree Care | Angel Tree Services",
        "description": "Coordinate tree-service scopes, approvals, contacts, and scheduling for HOAs, property managers, and commercial properties.",
        "h1": "Clear tree-service coordination for managed properties.",
        "lead": "For HOAs, property managers, apartment communities, churches, nonprofits, commercial sites, and multi-property organizations, a useful proposal starts with the property and approval path.",
        "breadcrumbs": [("Home", "/"), ("Services", "/services/"), ("Commercial and HOA", "/services/commercial-hoa-tree-care/")],
        "estimate_href": "/?service=Multiple%20Services%20%2F%20Not%20Sure%20Yet&customer_type=Commercial%20%2F%20Property%20Management#contact",
        "estimate_label": "Request a property estimate",
        "hero_image": "/assets/GardenLandscaping+(2)_008.jpg",
        "image_width": 2500,
        "image_height": 1407,
        "hero_alt": "Landscaped garden and lawn",
        "body": commercial_body(),
    },
    {
        "path": "/credentials-safety/",
        "active": "credentials",
        "type": "page",
        "schema_type": "AboutPage",
        "title": "Credentials & Safety | Angel Tree Services",
        "description": "Review Angel Tree Services’ verified ISA credentials, company experience, project-scope expectations, and urgent safety guidance.",
        "h1": "Verified credentials. Clear expectations.",
        "lead": "Trust should come from current credentials, a written scope, honest limits, and a practical plan for the property—not from inflated claims.",
        "breadcrumbs": [("Home", "/"), ("Credentials and Safety", "/credentials-safety/")],
        "estimate_href": "/#contact",
        "estimate_label": "Request a free estimate",
        "body": credentials_body(),
    },
    {
        "path": "/projects/",
        "active": "projects",
        "type": "page",
        "schema_type": "CollectionPage",
        "title": "Angel Tree Services Project Library",
        "description": "View real Angel Tree Services field imagery while factual, privacy-safe project case studies are prepared for publication.",
        "h1": "Real work, documented honestly.",
        "lead": "We are building a project library from genuine Angel Tree Services work without guessing at locations, species, equipment, customer concerns, or outcomes.",
        "breadcrumbs": [("Home", "/"), ("Projects", "/projects/")],
        "estimate_href": "/#contact",
        "estimate_label": "Request a free estimate",
        "body": projects_body(),
    },
    {
        "path": "/about/",
        "active": "about",
        "type": "page",
        "schema_type": "AboutPage",
        "about_business": True,
        "title": "About Angel Tree Services | Fredericksburg Tree Care",
        "description": "Learn how more than 30 years of tree-industry experience shaped Angel Tree Services, a family-operated company serving the Fredericksburg region since 2015.",
        "h1": "A family tree service built on decades in the field",
        "lead": "Serving the Fredericksburg region since 2015, Angel Tree Services carries forward more than 30 years of tree-industry experience in a locally operated family business.",
        "breadcrumbs": [("Home", "/"), ("About", "/about/")],
        "estimate_href": "/#contact",
        "estimate_label": "Request a free estimate",
        "hero_image": "/assets/AngelChainsawSquooshed_008.jpg",
        "image_width": 1080,
        "image_height": 1080,
        "hero_alt": "Angel Tree Services field worker beside cut tree sections",
        "body": about_body(),
    },
    {
        "path": "/recognition/",
        "active": "recognition",
        "type": "page",
        "schema_type": "WebPage",
        "about_business": True,
        "title": "Reviews, Recognition & Community | Angel Tree Services",
        "description": "Review verified customer feedback, professional trust details, local recognition, community connections, and NBC4 coverage for Angel Tree Services.",
        "h1": "Reviews, recognition, and community.",
        "lead": "Trust is built one property at a time. Review current third-party ratings, published customer experiences, professional credentials, and community connections.",
        "breadcrumbs": [("Home", "/"), ("Recognition", "/recognition/")],
        "estimate_href": "/#contact",
        "estimate_label": "Request a free estimate",
        "body": recognition_body(),
    },
]


def sitemap_document() -> str:
    urls = ["/", *[page["path"] for page in PAGES]]
    entries = "\n".join(f"  <url>\n    <loc>{SITE}{html_text(path)}</loc>\n  </url>" for path in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{entries}\n</urlset>\n'


def robots_document() -> str:
    return f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n"


def build(output_dir: Path) -> None:
    output_dir = output_dir.resolve()
    if output_dir == ROOT.resolve():
        raise ValueError("The generator cannot write into the repository root; use a dedicated output directory.")

    paths = [page["path"] for page in PAGES]
    if len(paths) != len(set(paths)):
        raise ValueError("Duplicate generated page paths are not allowed.")

    output_dir.mkdir(parents=True, exist_ok=True)

    for page in PAGES:
        destination = output_dir / page["path"].strip("/") / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(page_document(page), encoding="utf-8")
        print(destination.relative_to(output_dir))

    (output_dir / "sitemap.xml").write_text(sitemap_document(), encoding="utf-8")
    (output_dir / "robots.txt").write_text(robots_document(), encoding="utf-8")
    print("sitemap.xml")
    print("robots.txt")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "dist-public",
        help="Dedicated output directory (default: dist-public).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    try:
        build(parse_args().output_dir)
    except Exception as error:
        print(f"Public-page generation failed: {error}", file=sys.stderr)
        raise
