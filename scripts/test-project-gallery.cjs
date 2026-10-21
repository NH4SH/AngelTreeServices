const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../projects-gallery.js'), 'utf8');

function harness(options = {}) {
  let focused = null;
  function element(props = {}) {
    return Object.assign({
      hidden: false, dataset: {}, attributes: {}, listeners: {}, children: [], isConnected: true,
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      fire(type, data = {}) { const event = { button: 0, target: this, prevented: false, preventDefault() { this.prevented = true; }, ...data }; (this.listeners[type] || []).forEach(fn => fn(event)); return event; },
      setAttribute(name, value) { this.attributes[name] = value; },
      querySelector(selector) { return this.selectors?.[selector] || null; },
      querySelectorAll(selector) { return this.lists?.[selector] || []; },
      replaceChildren(...children) { this.children = children; },
      focus() { focused = this; },
    }, props);
  }
  const bodyClasses = new Set();
  const body = { classList: { add: x => bodyClasses.add(x), remove: x => bodyClasses.delete(x) } };
  const cards = ['tree landscaping', 'tree landscaping', 'landscaping', 'landscaping', 'tree', 'tree', 'tree', 'tree'].map((services, i) => {
    const img = element({ alt: `Approved alt ${i}`, width: 1280, height: 720 });
    const link = element({ href: `/assets/versioned/approved-${i}-1600.webp`, selectors: { img } });
    const estimate = element({ href: i < 4 ? '/?service=Landscaping#contact' : '/?service=Tree%20Care&estimate_context=tree-pruning#contact', textContent: `Estimate ${i}` });
    return element({ id: `photo-${i}`, dataset: { galleryServices: services }, selectors: { '[data-gallery-photo]': link, h2: element({ textContent: `Title ${i}` }), '[data-gallery-caption]': element({ textContent: `Approved caption ${i} <literal>` }), '[data-gallery-estimate]': estimate } });
  });
  const filters = ['all', 'tree', 'landscaping'].map(name => element({ dataset: { galleryFilter: name } }));
  const toolbar = element({ hidden: true });
  const count = element({ textContent: '8 project photos' });
  const names = ['title', 'description', 'position', 'media', 'load-status', 'request', 'original', 'close', 'previous', 'next'];
  const parts = Object.fromEntries(names.map(name => [name, element()]));
  const dialog = element({ open: false, selectors: Object.fromEntries(names.map(name => [`[data-gallery-${name}]`, parts[name]])),
    showModal() { if (options.throwOnOpen) throw Error('Unavailable'); this.open = true; parts.close.focus(); },
    close() { this.open = false; this.fire('close'); },
    getBoundingClientRect() { return { left: 20, right: 500, top: 20, bottom: 600 }; },
  });
  if (options.noDialog) dialog.showModal = undefined;
  const gallery = element({ selectors: { '[data-gallery-count]': count, '[data-gallery-filters]': toolbar, '[data-gallery-viewer]': dialog }, lists: { '[data-gallery-card]': cards, '[data-gallery-filter]': filters } });
  const document = element({ readyState: options.loading ? 'loading' : 'complete', body, createElement: () => element(), querySelector: () => options.noGallery ? null : gallery });
  const window = element({ location: { hash: options.hash || '' }, requestAnimationFrame: fn => fn() });
  vm.runInNewContext(source, { document, window });
  return { cards, filters, toolbar, count, dialog, parts, bodyClasses, document, window, focus: () => focused,
    link: i => cards[i].querySelector('[data-gallery-photo]'), open: i => cards[i].querySelector('[data-gallery-photo]').fire('click') };
}

test('gallery safely ignores other pages and initializes after DOM readiness', () => {
  assert.doesNotThrow(() => harness({ noGallery: true }));
  const h = harness({ loading: true });
  assert.equal(h.toolbar.hidden, true);
  h.document.fire('DOMContentLoaded');
  assert.equal(h.toolbar.hidden, false);
});

test('service filters retain mixed-service work and restore every approved photo', () => {
  const h = harness();
  h.filters[1].fire('click');
  assert.equal(h.cards.filter(c => !c.hidden).length, 6);
  assert.equal(h.count.textContent, '6 tree service photos');
  assert.equal(h.filters[1].attributes['aria-pressed'], 'true');
  h.filters[2].fire('click');
  assert.equal(h.cards.filter(c => !c.hidden).length, 4);
  assert.equal(h.count.textContent, '4 landscaping photos');
  assert.equal(h.filters[1].attributes['aria-pressed'], 'false');
  h.filters[0].fire('click');
  assert.equal(h.cards.filter(c => !c.hidden).length, 8);
  assert.equal(h.count.textContent, '8 project photos');
  assert.equal(h.cards[0].querySelector('[data-gallery-caption]').textContent, 'Approved caption 0 <literal>');
});

test('enlarged photo preserves caption, alt text, full image and service estimate context', () => {
  const h = harness();
  assert.equal(h.open(4).prevented, true);
  assert.equal(h.dialog.open, true);
  assert.equal(h.parts.title.textContent, 'Title 4');
  assert.equal(h.parts.description.textContent, 'Approved caption 4 <literal>');
  assert.equal(h.parts.request.href, '/?service=Tree%20Care&estimate_context=tree-pruning#contact');
  assert.equal(h.parts.media.children[0].alt, 'Approved alt 4');
  assert.equal(h.parts.media.children[0].src, h.link(4).href);
  assert.equal(h.parts.original.href, h.link(4).href);
  assert.equal(h.bodyClasses.has('ats-gallery-open'), true);
});

