# Privacy Policy — Apex Unfollowers for Instagram

Publisher: **Konrad Woźniak**
Privacy contact: **support@apexsoftware.app**
Last updated: **13 November 2026** (version 1.2.0)

[Polska wersja poniżej ↓](#pl)

Apex Unfollowers for Instagram ("the extension") has one purpose: to show the user the follow relationships of their own Instagram account (who does not follow them back, whom they do not follow and who stopped following them) and to let them manually unfollow selected accounts. It runs in the browser, requires no account and has no publisher backend or telemetry.

## Data the extension processes

**Followers and following lists.** When the user clicks "Scan", the extension downloads from instagram.com the lists of accounts connected to the logged-in user. For each account it stores: ID, username, profile full name, profile picture thumbnail URL and whether the account is verified or private.

**Logged-in account ID.** The extension reads the account ID from the `ds_user_id` cookie on instagram.com to know whose lists to download and to keep results of different accounts apart. It never reads, stores or transmits the password. For unfollowing it also reads session tokens from the instagram.com page (`csrftoken`, `fb_dtsg`) and sends them only to instagram.com, exactly as the Instagram website does.

**History.** After each scan it stores the date and the number of followers, following and mutual follows (up to 400 entries) for statistics and the chart, and the list of accounts that left or joined since the previous scan (up to 100 entries).

**Unfollows.** When the user clicks "Unfollow" and confirms, the extension stores the date, ID and username of the unfollowed account (up to 500 entries) to enforce breaks and the daily limit, and the time until which unfollowing is paused after Instagram blocks an action.

**Scan progress.** While a scan runs, the extension periodically stores the progress (the accounts downloaded so far and Instagram's page cursor) so an interrupted scan can be resumed. The progress is removed when the scan finishes and is ignored after 12 hours.

**Settings.** Interface language, scan speed, unfollow limit, visibility of the on-page button, whitelist (IDs of accounts hidden by the user) and whether the welcome screen was accepted.

## Where data is stored

All data is stored only in the extension's local storage (`chrome.storage.local`) in the browser profile. "Clear data" in the panel settings deletes the current account's data. Removing the extension deletes all of its data. The extension does not use `storage.sync`.

CSV export and the JSON backup create a file on the user's computer only when the user asks for it. Restoring a backup writes its contents to the extension's local storage; the file is not sent anywhere.

## Data transfer

The extension sends requests only to `https://www.instagram.com`, within the user's session, using the same addresses the Instagram website uses to show followers lists and for its "Unfollow" button. An unfollow request is sent only after the user clicks twice (click and confirmation), never automatically. Instagram processes these requests under its own privacy policy.

The background script only opens the welcome screen after installation or on request from the panel. It makes no network requests.

**Reporting a problem.** The "Report a problem" and "Send an e-mail" buttons open a pre-filled GitHub issue or an e-mail draft in the user's own browser or mail app. They contain the extension version, browser name and version, interface language and the text of the last error – no account names or lists. Nothing is sent until the user submits the issue or e-mail. If the user does so, GitHub or the e-mail recipient receives the content and the sender's data, as with any message.

Apex Unfollowers **does not send** any data to the publisher or to third parties, contains no analytics, ads or remotely loaded code, and does not sell data.

## Chrome Web Store User Data Policy (Limited Use)

Apex Unfollowers’ use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data handled automatically by the extension is used only to provide its single purpose — showing the follow relationships of the user’s own Instagram account and letting the user manually unfollow selected accounts. The extension does not sell this data or automatically transfer it to Apex Software or third parties, and it is not used for advertising, creditworthiness or lending purposes. Humans do not read this data unless the user explicitly chooses to send a file, report or message.

## Permissions

- `storage`, `unlimitedStorage` – local storage of results (large accounts can have tens of thousands of followers),
- access to `https://www.instagram.com/*` – showing the panel and downloading lists within the user's session,
- background script (no extra permission) – opening the welcome screen.

## Changes and contact

Changes to this policy are published in the extension repository together with the version they apply to. Privacy questions: support@apexsoftware.app

---

<a id="pl"></a>

# Polityka prywatności — Apex Unfollowers dla Instagrama

Wydawca: **Konrad Woźniak**
Kontakt w sprawie prywatności: **support@apexsoftware.app**
Ostatnia aktualizacja: **13 listopada 2026** (wersja 1.2.0)

Jedynym celem Apex Unfollowers dla Instagrama („wtyczka”) jest pokazanie użytkownikowi relacji obserwowania na jego własnym koncie Instagram (kto go nie obserwuje, kogo on nie obserwuje i kto przestał go obserwować) oraz umożliwienie mu ręcznego odobserwowania wybranych kont. Wtyczka działa w przeglądarce, nie wymaga konta i nie ma backendu ani telemetrii wydawcy.

## Jakie dane są przetwarzane

**Listy obserwujących i obserwowanych.** Po kliknięciu „Skanuj” wtyczka pobiera z instagram.com listy kont powiązanych z zalogowanym użytkownikiem. Dla każdego konta zapisuje: identyfikator, nazwę użytkownika, imię i nazwisko z profilu, adres miniatury zdjęcia profilowego oraz informację, czy konto jest zweryfikowane i prywatne.

**Identyfikator zalogowanego konta.** Wtyczka odczytuje identyfikator konta z ciasteczka `ds_user_id` na instagram.com, żeby wiedzieć, czyje listy pobrać, i rozdzielić wyniki różnych kont. Nie odczytuje, nie zapisuje i nie przesyła hasła. Do odobserwowania odczytuje też tokeny sesji ze strony instagram.com (`csrftoken`, `fb_dtsg`) i wysyła je wyłącznie do instagram.com – tak samo jak strona Instagrama.

**Historia.** Po każdym skanie wtyczka zapisuje datę oraz liczbę obserwujących, obserwowanych i wzajemnych obserwacji (do 400 wpisów) na potrzeby statystyk i wykresu, a także listę kont, które odeszły lub doszły od poprzedniego skanu (do 100 wpisów).

**Odobserwowania.** Gdy użytkownik kliknie „Odobserwuj” i potwierdzi, wtyczka zapisuje datę, identyfikator i nazwę odobserwowanego konta (do 500 wpisów), żeby pilnować przerw i limitu dziennego, oraz czas, do którego odobserwowywanie jest wstrzymane po blokadzie akcji przez Instagram.

**Postęp skanu.** W trakcie skanu wtyczka co jakiś czas zapisuje postęp (pobrane dotąd konta i kursor strony Instagrama), żeby przerwany skan można było wznowić. Postęp jest usuwany po zakończeniu skanu i ignorowany po 12 godzinach.

**Ustawienia.** Język interfejsu, tempo skanowania, limit odobserwowań, widoczność przycisku na stronie, biała lista (identyfikatory kont ukrytych przez użytkownika) i informacja, czy zaakceptowano ekran powitalny.

## Gdzie dane są przechowywane

Wszystkie dane zapisują się wyłącznie w lokalnej pamięci rozszerzenia (`chrome.storage.local`) w profilu przeglądarki. „Wyczyść dane” w ustawieniach panelu usuwa dane bieżącego konta. Usunięcie wtyczki usuwa wszystkie jej dane. Wtyczka nie korzysta z `storage.sync`.

Eksport CSV i kopia zapasowa JSON tworzą plik na komputerze użytkownika tylko wtedy, gdy użytkownik o to poprosi. Wczytanie kopii zapasowej zapisuje jej zawartość w lokalnej pamięci rozszerzenia; plik nie jest nigdzie wysyłany.

## Przesyłanie danych

Wtyczka wysyła zapytania wyłącznie do `https://www.instagram.com`, w ramach sesji użytkownika, tymi samymi adresami, których używa strona Instagrama przy wyświetlaniu list obserwujących i przy przycisku „Przestań obserwować”. Zapytanie odobserwowania jest wysyłane tylko po dwukrotnym kliknięciu (kliknięcie i potwierdzenie), nigdy automatycznie. Instagram przetwarza te zapytania na zasadach własnej polityki prywatności.

Skrypt tła tylko otwiera ekran powitalny po instalacji albo na prośbę panelu. Nie wykonuje zapytań sieciowych.

**Zgłaszanie problemów.** Przyciski „Zgłoś problem” i „Napisz e-mail” otwierają gotowe zgłoszenie na GitHubie albo szkic wiadomości w przeglądarce lub programie pocztowym użytkownika. Zawierają wersję wtyczki, nazwę i wersję przeglądarki, język interfejsu i treść ostatniego błędu – bez nazw kont i list. Nic nie zostaje wysłane, dopóki użytkownik sam nie wyśle zgłoszenia lub wiadomości. Jeśli to zrobi, GitHub lub odbiorca wiadomości otrzyma jej treść i dane nadawcy, jak przy każdej wiadomości.

Apex Unfollowers **nie przesyła** żadnych danych wydawcy ani stronom trzecim, nie zawiera analityki, reklam ani zdalnie pobieranego kodu i nie sprzedaje danych.

## Zasady Chrome Web Store dotyczące danych użytkownika (Limited Use)

Sposób, w jaki Apex Unfollowers korzysta z informacji, jest zgodny z zasadami Chrome Web Store dotyczącymi danych użytkownika (Chrome Web Store User Data Policy), w tym z wymogami ograniczonego użytkowania (Limited Use). Dane automatycznie przetwarzane przez rozszerzenie służą wyłącznie realizacji jego jedynego celu — pokazywaniu relacji obserwowania na własnym koncie Instagram użytkownika i ręcznemu odobserwowaniu wybranych kont. Rozszerzenie nie sprzedaje tych danych ani nie przekazuje ich automatycznie Apex Software lub osobom trzecim i nie używa ich do reklam, oceny zdolności kredytowej ani w celach pożyczkowych. Ludzie nie odczytują tych danych, chyba że użytkownik sam zdecyduje się przesłać plik, raport lub wiadomość.

## Uprawnienia

- `storage`, `unlimitedStorage` – lokalny zapis wyników (duże konta mogą mieć dziesiątki tysięcy obserwujących),
- dostęp do `https://www.instagram.com/*` – wyświetlenie panelu i pobranie list z sesji użytkownika,
- skrypt tła (bez dodatkowych uprawnień) – otwarcie ekranu powitalnego.

## Zmiany i kontakt

Zmiany tej polityki są publikowane w repozytorium wtyczki razem z wersją, której dotyczą. Pytania dotyczące prywatności: support@apexsoftware.app
