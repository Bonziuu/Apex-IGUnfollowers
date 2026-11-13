# Cel, uprawnienia i deklaracje prywatności / Purpose, permissions and privacy

Opiera się na kodzie wersji 1.2.0. Formularze sklepów zmieniają się – sprawdź je w dniu zgłoszenia i odpowiadaj zgodnie z rzeczywistym działaniem, nie automatycznie.

## Jeden główny cel / Single purpose

**PL:** Pokazywanie użytkownikowi relacji obserwowania na jego własnym koncie Instagram (kto nie obserwuje go nawzajem i kto przestał obserwować) z możliwością ręcznego odobserwowania wybranych kont.

**EN:** Showing the user the follow relationships of their own Instagram account (who doesn't follow them back and who unfollowed them), with the option to manually unfollow selected accounts.

## Uzasadnienia uprawnień / Permission justifications

| Uprawnienie | PL | EN |
|---|---|---|
| `storage` | Lokalny zapis wyników skanów, historii, białej listy, postępu przerwanego skanu i ustawień. Wtyczka nie korzysta z `storage.sync`. | Stores scan results, history, whitelist, interrupted-scan progress and settings locally. The extension does not use `storage.sync`. |
| `unlimitedStorage` | Konta mogą mieć dziesiątki tysięcy obserwujących; lista z historią może przekroczyć domyślny limit 10 MB pamięci lokalnej. | Accounts can have tens of thousands of followers; the lists with history can exceed the default 10 MB local storage quota. |
| Dostęp do `https://www.instagram.com/*` | Wyświetlenie panelu na stronie Instagrama i pobranie list obserwujących i obserwowanych w ramach sesji zalogowanego użytkownika – tymi samymi zapytaniami, co strona www. Ręczne odobserwowanie po potwierdzeniu użytkownika. Brak dostępu do innych witryn. | Shows the panel on the Instagram website and downloads the followers and following lists within the logged-in user's session, using the same requests as the website. Manual unfollow after the user's confirmation. No access to other websites. |
| Skrypt tła / background script | Wyłącznie otwarcie ekranu powitalnego po instalacji. Bez zapytań sieciowych. | Only opens the welcome screen after installation. No network requests. |

## Kod zdalny / Remote code

**PL:** Nie. Wszystkie skrypty są w paczce. Wtyczka nie pobiera ani nie wykonuje kodu z zewnątrz i nie używa `eval`.

**EN:** No. All scripts are packaged. The extension does not download or execute remote code and does not use `eval`.

## Użycie danych / Data usage

Brak serwera i telemetrii nie oznacza braku dostępu do danych. Wtyczka przetwarza lokalnie:

| Dane | Zakres |
|---|---|
| Identyfikator konta Instagram użytkownika | z ciasteczka `ds_user_id`; do rozdzielenia wyników kont |
| Listy obserwujących i obserwowanych | nazwa użytkownika, imię i nazwisko z profilu, miniatura zdjęcia, zweryfikowane/prywatne – zapis lokalny |
| Tokeny sesji instagram.com (`csrftoken`, `fb_dtsg`) | wyłącznie do zapytania odobserwowania wysyłanego do instagram.com; nie są zapisywane |
| Historia i rejestr odobserwowań | lokalnie, do statystyk, przerw i limitu dziennego |

Nic z tego nie jest przesyłane wydawcy ani stronom trzecim. Przyciski „Zgłoś problem” / „Napisz e-mail” otwierają szkic zgłoszenia lub wiadomości u użytkownika (wersja, przeglądarka, treść błędu) – wysyła go tylko użytkownik.

**Chrome Web Store, zakładka „Prywatność”:** przejrzyj wszystkie kategorie według aktualnych definicji Google. Jeżeli formularz traktuje lokalne przetwarzanie danych osobowych innych osób (nazwy i zdjęcia obserwujących) jako „zbieranie”, zaznacz odpowiednio „Dane osobowe” i/lub „Treść witryny”. Zaświadczenia, które są zgodne z działaniem wtyczki: dane nie są sprzedawane, nie są używane ani przekazywane w celach niezwiązanych z jedynym przeznaczeniem, nie służą do oceny zdolności kredytowej.
