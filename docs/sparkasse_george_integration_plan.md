# Bankkonten / Enable Banking Integration

Stand: 2026-06-26

Hinweis: Dieser Plan begann als Sparkasse-George-Integration. Seit
2026-06-26 ist die technische Quelle generisch `bank_accounts`, damit
Erste/Sparkasse, Revolut, bank99 und spaetere Bankkonten gleich behandelt
werden.

## Entscheidung

Bankkonten werden als read-only Bankquelle integriert.

Technischer Zielweg:

- Anbieter: Enable Banking
- Zugriff: nur Kontoinformationen, keine Zahlungen
- Umfang Phase 1: Konten und aktuelle Salden
- Umfang Phase 2: Umsaetze als `ledgerEntries`
- Umfang Phase 3: Gebuehren, Zinsen und Umbuchungen klassifizieren

Bank-Weboberflaechen werden nicht gescrapt. Der Zugriff laeuft ueber Open
Banking/PSD2 mit ausdruecklicher Freigabe durch den Nutzer.

## Warum nicht George-Scraping

- Bankoberflaechen sind sicherheitskritisch und aendern sich.
- Login, 2FA und Session-Verhalten sind fuer stabile Automation ungeeignet.
- Read-only Open Banking ist fachlich sauberer und auditierbarer.
- Die App muss klar anzeigen, wann der Bankstand von der Bank/API kommt und
  wann nur der Agent zuletzt gelaufen ist.

## Erwartete Kosten

Ziel ist die kostenlose Nutzung fuer eigene verknuepfte Konten. Enable Banking
beschreibt eigenen/limitierten Zugriff fuer verknuepfte Konten als geeigneten
Startpunkt; kommerzielle oder oeffentliche Nutzung kann kostenpflichtig sein.

Vor produktiver Einrichtung muss im Enable-Banking-Konto geprueft werden:

- ob der eigene Use Case kostenlos bleibt
- ob alle Sparkasse/Erste-Konten sichtbar sind
- wie lange der Consent gueltig ist
- ob Balances und Transactions fuer die gewaehlten Konten erlaubt sind

## Firestore-Zielmodell

### `sourceSummaries/bank_accounts`

Gesamtstand aller angebundenen Bankkonten.

Wichtige Felder:

- `displayName`: `Bankkonten`
- `source`: `bank_accounts`
- `currentValue` / `netValue`: Summe der echten Kontosalden
- `cashValue`: identisch oder Summe liquider Konten
- `availableWithCredit`: Summe der verfuegbaren Betraege inkl. Kreditlinien
- `creditLineEstimate`: erkannte Kreditlinien, zaehlen nicht als Vermoegen
- `sourceDataUpdatedAt`: fachlicher Bankdatenstand
- `sourceDataProvider`: `enable_banking`
- `lastAgentRunAt`
- `lastAgentSuccessAt`
- `agentStatus`
- `consentExpiresAt`
- `accounts`: kompakte Kontoanzeige mit `bankName`, `label`,
  `currentValue`, `availableWithCredit`, `creditLineEstimate`

### `sourceAccounts`

Ein Eintrag je Bankkonto.

Wichtige Felder:

- `source`: `bank_accounts`
- `accountId`: stabile Enable-Banking Account UID
- `label`: Anzeigename aus Bank/API oder manuell vergebener Name
- `accountType`: `checking`, `savings`, `card`, `unknown`
- `currency`
- `status`: `ACTIVE`, `MISSING`, `CLOSED`
- `lastSeenAt`

### `sourcePositions`

Eine Cash-Position je Konto.

Wichtige Felder:

- `source`: `bank_accounts`
- `accountId`
- `name`: Kontoname
- `category`: `cash`
- `currency`: `EUR`
- `currentValue`: aktueller Saldo
- `accountValueIncluded`: true
- `sourceDataProvider`: `enable_banking`
- `sourceDataUpdatedAt`
- `updatedAt`

### `ledgerEntries`

Ab Phase 2: ein idempotenter Eintrag je Bankumsatz.

Wichtige Dedupe-Felder:

- Enable-Banking Transaction ID, falls vorhanden
- sonst Hash aus Konto, Buchungsdatum, Valutadatum, Betrag, Waehrung,
  Beschreibung und Gegenpartei

### `costEvents` und `incomeEvents`

Ab Phase 3:

- Kontofuehrungsgebuehren, Kartenentgelte und sonstige Bankkosten als
  `costEvents`
- Habenzinsen, Cashback oder Bankboni als `incomeEvents`

## Agent-Design

Agent-ID:

- `bank_accounts`

Aufgaben:

1. Consent/Session lokal pruefen.
2. Konten abrufen.
3. Balances abrufen.
4. Firestore `sourceAccounts`, `sourcePositions` und
   `sourceSummaries/bank_accounts` schreiben.
5. Health-Warnung schreiben, wenn Consent abgelaufen ist oder ein Konto fehlt.
6. bank99 maximal 4-mal pro Kalendertag abrufen.

Geplanter Rhythmus:

- taeglich morgens, z. B. 06:20
- zusaetzlich ueber `Alles aktualisieren`

Kein 5-Minuten-Polling. Bankdaten brauchen keine Hochfrequenz und Consent/API
sollen nicht unnoetig belastet werden.

## GUI-Regeln

Die Bankkonten-Karte zeigt:

- Geldstand: echter aktueller Kontostand, zaehlt zum Vermoegen
- Verfuegbar: Betrag inkl. Kreditlinie, zaehlt nicht zusaetzlich zum Vermoegen
- Kreditlinie: erkannte Differenz zwischen verfuegbar und echtem Kontostand
- einzelne Konten ausklappbar
- letzte Umsaetze je Konto aus `ledgerEntries`
- `Bankstand`: fachlicher Datenstand von Enable Banking/Bank
- Agentstatus: letzter technischer Agentlauf, Ergebnis und Warnungen

