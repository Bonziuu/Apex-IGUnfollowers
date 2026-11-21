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

The extension requests lists and sends unfollow requests to `https://www.instagram.com` within the user's session. Profile thumbnails may load from Instagram and Meta image servers. The user clicks and confirms each unfollow individually. Instagram processes these requests under its own privacy policy.

The background script opens the welcome screen and reads translation files included in the extension. Language preferences are stored locally.

**Reporting a problem.** The "Report a problem" and "Send an e-mail" buttons open a GitHub issue form or an e-mail draft. The pre-filled text includes the extension version, browser name and version, and diagnostic details such as an HTTP status. The e-mail draft also includes the interface language. Account names, lists and raw Instagram responses are excluded. Opening the GitHub form passes its pre-filled information to GitHub. The user decides whether to submit the issue or send the e-mail.

**Voluntary contributions.** The Ko-fi link opens the developer’s public profile after the user activates it. Ko-fi and its payment provider handle payment details on their own pages. The extension does not handle payment details.

Apex Unfollowers has no publisher backend, analytics, ads or remotely loaded code. It does not sell data.

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

Wtyczka pobiera listy i wysyła żądania odobserwowania do `https://www.instagram.com` w ramach sesji użytkownika. Miniatury zdjęć profilowych mogą się ładować z serwerów Instagrama lub Meta. Użytkownik osobno wybiera i potwierdza każde odobserwowanie. Instagram przetwarza te zapytania na zasadach własnej polityki prywatności.

Skrypt tła otwiera ekran powitalny i odczytuje tłumaczenia dołączone do rozszerzenia. Preferencja języka jest zapisywana lokalnie.

**Zgłaszanie problemów.** Przyciski „Zgłoś problem” i „Napisz e-mail” otwierają formularz zgłoszenia na GitHubie lub szkic e-maila. Wstępnie uzupełniona treść zawiera wersję wtyczki, nazwę i wersję przeglądarki oraz dane diagnostyczne, np. kod HTTP. Szkic e-maila zawiera też język interfejsu. Nazwy kont, listy i treść odpowiedzi Instagrama są pomijane. Otwarcie formularza przekazuje wstępnie wypełniane informacje do GitHuba. Użytkownik decyduje, czy wysłać zgłoszenie lub wiadomość.

**Dobrowolne wpłaty.** Link Ko-fi otwiera publiczny profil autora po wybraniu go przez użytkownika. Dane płatności są obsługiwane na stronach Ko-fi i jego operatora płatności. Wtyczka nie ma dostępu do tych danych.

Apex Unfollowers działa bez serwera wydawcy, analityki, reklam i zdalnie ładowanego kodu. Wtyczka nie sprzedaje danych.

## Zasady Chrome Web Store dotyczące danych użytkownika (Limited Use)

Sposób, w jaki Apex Unfollowers korzysta z informacji, jest zgodny z zasadami Chrome Web Store dotyczącymi danych użytkownika (Chrome Web Store User Data Policy), w tym z wymogami ograniczonego użytkowania (Limited Use). Dane automatycznie przetwarzane przez rozszerzenie służą wyłącznie realizacji jego jedynego celu — pokazywaniu relacji obserwowania na własnym koncie Instagram użytkownika i ręcznemu odobserwowaniu wybranych kont. Rozszerzenie nie sprzedaje tych danych ani nie przekazuje ich automatycznie Apex Software lub osobom trzecim i nie używa ich do reklam, oceny zdolności kredytowej ani w celach pożyczkowych. Ludzie nie odczytują tych danych, chyba że użytkownik sam zdecyduje się przesłać plik, raport lub wiadomość.

## Uprawnienia

- `storage`, `unlimitedStorage` – lokalny zapis wyników (duże konta mogą mieć dziesiątki tysięcy obserwujących),
- dostęp do `https://www.instagram.com/*` – wyświetlenie panelu i pobranie list z sesji użytkownika,
- skrypt tła (bez dodatkowych uprawnień) – otwarcie ekranu powitalnego.

## Zmiany i kontakt

Zmiany tej polityki są publikowane w repozytorium wtyczki razem z wersją, której dotyczą. Pytania dotyczące prywatności: support@apexsoftware.app
