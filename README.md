# muvi-proxy

Node.js/Express-App, die als Parent-Proxy für die Wix-Unterseite `/muvi` dient.
Sie synchronisiert die Browser-URL mit der Navigation im eingebetteten iFrame und schützt die Wix-Routen über ein kurzlebiges HMAC-Token.

## 🚀 Schnellstart

```bash
npm install
npm start
```

Die App lauscht standardmäßig auf `http://localhost:3000`.

## ⚙️ Environment
Kopiere `.env.example` zu `.env` und passe ggf. Werte an:

```env
PUBLIC_BASE_ORIGIN=https://muvi.com
SOURCE_BASE_ORIGIN=https://flixtake.de
SOURCE_BASE_PATH=/muvi
MUVI_IFRAME_GATE_SECRET=change_me_super_secret
TOKEN_TTL_SECONDS=30
PORT=3000
```

`MUVI_IFRAME_GATE_SECRET` muss identisch im Wix Secrets Manager hinterlegt sein.

## 📦 Deploy auf Plesk
1. Repository deployen oder Dateien hochladen.
2. In Plesk **Node.js-App** aktivieren (Startup file: `server.js`, Node ≥18).
3. ENV-Variablen setzen (siehe `.env.example`).
4. `npm install` ausführen und App starten.

## 🔐 Token-Gate Ablauf
1. Client fragt beim Proxy `/gate/token?path=/muvi/...` an.
2. Proxy erzeugt Token:
   `token = base64url(exp + "." + HMAC_SHA256(secret, path + "|" + exp))`
3. Token wird als `?token=` Query an die iFrame-URL gehängt.
4. Wix-Router verifiziert Token, Pfad und Ablaufzeit (TTL, default 30 s).

Beispiel-iFrame-URL:
```
https://flixtake.de/muvi/netflix/titel-123?token=BASE64URL
```

> Die Wix-Seite muss einbettbar sein (kein `X-Frame-Options: DENY/SAMEORIGIN`).

## 🧩 Wix Velo Codes

### A) Router – `backend/routers.js`
```js
import { ok, redirect, forbidden } from 'wix-router';
import { hmacSha256, timingSafeEqual } from 'wix-crypto';
import { getSecret } from 'wix-secrets-backend';

function b64urlDecode(input) {
  const s = input.replace(/-/g,'+').replace(/_/g,'/');
  return Buffer.from(s + '==='.slice((s.length + 3) % 4), 'base64').toString();
}

async function verifyToken({ token, path }) {
  if (!token) return false;
  let payload; try { payload = b64urlDecode(token); } catch(_) { return false; }
  const [expStr, sigHex] = payload.split('.');
  const exp = parseInt(expStr, 10);
  const now = Math.floor(Date.now()/1000);
  if (!exp || now > exp) return false;

  const SECRET = await getSecret('MUVI_IFRAME_GATE_SECRET');
  const data = `${path}|${exp}`;
  const calc = await hmacSha256(SECRET, data);
  return timingSafeEqual(Buffer.from(calc,'hex'), Buffer.from(sigHex,'hex'));
}

export async function muvi_Router(request) {
  const { path, query, headers } = request;
  const fullPath = '/' + path.join('/');
  const token = query.token;
  const referer = headers.referer || headers['referer'] || '';

  // nur /muvi erlauben
  if (!fullPath.toLowerCase().startsWith('/muvi')) {
    return redirect('https://flixtake.de', { status: 302 });
  }

  const okToken = await verifyToken({ token, path: fullPath });
  if (!okToken) return redirect('https://flixtake.de', { status: 302 });

  // optionaler Referer-Check auf muvi.com
  const ALLOWED_PARENT = 'muvi.com';
  if (referer && !referer.includes(ALLOWED_PARENT)) {
    // return forbidden(); // strenger
  }

  return ok('muvi-router-page', { someData: { path: fullPath } });
}
```

### B) Client-Snippet – URL-Sync
**Einstellungen → Erweitert → Benutzerdefinierter Code** (nur auf Seiten unter `/muvi`).

```html
<script>
(function(){
  function notifyParent() {
    try {
      var msg = {
        type: 'ROUTE_CHANGE',
        path: window.location.pathname,
        search: window.location.search || '',
        hash: window.location.hash || ''
      };
      // Parent ist https://muvi.com
      window.parent.postMessage(msg, 'https://muvi.com');
    } catch(e){}
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if (!a) return;
    var url = new URL(a.href, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.toLowerCase().startsWith('/muvi')) {
      setTimeout(notifyParent, 50);
    }
  }, true);

  window.addEventListener('popstate', notifyParent);
  window.addEventListener('hashchange', notifyParent);

  window.addEventListener('message', function(event){
    if (event.origin !== 'https://muvi.com') return;
    var data = event.data || {};
    if (data.type === 'PARENT_NAVIGATE' && typeof data.url === 'string') {
      try {
        var target = new URL(data.url);
        if (target.origin === window.location.origin && target.pathname.toLowerCase().startsWith('/muvi')) {
          if (target.href !== window.location.href) window.location.href = target.href;
        }
      } catch(e){}
    }
    if (data.type === 'PARENT_READY') notifyParent();
  });

  document.addEventListener('DOMContentLoaded', notifyParent);
})();
</script>
```

codex/create-complete-muvi-proxy-repository
## 🛡️ Security
- Nur Pfade unter `/muvi` erlaubt.
- Token TTL 30 s, pfadspezifische Signatur.
- Optionaler Referer-Check auf `muvi.com` (leerer Referer erlaubt).
- CSP: `frame-src` nur `self` und `https://flixtake.de`.
- =======
👉 Einfügen unter **Einstellungen → Erweitert → Benutzerdefinierter Code** (nur auf `/muvi`-Seiten aktivieren).

---

## 🛡️ Sicherheitshinweise

- **Tokens sind nur ~30 Sekunden gültig** → erschwert direkte Zugriffe.  
- **Pfadbindung**: Token ist nur für den angefragten Pfad gültig.  
- **Optionaler Referer-Check**: blockt Aufrufe außerhalb `muvi.com`.  
- **helmet CSP**: nur `self` + `https://flixtake.de` dürfen eingebettet werden.  
 main