Kreditkarten oder negative Salden duerfen nicht als Depotwert erscheinen,
sondern muessen als Verbindlichkeit/negativer Cashbestand erkennbar sein.

## Schrittfolge

1. Entscheidung und Datenvertrag dokumentieren.
2. Enable-Banking-Konto/App fuer read-only Account Information einrichten.
3. Redirect/Consent lokal testen und erste Session erzeugen. Erledigt.
4. Konten und Balances im Dry-Run ausgeben, noch nichts nach Firestore
   schreiben. Erledigt.
5. Mapping der Konten festlegen. Phase 1 erledigt:
   - Girokonto
   - Sparkonto
   - Kreditkarte, falls ueber diesen Weg sichtbar
6. Firestore-Schreibpfad fuer `sourceAccounts`, `sourcePositions` und
   `sourceSummaries/bank_accounts` implementieren. Erledigt fuer Balances.
7. Health-Warnungen fuer Consent-Ablauf, fehlende Konten und API-Fehler
   implementieren. Teilweise erledigt fuer Agentstatus und Stale-Warnung.
8. Umsaetze als `ledgerEntries` ergaenzen. Erledigt fuer vorhandene
   Erste/Sparkasse-Session.

## Aktueller Setup-Stand

Stand 2026-06-26:

- Projektentscheidung, Datenvertrag und App-Fallbackquelle sind angelegt.
- Enable-Banking-Production-App ist erstellt:
  `5df43790-b2b4-4920-987e-df41f7393250`
- Status im Enable-Banking-Control-Panel: `Active`
- Service: `Account Information`, eingeschraenkt auf verlinkte eigene Konten
  (`Restricted`)
- Verlinkte Konten laut Control Panel:
  - Erste Bank/Sparkasse, IBAN endet auf `1132`
  - Revolut, IBAN endet auf `943`
  - bank99, IBAN endet auf `0810`
- Fuer jede Bank braucht der lokale Agent eine eigene gespeicherte
  Enable-Banking-Session. Bisher ist die Erste/Sparkasse-Session vorhanden.
- bank99 wird lokal auf maximal 4 Abrufe pro Tag begrenzt.
- Redirect URLs:
  - `https://finanzperformance-tool.web.app/open-banking/callback`
  - `https://finanzperformance-tool.firebaseapp.com/open-banking/callback`
- Private Key:
  - lokale Datei, nicht versioniert:
    `/Users/niklaskofler/Documents/finanztool/secrets/enable-banking/5df43790-b2b4-4920-987e-df41f7393250.pem`
  - macOS-Schluesselbund-Service:
    `finanztool.enablebanking.privateKey.5df43790-b2b4-4920-987e-df41f7393250`
- App-ID im macOS-Schluesselbund:
  `finanztool.enablebanking.applicationId`
- Erster erfolgreicher Firestore-Import:
  - bisher historisch `sourceSummaries/sparkasse_george`
  - neuer Zielstand `sourceSummaries/bank_accounts`
  - `sourcePositions/bank_accounts_<bank>_<account_uid>`
  - `sourceAccounts/bank_accounts_<bank>_<account_uid>`
  - `agentStatus/bank_accounts`
- Aktueller Kontostand wird als Cash/Netto-Wert gespeichert.
- Wenn Enable Banking zusaetzlich einen hoeheren verfuegbaren Betrag liefert,
  wird dieser als `availableWithCredit` gespeichert; die Differenz wird als
  `creditLineEstimate` behandelt und nicht als Vermoegen gezaehlt.
- Umsaetze werden idempotent als `ledgerEntries` geschrieben.
- Der Initialbestand ist vorhanden. Der normale Sync liest inkrementell je Konto
  ab letztem gespeicherten Umsatz minus 2 Tage Sicherheitsfenster.
- Der Backfill-Befehl `npm run sync:bank-accounts:backfill` liest 180 Tage.
- `transactionCount` zeigt die insgesamt gespeicherte Historie je Konto; der
  aktuelle Lauf wird separat ueber neue und doppelte Umsaetze dokumentiert.
- Bankkosten/Steuern werden als `costEvents`, Zinsen/Bonus/Cashback als
  `incomeEvents` gespeichert, sofern sie im Umsatztext eindeutig erkannt
  werden.
- Naechster praktischer Schritt: separate Enable-Banking-Sessions fuer Revolut
  und bank99 erzeugen.

## Enable-Banking-Klickpfad

1. Enable Banking Control Panel oeffnen.
2. Neue Application erstellen.
3. Name:
   `Finanztool Sparkasse George`
4. Zugriff nur fuer Account Information / AIS / read-only auswaehlen.
   Keine Payments/PIS aktivieren.
5. Redirect URLs eintragen:
   - `https://finanzperformance-tool.web.app/open-banking/callback`
   - `https://finanzperformance-tool.firebaseapp.com/open-banking/callback`
6. Application speichern.
7. `.pem` private-key-Datei herunterladen und lokal sicher ablegen.
8. Application ID notieren.
9. Danach lokalen Dry-Run ausfuehren und erst bei plausiblen Zahlen mit
   `--write` nach Firestore schreiben.

## Offene Fragen vor Umsetzung

- Welche Sparkasse-/George-Konten sollen einbezogen werden?
- Sind Kreditkarten ueber denselben PSD2-Zugriff sichtbar oder brauchen sie
  eigene Integrationen?
- Wie lange ist der Enable-Banking-Consent fuer die Sparkasse in der Praxis
  gueltig?
- Welche Konten sollen im Gesamtvermoegen zaehlen und welche nur informativ
  sichtbar sein?
