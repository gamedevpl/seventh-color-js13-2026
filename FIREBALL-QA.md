# Unicorn Fireball — QA F12, 2026-09-05

Lokalna wersja z organicznym endgame i natychmiastowym końcem gry po śmierci
w solo. Zmiany pozostają bez commita i pushowania.

## Zmiana zasad

Dwie ostatnie bandy zachowują pozycje, liczebność i normalne zasady AI.
Usunięto przegrupowanie, posiłki, teleportowanie, odliczanie, wymuszony rozbieg
i wyjątek zatrzymujący spalanie jednostek. Duży clash może wyniknąć ze zwykłej
rozgrywki; nie stanowi obowiązkowej fazy.

Pozostają wyładowania od 10 jednostek, kontrolowalna niestabilność przy 35+
i plazmowe efekty dużych uderzeń. Czołowe starcie dwóch band 30+ rozstrzyga
impet `(followers + 1) * max(11, speed)`. Boczne spotkania nadal odbijają stada.

Śmierć gracza solo od razu pokazuje wynik, przerywa filmowy efekt zderzenia
i zatrzymuje symulację. Boty nie rozgrywają dalszego finału. Online nadal ma
obserwowanie podczas oczekiwania na odrodzenie i pięciosekundowe odrodzenia.

## Sprawdzenia

- 10/10 deterministycznych testów reguł: zwykłe i duże kolizje, przewaga
  impetu, niezależność od kolejności liderów, brak specjalnej fazy przy dwóch
  ostatnich bandach, narastanie niestabilności, zapłon i chłodzenie.
- Testy przeglądarkowe rozgrywki: sterowanie, zbieranie, ładowanie, spalanie,
  dotyk, dźwięk, krawędzie, utrwalenie zwycięstwa i odrodzenia — PASS.
- Losowe symulacje: 23/24 rund zakończone w siedem minut, 4 wygrane pierwszego
  bota; zakończone rundy średnio 86 s. Średnio 1,2 clashu na rundę, maksymalne
  stado 36. Jedna runda pozostała nierozstrzygnięta; brak gwarancji zakończenia.
- Regresja solo: śmierć i duża eksplozja w tej samej klatce pokazują DEFEAT
  bez opóźnienia; brak aktywnego efektu kamery, pozycje i zdrowie botów nie
  zmieniają się po wyniku, także przy trzymaniu klawisza ruchu — PASS.
- Pozostałe regresje QA: zwolnienie wskaźnika poza canvasem, duże WASD,
  pauza przy obrocie ekranu solo, przyciski Online/Exit, licznik odrodzenia,
  rozłączenie i świeża elekcja hosta — PASS.
- Multiplayer: sterowanie gościem, dołączanie, odrodzenie, migracja hosta,
  zachowanie zdrowia, pozycji, ogłuszenia i wskaźnika niestabilności — PASS.
- `npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.
- Testy przeglądarkowe nie wykazały błędów JavaScript.

## Artefakt i budżet

ZIP `build/fireball/index.zip`: **13 081 / 13 312 bajtów**, zapas **231**.
Pięć kompresji O1: 13 101, 13 081, 13 101, 13 086, 13 101 bajtów.
Najgorszy wynik również mieści się w limicie. HTML w ZIP-ie jest identyczny
z `build/fireball/index.html` i `play/unicorn-fireball.html`.

SHA-256 ZIP-a: `85c7e883b5b23b7c1c44d88892bc2fcaf53a069c54728fb1df32ff79bc2eee02`.

## Ograniczenia

Testowano lokalny Chromium ze SwiftShaderem i lokalny relay, bez fizycznego
telefonu, Safari, Firefoxa i publicznego relaya. To nie jest pomiar wydajności
docelowego GPU ani ocena balansu przez ludzi. Losowe symulacje opisują próbę,
nie gwarantują końca każdej rozgrywki ani naturalnego zebrania dwóch band 30+.
