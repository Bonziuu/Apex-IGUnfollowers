# Changelog

Wszystkie istotne zmiany w Apex IG Unfollowers. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

## [1.0.0] – 2026-11-13

Pierwsza wersja testowa.

### Dodano

- Skan listy obserwujących i obserwowanych przez sesję zalogowaną na instagram.com (REST API strony www, zapasowo GraphQL).
- Zakładki: **Nie obserwują Cię**, **Ty nie obserwujesz**, **Wzajemni** i **Zmiany** (kto odszedł i kto doszedł od poprzedniego skanu).
- Biała lista („Ukryj”), wyszukiwarka i eksport widocznej listy do CSV.
- Tempo „bezpieczne” i „szybsze”, losowe przerwy, automatyczne czekanie po HTTP 429 i przycisk „Zatrzymaj”.
- Panel w Shadow DOM w stylu marki Apex (różowa paleta, jasny i ciemny motyw) oraz okienko na pasku przeglądarki.
- Test end-to-end na symulowanym Instagramie (`npm test`), CI i automatyczne wydania z tagów.