test('previous/next wraps only through the selected service photos', () => {
  const h = harness(); h.filters[2].fire('click'); h.open(0);
  h.parts.previous.fire('click'); assert.equal(h.parts.title.textContent, 'Title 3');
  assert.equal(h.parts.position.textContent, 'Photo 4 of 4: Title 3');
  h.parts.next.fire('click'); assert.equal(h.parts.title.textContent, 'Title 0');
  for (let i = 0; i < 8; i++) { h.parts.next.fire('click'); assert.match(h.parts.title.textContent, /Title [0-3]/); }
});

test('arrow navigation does not hijack modified shortcuts', () => {
  const h = harness(); h.open(0);
  assert.equal(h.dialog.fire('keydown', { key: 'ArrowRight' }).prevented, true);
  assert.equal(h.parts.title.textContent, 'Title 1');
  assert.equal(h.dialog.fire('keydown', { key: 'ArrowLeft', ctrlKey: true }).prevented, false);
  assert.equal(h.parts.title.textContent, 'Title 1');
  h.dialog.fire('keydown', { key: 'ArrowLeft' }); assert.equal(h.parts.title.textContent, 'Title 0');
});

test('close button and native close paths unlock scroll and return focus to the opened photo', () => {
  for (const nativeClose of [false, true]) {
    const h = harness(); h.open(5); h.parts.next.fire('click');
    nativeClose ? h.dialog.close() : h.parts.close.fire('click');
    assert.equal(h.dialog.open, false);
    assert.equal(h.bodyClasses.has('ats-gallery-open'), false);
    assert.equal(h.focus(), h.link(5));
    assert.equal(h.parts.media.children.length, 0);
  }
});

test('modified clicks, missing dialog support and failed modal opens preserve native image links', () => {
  const h = harness();
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) assert.equal(h.link(0).fire('click', { [modifier]: true }).prevented, false);
  assert.equal(h.link(0).fire('click', { button: 1 }).prevented, false);
  for (const options of [{ noDialog: true }, { throwOnOpen: true }]) {
    const f = harness(options); assert.equal(f.open(0).prevented, false);
    assert.equal(f.bodyClasses.has('ats-gallery-open'), false);
    assert.match(f.link(0).href, /approved-0-1600.webp$/);
    f.filters[2].fire('click'); assert.equal(f.cards.filter(c => !c.hidden).length, 4);
  }
});

test('image failures remain recoverable and stale loads do not replace the current status', () => {
  const h = harness(); h.open(0); const first = h.parts.media.children[0];
  h.parts.next.fire('click'); const second = h.parts.media.children[0];
  first.fire('load'); assert.equal(h.parts['load-status'].textContent, 'Loading photo…');
  second.fire('error'); assert.match(h.parts['load-status'].textContent, /full-size photo link/);
  h.parts.next.fire('click'); h.parts.media.children[0].fire('load');
  assert.equal(h.parts['load-status'].textContent, '');
});

test('only an actual backdrop click dismisses the enlarged photo', () => {
  const h = harness(); h.open(0);
  h.dialog.fire('click', { clientX: 100, clientY: 100 }); assert.equal(h.dialog.open, true);
  h.dialog.fire('click', { target: h.parts.media, clientX: 0, clientY: 0 }); assert.equal(h.dialog.open, true);
  h.dialog.fire('click', { clientX: 0, clientY: 0 }); assert.equal(h.dialog.open, false);
  assert.equal(h.focus(), h.link(0));
});

test('a known service-page fragment opens its photo and restores focus on close', () => {
  const h = harness({ hash: '#photo-7' });
  assert.equal(h.dialog.open, true);
  assert.equal(h.parts.title.textContent, 'Title 7');
  assert.equal(h.parts.position.textContent, 'Photo 8 of 8: Title 7');
  assert.equal(h.parts.description.textContent, 'Approved caption 7 <literal>');
  h.parts.next.fire('click'); assert.equal(h.parts.title.textContent, 'Title 0');
  h.dialog.close(); assert.equal(h.focus(), h.link(7));
  assert.equal(h.bodyClasses.has('ats-gallery-open'), false);
});

test('a service fragment waits for page loading before taking modal focus', () => {
  const h = harness({ hash: '#photo-7', loading: true });
  h.document.fire('DOMContentLoaded');
  assert.equal(h.dialog.open, false);
  h.window.fire('load');
  assert.equal(h.dialog.open, true);
  assert.equal(h.focus(), h.parts.close);
});

test('unknown, malformed and other page fragments never open or alter gallery content', () => {
  for (const hash of ['', '#field-gallery-title', '#photo-99', '#%E0%A4%A', '#photo-<script>', '#__proto__']) {
    const h = harness({ hash });
    assert.equal(h.dialog.open, false);
    assert.equal(h.bodyClasses.has('ats-gallery-open'), false);
    assert.equal(h.cards.filter(c => !c.hidden).length, 8);
  }
});

test('service fragments preserve native anchor fallback when modal support is absent or fails', () => {
  for (const extra of [{ noDialog: true }, { throwOnOpen: true }]) {
    const h = harness({ hash: '#photo-7', ...extra });
    assert.equal(h.dialog.open, false);
    assert.equal(h.bodyClasses.has('ats-gallery-open'), false);
    assert.match(h.link(7).href, /approved-7-1600.webp$/);
  }
});
