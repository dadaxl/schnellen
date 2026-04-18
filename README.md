# Schnellen – Online Multiplayer

Das Tiroler Kartenspiel als Echtzeit-Browserspiel mit Firebase Realtime Database.

## Tech Stack

- **Frontend**: React + Vite
- **State**: Zustand (lokal) + Firebase Realtime DB (live)
- **Hosting**: Eigener VPS mit Nginx

---

## 1. Firebase einrichten

1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com)
2. Neues Projekt erstellen (z.B. `schnellen-spiel`)
3. **Realtime Database** aktivieren:
   - Build → Realtime Database → Create Database
   - Region: `europe-west1` (empfohlen für AT/DE)
   - Regeln für Entwicklung: Start in **test mode**
4. **Web-App hinzufügen**:
   - Projekteinstellungen (⚙️) → Deine Apps → Web (</>) 
   - App-Name eingeben → Registrieren
   - Die angezeigte `firebaseConfig` brauchst du im nächsten Schritt

---

## 2. Lokale Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# .env Datei anlegen
cp .env.example .env
# Dann .env öffnen und Firebase-Werte eintragen

# Entwicklungsserver starten
npm run dev
# → http://localhost:5173
```

---

## 3. Deployment auf VPS

### Build erstellen
```bash
npm run build
# Erzeugt den dist/ Ordner
```

### Auf Server hochladen
```bash
# Erstmalig:
ssh user@dein-server "mkdir -p /var/www/schnellen"

# Dateien übertragen:
rsync -avz dist/ user@dein-server:/var/www/schnellen/dist/
```

### Nginx konfigurieren
```bash
# Nginx-Konfiguration kopieren
scp nginx.conf user@dein-server:/etc/nginx/sites-available/schnellen

# Aktivieren
ssh user@dein-server "
  ln -sf /etc/nginx/sites-available/schnellen /etc/nginx/sites-enabled/ &&
  nginx -t &&
  systemctl reload nginx
"
```

### HTTPS mit Let's Encrypt (empfohlen)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d deine-domain.com
```

---

## 4. Firebase Security Rules

Für Produktion die `firebase-rules.json` in der Firebase Console eintragen:
- Realtime Database → Rules → Inhalt aus `firebase-rules.json` einfügen

---

## Spielregeln (Kurzform)

- **Ziel**: Als Erster von 15 auf 0 Punkte kommen
- **Karten**: 33 Karten (7–As je Farbe + Weli)
- **Trumpf**: Aufgedeckte Karte des Gebers bestimmt Trumpf
- **Weli**: Immer zweithöchster Trumpf (nach Trumpf-As)
- **Stiche**: Jeder Stich = −1 Punkt; Kein Stich = +5 (Schnellen!)
- **Aussteigen**: Möglich wenn >5 Punkte → +1 Punkt, kein Risiko
- **Farbzwang**: Man muss Farbe bekennen; höher stechen wenn möglich

---

## Projektstruktur

```
schnellen/
├── src/
│   ├── lib/
│   │   ├── firebase.js      # Firebase-Initialisierung
│   │   ├── gameLogic.js     # Reine Spiellogik (keine Side Effects)
│   │   ├── gameActions.js   # Firebase-Schreiboperationen
│   │   └── store.js         # Zustand-Store + Firebase-Listener
│   ├── components/
│   │   ├── Lobby.jsx        # Raum erstellen/beitreten
│   │   ├── GameBoard.jsx    # Spielfeld
│   │   └── Card.jsx         # Karten-Komponente
│   ├── styles/global.css
│   ├── App.jsx
│   └── main.jsx
├── .env.example
├── firebase-rules.json
├── nginx.conf
└── vite.config.js
```
