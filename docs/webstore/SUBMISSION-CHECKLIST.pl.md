# Checklista zgłoszenia — Apex Unfollowers 1.2.0

## Przed każdym sklepem

- [ ] Repozytorium jest publiczne (link do kodu, polityki i zgłoszeń działa bez logowania).
- [ ] Strona https://apexsoftware.app/pl/unfollowers/ i polityka https://apexsoftware.app/unfollowers/privacy/ są wdrożone.
- [ ] `npm test` przechodzi, `npm run package:release` zbudował `dist/Apex-Unfollowers-1.2.0-store.zip` (manifest w głównym katalogu).
- [ ] Wtyczka sprawdzona ręcznie na prawdziwym koncie: skan, wznowienie skanu, jedno odobserwowanie, kopia zapasowa.
- [ ] Opisy z [listing-pl.md](listing-pl.md) / [listing-en.md](listing-en.md), zrzuty z `store/screenshots/<pl|en>/`, grafiki z `store/promo/`.

## Chrome Web Store

1. Konto dewelopera: https://chrome.google.com/webstore/devconsole (jednorazowa opłata rejestracyjna, weryfikacja e-maila; w UE deklaracja statusu przedsiębiorcy/nie-przedsiębiorcy zgodnie z DSA).
2. „Nowy element” → wgraj `Apex-Unfollowers-1.2.0-store.zip`.
3. **Strona w sklepie:** opis PL i EN, kategoria Społecznościowe i komunikacja, ikona 128 (`brand/apex-unfollowers-store-icon-128.png`), mała grafika 440×280, duża 1400×560, zrzuty 1280×800 (do 5).
4. **Prywatność:** jedno przeznaczenie, uzasadnienia uprawnień i kod zdalny z [permissions-and-privacy.md](permissions-and-privacy.md); URL polityki prywatności.
5. **Dystrybucja:** publiczna, wszystkie regiony (lub wybrane), bezpłatna.
6. Wyślij do sprawdzenia. Wtyczki z dostępem do konkretnej witryny i akcjami na koncie mogą być sprawdzane dłużej; odpowiadaj na pytania recenzentów zgodnie z dokumentacją.

## Firefox Add-ons (AMO)

1. Konto: https://addons.mozilla.org/developers/ (bezpłatne).
2. „Submit a New Add-on” → „On this site” (publicznie) albo „On your own” (tylko podpis, dystrybucja z GitHuba).
3. Wgraj ten sam `-store.zip`. Kod nie jest minifikowany ani budowany, więc źródła nie są wymagane osobno.
4. Opis EN/PL, kategoria Social & Communication, zrzuty, URL polityki, licencja MIT, strona wsparcia (GitHub Issues).
5. Ostrzeżenia lintera (`npx web-ext lint`) w 1.2.0: `service_worker` ignorowany przez Firefoksa (używa `scripts`) i `innerHTML` w szablonie panelu (stałe teksty z paczki) – opisz je w uwagach dla recenzenta.

## Microsoft Edge Add-ons

1. Konto Partner Center: https://partner.microsoft.com/dashboard/microsoftedge (bezpłatne).
2. Wgraj ten sam `-store.zip`, uzupełnij opisy, zrzuty, grafiki i URL polityki prywatności.

## Po publikacji

- Wpisz adresy sklepów w README i na stronie (`apexsoftware.app`).
- Każda nowa wersja: podbij `version`, opisz zmiany w `CHANGELOG.md`, wypchnij na `main` (GitHub Release powstaje sam) i wgraj nowy `-store.zip` do sklepów.
