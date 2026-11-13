# Changelog

Wszystkie istotne zmiany w Apex IG Unfollowers. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

## [1.1.0] – 2026-11-13

### Dodano

- **Odobserwuj** przy kontach, które obserwujesz: potwierdzenie drugim kliknięciem, 15 s przerwy między akcjami, limit dzienny (10–100, domyślnie 30 w ciągu 24 h). Po blokadzie akcji przez Instagram („feedback_required”) odobserwowywanie jest wstrzymywane na 6 h, po HTTP 429 na 1 h.
- **Filtry i sortowanie**: zweryfikowane, prywatne, publiczne, bez zdjęcia profilowego; od najnowszych, A–Z, Z–A.
- **Statystyki**: liczniki ze zmianą od poprzedniego skanu, bilans 7 i 30 dni, wykres obserwujących w czasie (z podpowiedzią po najechaniu) i tabela historii skanów.
- **Interfejs PL / EN**: język wg przeglądarki albo wybrany w ustawieniach; nazwa i opis wtyczki w `_locales`.
- **Ustawienia** w panelu: język, limit odobserwowań, widoczność przycisku na stronie, kopia zapasowa, czyszczenie danych.
- **Kopia zapasowa**: zapis i wczytanie wyników, historii, białej listy i ustawień w pliku JSON.

### Zmieniono

- Panel jest szerszy (440 px), a „Ukryj przycisk” i „Wyczyść dane” przeniesiono do ustawień.
- Historia liczników jest zapisywana przy każdym skanie; dla danych z 1.0.0 zaczyna się od ostatniego skanu.

## [1.0.0] – 2026-11-13

Pierwsza wersja testowa.

### Dodano

- Skan listy obserwujących i obserwowanych przez sesję zalogowaną na instagram.com (REST API strony www, zapasowo GraphQL).
- Zakładki: **Nie obserwują Cię**, **Ty nie obserwujesz**, **Wzajemni** i **Zmiany** (kto odszedł i kto doszedł od poprzedniego skanu).
- Biała lista („Ukryj”), wyszukiwarka i eksport widocznej listy do CSV.
- Tempo „bezpieczne” i „szybsze”, losowe przerwy, automatyczne czekanie po HTTP 429 i przycisk „Zatrzymaj”.
- Panel w Shadow DOM w stylu marki Apex (różowa paleta, jasny i ciemny motyw) oraz okienko na pasku przeglądarki.
- Test end-to-end na symulowanym Instagramie (`npm test`), CI i automatyczne wydania z tagów.
