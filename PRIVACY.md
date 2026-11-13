# Polityka prywatności — Apex IG Unfollowers

Wydawca: **Konrad Woźniak**
Kontakt w sprawie prywatności: **support@apexsoftware.app**
Ostatnia aktualizacja: **13 listopada 2026**

Dokument opisuje Apex IG Unfollowers w wersji 1.0.0. Jedynym celem wtyczki jest pokazanie użytkownikowi relacji obserwowania na jego własnym koncie Instagram: kto go nie obserwuje, kogo on nie obserwuje i kto przestał go obserwować. Wtyczka działa w przeglądarce, nie wymaga konta i nie ma backendu ani telemetrii wydawcy.

## Jakie dane są przetwarzane

**Listy obserwujących i obserwowanych.** Po kliknięciu „Skanuj” wtyczka pobiera z instagram.com listy kont powiązanych z zalogowanym użytkownikiem. Dla każdego konta zapisuje: identyfikator, nazwę użytkownika, imię i nazwisko z profilu, adres miniatury zdjęcia profilowego oraz informację, czy konto jest zweryfikowane i prywatne.

**Identyfikator zalogowanego konta.** Wtyczka odczytuje identyfikator konta z ciasteczka `ds_user_id` na instagram.com, żeby wiedzieć, czyje listy pobrać i rozdzielić wyniki różnych kont w tej samej przeglądarce. Wtyczka nie odczytuje, nie zapisuje i nie przesyła hasła.

**Ustawienia.** Wybrane tempo skanowania, widoczność przycisku na stronie i biała lista (identyfikatory kont ukrytych przez użytkownika).

## Gdzie dane są przechowywane

Wszystkie dane zapisują się wyłącznie w lokalnej pamięci rozszerzenia (`chrome.storage.local`) w profilu przeglądarki: ostatni skan każdego konta, historia zmian (do 100 wpisów), biała lista i ustawienia. Przycisk „Wyczyść dane” w panelu usuwa wyniki bieżącego konta. Usunięcie wtyczki usuwa wszystkie jej dane.

Eksport CSV tworzy plik na komputerze użytkownika tylko wtedy, gdy użytkownik o to poprosi.

## Przesyłanie danych

Wtyczka wysyła zapytania wyłącznie do `https://www.instagram.com`, w ramach sesji użytkownika, tymi samymi adresami, których używa strona Instagrama przy wyświetlaniu list obserwujących. Instagram przetwarza te zapytania na zasadach własnej polityki prywatności.

Apex IG Unfollowers **nie przesyła** żadnych danych wydawcy ani stronom trzecim, nie zawiera analityki, reklam ani zdalnie pobieranego kodu i nie sprzedaje danych.

## Uprawnienia

- `storage`, `unlimitedStorage` – lokalny zapis wyników (duże konta mogą mieć dziesiątki tysięcy obserwujących),
- dostęp do `https://www.instagram.com/*` – wyświetlenie panelu i pobranie list z sesji użytkownika.

## Kontakt

Pytania dotyczące prywatności: support@apexsoftware.app
