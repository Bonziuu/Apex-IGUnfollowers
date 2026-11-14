# Changelog

Wszystkie istotne zmiany w Apex Unfollowers dla Instagrama (do wersji 1.1.2: Apex IG Unfollowers). Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

## [1.2.1] – 2026-11-14

Poprawki bezpieczeństwa i prywatności po przeglądzie kodu.

### Bezpieczeństwo

- **Eksport CSV odporny na formuły („CSV injection”).** Wartości zaczynające się od `=`, `+`, `-`, `@`, tabulatora lub CR (także ich pełnoszerokich odpowiedników) dostają apostrof na początku, więc Excel, Google Sheets i LibreOffice pokażą je jako tekst. Znaki sterujące są usuwane.
- **Pełna walidacja kopii zapasowej przed wczytaniem.** Limit 64 MB na plik, maks. 20 kont i 250 000 kont na liście; sprawdzane są typy, identyfikatory, nazwy użytkowników, daty, liczniki i długości wszystkich list. Nieznane pola są pomijane, zdjęcia profilowe spoza serwerów Instagrama usuwane. Kopia jest zapisywana jednym zapisem dopiero po sprawdzeniu całości – wadliwy plik niczego nie zmienia.
- **Działania wykonuje tylko użytkownik.** Odobserwowanie, skan, biała lista, usuwanie danych, import/eksport, zgłoszenie problemu, akceptacja ekranu powitalnego i zmiana limitów reagują wyłącznie na prawdziwe kliknięcia (`event.isTrusted`). Kliknięcia wywołane skryptem strony są ignorowane.

### Prywatność

- **Po wylogowaniu z Instagrama panel nie pokazuje wyników poprzedniego konta.** Wcześniej wtyczka sięgała wtedy po ostatnio używane konto. Dane zostają w pamięci wtyczki i wracają po zalogowaniu na to samo konto.

### Testy

- Testy jednostkowe CSV i walidacji kopii (`tests/security.test.mjs`) oraz testy panelu: kliknięcia ze skryptu strony i stan po wylogowaniu. CI sprawdza składnię wszystkich plików JS i pliki wskazane w manifeście.

## [1.2.0] – 2026-11-13

Wersja przygotowana do publikacji w sklepach.

### Zmieniono

- **Nowa nazwa: Apex Unfollowers dla Instagrama / for Instagram** (wcześniej Apex IG Unfollowers). Paczka nazywa się `Apex-Unfollowers.zip`, a folder w niej `Apex-Unfollowers`. Dane z 1.1.x zostają, kopie zapasowe z 1.1.x można wczytać.
- Kod panelu podzielony na moduły `content/core.js`, `net.js`, `actions.js`, `ui.js`, `views.js`, `main.js` (zamiast jednego pliku ok. 1600 linii).
- Polityka prywatności po angielsku i po polsku.
- Minimalna wersja Firefoksa: 142.

### Dodano

- **Ekran powitalny** po instalacji (osobna karta) i w panelu przy pierwszym uruchomieniu: jak zacząć, zasady bezpieczeństwa konta i akceptacja ryzyka przed pierwszym skanem; autor i kontakt.
- **Zgłoś problem**: przycisk przy każdym błędzie i w ustawieniach – gotowe zgłoszenie na GitHubie (szablon z wersją, przeglądarką i treścią błędu, bez nazw kont) albo e-mail do autora. Szablony zgłoszeń w repozytorium.
- **Wznawianie skanu**: postęp zapisuje się w trakcie (co ok. 20 s i przy przerwaniu); „Wznów skan” dokańcza pracę bez ponownego pobierania gotowej listy, „Zacznij od nowa” startuje od zera. Punkt wznowienia jest ważny 12 h.
- **Szacowany pozostały czas** skanu na pasku postępu.
- **Ustawienia → O wtyczce**: autor (Konrad Woźniak), e-mail, LinkedIn, apexsoftware.app, zgłaszanie problemów i ponowne otwarcie ekranu powitalnego.
- Materiały do sklepów: opisy PL/EN, uzasadnienia uprawnień, deklaracje prywatności, zrzuty 1280×800 i grafiki promocyjne (`docs/webstore/`, `store/`).

## [1.1.2] – 2026-11-13

Dostosowanie do zmiany w kliencie www Instagrama z listopada 2026.

### Naprawiono

- **Odobserwuj** działa jak przycisk na instagram.com: wysyła tokeny sesji strony (`fb_dtsg`, `jazoest`) i nagłówki klienta www (`X-IG-WWW-Claim`, `X-ASBD-ID`, `X-Web-Session-ID`, `X-Instagram-AJAX`). Bez nich Instagram odpowiadał stroną HTML z kodem 200. Sukces jest liczony dopiero po potwierdzeniu (`friendship_status` albo wyszukanie konta na liście obserwowanych). Usunięto nieistniejący już adres `/web/friendships/…/unfollow/`.
- **Osoby, które obserwujesz, w „Ty nie obserwujesz”**: konta są dopasowywane po `pk_id`, `pk` i nazwie użytkownika, bo Instagram w różnych listach podaje ID w różnej postaci.
- Odpowiedź HTML z kodem 200 podczas skanu jest traktowana jak chwilowe przyhamowanie (czekanie i ponowienie), a nie błąd przerywający skan.

### Usunięto

- Zapasowe pobieranie list przez stary GraphQL (`query_hash`) – Instagram zwraca tam dziś puste listy bez błędu.

## [1.1.1] – 2026-11-13

Poprawki po pierwszych testach na prawdziwym koncie.

### Naprawiono

- **Odobserwuj zgłaszało błąd „HTTP 200”**, gdy Instagram odpowiadał bez JSON-a. Wtyczka wysyła teraz nagłówki jak strona www (`x-ig-www-claim`, `x-asbd-id`), a przy niejasnej odpowiedzi sprawdza faktyczny stan obserwowania (`friendships/show`) i w razie potrzeby próbuje starszego adresu. Komunikat błędu pokazuje, co odpowiedział Instagram.
- **Niepełna lista obserwowanych** powodowała, że w zakładce „Ty nie obserwujesz” pojawiały się osoby, które obserwujesz. Wtyczka porównuje wynik z licznikiem profilu i, gdy brakuje kont, dociąga listę dwiema innymi metodami i łączy wyniki. Jeśli nadal brakuje, pokazuje ostrzeżenie zamiast cicho błędnych list.
- Liczniki i nazwa konta są odczytywane zapasowo z `web_profile_info`, gdy `users/{id}/info` nie działa (brak `@nazwy` w nagłówku panelu).

### Zmieniono

- Przerwa 15 s obowiązuje po każdej próbie odobserwowania, także nieudanej.
- Gdy lista obserwujących jest niepełna, skan nie zapisuje „Zmian”, żeby nie pokazać fałszywie, że ktoś odszedł.

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
