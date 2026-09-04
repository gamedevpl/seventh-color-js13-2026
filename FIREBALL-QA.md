# Unicorn Fireball — QA F13, 2026-09-05

Obecna wersja zachowuje organiczny endgame. Nie ma przegrupowania, posiłków,
teleportowania, odliczania ani obowiązkowego finału. Śmierć solo natychmiast
pokazuje wynik i zatrzymuje walkę botów.

## Znalezione i poprawione

| Problem | Poprawka i dowód |
|---|---|
| Neutralny unicorn dokładnie na pozycji obcego lidera dostawał NaN w prędkości i pozycji | Zabezpieczenie dzielenia przez zerową odległość. Test odtwarza nakładanie i sprawdza skończone współrzędne całego świata. |
| Przygarnięte neutralne jednostki zostawały przypisane do martwego lidera | Eliminacja zwalnia wszystkich jego podwładnych, niezależnie od koloru. Regresja obejmuje śmierć na krawędzi i od rogu. |
| Dwie bandy potrafiły krążyć w nieskończonym pościgu | AI zaczyna bliskie ładowanie z 30 zamiast 18 jednostek dystansu. Seed 42 kończy się zwykłą walką, bez teleportów i ofiar na krawędzi. |
| Odległy clash botów przejmował kamerę gracza | Filmowa kamera tylko dla uderzeń w promieniu 35. Test sprawdza odległą i bliską eksplozję oraz śmierć w tej samej klatce. |
| Na radarze solo trudno było rozpoznać własną bandę i kierunek jazdy | Biały pierścień i kreska kierunku; sprawdzone wizualnie przy 10/35 unicornach i podczas tęczy. |
| Tęcza dużej bandy była blada na oddalonej kamerze | Mocniejszy kolor istniejącej smugi: alpha 0,26 → 0,38. Bez nowej geometrii ani dodatkowych draw calli. |
| Nakładające się dźwięki przekraczały maksymalny poziom sygnału | Wspólny kompresor dla muzyki, uderzeń i ładowania. W deterministycznym miksie peak 1,098 → 0,494; próbki ponad pełną skalą 3 → 0. |

## Grywalność — porównanie

`node tools/probe-fireball-balance.mjs`: 48 identycznie zasianych rund,
30 kroków/s, limit siedmiu minut, wszyscy liderzy sterowani przez AI.

| Pomiar | Przed F13 | Końcowa F13 |
|---|---:|---:|
| Zakończone rundy | 47/48 | 48/48 |
| Średni czas zakończonych rund | 65,2 s | 69,5 s |
| Wszystkie czołowe clashe | 47 | 60 |
| Największe stado | 47 | 53 |
| Clashe dwóch band 30+ | 0 | 0 |
| Śmierci na krawędzi | 0 | 0 |
| NaN w zwykłych rundach | 0 | 0 |

Osobny losowy test przeglądarkowy: 24/24 zakończenia, 3 wygrane pierwszego
bota, średnio 65 s, 11,9 zapłonu i 1,3 clashu na rundę; największe stado 46.
To próby symulacji, nie gwarancja zakończenia każdej gry ani badanie balansu
z ludźmi. Regresję pościgu sprawdza również osobny deterministyczny test.

## Weryfikacja

`npm run fireball:test`: PASS.
`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.

- 13/13 testów reguł: kolizje, impet, chłodzenie i spalanie, krawędzie,
  brak specjalnej fazy finału, pościg, NaN i zwalnianie podwładnych.
- Przeglądarka: start, zbieranie, klawiatura, wskaźnik i dotyk, dźwięk,
  utrwalenie wyniku, natychmiastowa porażka, orientacja ekranu, kamera.
- Multiplayer: dołączanie, sterowanie gościem, odrodzenia, rozłączenie,
  świeża elekcja i migracja hosta z pozycją, zdrowiem, stunem i niestabilnością.
- OfflineAudioContext: czterosekundowy miks muzyki, mega eksplozji, zapłonu
  i ośmiu uderzeń w tej samej chwili; bez przekroczenia pełnej skali.
- Zrzuty 10/35 jednostek oraz płonącej tęczy sprawdzone wizualnie.

## Dalsze możliwości

1. **Naturalny clash 30+ kontra 30+ wciąż jest rzadki — w próbie nie wystąpił.**
   Na mapie jest 70 podwładnych, więc takie starcie wymaga jednoczesnego
   skupienia co najmniej 60 z nich w dwóch stadach, które dodatkowo spalają
   jednostki podczas szarży. Następny eksperyment powinien porównać koszt
   spalania i decyzje AI o zbieraniu neutralnych przed kolejnym atakiem.
   Same zmiany stałych są tanie w bajtach, ale wymagają pomiaru balansu;
   nie wprowadzono darmowych posiłków ani wymuszonego spotkania.
2. **Dźwięk zależny od dystansu.** Kamera jest już lokalna, ale część odgłosów
   i błysków nadal reaguje na walki w całym świecie. Ograniczenie odległych
   uderzeń poprawiłoby orientację; trzeba sprawdzić koszt filtrowania zdarzeń.
3. **Lepsza czytelność gruntu.** Kontrast smugi i radar poprawiono bez nowych
   obiektów. Kolejne próby mogą zmienić parametry mgły i światła, lecz należy
   porównać wszystkie kolory oraz widoczność krawędzi na małym ekranie.

## Ograniczenia

Lokalny Chromium ze SwiftShaderem i lokalny relay; bez fizycznego telefonu,
Safari, Firefoxa i publicznego relaya. Dźwięk oceniono pomiarem sygnału, nie
odsłuchem na docelowych głośnikach. Wyniki nie są pomiarem wydajności GPU.

## Paczka

ZIP: **13 172 / 13 312 bajtów**, zapas **140 bajtów**.
Pięć kompresji O1: 13 187, 13 195, 13 172, 13 195, 13 178.
Najgorsza próba także mieści się w limicie. HTML w ZIP-ie jest identyczny
z `build/fireball/index.html` i `play/unicorn-fireball.html`.

SHA-256: `728df277e475b8e23c8ca3f980f5893604f674e8c398a96dc66e83049f66e780`.
