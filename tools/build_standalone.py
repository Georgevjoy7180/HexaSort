import os, json, base64, mimetypes, html

BUILD_DIR = "G:/HexaSort/build/web-mobile"
OUT_FILE = "G:/HexaSort/build/web-mobile-standalone/index.html"

def read_bytes(path):
    with open(path, 'rb') as f:
        return f.read()

def read_text(path):
    with open(path, 'rb') as f:
        return f.read().decode('utf-8', errors='replace')


def collect_files():
    all_files = []
    for root, dirs, files in os.walk(BUILD_DIR):
        for fn in files:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, BUILD_DIR).replace(os.sep, '/')
            all_files.append(rel)
    return sorted(all_files)


def classify(all_files, loader_files, handled_specially):
    module_files = []
    raw_files = []
    for rel in all_files:
        if rel in handled_specially or rel in loader_files:
            continue
        if rel.endswith('.js'):
            text = read_text(os.path.join(BUILD_DIR, rel))
            stripped = text.lstrip('\ufeff \t\r\n')
            if stripped.startswith('System.register('):
                module_files.append(rel)
                continue
        raw_files.append(rel)
    return module_files, raw_files


def inject_id(rel_path, text):
    stripped = text.lstrip('\ufeff \t\r\n')
    prefix_len = len(text) - len(stripped)
    assert stripped.startswith('System.register('), rel_path
    after = stripped[len('System.register('):]
    after_stripped_lead = after.lstrip()
    if after_stripped_lead and after_stripped_lead[0] in ('"', "'"):
        # Already has an explicit id (e.g. Rollup's "chunks:///_virtual/..." scheme) - leave as-is.
        return text
    id_expr = 'new URL(%s, document.baseURI).href' % json.dumps(rel_path)
    new_stripped = 'System.register(' + id_expr + ', ' + after
    return text[:prefix_len] + new_stripped


def guess_mime(rel):
    mt, _ = mimetypes.guess_type(rel)
    if mt:
        return mt
    if rel.endswith('.bin'):
        return 'application/octet-stream'
    if rel.endswith('.wasm'):
        return 'application/wasm'
    return 'application/octet-stream'


