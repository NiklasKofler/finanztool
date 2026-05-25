# Finanzperformance App

Erste App-Schicht für das persönliche Finanzperformance-Tool. Die App ist als Firebase-fähige React/Vite-Anwendung angelegt und läuft lokal auch ohne Firebase-Konfiguration.

## Start

```bash
npm install
npm run dev
```

## Firebase konfigurieren

1. `.env.example` nach `.env.local` kopieren.
2. Werte aus der Firebase-Web-App eintragen.
3. App neu starten.

Benötigte Variablen:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## MVP-Fokus

- Broker- und Anbieter-Exporte unverändert archivieren.
- Parser zuerst in ein Staging-Modell schreiben lassen.
- Validierung und Duplikaterkennung vor jedem Firestore-Commit.
- Snapshots aus Brokern gegen berechnete Bestände abgleichen.
- Trade Republic bewusst als E-Mail-gestützten Import behandeln, weil der Export am iPhone startet.
