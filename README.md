# Muvinet Proxy

Dieses Repository enthält eine Node.js/Express-App, die als **Parent-Proxy** für deine Wix-Unterseite fungiert.  
Ziel: Unter [https://muvi.com](https://muvi.com) soll die Unterseite [https://flixtake.de/muvi](https://flixtake.de/muvi) eingebettet werden, sodass es für den User wie eine eigenständige Website wirkt – inklusive **URL-Synchronisation** und **Token-Gate** (Whitelist).

---

## ✨ Features

- **iFrame-Wrapper**: `muvi.com` lädt Inhalte von `flixtake.de/muvi/...`
- **Dynamische URL-Synchronisation**: Navigation im iFrame aktualisiert die Browser-URL – und umgekehrt.
- **Token-Gate**: Zugriff auf die Wix-Unterseite `/muvi/*` ist nur mit einem gültigen, kurzlebigen Token möglich, das vom Proxy (`muvi.com`) erzeugt wird.
- **Restriktion**: Nur Pfade unter `/muvi` sind erlaubt – alles andere wird blockiert oder umgeleitet.
- **Sicherheitsmaßnahmen**: HMAC-Signaturen, kurze Token-Lebenszeit, optionale Referer-Prüfung.

---

## 📂 Repository-Struktur

```
Muvinet/
├─ package.json
├─ server.js
├─ .env.example
├─ public/
│  ├─ index.html
│  ├─ client.js
│  └─ styles.css
└─ README.md
```

---

## ⚙️ Installation & Setup

### 1. Klonen & Abhängigkeiten installieren
```bash
git clone https://github.com/<OWNER>/Muvinet.git
cd Muvinet
npm install
```

### 2. Environment konfigurieren
Kopiere `.env.example` → `.env` und passe Werte an:

```
PUBLIC_BASE_ORIGIN=https://muvi.com
SOURCE_BASE_ORIGIN=https://flixtake.de
SOURCE_BASE_PATH=/muvi
MUVI_IFRAME_GATE_SECRET=change_me_super_secret
TOKEN_TTL_SECONDS=30
PORT=3000
```

> **Wichtig:** Der Secret-Wert muss identisch im **Wix Secrets Manager** als `MUVI_IFRAME_GATE_SECRET` hinterlegt sein.

### 3. Starten
```bash
npm start
```

App läuft unter `http://localhost:3000`.

---

## 🚀 Deployment (z. B. Plesk)

1. Repository deployen oder Dateien hochladen.  
2. In Plesk → **Node.js App aktivieren**.  
   - Startup file: `server.js`  
   - Node-Version ≥ 18  
3. ENV-Variablen setzen (siehe `.env.example`).  
4. `npm install` ausführen.  
5. App starten.

---

## 🔑 Funktionsweise des Token-Gates

1. Der Proxy (`muvi.com`) generiert pro Pfad ein Token:  
   ```
   token = base64url(exp + "." + HMAC_SHA256(secret, path + "|" + exp))
   ```
   - `exp` = Ablaufzeit (jetzt + TTL in Sekunden).  
   - `secret` = gemeinsames Secret (Proxy + Wix).  

2. Das Token wird als Query-Parameter an die iFrame-URL gehängt:  
   ```
   https://flixtake.de/muvi/xyz?token=...
   ```

3. Auf der Wix-Seite prüft ein **Router** (Velo-Code), ob Token gültig ist.  
   → Ohne gültiges Token: Redirect nach `https://flixtake.de`.

---

## 🖥️ Wix Integration

Damit das Ganze funktioniert, brauchst du **zwei Bausteine in Wix**:

### A) Router (backend/routers.js)
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

  if (!fullPath.toLowerCase().startsWith('/muvi')) {
    return redirect('https://flixtake.de', { status: 302 });
  }

  const okToken = await verifyToken({ token: query.token, path: fullPath });
  if (!okToken) return redirect('https://flixtake.de', { status: 302 });

  // Optional: Referer-Check
  const referer = headers.referer || headers['referer'] || '';
  const ALLOWED_PARENT = 'muvi.com';
  if (referer && !referer.includes(ALLOWED_PARENT)) {
    // return forbidden(); // falls du streng sein willst
  }

  return ok('muvi-router-page', { someData: { path: fullPath } });
}
```

👉 Einrichtung in Wix:  
- **Secrets Manager** → Secret `MUVI_IFRAME_GATE_SECRET` anlegen.  
- **Router mit Präfix /muvi** erstellen.  
- Router-Seitenvorlage `muvi-router-page` verknüpfen.  

---

### B) Client-Snippet (Custom Code auf /muvi Seiten)
```html
<script>
(function(){
  function notifyParent(){
    try {
      var msg = {
        type:'ROUTE_CHANGE',
        path:location.pathname,
        search:location.search||'',
        hash:location.hash||''
      };
      parent.postMessage(msg, 'https://muvi.com');
    } catch(e){}
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if (!a) return;
    var u = new URL(a.href, location.origin);
    if (u.origin===location.origin && u.pathname.toLowerCase().startsWith('/muvi')) {
      setTimeout(notifyParent, 50);
    }
  }, true);

  addEventListener('popstate', notifyParent);
  addEventListener('hashchange', notifyParent);

  addEventListener('message', function(ev){
    if (ev.origin !== 'https://muvi.com') return;
    var d = ev.data||{};
    if (d.type==='PARENT_NAVIGATE' && typeof d.url==='string') {
      try {
        var t = new URL(d.url);
        if (t.origin===location.origin && t.pathname.toLowerCase().startsWith('/muvi')) {
          if (t.href!==location.href) location.href = t.href;
        }
      } catch(e){}
    }
    if (d.type==='PARENT_READY') notifyParent();
  });

  document.addEventListener('DOMContentLoaded', notifyParent);
})();
</script>
```

👉 Einfügen unter **Einstellungen → Erweitert → Benutzerdefinierter Code** (nur auf `/muvi`-Seiten aktivieren).

---

## 🛡️ Sicherheitshinweise

- **Tokens sind nur ~30 Sekunden gültig** → erschwert direkte Zugriffe.  
- **Pfadbindung**: Token ist nur für den angefragten Pfad gültig.  
- **Optionaler Referer-Check**: blockt Aufrufe außerhalb `muvi.com`.  
- **helmet CSP**: nur `self` + `https://flixtake.de` dürfen eingebettet werden.  

---

## ✅ ToDo für dich

1. Repo initialisieren (`README.md` erstellen).  
2. App lokal/Plesk starten.  
3. ENV setzen & Secrets in Wix hinterlegen.  
4. Router & Snippet in Wix einbauen.  
5. Test: `https://muvi.com/netflix/xyz` → lädt `https://flixtake.de/muvi/netflix/xyz`.

---

Fertig 🎬 – jetzt verhält sich **muvi.com** wie eine eigenständige Seite, die sicher deine Wix-Unterseite spiegelt.