def main():
    loader_files = ['src/polyfills.bundle.js', 'src/system.bundle.js']
    handled_specially = set(['index.html', 'style.css', 'src/import-map.json'])

    all_files = collect_files()
    module_files, raw_files = classify(all_files, loader_files, handled_specially)

    # --- import map, rewritten from being src/-relative to being root-relative ---
    import_map = json.loads(read_text(os.path.join(BUILD_DIR, 'src/import-map.json')))
    new_imports = {}
    for k, v in import_map.get('imports', {}).items():
        joined = os.path.normpath(os.path.join('src', v)).replace(os.sep, '/')
        new_imports[k] = './' + joined
    import_map['imports'] = new_imports
    import_map_json = json.dumps(import_map)

    # --- style.css, inlined ---
    style_css = read_text(os.path.join(BUILD_DIR, 'style.css'))

    # --- loader scripts, verbatim ---
    loader_scripts_html = []
    for rel in loader_files:
        text = read_text(os.path.join(BUILD_DIR, rel))
        loader_scripts_html.append('<script>\n' + text + '\n</script>')

    # --- module scripts, id-injected ---
    module_scripts_html = []
    for rel in module_files:
        text = read_text(os.path.join(BUILD_DIR, rel))
        patched = inject_id(rel, text)
        module_scripts_html.append('<script>\n' + patched + '\n</script>')

    # --- every file (raw assets AND module files) gets embedded in the
    # fetch/XHR patch map too, as a universal fallback: some asset-bundle
    # files get loaded via a direct fetch() rather than System.import(),
    # even when their content also happens to be a SystemJS module. ---
    asset_entries = []
    total_raw = 0
    for rel in raw_files + module_files:
        data = read_bytes(os.path.join(BUILD_DIR, rel))
        total_raw += len(data)
        mime = guess_mime(rel)
        b64 = base64.b64encode(data).decode('ascii')
        asset_entries.append('%s:"data:%s;base64,%s"' % (json.dumps(rel), mime, b64))

    asset_map_js = '{' + ','.join(asset_entries) + '}'

    fetch_patch = """
<script>
(function () {
  var ASSET_MAP = __ASSET_MAP__;
  var resolved = {};
  for (var key in ASSET_MAP) {
    if (Object.prototype.hasOwnProperty.call(ASSET_MAP, key)) {
      resolved[new URL(key, document.baseURI).href] = ASSET_MAP[key];
    }
  }

  function lookup(url) {
    try {
      var abs = new URL(url, document.baseURI).href;
      return resolved[abs] || null;
    } catch (e) {
      return null;
    }
  }

  function dataURIToBlob(dataURI) {
    var comma = dataURI.indexOf(',');
    var meta = dataURI.substring(5, comma);
    var isBase64 = meta.indexOf(';base64') !== -1;
    var mime = meta.split(';')[0] || 'application/octet-stream';
    var raw = dataURI.substring(comma + 1);
    var bytes;
    if (isBase64) {
      var binStr = atob(raw);
      bytes = new Uint8Array(binStr.length);
      for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(raw));
    }
    return new Blob([bytes], { type: mime });
  }

  var originalFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    var dataURI = url ? lookup(url) : null;
    if (dataURI) {
      var blob = dataURIToBlob(dataURI);
      var mime = dataURI.substring(5, dataURI.indexOf(';'));
      return Promise.resolve(new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': mime }
      }));
    }
    if (originalFetch) return originalFetch(input, init);
    return Promise.reject(new Error('fetch not available for ' + url));
  };

  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr = new OrigXHR();
    var patchedURL = null;
    var patchedResponseType = '';
    var origOpen = xhr.open.bind(xhr);
    var origSend = xhr.send.bind(xhr);
    xhr.open = function (method, url) {
      patchedURL = url;
      return origOpen.apply(xhr, arguments);
    };
    xhr.send = function () {
      var dataURI = patchedURL ? lookup(patchedURL) : null;
      if (dataURI) {
        var blob = dataURIToBlob(dataURI);
        var deliver = function () {
          Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
          Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
          var rt = xhr.responseType;
          var finish = function (value) {
            Object.defineProperty(xhr, 'response', { value: value, configurable: true });
            if (rt === '' || rt === 'text') {
              Object.defineProperty(xhr, 'responseText', { value: typeof value === 'string' ? value : '', configurable: true });
            }
            if (xhr.onreadystatechange) xhr.onreadystatechange();
            if (xhr.onload) xhr.onload();
          };
          if (rt === 'arraybuffer') {
            blob.arrayBuffer().then(finish);
          } else if (rt === 'blob') {
            finish(blob);
          } else if (rt === 'json') {
            blob.text().then(function (t) { finish(JSON.parse(t)); });
          } else {
            blob.text().then(finish);
          }
        };
        setTimeout(deliver, 0);
        return;
      }
      return origSend.apply(xhr, arguments);
    };
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  // Some files get loaded via a dynamically created element's `src`
  // (script tags for on-demand bundle code, Image elements for WebGL
  // texture upload, etc.) rather than fetch()/XHR — neither patch above
  // sees those. Redirect the src assignment itself to the matching data:
  // URI when there's a hit, for every element type that supports `src`.
  var SRC_ELEMENT_CTORS = [
    window.HTMLScriptElement,
    window.HTMLImageElement,
    window.HTMLMediaElement,
    window.HTMLSourceElement
  ];
  SRC_ELEMENT_CTORS.forEach(function (Ctor) {
    if (!Ctor) return;
    var desc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'src');
    if (!desc || !desc.set) return;
    Object.defineProperty(Ctor.prototype, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function (value) {
        var dataURI = value ? lookup(value) : null;
        desc.set.call(this, dataURI || value);
      }
    });
  });

  var origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name.toLowerCase() === 'src') {
      var dataURI = value ? lookup(value) : null;
      return origSetAttribute.call(this, name, dataURI || value);
    }
    return origSetAttribute.call(this, name, value);
  };
})();
</script>
""".replace('__ASSET_MAP__', asset_map_js)

    html_out = []
    html_out.append('<!DOCTYPE html>')
    html_out.append('<html>')
    html_out.append('<head>')
    html_out.append('<meta charset="utf-8">')
    html_out.append('<title>Cocos Creator | HexaSort</title>')
    html_out.append('<meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1,minimum-scale=1,maximum-scale=1,minimal-ui=true"/>')
    html_out.append('<meta name="apple-mobile-web-app-capable" content="yes">')
    html_out.append('<meta name="mobile-web-app-capable" content="yes">')
    html_out.append('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">')
    html_out.append('<meta name="format-detection" content="telephone=no">')
    html_out.append('<meta name="renderer" content="webkit"/>')
    html_out.append('<meta name="force-rendering" content="webkit"/>')
    html_out.append('<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>')
    html_out.append('<meta name="msapplication-tap-highlight" content="no">')
    html_out.append('<meta name="full-screen" content="yes"/>')
    html_out.append('<meta name="x5-fullscreen" content="true"/>')
    html_out.append('<meta name="360-fullscreen" content="true"/>')
    html_out.append('<meta name="x5-page-mode" content="app">')
    html_out.append('<style>' + style_css + '</style>')
    html_out.append('</head>')
    html_out.append('<body>')
    html_out.append('<div id="GameDiv" cc_exact_fit_screen="true"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" oncontextmenu="event.preventDefault()" tabindex="99"></canvas></div></div>')
    html_out.append(fetch_patch)
    html_out.extend(loader_scripts_html)
    html_out.append('<script type="systemjs-importmap">' + import_map_json + '</script>')
    html_out.extend(module_scripts_html)
    html_out.append("<script>System.import('./index.js').catch(function(err) { console.error(err); })</script>")
    html_out.append('</body>')
    html_out.append('</html>')

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(html_out))

    total_size = os.path.getsize(OUT_FILE)
    print(f"Wrote {OUT_FILE}")
    print(f"Module files inlined: {len(module_files)}")
    print(f"Raw asset files embedded: {len(raw_files)} ({total_raw:,} bytes raw)")
    print(f"Final file size: {total_size:,} bytes ({total_size/1024/1024:.2f} MB)")


if __name__ == '__main__':
    main()
