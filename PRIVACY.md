# Polityka prywatności — Apex IG Unfollowers

Wydawca: **Konrad Woźniak**
Kontakt w sprawie prywatności: **support@apexsoftware.app**
Ostatnia aktualizacja: **13 listopada 2026** (wersja 1.1.0)

Dokument opisuje Apex IG Unfollowers w wersji 1.1.0. Jedynym celem wtyczki jest pokazanie użytkownikowi relacji obserwowania na jego własnym koncie Instagram (kto go nie obserwuje, kogo on nie obserwuje i kto przestał go obserwować) oraz umożliwienie mu ręcznego odobserwowania wybranych kont. Wtyczka działa w przeglądarce, nie wymaga konta i nie ma backendu ani telemetrii wydawcy.

## Jakie dane są przetwarzane

**Listy obserwujących i obserwowanych.** Po kliknięciu „Skanuj” wtyczka pobiera z instagram.com listy kont powiązanych z zalogowanym użytkownikiem. Dla każdego konta zapisuje: identyfikator, nazwę użytkownika, imię i nazwisko z profilu, adres miniatury zdjęcia profilowego oraz informację, czy konto jest zweryfikowane i prywatne.

**Identyfikator zalogowanego konta.** Wtyczka odczytuje identyfikator konta z ciasteczka `ds_user_id` na instagram.com, żeby wiedzieć, czyje listy pobrać i rozdzielić wyniki różnych kont w tej samej przeglądarce. Wtyczka nie odczytuje, nie zapisuje i nie przesyła hasła.

**Historia.** Przy każdym skanie wtyczka zapisuje datę oraz liczbę obserwujących, obserwowanych i wzajemnych obserwacji (do 400 wpisów), żeby pokazać statystyki i wykres.

**Odobserwowania.** Gdy użytkownik kliknie „Odobserwuj” i potwierdzi, wtyczka zapisuje datę, identyfikator i nazwę odobserwowanego konta (do 500 wpisów), żeby pilnować przerw i limitu dziennego. Zapisuje też czas, do którego odobserwowywanie jest wstrzymane po blokadzie akcji przez Instagram.

**Ustawienia.** Język interfejsu, tempo skanowania, limit odobserwowań, widoczność przycisku na stronie i biała lista (identyfikatory kont ukrytych przez użytkownika).

## Gdzie dane są przechowywane

Wszystkie dane zapisują się wyłącznie w lokalnej pamięci rozszerzenia (`chrome.storage.local`) w profilu przeglądarki: ostatni skan każdego konta, historia zmian (do 100 wpisów), historia liczników, rejestr odobserwowań, biała lista i ustawienia. Przycisk „Wyczyść dane” w ustawieniach panelu usuwa dane bieżącego konta. Usunięcie wtyczki usuwa wszystkie jej dane.

Eksport CSV i kopia zapasowa JSON tworzą plik na komputerze użytkownika tylko wtedy, gdy użytkownik o to poprosi. Wczytanie kopii zapasowej zapisuje jej zawartość w lokalnej pamięci rozszerzenia; plik nie jest nigdzie wysyłany.

## Przesyłanie danych

Wtyczka wysyła zapytania wyłącznie do `https://www.instagram.com`, w ramach sesji użytkownika, tymi samymi adresami, których używa strona Instagrama przy wyświetlaniu list obserwujących i przy przycisku „Przestań obserwować”. Zapytanie odobserwowania jest wysyłane tylko po dwukrotnym kliknięciu (kliknięcie i potwierdzenie) przez użytkownika, nigdy automatycznie. Instagram przetwarza te zapytania na zasadach własnej polityki prywatności.

Apex IG Unfollowers **nie przesyła** żadnych danych wydawcy ani stronom trzecim, nie zawiera analityki, reklam ani zdalnie pobieranego kodu i nie sprzedaje danych.

## Uprawnienia

- `storage`, `unlimitedStorage` – lokalny zapis wyników (duże konta mogą mieć dziesiątki tysięcy obserwujących),
- dostęp do `https://www.instagram.com/*` – wyświetlenie panelu i pobranie list z sesji użytkownika.

## Kontakt

Pytania dotyczące prywatności: support@apexsoftware.app
