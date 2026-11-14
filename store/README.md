# Apex Unfollowers — grafiki do sklepów i strony

Generowane przez `npm run store` (`store/capture.mjs`): prawdziwy panel wtyczki uruchomiony na symulowanym Instagramie z fikcyjnymi kontami `*_demo`. Nic z tego folderu nie trafia do paczki wtyczki. Teksty i checklista zgłoszenia: [docs/webstore](../docs/webstore/README.md).

| Folder | Zawartość |
|---|---|
| `screenshots/pl/`, `screenshots/en/` | zrzuty sklepowe 1280×800 JPEG (bez kanału alfa): listy, zmiany, statystyki, odobserwowanie, ekran powitalny – z podpisem „Dane demonstracyjne” |
| `promo/` | `small-tile-440x280(-pl).jpg`, `marquee-1400x560(-pl).jpg` |
| `panel/pl/`, `panel/en/` | surowe zrzuty panelu (2×, jasny i ciemny motyw) – także na stronę apexsoftware.app |

Ikona sklepu 128×128: [`brand/apex-unfollowers-store-icon-128.png`](../brand/apex-unfollowers-store-icon-128.png).

## Zrzuty zoptymalizowane pod instalacje (Chrome Web Store)

Oba języki mają tę samą kompozycję, inspirowaną materiałami Apex AdBlocker:
logo i nazwa u góry, **mocny nagłówek z kolorowym akcentem**, jedno zdanie
korzyści i oryginalny, aktualnie wygenerowany panel po prawej. Unfollowers
zachowuje własny różowy akcent; nie kopiujemy turkusowej kolorystyki AdBlockera.

Kolejność galerii celowo prowadzi od najprostszego problemu do zaufania:

1. **01-lists** — kto nie obserwuje Cię z powrotem (pierwszy ekran / główna obietnica).
2. **02-changes** — kto przestał i zaczął obserwować (jasne wyjaśnienie, że historia działa od drugiego skanu).
3. **03-stats** — trend obserwujących, bilans i wykres.
4. **04-unfollow** — ręczne odobserwowanie, potwierdzenie i limity; bez obietnic braku blokad.
5. **05-welcome** — bez hasła, konta Apex i telemetrii; pokazany jest prawdziwy onboarding.

**Regeneracja:** `npm ci && npx playwright install chromium && npm run store`.
Generator czyta wersję z `manifest.json` i wykonuje zdjęcia realnego UI w
symulowanym Instagramie z fikcyjnymi kontami — nie używa prawdziwych kont.
Wynikowe JPEG-i (1280×800) są w `store/screenshots/{pl,en}/`.

W akcjach GitHub `CI` jest dodatkowo publikowany artefakt
`Apex-Unfollowers-CWS` z 10 gotowymi plikami JPEG (PL i EN); nie trzeba
ich pobierać pojedynczo. Grafiki nie publikują się automatycznie w sklepie.

Przy zmianach interfejsu, tłumaczeń lub stylu ponownie wygeneruj materiały,
a przed wgraniem sprawdź w powiększeniu, czy każdy screenshot odpowiada temu,
co naprawdę działa w najnowszej wersji rozszerzenia.
