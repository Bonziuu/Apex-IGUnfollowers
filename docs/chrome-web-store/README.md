# Lokalizacja wizytówki Chrome Web Store

## Pliki do skopiowania

| Języki | Opisy |
|---|---|
| Angielski, polski, portugalski (Brazylia) | [en](en.md), [pl](pl.md), [pt_BR](pt_BR.md) |
| Hiszpański, hiszpański (Ameryka Łacińska), turecki | [es](es.md), [es_419](es_419.md), [tr](tr.md) |
| Indonezyjski, niemiecki, francuski, włoski | [id](id.md), [de](de.md), [fr](fr.md), [it](it.md) |
| Japoński, koreański, hindi, arabski | [ja](ja.md), [ko](ko.md), [hi](hi.md), [ar](ar.md) |
| Ukraiński, niderlandzki, wietnamski, tajski | [uk](uk.md), [nl](nl.md), [vi](vi.md), [th](th.md) |
| Chiński uproszczony i tradycyjny | [zh_CN](zh_CN.md), [zh_TW](zh_TW.md) |

## Publikacja w panelu dewelopera

1. Uruchom `npm ci`, `npx playwright install chromium`, `npm test`, `npm run validate:locales` i `npm run package:release`. Po udanym CI możesz też pobrać bezpośredni artefakt `Apex-Unfollowers-<wersja>-store.zip` z GitHub Actions. Suma kontrolna znajduje się w `SHA256SUMS.txt` w artefakcie `Apex-Unfollowers`.
2. Otwórz istniejącą pozycję Apex Unfollowers w [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) i wgraj ZIP z końcówką `-store.zip` w zakładce **Package**. `manifest.json` powinien znajdować się w katalogu głównym ZIP-a. Nowy numer wersji musi być wyższy od numeru ostatniej przesłanej paczki.
3. Na karcie **Store listing** otwórz każdy język i wklej wyłącznie treść sekcji **Full description** z odpowiadającego mu pliku. Nazwa i krótki opis pochodzą z katalogów `_locales` w paczce. Warianty hiszpańskie i chińskie mają osobne pozycje.
4. Sekcje **Search phrases**, **Screenshot copy** i **Key benefits** służą do przygotowania opisu i zrzutów ekranu. Frazy wykorzystuj w zdaniach, gdy pasują do treści. Repozytorium zawiera [grafiki PL i EN](../../store/screenshots) oraz teksty do przygotowania grafik pozostałych wersji.
5. Podejrzyj opisy i grafiki w wybranych językach, sprawdź deklaracje w zakładce **Privacy** i wyślij aktualizację do weryfikacji. [Instrukcja Google](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) · [Uzasadnienia uprawnień i deklaracje prywatności](../webstore/permissions-and-privacy.md)

## Dodanie języka

1. Wybierz kod z [listy języków obsługiwanych przez Chrome Web Store](https://developer.chrome.com/docs/webstore/i18n#localeTable). Dodaj wpis do rejestru w [shared/i18n.js](../../shared/i18n.js), podając rodzimą nazwę, znacznik BCP 47 do `Intl` i kierunek `rtl`, jeśli jest potrzebny. Przy wariancie regionalnym sprawdź regułę automatycznego wyboru i jej testy.
2. Skopiuj [angielski katalog](../../_locales/en/messages.json) do `_locales/<kod>/messages.json` i przetłumacz wartości `message`. Zachowaj nazwy zmiennych w nawiasach klamrowych, przecinki w nagłówkach CSV i znaczniki `<strong>` w czterech elementach powitania. `{p}` zawiera już znak procentu. Limity metadanych to 75 znaków dla nazwy, 12 dla krótkiej nazwy i 132 dla krótkiego opisu.
3. Dodaj `docs/chrome-web-store/<kod>.md` według struktury [en.md](en.md). Nagłówek i **Short description** muszą zgadzać się z katalogiem. Uruchom walidację, testy i budowę paczki. Rejestr języków zasila selektor i listę katalogów pakowanych do ZIP-a.
