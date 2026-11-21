# Checklista zgłoszenia — Apex Unfollowers

## Przed każdym sklepem

- [ ] Repozytorium jest publiczne (link do kodu, polityki i zgłoszeń działa bez logowania).
- [ ] Strona https://apexsoftware.app/pl/unfollowers/ i polityka https://apexsoftware.app/unfollowers/privacy/ są wdrożone.
- [ ] `npm test` i `npm run validate:locales` przechodzą. `npm run package:release` zbudował `dist/Apex-Unfollowers-<wersja>-store.zip` z manifestem w katalogu głównym.
- [ ] Wtyczka sprawdzona ręcznie na prawdziwym koncie: skan, wznowienie skanu, jedno odobserwowanie, kopia zapasowa.
- [ ] Opisy i teksty na zrzuty z [docs/chrome-web-store](../chrome-web-store/README.md), grafiki z `store/screenshots/` i `store/promo/`.

## Chrome Web Store

1. Konto dewelopera: https://chrome.google.com/webstore/devconsole (jednorazowa opłata rejestracyjna, weryfikacja e-maila; w UE deklaracja statusu przedsiębiorcy/nie-przedsiębiorcy zgodnie z DSA).
2. Otwórz istniejącą pozycję Apex Unfollowers i wgraj `Apex-Unfollowers-<wersja>-store.zip` jako aktualizację.
3. **Strona w sklepie:** dodaj pełne opisy w 20 językach, zachowaj kategorię i uzupełnij grafiki we właściwych wariantach. [Instrukcja publikowania opisów](../chrome-web-store/README.md)
4. **Prywatność:** jedno przeznaczenie, uzasadnienia uprawnień i kod zdalny z [permissions-and-privacy.md](permissions-and-privacy.md); URL polityki prywatności.
5. **Dystrybucja:** publiczna, wszystkie regiony (lub wybrane), bezpłatna.
6. Wyślij do sprawdzenia. Wtyczki z dostępem do konkretnej witryny i akcjami na koncie mogą być sprawdzane dłużej; odpowiadaj na pytania recenzentów zgodnie z dokumentacją.

## Microsoft Edge Add-ons

1. Konto Partner Center: https://partner.microsoft.com/dashboard/microsoftedge (bezpłatne).
2. Wgraj ten sam `-store.zip`, uzupełnij opisy, zrzuty, grafiki i URL polityki prywatności.

## Po publikacji

- Wpisz adresy sklepów w README i na stronie (`apexsoftware.app`).
- Każda nowa wersja: podbij `version`, opisz zmiany w `CHANGELOG.md`, wypchnij na `main` (GitHub Release powstaje sam) i wgraj nowy `-store.zip` do sklepów.
